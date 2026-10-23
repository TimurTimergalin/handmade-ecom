from __future__ import annotations

import logging
import os
import random
import re
import uuid
from collections.abc import AsyncIterator, Sequence
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

import httpx
from common.app import BadRequestError, ConflictError, NotFoundError
from common.db import Database
from common.kafka import EventProducer, Topics
from fastapi import APIRouter, Depends, Header, Query, status
from models import (
    STATUS_TRANSITIONS,
    DeliveryMethod,
    Order,
    OrderItem,
    OrderStatus,
    OrderStatusHistory,
)
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1")
logger = logging.getLogger(__name__)
_db: Database | None = None
_producer: EventProducer | None = None
_order_number_prefix = "HM"
TWO_PLACES = Decimal("0.01")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CDEK_EMAIL_FALLBACK_NOTE = "Для заказа СДЭК подставлен служебный email получателя"


class DeliveryOption(BaseModel):
    method: DeliveryMethod
    title: str
    description: str
    price_amount: Decimal
    eta_days: int
    currency: str = "RUB"


DELIVERY_OPTIONS: dict[DeliveryMethod, DeliveryOption] = {
    DeliveryMethod.CDEK: DeliveryOption(
        method=DeliveryMethod.CDEK,
        title="СДЭК",
        description="Доставка СДЭК",
        price_amount=Decimal("390.00"),
        eta_days=4,
    ),
    DeliveryMethod.PICKUP: DeliveryOption(
        method=DeliveryMethod.PICKUP,
        title="Самовывоз",
        description="Из пункта выдачи рядом с вами",
        price_amount=Decimal("0.00"),
        eta_days=2,
    ),
    DeliveryMethod.COURIER: DeliveryOption(
        method=DeliveryMethod.COURIER,
        title="Курьер",
        description="Доставка до двери",
        price_amount=Decimal("390.00"),
        eta_days=3,
    ),
    DeliveryMethod.POST: DeliveryOption(
        method=DeliveryMethod.POST,
        title="Почта",
        description="Доставка в отделение",
        price_amount=Decimal("250.00"),
        eta_days=7,
    ),
}


def bind_db(database: Database) -> None:
    global _db
    _db = database


def bind_producer(producer: EventProducer) -> None:
    global _producer
    _producer = producer


def configure(*, order_number_prefix: str = "HM") -> None:
    global _order_number_prefix
    _order_number_prefix = order_number_prefix


async def get_session() -> AsyncIterator[AsyncSession]:
    assert _db is not None
    async for session in _db.session():
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class OrderItemIn(BaseModel):
    product_id: uuid.UUID
    offer_id: uuid.UUID
    seller_id: uuid.UUID | None = None
    title: str = ""
    image_url: str | None = None
    quantity: int = Field(default=1, ge=1)
    price_amount: Decimal


class OrderCreate(BaseModel):
    user_id: uuid.UUID
    items: list[OrderItemIn] = Field(min_length=1)
    delivery_method: DeliveryMethod = DeliveryMethod.COURIER
    delivery_address: str | None = None
    recipient_name: str
    recipient_phone: str
    payment_method: str = "card"
    comment: str | None = None
    discount_amount: Decimal = Decimal("0")
    currency: str = "RUB"
    payout_token: str | None = Field(default=None, max_length=512)
    yookassa_account_id: str | None = Field(default=None, max_length=128)
    delivery_amount: Decimal | None = Field(default=None, ge=0)
    cdek_office_code: str | None = Field(default=None, max_length=64)


class CheckoutGroupIn(BaseModel):
    seller_id: uuid.UUID
    yookassa_account_id: str = ""
    items: list[OrderItemIn] = Field(min_length=1)
    delivery_method: DeliveryMethod = DeliveryMethod.CDEK
    delivery_address: str | None = None
    recipient_name: str = ""
    recipient_phone: str = ""
    payment_method: str = "card"
    comment: str | None = None
    discount_amount: Decimal = Decimal("0")
    currency: str = "RUB"
    delivery_amount: Decimal = Field(default=Decimal("0"), ge=0)
    cdek_office_code: str | None = Field(default=None, max_length=64)


