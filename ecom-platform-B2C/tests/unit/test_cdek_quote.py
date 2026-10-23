from __future__ import annotations

import sys
import uuid
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest
import respx

pytestmark = pytest.mark.unit

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "libs"))
sys.path.insert(0, str(ROOT / "services"))
sys.path.insert(0, str(ROOT / "services" / "b2c"))

from common.app import BadRequestError  # noqa: E402
from contract_api.errors import ApiError  # noqa: E402
from facade import FrontendFacade  # noqa: E402
from routes_cdek import QuoteIn, bind, quote_delivery  # noqa: E402

B2B = "http://b2b.test/api"
SELLER = "11111111-1111-1111-1111-111111111111"
SHIPMENT = f"{B2B}/internal/sellers/{SELLER}/cdek-shipment"


class _Settings:
    b2b_url = B2B
    service_key = "test-service-key"
    upstream_timeout_seconds = 2.0
    cdek_api_url = "https://cdek.test/v2"
    cdek_client_id = "id"
    cdek_client_secret = "secret"


class _QuoteClient:
    def __init__(self) -> None:
        self.args: tuple[str, str, int] | None = None

    async def quote_pvz(self, from_office: str, to_office: str, item_count: int) -> int:
        self.args = (from_office, to_office, item_count)
        return 350


class _Upstream:
    def __init__(self) -> None:
        self.checkout: dict | None = None
        self.stock: list[tuple[str, int]] = []

    async def get_user(self, _user_id: uuid.UUID) -> dict:
        return {"displayName": "Анна", "email": "anna@example.com"}

    async def get_product(self, _product_id: uuid.UUID) -> dict:
        return {
            "seller_id": SELLER,
            "sale_mode": "online",
            "title": "Кружка",
            "images": [{"url": "http://img"}],
            "offers": [
                {
                    "id": "22222222-2222-2222-2222-222222222222",
                    "is_default": True,
                    "stock": 5,
                    "price_amount": "390.00",
                }
            ],
        }

    async def seller_yookassa_shop_id(self, _seller_id: uuid.UUID) -> str:
        return "shop-1"

    async def create_checkout(self, payload: dict) -> dict:
        self.checkout = payload
        return {"orders": [], "paymentUrl": None}

    async def adjust_catalog_stock(self, product_id: uuid.UUID, delta: int) -> int:
        self.stock.append((str(product_id), delta))
        return 0

    async def adjust_storefront_stock(self, _product_id: uuid.UUID, _delta: int) -> int:
        return 0


@pytest.fixture
def quote_client(monkeypatch: pytest.MonkeyPatch) -> _QuoteClient:
    bind(_Settings())
    client = _QuoteClient()
    monkeypatch.setattr("routes_cdek.get_client", lambda: client)
    return client


@pytest.mark.asyncio
async def test_quote_uses_seller_shipment_office(quote_client: _QuoteClient) -> None:
    async with respx.mock:
        route = respx.get(SHIPMENT).mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": {
                        "officeCode": "NSK1",
                        "officeAddress": "Новосибирск",
                        "shipDays": [0],
                    }
                },
            )
        )
        result = await quote_delivery(
            QuoteIn.model_validate(
                {"sellerId": SELLER, "toOfficeCode": "MSK67", "itemCount": 3}
            )
        )
    assert route.call_count == 1
    assert route.calls[0].request.headers["X-Service-Key"] == "test-service-key"
    assert quote_client.args == ("NSK1", "MSK67", 3)
    assert result == {"price": 350}


@pytest.mark.asyncio
async def test_quote_keeps_explicit_from_office(quote_client: _QuoteClient) -> None:
    async with respx.mock:
        route = respx.get(url__regex=r".*cdek-shipment.*").mock(
            return_value=httpx.Response(500, json={"message": "should not be called"})
        )
        result = await quote_delivery(
            QuoteIn.model_validate(
                {
                    "fromOfficeCode": "NSK9",
                    "sellerId": SELLER,
                    "toOfficeCode": "MSK67",
                    "itemCount": 1,
                }
            )
        )
    assert route.call_count == 0
    assert quote_client.args == ("NSK9", "MSK67", 1)
    assert result == {"price": 350}


@pytest.mark.asyncio
async def test_quote_missing_shipment_is_400(quote_client: _QuoteClient) -> None:
    async with respx.mock:
        respx.get(SHIPMENT).mock(
            return_value=httpx.Response(404, json={"error": {"message": "Ресурс не найден"}})
        )
        with pytest.raises(BadRequestError, match="пункт отгрузки"):
            await quote_delivery(
                QuoteIn.model_validate({"sellerId": SELLER, "toOfficeCode": "MSK67", "itemCount": 1})
            )
    assert quote_client.args is None


@pytest.mark.asyncio
async def test_checkout_recalculates_cdek_and_ignores_client_price(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("facade.office_code_for_seller", AsyncMock(return_value="NSK1"))
    quote = AsyncMock(return_value=120)
    monkeypatch.setattr("facade.quote_delivery_price", quote)
    upstream = _Upstream()
    facade = FrontendFacade(upstream)  # type: ignore[arg-type]
    user_id = uuid.UUID("33333333-3333-3333-3333-333333333333")
    product_id = "44444444-4444-4444-4444-444444444444"
    await facade.create_orders_from_cart(
        user_id,
        {
            "groups": [
                {
                    "sellerId": SELLER,
                    "delivery": "cdek",
                    "items": [
                        {"productId": product_id, "quantity": 2},
                        {"productId": product_id, "quantity": 1},
                    ],
                    "pickupPoint": {
                        "city": "Казань",
                        "address": "Баумана 1",
                        "code": "MSK67",
                        "price": 1,
                    },
                }
            ]
        },
        "https://yoomoney.ru/checkout/demo",
    )
    assert quote.await_args is not None
    assert quote.await_args.args == ("NSK1", "MSK67", 3)
    assert upstream.checkout is not None
    group = upstream.checkout["groups"][0]
    assert group["delivery_amount"] == "120.00"
    assert group["cdek_office_code"] == "MSK67"
    assert group["delivery_address"] == "Казань, Баумана 1"
    assert "price" not in group
    assert upstream.stock == [(product_id, -2), (product_id, -1)]


@pytest.mark.asyncio
async def test_checkout_requires_cdek_office_code() -> None:
    facade = FrontendFacade(_Upstream())  # type: ignore[arg-type]
    with pytest.raises(ApiError, match="пункт выдачи") as exc:
        await facade.create_orders_from_cart(
            uuid.uuid4(),
            {
                "groups": [
                    {
                        "sellerId": SELLER,
                        "delivery": "cdek",
                        "items": [
                            {
                                "productId": "44444444-4444-4444-4444-444444444444",
                                "quantity": 1,
                            }
                        ],
                        "pickupPoint": {"city": "Казань", "address": "Баумана 1"},
                    }
                ]
            },
            "https://yoomoney.ru/checkout/demo",
        )
    assert exc.value.http_status == 400
