from __future__ import annotations

import json
import uuid

import httpx
import jwt
import pytest
import respx
from fastapi import HTTPException
from pydantic import ValidationError

from common.app import AuthConfig
from common.b2b_catalog import ensure_seller, seller_upsert_body
from tests.support.paths import service_import

pytestmark = pytest.mark.unit


def test_seller_upsert_body_uses_store() -> None:
    seller_id = uuid.UUID("12345678-1234-5678-1234-567812345678")
    body = seller_upsert_body(
        seller_id,
        {
            "id": str(seller_id),
            "username": "pottery",
            "displayName": "Гончарная",
            "avatar": "",
            "bio": "hi",
            "joinedAt": "2024-01-01T00:00:00+00:00",
        },
    )
    assert body["username"] == "pottery"
    assert body["displayName"] == "Гончарная"
    assert body["avatar"] == ""
    assert body["bio"] == "hi"
    assert body["joinedAt"] == "2024-01-01T00:00:00+00:00"


def test_seller_upsert_body_fallback() -> None:
    seller_id = uuid.uuid4()
    body = seller_upsert_body(seller_id, None)
    assert body["username"] == f"shop{seller_id.hex[:8]}"
    assert body["displayName"] == "Магазин"
    assert "avatar" not in body


async def test_ensure_seller_falls_back_when_batch_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    seller_id = uuid.UUID("12345678-1234-5678-1234-567812345678")
    monkeypatch.setenv("B2B_URL", "http://b2b.test/api")
    monkeypatch.setenv("USERS_URL", "http://users.test")
    monkeypatch.setenv("SERVICE_KEY", "secret")
    seen: dict[str, object] = {}

    def capture(request: httpx.Request) -> httpx.Response:
        assert request.headers["X-Service-Key"] == "secret"
        seen["path"] = request.url.path
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"data": {"id": str(seller_id)}, "error": None})

    with respx.mock:
        respx.post("http://b2b.test/api/internal/stores/batch").mock(
            return_value=httpx.Response(503, json={"data": None, "error": {"code": "down"}})
        )
        respx.post("http://users.test/api/internal/sellers/upsert").mock(side_effect=capture)
        await ensure_seller(str(seller_id))

    assert seen["path"] == "/api/internal/sellers/upsert"
    assert seen["body"] == {
        "id": str(seller_id),
        "username": f"shop{seller_id.hex[:8]}",
        "displayName": "Магазин",
    }


async def test_ensure_seller_uses_store_from_batch(monkeypatch: pytest.MonkeyPatch) -> None:
    seller_id = uuid.uuid4()
    monkeypatch.setenv("B2B_URL", "http://b2b.test/api")
    monkeypatch.setenv("USERS_URL", "http://users.test")
    monkeypatch.setenv("SERVICE_KEY", "k")
    seen: dict[str, object] = {}

    def capture(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"data": {"id": str(seller_id)}, "error": None})

    with respx.mock:
        respx.post("http://b2b.test/api/internal/stores/batch").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": str(seller_id),
                            "username": "pottery",
                            "displayName": "Гончарная",
                            "avatar": "a.png",
                            "bio": "bio",
                            "joinedAt": "2024-05-01T00:00:00+00:00",
                        }
                    ],
                    "error": None,
                },
            )
        )
        respx.post("http://users.test/api/internal/sellers/upsert").mock(side_effect=capture)
        await ensure_seller(str(seller_id))

    body = seen["body"]
    assert isinstance(body, dict)
    assert body["username"] == "pottery"
    assert body["displayName"] == "Гончарная"
    assert body["avatar"] == "a.png"