class CheckoutCreate(BaseModel):
    user_id: uuid.UUID
    groups: list[CheckoutGroupIn] = Field(min_length=1)


class OrderItemOut(ORMModel):
    id: uuid.UUID
    product_id: uuid.UUID
    offer_id: uuid.UUID
    seller_id: uuid.UUID | None
    title: str
    image_url: str | None
    quantity: int
    price_amount: Decimal


class OrderStatusHistoryOut(ORMModel):
    status: OrderStatus
    comment: str | None
    created_at: datetime


class OrderOut(ORMModel):
    id: uuid.UUID
    number: str
    user_id: uuid.UUID
    status: OrderStatus
    currency: str
    items_amount: Decimal
    delivery_amount: Decimal
    discount_amount: Decimal
    total_amount: Decimal
    delivery_method: DeliveryMethod
    delivery_address: str | None
    delivery_eta_days: int | None
    recipient_name: str
    recipient_phone: str
    payment_method: str
    comment: str | None
    paid_at: datetime | None
    created_at: datetime
    payment_url: str | None = None
    receival_code: str | None = None
    tracking_number: str | None = None
    status_override: OrderStatus | None = None
    items: list[OrderItemOut] = Field(default_factory=list)
    history: list[OrderStatusHistoryOut] = Field(default_factory=list)


class OrderListOut(BaseModel):
    items: list[OrderOut]
    total: int


class CheckoutOut(BaseModel):
    orders: list[OrderOut]
    payment_url: str | None = None


class OrderStatusPatch(BaseModel):
    status: OrderStatus
    comment: str | None = None


class ReceiveIn(BaseModel):
    receival_code: str | None = None
    user_id: uuid.UUID | None = None


_EXTERNAL_STATUS = {
    OrderStatus.CREATED: "created",
    OrderStatus.PAID: "paid",
    OrderStatus.ASSEMBLING: "paid",
    OrderStatus.SHIPPED: "shipped",
    OrderStatus.DELIVERING: "delivering",
    OrderStatus.DELIVERED: "delivered",
    OrderStatus.COMPLETED: "completed",
    OrderStatus.CANCELLED: "cancelled",
}


def external_status(order: Order) -> str:
    visible = order.status_override or order.status
    method = getattr(order.delivery_method, "value", order.delivery_method)
    if method == DeliveryMethod.PICKUP.value and visible is OrderStatus.SHIPPED:
        return "delivered"
    return _EXTERNAL_STATUS[visible]


async def orders_with_same_payment(session: AsyncSession, order: Order) -> list[Order]:
    if order.multi_order_id:
        stmt = select(Order).where(Order.multi_order_id == order.multi_order_id)
    elif order.payment_url:
        stmt = select(Order).where(Order.payment_url == order.payment_url)
    else:
        return [order]
    rows = (await session.scalars(stmt)).unique().all()
    return list(rows) or [order]


async def sync_processor_payment(session: AsyncSession, order: Order) -> Order:
    """Mark every local order of the same payment paid.

    Called from the buyer list, the buyer card route and the seller card/list.
    Must not run inside get_order: change_status loads the row through get_order,
    and syncing there loops forever. A manual status override freezes actualization.
    """
    if order.status_override is not None:
        return order
    from processor import fetch_order, processor_url

    if (
        processor_url() is None
        or not order.external_order_id
        or order.status is not OrderStatus.CREATED
    ):
        return order
    remote = await fetch_order(order.external_order_id)
    if not remote or remote.get("status") != "PAID":
        return order
    updated = order
    for sibling in await orders_with_same_payment(session, order):
        if sibling.status is not OrderStatus.CREATED:
            if sibling.id == order.id:
                updated = sibling
            continue
        changed = await change_status(
            session,
            sibling.id,
            OrderStatus.PAID,
            "Оплата подтверждена",
            order=sibling,
        )
        if changed.id == order.id:
            updated = changed
    return updated


