from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from marketplace.goods.schemas.products import (
    Batch,
    ProductCreate,
    ProductPatch,
    ProductRead,
    RejectReason,
    ShipmentDays,
    StockAdjust,
)
from marketplace.goods.services.catalog import CatalogService
from marketplace.shared.db import session
from marketplace.shared.schemas import DeliveryMethod, Envelope, Page, SaleMode
from marketplace.shared.security import internal

router = APIRouter(dependencies=[Depends(internal)], tags=["Goods internal API"])
DB = Annotated[AsyncSession, Depends(session, scope="function")]


def service(request: Request, db: DB):
    return CatalogService(db, request.app.state.policy)


Service = Annotated[CatalogService, Depends(service)]


@router.get("/internal/sellers/{seller_id}/products", response_model=Envelope[Page[ProductRead]])
async def products(
    seller_id: UUID,
    svc: Service,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, alias="pageSize", ge=1, le=100),
    q: str = Query("", max_length=200),
    sale_mode: SaleMode | None = Query(None, alias="saleMode"),
    delivery: DeliveryMethod | None = None,
):
    return {"data": await svc.list(seller_id, page, page_size, q, sale_mode, delivery)}


@router.post(
    "/internal/sellers/{seller_id}/products", response_model=Envelope[ProductRead], status_code=201
)
async def create(seller_id: UUID, payload: ProductCreate, svc: Service):
    return {"data": await svc.create(seller_id, payload)}


@router.post(
    "/internal/sellers/{seller_id}/products/batch", response_model=Envelope[list[ProductRead]]
)
async def batch(seller_id: UUID, payload: Batch, svc: Service):
    return {"data": await svc.batch(seller_id, payload)}


@router.get("/internal/sellers/{seller_id}/products-summary", response_model=Envelope[dict])
async def summary(seller_id: UUID, svc: Service, threshold: int = Query(3, ge=0, le=100000)):
    return {"data": await svc.summary(seller_id, threshold)}


@router.get(
    "/internal/sellers/{seller_id}/products/{product_id}", response_model=Envelope[ProductRead]
)
async def get(seller_id: UUID, product_id: UUID, svc: Service):
    return {"data": await svc.get(seller_id, product_id)}


@router.patch(
    "/internal/sellers/{seller_id}/products/{product_id}", response_model=Envelope[ProductRead]
)
async def update(seller_id: UUID, product_id: UUID, payload: ProductPatch, svc: Service):
    return {"data": await svc.update(seller_id, product_id, payload)}


@router.post(
    "/internal/sellers/{seller_id}/products/{product_id}/revert",
    response_model=Envelope[ProductRead],
)
async def revert_product(seller_id: UUID, product_id: UUID, svc: Service):
    return {"data": await svc.discard_draft(seller_id, product_id)}


@router.delete("/internal/sellers/{seller_id}/products/{product_id}", response_model=Envelope[dict])
async def delete(seller_id: UUID, product_id: UUID, svc: Service):
    await svc.delete(seller_id, product_id)
    return {"data": None}


@router.post(
    "/internal/sellers/{seller_id}/products/shipment-days",
    response_model=Envelope[dict],
)
async def broadcast_ship_days(seller_id: UUID, payload: ShipmentDays, svc: Service):
    await svc.broadcast_ship_days(seller_id, payload.ship_days)
    return {"data": {"updated": True}}


@router.get("/internal/products", response_model=Envelope[Page[ProductRead]])
async def read_catalog(
    svc: Service,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, alias="pageSize", ge=1, le=100),
    q: str = Query("", max_length=200),
    seller_id: UUID | None = Query(None, alias="sellerId"),
    sale_mode: SaleMode | None = Query(None, alias="saleMode"),
    delivery: DeliveryMethod | None = None,
):
    return {"data": await svc.read_catalog(page, page_size, q, seller_id, sale_mode, delivery)}


@router.get("/internal/products/{product_id}", response_model=Envelope[ProductRead])
async def read_one(product_id: UUID, svc: Service):
    return {"data": await svc.read_one(product_id)}


@router.get("/internal/sellers/{seller_id}/media/references", response_model=Envelope[list[str]])
async def media_references(seller_id: UUID, svc: Service):
    return {"data": await svc.media_references(seller_id)}


@router.post("/internal/products/batch", response_model=Envelope[list[ProductRead]])
async def read_batch(payload: Batch, svc: Service):
    return {"data": await svc.read_batch(payload)}


@router.get("/internal/moderation/products", response_model=Envelope[list[dict]])
async def pending_products(svc: Service):
    return {"data": await svc.pending_moderation()}


@router.post("/internal/moderation/products/{product_id}/accept", response_model=Envelope[dict])
async def accept_product(product_id: UUID, svc: Service):
    return {"data": await svc.accept_moderation(product_id)}


@router.post("/internal/moderation/products/{product_id}/reject", response_model=Envelope[dict])
async def reject_product(product_id: UUID, payload: RejectReason, svc: Service):
    return {"data": await svc.reject_moderation(product_id, payload.reason)}


@router.post("/internal/products/{product_id}/stock", response_model=Envelope[dict])
async def adjust_product_stock(product_id: UUID, payload: StockAdjust, svc: Service):
    return {"data": await svc.adjust_stock(product_id, payload.delta)}