def test_product_event_maps_into_upsert_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KAFKA_PRODUCTS_TOPIC", "handmade.products.v1")
    product_id = "b1000001-0000-4000-8000-000000000001"
    seller_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"
    with service_import("goods"):
        import kafka

        assert kafka.consumer_topics() == ["goods.changed", "handmade.products.v1"]
        monkeypatch.setenv("KAFKA_PRODUCTS_TOPIC", "goods.changed")
        assert kafka.consumer_topics() == ["goods.changed"]
        mapped = kafka.product_to_upsert_payload(
            {
                "id": product_id,
                "title": "Кружка",
                "description": "глина",
                "image": "https://cdn.example/mug.jpg",
                "price": 1500,
                "sellerId": seller_id,
                "saleMode": "online",
                "availableDeliveries": ["pickup"],
                "pickupPoints": [{"city": "Казань", "address": "Баумана 1", "maxDays": 4}],
                "dealContacts": None,
                "inStock": 3,
                "currency": "RUB",
                "deletedAt": None,
            }
        )
        assert kafka.product_deleted({"deletedAt": None}) is False
        assert kafka.product_deleted({"deletedAt": "2024-01-01T00:00:00Z"}) is True
        from datetime import UTC, datetime
        from decimal import Decimal

        from routes import ProductOut

        product_out = ProductOut(
            id=uuid.UUID(product_id),
            slug="mug",
            title="Кружка",
            subtitle=None,
            description=None,
            seller_id=uuid.UUID(seller_id),
            category_id=None,
            images=[],
            attributes=[],
            tags=[],
            rating=Decimal("0.0"),
            reviews_count=0,
            is_active=True,
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
            pickup_points=[{"city": "Казань", "address": "Баумана 1", "maxDays": 4}],
        )
        assert product_out.pickup_points == [
            {"city": "Казань", "address": "Баумана 1", "maxDays": 4}
        ]
        legacy_out = product_out.model_copy(
            update={"pickup_points": [{"city": "Казань", "address": "Баумана 1"}]}
        )
        assert legacy_out.pickup_points == [{"city": "Казань", "address": "Баумана 1"}]
    assert mapped["id"] == product_id
    assert mapped["slug"] == product_id
    assert mapped["seller_id"] == seller_id
    assert mapped["images"] == [{"url": "https://cdn.example/mug.jpg"}]
    gallery_source = {
        "id": product_id,
        "title": "Кружка",
        "image": "https://cdn.example/ignored.jpg",
        "images": [
            "https://cdn.example/mug.jpg",
            {"url": "https://cdn.example/mug-side.jpg"},
        ],
        "sellerId": seller_id,
    }
    gallery = kafka.product_to_upsert_payload(gallery_source)
    assert gallery["images"] == [
        {"url": "https://cdn.example/mug.jpg"},
        {"url": "https://cdn.example/mug-side.jpg"},
    ]
    assert mapped["is_active"] is True
    assert mapped["sale_mode"] == "online"
    assert mapped["available_deliveries"] == ["pickup"]
    assert mapped["pickup_points"] == [{"city": "Казань", "address": "Баумана 1", "maxDays": 4}]
    legacy = kafka.product_to_upsert_payload(
        {
            "id": product_id,
            "title": "Кружка",
            "sellerId": seller_id,
            "pickupPoints": [{"city": "Казань", "address": "Баумана 1"}],
        }
    )
    assert legacy["pickup_points"] == [{"city": "Казань", "address": "Баумана 1"}]
    assert mapped["deal_contacts"] is None
    offer = mapped["offers"][0]
    assert offer["id"] == product_id
    assert offer["price_amount"] == 1500
    assert offer["currency"] == "RUB"
    assert offer["stock"] == 3
    assert offer["is_default"] is True
    assert offer["is_active"] is True
    assert offer["title"] == "Кружка"


def test_users_compat_routes_and_identity() -> None:
    with service_import("users"):
        import main
        from b2b_compat import (
            SellerRoleIn,
            identity_user,
            user_id_from_auth_token,
            with_seller_role,
        )
        from models import User

        paths = {getattr(route, "path", None) for route in main.app.routes}
        user_id = uuid.uuid4()
        user = User(
            email="user@example.test",
            username="master",
            display_name="Мастер",
            roles=["buyer"],
            avatar=None,
            bio=None,
        )
        user.id = user_id
        identity = identity_user(user)
        token = jwt.encode(
            {"sub": str(user_id)},
            AuthConfig.jwt_secret,
            algorithm=AuthConfig.jwt_algorithm,
        )
        parsed = user_id_from_auth_token(token)
        short_username = None
        try:
            SellerRoleIn.model_validate({"sellerId": str(uuid.uuid4()), "username": "ab"})
        except ValidationError as exc:
            short_username = exc
        seller_only = SellerRoleIn.model_validate({"sellerId": str(uuid.uuid4())})

    assert "/api/auth/me" in paths
    assert "/api/internal/users/{user_id}/seller-role" in paths
    assert "/api/internal/sellers/{seller_id}/followers" in paths
    assert "/api/internal/sellers/upsert" in paths
    assert "/api/v1/auth/login" in paths
    assert identity["roles"] == ["buyer"]
    assert identity["avatar"] == ""
    assert identity["bio"] == ""
    assert identity["displayName"] == "Мастер"
    assert identity["email"] == "user@example.test"
    assert None not in identity.values()
    assert with_seller_role(["buyer"]) == ["buyer", "seller"]
    assert with_seller_role(["seller"]) == ["seller"]
    assert parsed == user_id
    assert short_username is not None
    assert seller_only.username is None
    with pytest.raises(HTTPException) as missing:
        user_id_from_auth_token(None)
    assert missing.value.status_code == 401


def test_publications_keeps_existing_routes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KAFKA_PUBLICATIONS_TOPIC", "handmade.publications.v1")
    monkeypatch.setenv("KAFKA_ENABLED", "false")
    with service_import("publications"):
        import kafka
        import main

        paths = {getattr(route, "path", None) for route in main.app.routes}
        topics = kafka.consumer_topics()
    assert "/api/v1/posts" in paths
    assert topics == ["handmade.publications.v1"]