_CDEK_DELIVERED = {"DELIVERED", "POSTOMAT_RECEIVED"}
_CDEK_SHIPPED = {
    "RECEIVED_AT_SHIPMENT_WAREHOUSE",
    "READY_FOR_SHIPMENT_IN_SENDER_CITY",
    "READY_FOR_SHIPMENT_IN_TRANSIT_CITY",
    "SENT_TO_TRANSIT_CITY",
    "ACCEPTED_IN_TRANSIT_CITY",
    "ACCEPTED_AT_TRANSIT_WAREHOUSE",
    "SENT_TO_RECIPIENT_CITY",
    "ACCEPTED_IN_RECIPIENT_CITY",
    "ACCEPTED_AT_RECIPIENT_CITY_WAREHOUSE",
    "ACCEPTED_AT_PICK_UP_POINT",
    "TAKEN_BY_COURIER",
    "POSTOMAT_POSTED",
}


async def sync_cdek_progress(session: AsyncSession, order: Order) -> Order:
    """Подтянуть трек и статус СДЭК. Ошибки внешнего сервиса не роняют чтение заказа."""
    if order.status_override is not None:
        return order
    shipment_id = (order.cdek_order_uuid or "").strip()
    if not shipment_id or order.status in {OrderStatus.CANCELLED, OrderStatus.COMPLETED}:
        return order
    try:
        from cdek.client import fetch_shipment

        state = await fetch_shipment(shipment_id)
    except Exception:
        logger.exception("CDEK status was not refreshed for order %s", order.id)
        return order
    number = state.get("cdek_number")
    if number and order.tracking_number != number:
        order.tracking_number = str(number)[:120]
        await session.flush()
    code = state.get("status")
    if code in _CDEK_DELIVERED:
        target = OrderStatus.DELIVERED
    elif code in _CDEK_SHIPPED:
        target = OrderStatus.DELIVERING
    else:
        return order
    if order.status in {OrderStatus.PAID, OrderStatus.ASSEMBLING, OrderStatus.SHIPPED} and target in {
        OrderStatus.DELIVERING,
        OrderStatus.DELIVERED,
    }:
        order = await change_status(session, order.id, OrderStatus.DELIVERING, "Доставляется СДЭК", order=order)
    if target is OrderStatus.DELIVERED and order.status is OrderStatus.DELIVERING:
        order = await change_status(session, order.id, OrderStatus.DELIVERED, "Доставлен СДЭК", order=order)
    return order


async def ship_order(session: AsyncSession, order: Order, tracking_number: str | None) -> Order:
    if external_status(order) == "shipped":
        return order
    if external_status(order) != "paid":
        raise ConflictError(
            f"Cannot move order from {order.status} to shipped",
            code="invalid_status_transition",
        )
    from processor import confirm_shipment, processor_url

    method = getattr(order.delivery_method, "value", order.delivery_method)
    pickup = method == DeliveryMethod.PICKUP.value
    if processor_url() and order.external_order_id:
        code = await confirm_shipment(order.external_order_id)
        if not code:
            raise ConflictError("Order processor did not confirm shipment")
        order.receival_code = code
    elif pickup:
        if not order.receival_code:
            order.receival_code = f"{random.randint(0, 999999):06d}"
    elif tracking_number:
        order.tracking_number = tracking_number[:120]
    if pickup:
        return await change_status(session, order.id, OrderStatus.DELIVERED, "Доставлен")
    return await change_status(session, order.id, OrderStatus.SHIPPED, "Отправлен")


