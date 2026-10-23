from __future__ import annotations

import asyncio
import inspect
import json
import sys
from pathlib import Path

import httpx
import pytest
import respx

pytestmark = pytest.mark.unit

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services"))

from cdek.client import CdekClient, close_client, create_order  # noqa: E402

API = "https://cdek.test/v2"


def _client() -> CdekClient:
    return CdekClient(base_url=API, client_id="test-id", client_secret="test-secret")


def _token() -> httpx.Response:
    return httpx.Response(
        200,
        json={"access_token": "token-1", "expires_in": 3600, "token_type": "bearer"},
    )


def _office(request: httpx.Request) -> httpx.Response:
    cities = {"NSK1": 270, "MSK67": 44, "A": 1, "B": 2}
    code = request.url.params.get("code") or ""
    return httpx.Response(200, json=[{"code": code, "location": {"city_code": cities.get(code, 1)}}])


@pytest.mark.asyncio
async def test_quote_pvz_uses_tariff_136_and_caches_token() -> None:
    client = _client()
    async with respx.mock:
        token_route = respx.post(f"{API}/oauth/token").mock(return_value=_token())
        respx.get(url__regex=r".*/deliverypoints").mock(side_effect=_office)
        tariff_route = respx.post(f"{API}/calculator/tariff").mock(
            return_value=httpx.Response(200, json={"delivery_sum": 10.5, "currency": "RUB"})
        )
        assert await client.quote_pvz("NSK1", "MSK67", 2) == 11
        assert await client.quote_pvz("NSK1", "MSK67", 1) == 11
        assert token_route.call_count == 1
        assert tariff_route.call_count == 2
        body = json.loads(tariff_route.calls[0].request.content)
    assert body["tariff_code"] == 136
    assert body["from_location"] == {"code": 270}
    assert body["to_location"] == {"code": 44}
    assert body["shipment_point"] == "NSK1"
    assert body["delivery_point"] == "MSK67"
    assert body["packages"] == [
        {"weight": 500, "length": 10, "width": 10, "height": 10},
        {"weight": 500, "length": 10, "width": 10, "height": 10},
    ]
    sent = token_route.calls[0].request.content.decode()
    assert "grant_type=client_credentials" in sent
    assert "client_id=test-id" in sent
    assert tariff_route.calls[0].request.headers["Authorization"] == "Bearer token-1"
    await client.aclose()


@pytest.mark.asyncio
async def test_token_is_refetched_after_expires_in() -> None:
    client = _client()
    async with respx.mock:
        token_route = respx.post(f"{API}/oauth/token").mock(return_value=_token())
        respx.get(url__regex=r".*/deliverypoints").mock(side_effect=_office)
        respx.post(f"{API}/calculator/tariff").mock(
            return_value=httpx.Response(200, json={"delivery_sum": 100})
        )
        await client.quote_pvz("A", "B", 1)
        client._token_deadline = 0
        await client.quote_pvz("A", "B", 1)
        assert token_route.call_count == 2
    await client.aclose()


@pytest.mark.asyncio
async def test_create_order_returns_number_without_extra_get() -> None:
    client = _client()
    async with respx.mock:
        respx.post(f"{API}/oauth/token").mock(return_value=_token())
        order_route = respx.post(f"{API}/orders").mock(
            return_value=httpx.Response(
                200,
                json={"entity": {"uuid": "order-uuid", "cdek_number": "1100285492"}},
            )
        )
        lookup = respx.get(url__regex=r".*/orders/order-uuid").mock(
            return_value=httpx.Response(500, json={"message": "should not be called"})
        )
        result = await client.create_order("NSK1", "MSK67", "Иван", "ivan@example.com", 1, "IM-1")
        assert lookup.call_count == 0
        body = json.loads(order_route.calls[0].request.content)
    assert result == {"uuid": "order-uuid", "cdek_number": "1100285492"}
    assert body["shipment_point"] == "NSK1"
    assert body["delivery_point"] == "MSK67"
    assert body["recipient"] == {"name": "Иван", "email": "ivan@example.com"}
    assert body["number"] == "IM-1"
    assert body["tariff_code"] == 136
    assert body["packages"][0]["weight"] == 500
    assert body["packages"][0]["length"] == 10
    assert body["packages"][0]["width"] == 10
    assert body["packages"][0]["height"] == 10
    await client.aclose()


@pytest.mark.asyncio
async def test_create_order_fetches_number_once_when_missing() -> None:
    client = _client()
    async with respx.mock:
        respx.post(f"{API}/oauth/token").mock(return_value=_token())
        respx.post(f"{API}/orders").mock(
            return_value=httpx.Response(202, json={"entity": {"uuid": "order-uuid"}})
        )
        lookup = respx.get(f"{API}/orders/order-uuid").mock(
            return_value=httpx.Response(
                200, json={"entity": {"uuid": "order-uuid", "cdek_number": "998877"}}
            )
        )
        result = await client.create_order("NSK1", "MSK67", "Иван", "ivan@example.com", 2, "IM-2")
        assert lookup.call_count == 1
        body = json.loads(respx.calls[1].request.content)
    assert result == {"uuid": "order-uuid", "cdek_number": "998877"}
    assert len(body["packages"]) == 2
    await client.aclose()


