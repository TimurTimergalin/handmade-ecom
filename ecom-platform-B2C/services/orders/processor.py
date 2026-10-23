"""Calls the YooKassa order processor when ORDER_PROCESSOR_URL is configured."""

from __future__ import annotations

import logging
import os
from decimal import Decimal
from typing import Any

import httpx

logger = logging.getLogger(__name__)
_TIMEOUT = 10.0


def processor_url() -> str | None:
    value = os.getenv("ORDER_PROCESSOR_URL", "").strip().rstrip("/")
    return value or None


async def request_json(
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
) -> tuple[int | None, dict[str, Any] | None]:
    base = processor_url()
    if base is None:
        return None, None
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.request(method, f"{base}{path}", json=body)
    except httpx.HTTPError:
        logger.exception("order processor request failed: %s %s", method, path)
        return None, None
    payload: dict[str, Any] | None
    try:
        parsed = response.json()
        payload = parsed if isinstance(parsed, dict) else None
    except ValueError:
        payload = None
    if response.status_code >= 400:
        logger.warning("order processor %s %s returned %s", method, path, response.status_code)
    return response.status_code, payload


async def fetch_order(external_id: str) -> dict[str, Any] | None:
    status, payload = await request_json("GET", f"/v1/orders/{external_id}")
    if status == 200 and payload is not None:
        return payload
    return None


async def confirm_shipment(external_id: str) -> str | None:
    status, payload = await request_json("POST", f"/v1/orders/{external_id}/confirm")
    if status == 200 and payload and payload.get("receival_code"):
        return str(payload["receival_code"])
    remote = await fetch_order(external_id)
    if (
        remote
        and remote.get("receival_code")
        and remote.get("status") in {"DELIVERED", "COMPLETED"}
    ):
        return str(remote["receival_code"])
    return None


async def complete_remote(external_id: str, code: str) -> bool:
    status, payload = await request_json(
        "POST",
        f"/v1/orders/{external_id}/complete",
        {"receival_code": code},
    )
    if status == 200 and payload and payload.get("status") == "COMPLETED":
        return True
    remote = await fetch_order(external_id)
    return bool(remote and remote.get("status") == "COMPLETED")


async def cancel_remote(external_id: str) -> None:
    await request_json("POST", f"/v1/orders/{external_id}/cancel")


def _money(amount: Decimal | str) -> str:
    return format(Decimal(str(amount)).quantize(Decimal("0.01")), "f")


def _delivery_type(order: Any) -> str | None:
    method = getattr(order.delivery_method, "value", order.delivery_method)
    if method in {"pickup", "cdek"}:
        return str(method)
    return None


def _seller_id(order: Any) -> str | None:
    items = list(getattr(order, "items", None) or [])
    if not items or getattr(items[0], "seller_id", None) is None:
        return None
    return str(items[0].seller_id)


def checkout_group(order: Any) -> dict[str, Any] | None:
    """One seller group for POST /v1/orders. Pickup and CDEK are both sent."""
    delivery = _delivery_type(order)
    seller_id = _seller_id(order)
    shop_id = (getattr(order, "yookassa_account_id", None) or "").strip()
    items = list(getattr(order, "items", None) or [])
    if delivery is None or not seller_id or not shop_id or not items:
        return None
    address = (getattr(order, "delivery_address", None) or "").strip() or delivery
    payload_items = [
        {
            "sku_id": str(item.product_id),
            "name": (getattr(item, "title", None) or "item")[:255],
            "image": (getattr(item, "image_url", None) or "https://example.invalid/item")[:2048],
            "price": _money(item.price_amount),
            "quantity": item.quantity,
        }
        for item in items
    ]
    delivery_amount = getattr(order, "delivery_amount", None)
    if delivery_amount is not None and Decimal(str(delivery_amount)) > 0:
        payload_items.append(
            {
                "sku_id": "cdek-delivery",
                "name": "Доставка СДЭК",
                "image": "https://example.invalid/item",
                "price": _money(delivery_amount),
                "quantity": 1,
            }
        )
    return {
        "seller_id": seller_id,
        "yookassa_account_id": shop_id,
        "address": address[:1024],
        "delivery_type": delivery,
        "items": payload_items,
    }


def checkout_request(orders: list[Any]) -> dict[str, Any] | None:
    """Body for one POST /v1/orders covering every payable seller in the checkout.

    A pickup/cdek group without shopId makes the whole payment impossible:
    the caller must not create a partial multi-order.
    """
    if not orders:
        return None
    groups: list[dict[str, Any]] = []
    for order in orders:
        if _delivery_type(order) is None:
            continue
        group = checkout_group(order)
        if group is None:
            return None
        groups.append(group)
    if not groups:
        return None
    return {
        "user_id": str(orders[0].user_id),
        "idempotency_key": str(orders[0].id),
        "groups": groups,
    }


def confirmation_url(payload: dict[str, Any]) -> str | None:
    url = payload.get("confirmation_url")
    payment = payload.get("payment")
    if not url and isinstance(payment, dict):
        url = payment.get("confirmation_url")
    text = str(url).strip() if url else ""
    return text or None


def apply_processor_checkout(orders: list[Any], payload: dict[str, Any]) -> None:
    """Store one confirmation_url on every local order and each seller's external id."""
    url = confirmation_url(payload)
    multi_id = str(payload["multi_order_id"])[:64] if payload.get("multi_order_id") else None
    remote_orders = payload.get("orders") if isinstance(payload.get("orders"), list) else []
    buckets: dict[str, list[dict[str, Any]]] = {}
    for item in remote_orders:
        if isinstance(item, dict) and item.get("seller_id") and item.get("order_id"):
            buckets.setdefault(str(item["seller_id"]), []).append(item)
    seen: set[str] = set()
    for order in orders:
        seller_id = _seller_id(order)
        remote = buckets[seller_id].pop(0) if seller_id and buckets.get(seller_id) else None
        if url:
            order.payment_url = url
        if multi_id:
            order.multi_order_id = multi_id
        external = None
        if remote is not None:
            external = str(remote["order_id"])[:36]
        elif len(orders) == 1 and payload.get("order_id"):
            external = str(payload["order_id"])[:36]
        if external and external not in seen:
            order.external_order_id = external
            seen.add(external)


async def attach_processor_orders(orders: list[Any]) -> None:
    if processor_url() is None or not orders:
        return
    body = checkout_request(orders)
    if body is None:
        logger.info(
            "order processor skipped, yookassa shop id or seller group is missing: %s",
            [getattr(order, "id", None) for order in orders],
        )
        return
    try:
        status, payload = await request_json("POST", "/v1/orders", body)
        if status not in (200, 201) or not isinstance(payload, dict):
            return
        if not payload.get("orders") and not payload.get("order_id"):
            return
        apply_processor_checkout(orders, payload)
    except Exception:
        logger.exception(
            "order processor create failed for %s",
            [getattr(order, "id", None) for order in orders],
        )


async def attach_processor_order(order: Any) -> None:
    await attach_processor_orders([order])


async def repay_remote(external_id: str) -> dict[str, Any] | None:
    status, payload = await request_json("POST", f"/v1/orders/{external_id}/repay")
    if status in (200, 201) and isinstance(payload, dict):
        return payload
    return None