async def deliver_order(session: AsyncSession, order: Order, code: str | None) -> Order:
    if order.status is OrderStatus.DELIVERED:
        return order
    if order.status is not OrderStatus.SHIPPED:
        raise ConflictError(
            f"Cannot move order from {order.status} to delivered",
            code="invalid_status_transition",
        )
    from processor import complete_remote, processor_url

    if processor_url() and order.external_order_id:
        chosen = code or order.receival_code
        if not chosen or len(chosen) != 6 or not chosen.isdigit():
            raise BadRequestError("Receival code must be 6 digits")
        if not await complete_remote(order.external_order_id, chosen):
            raise ConflictError("Неверный код выдачи")
        if not _keep_cdek_track(order):
            order.tracking_number = chosen
        if order.receival_code is None:
            order.receival_code = chosen
    elif code:
        order.tracking_number = code[:120]
    return await change_status(session, order.id, OrderStatus.DELIVERED, "Доставлен")


async def complete_order(session: AsyncSession, order: Order, code: str | None) -> Order:
    """Продавец ввёл код, который назвал покупатель."""
    if order.status is OrderStatus.COMPLETED:
        return order
    method = getattr(order.delivery_method, "value", order.delivery_method)
    if method != DeliveryMethod.PICKUP.value or order.status not in {
        OrderStatus.SHIPPED,
        OrderStatus.DELIVERED,
    }:
        raise ConflictError("Заказ ещё нельзя завершить", code="invalid_status_transition")
    given = (code or "").strip()
    if not order.receival_code or given != order.receival_code:
        raise ConflictError("Неверный код выдачи")
    from processor import complete_remote, processor_url

    if processor_url() and order.external_order_id:
        if not await complete_remote(order.external_order_id, given):
            raise ConflictError("Неверный код выдачи")
    return await change_status(
        session, order.id, OrderStatus.COMPLETED, "Продавец подтвердил выдачу", order=order
    )


_CANCELLABLE = {OrderStatus.CREATED, OrderStatus.PAID, OrderStatus.ASSEMBLING}
_PICKUP_CANCELLABLE = _CANCELLABLE | {OrderStatus.SHIPPED, OrderStatus.DELIVERED}


def _cancellable_statuses(order: Order) -> set[OrderStatus]:
    method = getattr(order.delivery_method, "value", order.delivery_method)
    if method == DeliveryMethod.PICKUP.value:
        return _PICKUP_CANCELLABLE
    return _CANCELLABLE


async def cancel_order(session: AsyncSession, order: Order, comment: str) -> Order:
    """Самовывоз можно отменить до подтверждения кода. СДЭК — только до передачи в доставку."""
    visible = order.status_override or order.status
    allowed = _cancellable_statuses(order)
    if order.status is OrderStatus.CANCELLED or visible is OrderStatus.CANCELLED:
        return order
    if visible not in allowed or order.status not in allowed:
        raise ConflictError("Заказ уже нельзя отменить", code="invalid_status_transition")
    await _cancel_cdek_shipment(order)
    from processor import cancel_remote, processor_url

    if processor_url() and order.external_order_id:
        await cancel_remote(order.external_order_id)
    order.status_override = None
    return await change_status(session, order.id, OrderStatus.CANCELLED, comment, order=order)


async def _cancel_cdek_shipment(order: Order) -> None:
    method = getattr(order.delivery_method, "value", order.delivery_method)
    shipment_id = (order.cdek_order_uuid or "").strip()
    if method != DeliveryMethod.CDEK.value or not shipment_id:
        return
    from cdek.client import CdekError, cancel_shipment

    try:
        await cancel_shipment(shipment_id)
    except CdekError as exc:
        logger.warning("CDEK cancel failed for order %s: %s", order.id, exc)
        if exc.status_code == 409:
            raise ConflictError("СДЭК уже принял посылку, отменить заказ нельзя") from exc
        raise ConflictError("Не удалось отменить заявку в СДЭК") from exc


async def cancel_seller_order(session: AsyncSession, order: Order) -> Order:
    return await cancel_order(session, order, "Отменён продавцом")