@pytest.mark.asyncio
async def test_create_order_number_stays_none_after_one_get() -> None:
    client = _client()
    async with respx.mock:
        respx.post(f"{API}/oauth/token").mock(return_value=_token())
        respx.post(f"{API}/orders").mock(
            return_value=httpx.Response(202, json={"entity": {"uuid": "order-uuid"}})
        )
        respx.get(f"{API}/orders/order-uuid").mock(
            return_value=httpx.Response(200, json={"entity": {"uuid": "order-uuid"}})
        )
        result = await client.create_order("NSK1", "MSK67", "Иван", "ivan@example.com", 1, "IM-3")
    assert result == {"uuid": "order-uuid", "cdek_number": None}
    await client.aclose()


@pytest.mark.asyncio
async def test_widget_proxy_contract() -> None:
    client = _client()
    async with respx.mock:
        respx.post(f"{API}/oauth/token").mock(return_value=_token())
        offices = respx.get(f"{API}/deliverypoints").mock(
            return_value=httpx.Response(
                200,
                json=[{"code": "MSK67"}],
                headers={"X-Source": "cdek"},
            )
        )
        calc = respx.post(f"{API}/calculator/tarifflist").mock(
            return_value=httpx.Response(200, json={"tariff_codes": []})
        )
        polygons = respx.get(f"{API}/deliverypoints/byPolygons").mock(
            return_value=httpx.Response(200, json=[])
        )
        missing = await client.proxy_widget({}, None)
        unknown = await client.proxy_widget({"action": "nope"}, None)
        offices_result = await client.proxy_widget({"action": "offices", "city_code": "44"}, None)
        calc_result = await client.proxy_widget({"action": "calculate"}, {"currency": 1})
        polygons_result = await client.proxy_widget({"action": "byCoordinate"}, {"polygon": "1"})
        assert offices.call_count == 1
        assert "action=offices" in str(offices.calls[0].request.url)
        assert "city_code=44" in str(offices.calls[0].request.url)
        calc_body = json.loads(calc.calls[0].request.content)
        assert offices.calls[0].request.headers["X-App-Name"] == "widget_pvz"
        assert polygons.call_count == 1
    assert json.loads(missing.content) == {"message": "Action is required"}
    assert missing.status_code == 400
    assert json.loads(unknown.content) == {"message": "Unknown action"}
    assert offices_result.status_code == 200
    assert json.loads(offices_result.content) == [{"code": "MSK67"}]
    assert ("X-Service-Version", "3.12.1") in offices_result.headers
    assert ("X-Source", "cdek") in offices_result.headers
    assert calc_body["action"] == "calculate"
    assert calc_body["currency"] == 1
    assert calc_result.status_code == 200
    assert polygons_result.status_code == 200
    await client.aclose()


@pytest.mark.asyncio
async def test_module_create_order_delegates(monkeypatch: pytest.MonkeyPatch) -> None:
    signature = inspect.signature(create_order)
    assert list(signature.parameters) == [
        "from_office_code",
        "to_office_code",
        "recipient_name",
        "recipient_email",
        "item_count",
        "number",
    ]
    monkeypatch.setenv("CDEK_API_URL", API)
    monkeypatch.setenv("CDEK_CLIENT_ID", "module-id")
    monkeypatch.setenv("CDEK_CLIENT_SECRET", "module-secret")
    await close_client()
    async with respx.mock:
        respx.post(f"{API}/oauth/token").mock(return_value=_token())
        respx.post(f"{API}/orders").mock(
            return_value=httpx.Response(200, json={"entity": {"uuid": "u", "cdek_number": "1"}})
        )
        result = await create_order("A", "B", "Имя", "a@b.c", 1, "N-1")
    assert result == {"uuid": "u", "cdek_number": "1"}
    await close_client()


@pytest.mark.asyncio
async def test_delete_order_accepts_cdek_delete() -> None:
    client = _client()
    async with respx.mock:
        respx.post(f"{API}/oauth/token").mock(return_value=_token())
        route = respx.delete(f"{API}/orders/ship-1").mock(
            return_value=httpx.Response(
                202,
                json={"entity": {"uuid": "ship-1"}, "requests": [{"type": "DELETE", "state": "ACCEPTED"}]},
            )
        )
        await client.delete_order("ship-1")
    assert route.call_count == 1
    await client.aclose()


@pytest.mark.asyncio
async def test_delete_order_rejects_invalid_request() -> None:
    from cdek.client import CdekError

    client = _client()
    async with respx.mock:
        respx.post(f"{API}/oauth/token").mock(return_value=_token())
        respx.delete(f"{API}/orders/ship-1").mock(
            return_value=httpx.Response(
                200,
                json={"requests": [{"type": "DELETE", "state": "INVALID", "errors": [{"code": "v2_order_status"}]}]},
            )
        )
        with pytest.raises(CdekError) as caught:
            await client.delete_order("ship-1")
    assert caught.value.status_code == 409
    await client.aclose()


def test_item_count_must_be_positive() -> None:
    client = _client()
    with pytest.raises(ValueError, match="item_count"):
        asyncio.run(client.quote_pvz("A", "B", 0))
