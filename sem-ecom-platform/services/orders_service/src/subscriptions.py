"""Premium subscription checkout via a regular YooKassa payment."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from urllib.parse import urlparse

from fastapi import APIRouter, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from yookassa import Payment

import yookassa_setup

router = APIRouter(prefix="/api/internal/subscriptions", tags=["subscriptions"])


class CheckoutIn(BaseModel):
    sellerId: str = Field(min_length=1, max_length=64)
    tier: str
    amount: int = Field(ge=1)
    currency: str = "RUB"


def envelope(data: dict) -> dict:
    return {"data": data, "error": None}


def fail(status: int, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"data": None, "error": {"code": "UPSTREAM_ERROR", "message": message}},
    )


def subscription_return_url() -> str:
    parsed = urlparse(yookassa_setup.return_url or "http://localhost:3000/account/orders")
    origin = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else "http://localhost:3000"
    return f"{origin}/seller/pricing?sync=1"


def money(amount: int) -> str:
    return format(Decimal(amount).quantize(Decimal("0.01")), "f")


def metadata_of(payment) -> dict:
    raw = getattr(payment, "metadata", None)
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        return dict(raw)
    except (TypeError, ValueError):
        return {}


def status_of(payment, seller_id: str) -> dict:
    meta = metadata_of(payment)
    if str(meta.get("seller_id") or "") != seller_id:
        return {}
    remote = getattr(payment, "status", "") or ""
    if remote == "succeeded":
        status = "confirmed"
    elif remote == "canceled":
        status = "cancelled"
    else:
        status = "pending"
    valid_until = None
    if status == "confirmed":
        valid_until = (datetime.now(UTC) + timedelta(days=30)).isoformat()
    return {
        "sellerId": seller_id,
        "reference": str(payment.id),
        "status": status,
        "tier": "premium",
        "validUntil": valid_until,
        "onlinePayments": status == "confirmed",
    }


@router.post("/checkout", response_model=None)
async def checkout(
    body: CheckoutIn,
    idempotency_key: str = Header(alias="Idempotency-Key"),
) -> dict | JSONResponse:
    if body.tier != "premium" or body.currency != "RUB":
        return fail(400, "Поддерживается только Premium в рублях")
    try:
        payment = await asyncio.to_thread(
            Payment.create,
            {
                "amount": {"value": money(body.amount), "currency": "RUB"},
                "capture": True,
                "confirmation": {"type": "redirect", "return_url": subscription_return_url()},
                "description": "Подписка Premium",
                "metadata": {"seller_id": body.sellerId, "purpose": "premium"},
            },
            idempotency_key,
        )
    except Exception:
        return fail(502, "YooKassa request failed")
    confirmation = getattr(payment, "confirmation", None)
    url = getattr(confirmation, "confirmation_url", None)
    if not getattr(payment, "id", None) or not url:
        return fail(502, "YooKassa request failed")
    return envelope({"reference": str(payment.id), "paymentUrl": url, "status": "pending"})


@router.get("/{reference}", response_model=None)
async def state(reference: str, sellerId: str) -> dict | JSONResponse:
    try:
        payment = await asyncio.to_thread(Payment.find_one, reference)
    except Exception:
        return fail(502, "YooKassa request failed")
    if payment is None or not getattr(payment, "id", None):
        return fail(404, "Платёж не найден")
    payload = status_of(payment, sellerId)
    if not payload:
        return fail(404, "Платёж не найден")
    return envelope(payload)