def _buyer_id(query_user: uuid.UUID | None, body_user: uuid.UUID | None) -> uuid.UUID:
    if query_user is not None and body_user is not None and query_user != body_user:
        raise BadRequestError("user_id does not match")
    owner = query_user or body_user
    if owner is None:
        raise BadRequestError("user_id is required")
    return owner


async def _get_by_idempotency_key(session: AsyncSession, key: str) -> Order | None:
    result = await session.scalars(select(Order).where(Order.idempotency_key == key))
    return result.first()


async def _next_number() -> str:
    today = datetime.now(UTC).strftime("%y%m%d")
    suffix = f"{random.randint(0, 999999):06d}"
    return f"{_order_number_prefix}-{today}-{suffix}"


async def _publish(order: Order) -> None:
    if _producer is None:
        return
    await _producer.send(
        Topics.ORDERS_CHANGED,
        {
            "order_id": str(order.id),
            "number": order.number,
            "user_id": str(order.user_id),
            "status": order.status.value,
            "total_amount": str(order.total_amount),
            "items": [
                {"product_id": str(item.product_id), "quantity": item.quantity}
                for item in order.items
            ],
        },
        key=str(order.user_id),
    )


def _shop_id(value: str | None) -> str | None:
    text = (value or "").strip()
    return text or None


def _group_idempotency(base: str, index: int) -> str:
    suffix = f":{index}"
    return f"{base[: 80 - len(suffix)]}{suffix}"


def _office_code(value: str | None) -> str | None:
    text = (value or "").strip()
    return text or None


async def _new_order(payload: OrderCreate, idempotency_key: str | None) -> Order:
    delivery = DELIVERY_OPTIONS[payload.delivery_method]
    items_amount = sum(
        (item.price_amount * item.quantity for item in payload.items),
        Decimal("0"),
    ).quantize(TWO_PLACES)
    delivery_amount = (
        delivery.price_amount
        if payload.delivery_amount is None
        else payload.delivery_amount.quantize(TWO_PLACES)
    )
    total = (items_amount + delivery_amount - payload.discount_amount).quantize(TWO_PLACES)
    order = Order(
        number=await _next_number(),
        user_id=payload.user_id,
        status=OrderStatus.CREATED,
        idempotency_key=idempotency_key,
        currency=payload.currency,
        items_amount=items_amount,
        delivery_amount=delivery_amount,
        discount_amount=payload.discount_amount,
        total_amount=total,
        delivery_method=payload.delivery_method,
        delivery_address=payload.delivery_address,
        delivery_eta_days=delivery.eta_days,
        recipient_name=payload.recipient_name,
        recipient_phone=payload.recipient_phone,
        payment_method=payload.payment_method,
        comment=payload.comment,
        cdek_office_code=_office_code(payload.cdek_office_code),
        payout_token=(payload.payout_token or "").strip() or None,
        yookassa_account_id=_shop_id(payload.yookassa_account_id),
    )
    order.items = [OrderItem(**item.model_dump()) for item in payload.items]
    order.history = [OrderStatusHistory(status=OrderStatus.CREATED, comment="Заказ оформлен")]
    return order


async def create_order(
    session: AsyncSession, payload: OrderCreate, idempotency_key: str | None
) -> Order:
    if idempotency_key:
        existing = await _get_by_idempotency_key(session, idempotency_key)
        if existing is not None:
            return existing

    order = await _new_order(payload, idempotency_key)
    session.add(order)

    try:
        await session.flush()
    except Exception as exc:
        await session.rollback()
        if idempotency_key:
            existing = await _get_by_idempotency_key(session, idempotency_key)
            if existing is not None:
                return existing
        raise ConflictError("Could not create order") from exc

    from processor import attach_processor_order

    await attach_processor_order(order)
    await _publish(order)
    return order


async def _existing_checkout(session: AsyncSession, idempotency_key: str, size: int) -> list[Order]:
    found: list[Order] = []
    for index in range(size):
        order = await _get_by_idempotency_key(session, _group_idempotency(idempotency_key, index))
        if order is None:
            return []
        found.append(order)
    return found


