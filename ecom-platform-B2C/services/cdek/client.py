"""CDEK API v2 client.

Widget proxy follows ``service.php`` from ``@cdek-it/widget`` 3.12.1:
``offices``, ``calculate``, ``byCoordinate``.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

import httpx

# Warehouse-to-warehouse (ПВЗ → ПВЗ). CDEK tariff «Посылка склад-склад».
TARIFF_CODE_PVZ = 136
BOX_WEIGHT_G = 500
BOX_LENGTH_CM = 10
BOX_WIDTH_CM = 10
BOX_HEIGHT_CM = 10
WIDGET_VERSION = "3.12.1"
DEFAULT_API_URL = "https://api.edu.cdek.ru/v2"

_WIDGET_ACTIONS = {
    "offices": ("GET", "deliverypoints"),
    "calculate": ("POST", "calculator/tarifflist"),
    "byCoordinate": ("GET", "deliverypoints/byPolygons"),
}

_default_client: CdekClient | None = None


class CdekError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        self.status_code = status_code
        super().__init__(message)


@dataclass(frozen=True, slots=True)
class WidgetProxyResponse:
    status_code: int
    content: bytes
    headers: tuple[tuple[str, str], ...]


def _rub(value: object) -> int:
    amount = Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(amount)


def _boxes(item_count: int) -> list[dict[str, int]]:
    if item_count < 1:
        raise ValueError("item_count must be >= 1")
    return [
        {
            "weight": BOX_WEIGHT_G,
            "length": BOX_LENGTH_CM,
            "width": BOX_WIDTH_CM,
            "height": BOX_HEIGHT_CM,
        }
        for _ in range(item_count)
    ]


def _order_packages(item_count: int) -> list[dict[str, Any]]:
    packages: list[dict[str, Any]] = []
    for index, box in enumerate(_boxes(item_count), start=1):
        packages.append(
            {
                **box,
                "number": str(index),
                "items": [
                    {
                        "name": "Товар",
                        "ware_key": str(index),
                        "payment": {"value": 0},
                        "cost": 0,
                        "weight": BOX_WEIGHT_G,
                        "amount": 1,
                    }
                ],
            }
        )
    return packages


def _entity_number(entity: Mapping[str, Any]) -> str | None:
    value = entity.get("cdek_number")
    if value is None or value == "":
        return None
    return str(value)


class CdekClient:
    def __init__(
        self,
        *,
        base_url: str,
        client_id: str,
        client_secret: str,
        client: httpx.AsyncClient | None = None,
        tariff_code: int = TARIFF_CODE_PVZ,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.tariff_code = tariff_code
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            base_url=self.base_url + "/",
            timeout=20.0,
        )
        self._token: str | None = None
        self._token_deadline = 0.0
        self._token_lock: asyncio.Lock | None = None
        self._city_codes: dict[str, int] = {}

    @classmethod
    def from_env(cls) -> CdekClient:
        client_id = os.getenv("CDEK_CLIENT_ID", "")
        client_secret = os.getenv("CDEK_CLIENT_SECRET", "")
        if not client_id or not client_secret:
            raise CdekError("CDEK credentials are not configured")
        return cls(
            base_url=os.getenv("CDEK_API_URL", DEFAULT_API_URL),
            client_id=client_id,
            client_secret=client_secret,
        )

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def _access_token(self) -> str:
        now = time.monotonic()
        if self._token is not None and now < self._token_deadline:
            return self._token
        if self._token_lock is None:
            self._token_lock = asyncio.Lock()
        async with self._token_lock:
            now = time.monotonic()
            if self._token is not None and now < self._token_deadline:
                return self._token
            response = await self._client.post(
                "oauth/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
                headers={"Accept": "application/json"},
            )
            if response.status_code >= 400:
                raise CdekError("CDEK authorization failed", status_code=response.status_code)
            payload = response.json()
            token = payload.get("access_token")
            if not token:
                raise CdekError("CDEK authorization failed", status_code=response.status_code)
            expires_in = int(payload.get("expires_in") or 0)
            self._token = str(token)
            self._token_deadline = time.monotonic() + expires_in
            return self._token

    def _auth_headers(self, token: str) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        }

    async def quote_pvz(self, from_office_code: str, to_office_code: str, item_count: int) -> int:
        packages = _boxes(item_count)
        token = await self._access_token()
        from_city = await self._office_city_code(from_office_code, token)
        to_city = await self._office_city_code(to_office_code, token)
        response = await self._client.post(
            "calculator/tariff",
            json={
                "type": 1,
                "tariff_code": self.tariff_code,
                "from_location": {"code": from_city},
                "to_location": {"code": to_city},
                "shipment_point": from_office_code,
                "delivery_point": to_office_code,
                "packages": packages,
            },
            headers=self._auth_headers(token),
        )
        if response.status_code >= 400:
            raise CdekError("CDEK calculator request failed", status_code=response.status_code)
        payload = response.json()
        if "delivery_sum" not in payload:
            raise CdekError("CDEK calculator response has no delivery_sum")
        return _rub(payload["delivery_sum"])

    async def _office_city_code(self, office_code: str, token: str) -> int:
        cached = self._city_codes.get(office_code)
        if cached is not None:
            return cached
        response = await self._client.get(
            "deliverypoints",
            params={"code": office_code},
            headers=self._auth_headers(token),
        )
        if response.status_code >= 400:
            raise CdekError("CDEK office lookup failed", status_code=response.status_code)
        points = response.json()
        if not isinstance(points, list) or not points:
            raise CdekError("CDEK office was not found")
        city_code = (points[0].get("location") or {}).get("city_code")
        if not isinstance(city_code, int):
            raise CdekError("CDEK office has no city")
        self._city_codes[office_code] = city_code
        return city_code

    async def create_order(
        self,
        from_office_code: str,
        to_office_code: str,
        recipient_name: str,
        recipient_email: str,
        recipient_phone: str,
        item_count: int,
        number: str,
    ) -> dict[str, str | None]:
        packages = _order_packages(item_count)
        token = await self._access_token()
        recipient: dict[str, Any] = {"name": recipient_name, "email": recipient_email}
        phone = recipient_phone.strip()
        if phone:
            recipient["phones"] = [{"number": phone}]
        response = await self._client.post(
            "orders",
            json={
                "type": 1,
                "number": number,
                "tariff_code": self.tariff_code,
                "shipment_point": from_office_code,
                "delivery_point": to_office_code,
                "recipient": recipient,
                "packages": packages,
            },
            headers=self._auth_headers(token),
        )
        if response.status_code >= 400:
            raise CdekError("CDEK order request failed", status_code=response.status_code)
        payload = response.json()
        entity = payload.get("entity") or {}
        uuid = entity.get("uuid")
        if not uuid:
            raise CdekError("CDEK order response has no uuid")
        cdek_number = _entity_number(entity)
        if cdek_number is None:
            loaded = await self._get_order(str(uuid), token)
            cdek_number = _entity_number(loaded.get("entity") or {})
        return {"uuid": str(uuid), "cdek_number": cdek_number}

    async def shipment_state(self, order_uuid: str) -> dict[str, str | None]:
        token = await self._access_token()
        body = await self._get_order(order_uuid, token)
        entity = body.get("entity") or {}
        statuses = entity.get("statuses") or []
        latest = ""
        code: str | None = None
        for item in statuses:
            if not isinstance(item, dict):
                continue
            moment = str(item.get("date_time") or "")
            if code is None or moment >= latest:
                latest = moment
                raw = item.get("code")
                code = str(raw) if raw else None
        return {"cdek_number": _entity_number(entity), "status": code}

    async def delete_order(self, order_uuid: str) -> None:
        """Снять заявку, пока СДЭК ещё не принял посылку."""
        token = await self._access_token()
        response = await self._client.delete(f"orders/{order_uuid}", headers=self._auth_headers(token))
        body: dict[str, Any] = {}
        try:
            parsed = response.json()
        except ValueError:
            parsed = None
        if isinstance(parsed, dict):
            body = parsed
        refused = _delete_refused(body)
        if response.status_code >= 400 or refused:
            raise CdekError(
                "CDEK refused to delete the order" if refused else "CDEK order cancel failed",
                status_code=409 if refused else response.status_code,
            )

    async def _get_order(self, uuid: str, token: str) -> dict[str, Any]:
        response = await self._client.get(f"orders/{uuid}", headers=self._auth_headers(token))
        if response.status_code >= 400:
            raise CdekError("CDEK order lookup failed", status_code=response.status_code)
        body = response.json()
        if not isinstance(body, dict):
            raise CdekError("CDEK order lookup returned an unexpected body")
        return body

    async def proxy_widget(
        self, query: Mapping[str, str], body: Mapping[str, Any] | None
    ) -> WidgetProxyResponse:
        """Same action contract as widget ``service.php`` 3.12.1."""
        started = time.perf_counter()
        merged: dict[str, Any] = dict(query)
        if body:
            merged.update(body)
        action = merged.get("action")
        if not action:
            return _widget_error(400, "Action is required")
        route = _WIDGET_ACTIONS.get(str(action))
        if route is None:
            return _widget_error(400, "Unknown action")
        try:
            token = await self._access_token()
        except CdekError:
            return _widget_error(500, "Server not authorized to CDEK API")
        auth_ms = round((time.perf_counter() - started) * 1000, 2)
        method, path = route
        headers = {
            **self._auth_headers(token),
            "X-App-Name": "widget_pvz",
            "X-App-Version": WIDGET_VERSION,
            "User-Agent": f"widget/{WIDGET_VERSION}",
        }
        if method == "POST":
            response = await self._client.post(path, json=merged, headers=headers)
        else:
            response = await self._client.get(path, params=merged, headers=headers)
        total_ms = round((time.perf_counter() - started) * 1000, 2)
        forwarded = tuple(
            (key.decode(), value.decode())
            for key, value in response.headers.raw
            if key.lower().startswith(b"x-")
        )
        timing = (
            f'auth;desc="Server Auth Time";dur={auth_ms},'
            f'total;desc="Total Time";dur={total_ms}'
        )
        return WidgetProxyResponse(
            status_code=response.status_code,
            content=response.content,
            headers=(
                ("Content-Type", "application/json"),
                ("X-Service-Version", WIDGET_VERSION),
                *forwarded,
                ("Server-Timing", timing),
            ),
        )


def _delete_refused(body: Mapping[str, Any]) -> bool:
    requests = body.get("requests")
    if not isinstance(requests, list):
        return False
    for item in requests:
        if isinstance(item, dict) and str(item.get("state") or "").upper() == "INVALID":
            return True
    return False


def _widget_error(status_code: int, message: str) -> WidgetProxyResponse:
    return WidgetProxyResponse(
        status_code=status_code,
        content=json.dumps({"message": message}).encode(),
        headers=(
            ("Content-Type", "application/json"),
            ("X-Service-Version", WIDGET_VERSION),
        ),
    )


def get_client() -> CdekClient:
    if _default_client is None:
        return set_client(CdekClient.from_env())
    return _default_client


def set_client(client: CdekClient) -> CdekClient:
    global _default_client
    _default_client = client
    return client


async def close_client() -> None:
    global _default_client
    client = _default_client
    _default_client = None
    if client is not None:
        await client.aclose()


async def create_order(
    from_office_code: str,
    to_office_code: str,
    recipient_name: str,
    recipient_email: str,
    item_count: int,
    number: str,
    recipient_phone: str = "",
) -> dict[str, str | None]:
    return await get_client().create_order(
        from_office_code,
        to_office_code,
        recipient_name,
        recipient_email,
        recipient_phone,
        item_count,
        number,
    )


async def fetch_shipment(order_uuid: str) -> dict[str, str | None]:
    return await get_client().shipment_state(order_uuid)


async def cancel_shipment(order_uuid: str) -> None:
    await get_client().delete_order(order_uuid)
