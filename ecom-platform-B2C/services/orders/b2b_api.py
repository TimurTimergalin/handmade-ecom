"""Seller-facing order API used by the B2B cabinet.

ORDER_SERVICE_URL is expected to be http://orders:8000/api, so this router is mounted at /api.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Header, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from common.app import BadRequestError, NotFoundError
from models import Order, OrderItem, OrderStatus
from processor import processor_url
from routes import (
    SessionDep,
    cancel_seller_order,
    complete_order,
    deliver_order,
    external_status,
    ship_order,
    sync_cdek_progress,
    sync_processor_payment,
)

router = APIRouter(prefix="/api", tags=["b2b-orders"])

_STATUS_FILTER = {
    "created": (OrderStatus.CREATED,),
    "paid": (OrderStatus.PAID, OrderStatus.ASSEMBLING),
    "shipped": (OrderStatus.SHIPPED,),
    "delivering": (OrderStatus.DELIVERING,),
    "delivered": (OrderStatus.DELIVERED,),
    "completed": (OrderStatus.COMPLETED,),
    "cancelled": (OrderStatus.CANCELLED,),
}


class SellerStatusBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: Literal["shipped", "delivered", "completed", "cancelled"]
    tracking_number: str | None = Field(default=None, max_length=120, alias="trackingNumber")


def _envelope(data: dict) -> JSONResponse:
    return JSONResponse(status_code=200, content={"data": data, "error": None})


def _order_data(order: Order, seller_id: uuid.UUID) -> dict:
    lines = [item for item in order.items if item.seller_id == seller_id]
    created = order.created_at or datetime.now(UTC)
    return {
        "id": str(order.id),
        "sellerId": str(seller_id),
        "status": external_status(order),
        "createdAt": created.isoformat(),
        "items": [
            {
                "id": str(item.id),
                "productId": str(item.product_id),
                "title": item.title,
                "image": item.image_url or "",
                "quantity": item.quantity,
                "price": int(item.price_amount),
            }
            for item in lines
        ],
        "total": int(order.total_amount),
        "delivery": getattr(order.delivery_method, "value", order.delivery_method),
        "trackingNumber": order.tracking_number,
        "seller": {"id": str(seller_id)},
    }


async def _seller_order(session: AsyncSession, order_id: uuid.UUID, seller_id: uuid.UUID) -> Order:
    order = await session.get(Order, order_id)
    if order is None or not any(item.seller_id == seller_id for item in order.items):
        raise NotFoundError(f"Order {order_id} not found")
    return order


def _seller_query(seller_id: uuid.UUID, status: str | None, q: str | None):
    stmt = select(Order).where(Order.items.any(OrderItem.seller_id == seller_id))
    if status:
        allowed = _STATUS_FILTER.get(status)
        if allowed is None:
            raise BadRequestError("Unknown order status")
        stmt = stmt.where(
            or_(
                (Order.status_override.is_(None) & Order.status.in_(allowed)),
                Order.status_override.in_(allowed),
            )
        )
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                Order.number.ilike(pattern),
                cast(Order.id, String).ilike(pattern),
                Order.tracking_number.ilike(pattern),
                Order.items.any(OrderItem.title.ilike(pattern)),
            )
        )
    return stmt


async def _sync_created(session: AsyncSession, seller_id: uuid.UUID) -> None:
    if processor_url() is None:
        return
    stmt = select(Order).where(
        Order.status == OrderStatus.CREATED,
        Order.external_order_id.is_not(None),
        Order.items.any(OrderItem.seller_id == seller_id),
    )
    orders = (await session.scalars(stmt)).unique().all()
    for order in orders:
        await sync_processor_payment(session, order)


@router.get("/orders")
async def list_seller_orders(
    session: SessionDep,
    seller_id: uuid.UUID = Query(alias="sellerId"),
    role: str = Query(default="seller"),
    status: str | None = None,
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
) -> JSONResponse:
    if role != "seller":
        raise BadRequestError("role must be seller")
    await _sync_created(session, seller_id)
    stmt = _seller_query(seller_id, status, q)
    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (
        await session.scalars(
            stmt.order_by(Order.created_at.desc()).limit(page_size).offset((page - 1) * page_size)
        )
    ).unique().all()
    return _envelope(
        {
            "items": [_order_data(order, seller_id) for order in rows],
            "total": int(total or 0),
            "page": page,
            "pageSize": page_size,
        }
    )


@router.get("/orders/{order_id}")
async def get_seller_order(
    order_id: uuid.UUID,
    session: SessionDep,
    seller_id: uuid.UUID = Query(alias="sellerId"),
    role: str = Query(default="seller"),
) -> JSONResponse:
    if role != "seller":
        raise BadRequestError("role must be seller")
    order = await _seller_order(session, order_id, seller_id)
    order = await sync_processor_payment(session, order)
    order = await sync_cdek_progress(session, order)
    return _envelope(_order_data(order, seller_id))


@router.patch("/orders/{order_id}/status")
async def patch_seller_order_status(
    order_id: uuid.UUID,
    body: SellerStatusBody,
    session: SessionDep,
    seller_id: uuid.UUID = Query(alias="sellerId"),
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> JSONResponse:
    del idempotency_key
    order = await _seller_order(session, order_id, seller_id)
    order = await sync_processor_payment(session, order)
    if order.status_override is not None:
        order.status_override = None
        await session.flush()
    if external_status(order) == body.status:
        return _envelope(_order_data(order, seller_id))
    if body.status == "shipped":
        order = await ship_order(session, order, body.tracking_number)
    elif body.status == "delivered":
        method = getattr(order.delivery_method, "value", order.delivery_method)
        if method == "pickup" and order.status in {OrderStatus.PAID, OrderStatus.ASSEMBLING}:
            order = await ship_order(session, order, None)
        else:
            order = await deliver_order(session, order, body.tracking_number)
    elif body.status == "completed":
        order = await complete_order(session, order, body.tracking_number)
    else:
        order = await cancel_seller_order(session, order)
    return _envelope(_order_data(order, seller_id))


@router.get("/internal/sellers/{seller_id}/orders-summary")
async def seller_orders_summary(seller_id: uuid.UUID, session: SessionDep) -> JSONResponse:
    await _sync_created(session, seller_id)
    orders = (
        await session.scalars(
            select(Order)
            .where(Order.items.any(OrderItem.seller_id == seller_id))
            .order_by(Order.created_at.desc())
        )
    ).unique().all()
    return _envelope(
        {
            "newOrdersCount": sum(order.status is OrderStatus.CREATED for order in orders),
            "awaitingShipmentCount": sum(order.status is OrderStatus.PAID for order in orders),
            "shippedOrdersCount": sum(
                order.status in {OrderStatus.SHIPPED, OrderStatus.DELIVERING} for order in orders
            ),
            "totalOrdersCount": len(orders),
            "recentOrders": [_order_data(order, seller_id) for order in orders[:5]],
        }
    )