def _checkout_group_payload(payload: CheckoutCreate, group: CheckoutGroupIn) -> OrderCreate:
    items: list[OrderItemIn] = []
    for item in group.items:
        data = item.model_dump()
        if data.get("seller_id") is None:
            data["seller_id"] = group.seller_id
        items.append(OrderItemIn(**data))
    return OrderCreate(
        user_id=payload.user_id,
        items=items,
        delivery_method=group.delivery_method,
        delivery_address=group.delivery_address,
        recipient_name=group.recipient_name,
        recipient_phone=group.recipient_phone,
        payment_method=group.payment_method,
        comment=group.comment,
        discount_amount=group.discount_amount,
        currency=group.currency,
        yookassa_account_id=_shop_id(group.yookassa_account_id),
        delivery_amount=group.delivery_amount,
        cdek_office_code=_office_code(group.cdek_office_code),
    )


async def create_checkout(
    session: AsyncSession, payload: CheckoutCreate, idempotency_key: str | None
) -> list[Order]:
    for group in payload.groups:
        if _shop_id(group.yookassa_account_id) is None:
            raise BadRequestError("У продавца не подключён магазин ЮKassa. Оплата невозможна.")
    if idempotency_key:
        existing = await _existing_checkout(session, idempotency_key, len(payload.groups))
        if existing:
            return existing

    orders: list[Order] = []
    for index, group in enumerate(payload.groups):
        key = _group_idempotency(idempotency_key, index) if idempotency_key else None
        order = await _new_order(_checkout_group_payload(payload, group), key)
        session.add(order)
        orders.append(order)
    try:
        await session.flush()
    except Exception as exc:
        await session.rollback()
        if idempotency_key:
            existing = await _existing_checkout(session, idempotency_key, len(payload.groups))
            if existing:
                return existing
        raise ConflictError("Could not create order") from exc

    from processor import attach_processor_orders

    await attach_processor_orders(orders)
    for order in orders:
        await _publish(order)
    return orders


async def repay_unpaid_order(session: AsyncSession, order: Order) -> Order:
    if order.status is not OrderStatus.CREATED:
        raise ConflictError("Заказ уже нельзя оплатить повторно")
    order = await sync_processor_payment(session, order)
    if order.status is not OrderStatus.CREATED:
        return order
    if not order.external_order_id:
        raise BadRequestError("Оплата для этого заказа не создана")
    from processor import confirmation_url, processor_url, repay_remote

    if processor_url() is None:
        raise BadRequestError("Оплата не настроена")
    payload = await repay_remote(order.external_order_id)
    if not payload:
        raise BadRequestError("Не удалось повторить оплату")
    url = confirmation_url(payload)
    if url:
        for sibling in await orders_with_same_payment(session, order):
            sibling.payment_url = url
        await session.flush()
    return order


async def get_order(
    session: AsyncSession, order_id: uuid.UUID, user_id: uuid.UUID | None = None
) -> Order:
    order = await session.get(Order, order_id)
    if order is None or (user_id is not None and order.user_id != user_id):
        raise NotFoundError(f"Order {order_id} not found")
    return order


