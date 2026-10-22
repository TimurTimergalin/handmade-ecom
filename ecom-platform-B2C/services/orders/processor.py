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


async def attach_processor_order(order: Any) -> None:
    if processor_url() is None:
        return
    try:
        method = getattr(order.delivery_method, "value", order.delivery_method)
        if method != "pickup":
            return
        items = list(order.items or [])
        if not items or items[0].seller_id is None:
            return
        token = (getattr(order, "payout_token", None) or "").strip()
        if not token:
            logger.info("order processor skipped, seller payout token is missing: %s", order.id)
            return
        body = {
            "items": [
                {
                    "sku_id": str(item.product_id),
                    "name": (item.title or "item")[:255],
                    "image": (item.image_url or "https://example.invalid/item")[:2048],
                    "price": _money(item.price_amount),
                    "quantity": item.quantity,
                }
                for item in items
            ],
            "user_id": str(order.user_id),
            "seller_id": str(items[0].seller_id),
            "address": (order.delivery_address or "pickup")[:1024],
            "delivery_type": "pickup",
            "idempotency_key": str(order.id),
            "payout_token": token,
        }
        status, payload = await request_json("POST", "/v1/orders", body)
        if status not in (200, 201) or not payload or not payload.get("order_id"):
            return
        order.external_order_id = str(payload["order_id"])[:36]
        order.payment_url = payload.get("confirmation_url")
    except Exception:
        logger.exception("order processor create failed for %s", getattr(order, "id", None))
