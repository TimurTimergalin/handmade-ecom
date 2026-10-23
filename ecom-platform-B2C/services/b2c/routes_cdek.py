"""CDEK widget proxy and delivery quote. Credentials stay on the server."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import httpx
from common.app import BadRequestError, UpstreamError
from fastapi import APIRouter, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

_SERVICES_DIR = Path(__file__).resolve().parents[1]
if str(_SERVICES_DIR) not in sys.path:
    sys.path.append(str(_SERVICES_DIR))

from cdek.client import CdekClient, CdekError, close_client, get_client, set_client  # noqa: E402

__all__ = ["bind", "close_client", "office_code_for_seller", "quote_delivery_price", "router"]

router = APIRouter(prefix="/api", tags=["cdek"])

_NO_SHIPMENT = "У продавца не выбран пункт отгрузки СДЭК"
_settings: Any = None


class QuoteIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_office_code: str | None = Field(default=None, alias="fromOfficeCode")
    seller_id: str | None = Field(default=None, alias="sellerId")
    to_office_code: str = Field(alias="toOfficeCode", min_length=1)
    item_count: int = Field(default=1, ge=1, alias="itemCount")


def bind(settings: Any) -> None:
    global _settings
    _settings = settings
    set_client(
        CdekClient(
            base_url=settings.cdek_api_url,
            client_id=settings.cdek_client_id,
            client_secret=settings.cdek_client_secret,
        )
    )


async def office_code_for_seller(seller_id: str) -> str:
    """Seller shipment office from B2B, same service-key call as payout-token."""
    settings = _settings
    base = str(getattr(settings, "b2b_url", "") or "").strip().rstrip("/")
    key = str(getattr(settings, "service_key", "") or "").strip()
    seller = seller_id.strip()
    if settings is None or not base or not key or not seller:
        raise BadRequestError(_NO_SHIPMENT)
    timeout = float(getattr(settings, "upstream_timeout_seconds", 5.0) or 5.0)
    url = f"{base}/internal/sellers/{seller}/cdek-shipment"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url, headers={"X-Service-Key": key})
    except httpx.HTTPError as exc:
        raise UpstreamError("b2b", "Не удалось получить пункт отгрузки продавца") from exc
    if response.status_code != 200:
        raise BadRequestError(_NO_SHIPMENT)
    try:
        body = response.json()
    except ValueError as exc:
        raise BadRequestError(_NO_SHIPMENT) from exc
    data = body.get("data") if isinstance(body, dict) else None
    code = ""
    if isinstance(data, dict):
        raw = data.get("officeCode")
        code = str(raw).strip() if raw else ""
    if not code:
        raise BadRequestError(_NO_SHIPMENT)
    return code


async def quote_delivery_price(from_office_code: str, to_office_code: str, item_count: int) -> int:
    try:
        return await get_client().quote_pvz(from_office_code, to_office_code, item_count)
    except CdekError as exc:
        raise UpstreamError("cdek", "Не удалось рассчитать доставку СДЭК") from exc
    except ValueError as exc:
        raise UpstreamError("cdek", "Не удалось рассчитать доставку СДЭК") from exc


@router.post("/cdek/quote")
async def quote_delivery(body: QuoteIn) -> dict[str, int]:
    from_code = (body.from_office_code or "").strip()
    if not from_code:
        seller_id = (body.seller_id or "").strip()
        if not seller_id:
            raise BadRequestError("Укажите пункт отправления или продавца")
        from_code = await office_code_for_seller(seller_id)
    price = await quote_delivery_price(from_code, body.to_office_code.strip(), body.item_count)
    return {"price": price}


@router.api_route("/cdek/service", methods=["GET", "POST"])
async def cdek_widget_service(request: Request) -> Response:
    raw = await request.body()
    payload: dict[str, Any] | None = None
    if raw:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            payload = parsed
    try:
        result = await get_client().proxy_widget(dict(request.query_params), payload)
    except CdekError as exc:
        raise UpstreamError("cdek", str(exc)) from exc
    return Response(
        content=result.content,
        status_code=result.status_code,
        headers=dict(result.headers),
    )