async def list_for_user(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    status: OrderStatus | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[Sequence[Order], int]:
    query = select(Order).where(Order.user_id == user_id)
    if status is not None:
        query = query.where(Order.status == status)
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    result = await session.scalars(
        query.order_by(Order.created_at.desc()).limit(limit).offset(offset)
    )
    orders = result.all()
    for order in orders:
        await sync_processor_payment(session, order)
    return orders, int(total or 0)


def _keep_cdek_track(order: Order) -> bool:
    method = getattr(order.delivery_method, "value", order.delivery_method)
    return method == DeliveryMethod.CDEK.value and bool(order.tracking_number)


def _cdek_recipient_email(order: Order) -> tuple[str, bool]:
    comment = (order.comment or "").strip()
    email = comment if _EMAIL_RE.fullmatch(comment) else ""
    if email:
        return email, False
    return f"{order.user_id}@example.com", True


async def _seller_cdek_office(seller_id: uuid.UUID) -> str:
    base = os.getenv("B2B_URL", "").strip().rstrip("/")
    key = os.getenv("SERVICE_KEY", "").strip()
    if not base or not key:
        raise RuntimeError("B2B_URL or SERVICE_KEY is not configured")
    url = f"{base}/internal/sellers/{seller_id}/cdek-shipment"
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url, headers={"X-Service-Key": key})
    if response.status_code >= 400:
        raise RuntimeError(f"seller cdek shipment lookup failed with status {response.status_code}")
    body = response.json()
    data = body.get("data") if isinstance(body, dict) else None
    raw = None
    if isinstance(data, dict):
        raw = data.get("officeCode") or data.get("office_code")
    code = str(raw).strip() if raw else ""
    if not code:
        raise RuntimeError("seller cdek office code is empty")
    return code


async def _create_cdek_order(
    from_office_code: str,
    to_office_code: str,
    recipient_name: str,
    recipient_email: str,
    item_count: int,
    number: str,
    recipient_phone: str,
) -> dict[str, str | None]:
    from cdek.client import create_order

    return await create_order(
        from_office_code,
        to_office_code,
        recipient_name,
        recipient_email,
        item_count,
        number,
        recipient_phone,
    )


async def _ensure_cdek_order(order: Order) -> str | None:
    """Create the CDEK shipment once payment is recorded. Never raises."""
    method = getattr(order.delivery_method, "value", order.delivery_method)
    office = (order.cdek_office_code or "").strip()
    if method != DeliveryMethod.CDEK.value or not office or order.cdek_order_uuid:
        return None
    seller_id = next(
        (item.seller_id for item in order.items if item.seller_id is not None),
        None,
    )
    if seller_id is None:
        logger.error("CDEK order skipped, seller is missing: %s", order.id)
        return None
    email, fallback = _cdek_recipient_email(order)
    item_count = sum(item.quantity for item in order.items)
    try:
        created = await _create_cdek_order(
            await _seller_cdek_office(seller_id),
            office,
            order.recipient_name,
            email,
            item_count,
            str(order.id),
            order.recipient_phone or "",
        )
    except Exception:
        logger.exception("CDEK order was not created for paid order %s", order.id)
        return None
    cdek_uuid = str(created.get("uuid") or "").strip()
    if cdek_uuid:
        order.cdek_order_uuid = cdek_uuid[:64]
    cdek_number = created.get("cdek_number")
    if cdek_number:
        order.tracking_number = str(cdek_number)[:120]
    if fallback:
        logger.info("CDEK recipient email fallback used for order %s", order.id)
        return CDEK_EMAIL_FALLBACK_NOTE
    return None


async def change_status(
    session: AsyncSession,
    order_id: uuid.UUID,
    new_status: OrderStatus,
    comment: str | None = None,
    *,
    order: Order | None = None,
) -> Order:
    if order is None or order.id != order_id:
        order = await get_order(session, order_id)
    if new_status not in STATUS_TRANSITIONS[order.status]:
        raise ConflictError(
            f"Cannot move order from {order.status} to {new_status}",
            code="invalid_status_transition",
        )
    order.status = new_status
    note: str | None = None
    if new_status is OrderStatus.PAID:
        order.paid_at = datetime.now(UTC)
        note = await _ensure_cdek_order(order)
    if note:
        comment = f"{comment}. {note}" if comment else note
    session.add(OrderStatusHistory(order_id=order.id, status=new_status, comment=comment))
    await session.flush()
    await _publish(order)
    return order


@router.post(
    "/checkouts",
    response_model=CheckoutOut,
    status_code=status.HTTP_201_CREATED,
    tags=["orders"],
)
async def create_checkout_route(
    payload: CheckoutCreate,
    session: SessionDep,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> CheckoutOut:
    orders = await create_checkout(session, payload, idempotency_key)
    payment = next((order.payment_url for order in orders if order.payment_url), None)
    return CheckoutOut(
        orders=[OrderOut.model_validate(order) for order in orders],
        payment_url=payment,
    )


@router.post(
    "/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED, tags=["orders"]
)
async def create_order_route(
    payload: OrderCreate,
    session: SessionDep,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> Order:
    return await create_order(session, payload, idempotency_key)


@router.get("/orders", response_model=OrderListOut, tags=["orders"])
async def list_orders(
    session: SessionDep,
    user_id: uuid.UUID,
    order_status: OrderStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> OrderListOut:
    items, total = await list_for_user(
        session,
        user_id,
        status=order_status,
        limit=limit,
        offset=offset,
    )
    return OrderListOut(items=[OrderOut.model_validate(item) for item in items], total=total)


@router.get("/orders/{order_id}", response_model=OrderOut, tags=["orders"])
async def get_order_route(
    order_id: uuid.UUID,
    session: SessionDep,
    user_id: uuid.UUID | None = None,
) -> Order:
    order = await get_order(session, order_id, user_id)
    order = await sync_processor_payment(session, order)
    return await sync_cdek_progress(session, order)


@router.post("/orders/{order_id}/cancel", response_model=OrderOut, tags=["orders"])
async def cancel_order_route(
    order_id: uuid.UUID,
    session: SessionDep,
    user_id: uuid.UUID | None = None,
) -> Order:
    if user_id is None:
        raise BadRequestError("user_id is required")
    order = await get_order(session, order_id, user_id)
    return await cancel_order(session, order, "Отменён покупателем")


@router.post("/orders/{order_id}/repay", response_model=OrderOut, tags=["orders"])
async def repay_order_route(
    order_id: uuid.UUID,
    session: SessionDep,
    user_id: uuid.UUID | None = None,
) -> Order:
    order = await get_order(session, order_id, user_id)
    return await repay_unpaid_order(session, order)


@router.patch("/orders/{order_id}/status", response_model=OrderOut, tags=["orders"])
async def change_status_route(
    order_id: uuid.UUID,
    payload: OrderStatusPatch,
    session: SessionDep,
) -> Order:
    return await change_status(session, order_id, payload.status, payload.comment)


@router.post("/orders/{order_id}/receive", response_model=OrderOut, tags=["orders"])
async def receive_order_route(
    order_id: uuid.UUID,
    payload: ReceiveIn,
    session: SessionDep,
    user_id: uuid.UUID | None = None,
) -> Order:
    owner = _buyer_id(user_id, payload.user_id)
    order = await get_order(session, order_id, owner)
    del payload
    raise ConflictError("Получение подтверждает продавец или служба доставки")


@router.get("/delivery-options", response_model=list[DeliveryOption], tags=["delivery"])
async def list_delivery_options() -> list[DeliveryOption]:
    return list(DELIVERY_OPTIONS.values())


class AdminOrderOut(BaseModel):
    id: uuid.UUID
    number: str
    status: OrderStatus
    status_override: OrderStatus | None = None
    delivery_method: DeliveryMethod
    total_amount: Decimal
    recipient_name: str
    tracking_number: str | None = None
    created_at: datetime


class StatusOverrideIn(BaseModel):
    status: OrderStatus | None = None


@router.get("/admin/orders", response_model=list[AdminOrderOut], tags=["admin"])
async def admin_list_orders(session: SessionDep) -> list[Order]:
    rows = await session.scalars(select(Order).order_by(Order.created_at.desc()).limit(100))
    return list(rows.all())


@router.patch("/admin/orders/{order_id}", response_model=AdminOrderOut, tags=["admin"])
async def admin_set_status_override(
    order_id: uuid.UUID,
    payload: StatusOverrideIn,
    session: SessionDep,
) -> Order:
    order = await get_order(session, order_id)
    order.status_override = payload.status
    await session.flush()
    return order
