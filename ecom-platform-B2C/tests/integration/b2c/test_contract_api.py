from __future__ import annotations

import pytest
import respx
from httpx import AsyncClient, Response

from tests.integration.b2c.conftest import BUYER_HEADER, BUYER_ID, MOCK_USER

pytestmark = [pytest.mark.integration, pytest.mark.b2c]


@pytest.mark.asyncio
@respx.mock
async def test_plans_static(client: AsyncClient) -> None:
    response = await client.get("/api/plans")
    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert len(body["data"]) >= 2


@pytest.mark.asyncio
@respx.mock
async def test_login_sets_auth_cookie(client: AsyncClient) -> None:
    respx.post("http://users:8000/api/v1/auth/login").mock(
        return_value=Response(200, json={"user": MOCK_USER})
    )
    respx.post("http://users:8000/api/v1/auth/sessions").mock(
        return_value=Response(200, json={"refreshToken": "refresh-1"})
    )
    response = await client.post(
        "/api/auth/login",
        json={"email": "buyer1@example.com", "password": "secret123"},
    )
    assert response.status_code == 200
    assert "auth-token" in response.cookies


@pytest.mark.asyncio
@respx.mock
async def test_products_list_hydrates_seller(client: AsyncClient) -> None:
    seller_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"
    respx.get("http://goods:8000/api/v1/goods").mock(
        return_value=Response(
            200,
            json={
                "items": [
                    {
                        "id": "b1000001-0000-4000-8000-000000000001",
                        "title": "Кружка",
                        "seller_id": seller_id,
                        "images": [{"url": "https://example/img.jpg"}],
                        "offers": [
                            {
                                "id": "f1000001-0000-4000-8000-000000000001",
                                "price_amount": "890.00",
                                "stock": 5,
                                "is_default": True,
                            }
                        ],
                        "sale_mode": "online",
                        "available_deliveries": ["pickup", "cdek"],
                        "created_at": "2026-01-01T00:00:00Z",
                    }
                ],
                "total": 1,
            },
        )
    )
    respx.post("http://users:8000/api/v1/sellers/batch").mock(
        return_value=Response(
            200,
            json={
                "items": [
                    {
                        "id": seller_id,
                        "username": "maria-clay",
                        "display_name": "Мария",
                        "followers_count": 1,
                        "rating": 4.8,
                        "products_count": 1,
                        "posts_count": 0,
                        "created_at": "2026-01-01T00:00:00Z",
                    }
                ]
            },
        )
    )
    response = await client.get("/api/products?pageSize=5")
    assert response.status_code == 200
    assert response.json()["data"]["items"][0]["seller"]["username"] == "maria-clay"


@pytest.mark.asyncio
@respx.mock
async def test_login_wrong_password_message(client: AsyncClient) -> None:
    respx.post("http://users:8000/api/v1/auth/login").mock(
        return_value=Response(401, json={"error": {"message": "Invalid email or password"}})
    )
    response = await client.post(
        "/api/auth/login",
        json={"email": "buyer1@example.com", "password": "wrong-pass"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Неверный email или пароль"


@pytest.mark.asyncio
@respx.mock
async def test_other_upstream_401_stays_auth_required(client: AsyncClient) -> None:
    respx.get(f"http://users:8000/api/v1/users/{BUYER_ID}").mock(
        return_value=Response(401, json={"error": {"message": "Invalid email or password"}})
    )
    response = await client.get("/api/auth/me", headers=BUYER_HEADER)
    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Требуется авторизация"


@pytest.mark.asyncio
@respx.mock
async def test_blank_comment_is_validation_not_unavailable(client: AsyncClient) -> None:
    route = respx.post(url__regex=r"http://publications:8000/api/v1/posts/.*/comments").mock(
        return_value=Response(503, json={"error": {"message": "should not be called"}})
    )
    response = await client.post(
        "/api/posts/e2000001-0000-4000-8000-000000000001/comments",
        headers=BUYER_HEADER,
        json={"body": "   "},
    )
    assert response.status_code == 400
    assert response.json()["error"]["message"] == "Текст комментария обязателен"
    assert route.call_count == 0


@pytest.mark.asyncio
@respx.mock
async def test_upstream_422_is_400_without_retry(client: AsyncClient) -> None:
    route = respx.post(url__regex=r"http://publications:8000/api/v1/posts/.*/comments").mock(
        return_value=Response(
            422,
            json={"error": {"code": "validation_error", "message": "Текст комментария обязателен"}},
        )
    )
    response = await client.post(
        "/api/posts/e2000001-0000-4000-8000-000000000001/comments",
        headers=BUYER_HEADER,
        json={"body": "привет"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["message"] == "Текст комментария обязателен"
    assert route.call_count == 1


@pytest.mark.asyncio
async def test_invalid_uuid_is_400(client: AsyncClient) -> None:
    response = await client.get("/api/products/not-a-uuid")
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["message"] == "Невалидные данные"

    posts = await client.get("/api/posts/not-a-uuid")
    assert posts.status_code == 400
    assert posts.json()["error"]["message"] == "Невалидные данные"


@pytest.mark.asyncio
@respx.mock
async def test_upstream_404_uses_message_not_raw_body(client: AsyncClient) -> None:
    product_id = "b1000001-0000-4000-8000-000000000099"
    respx.get(f"http://goods:8000/api/v1/goods/{product_id}").mock(
        return_value=Response(
            404,
            json={
                "error": {
                    "code": "not_found",
                    "message": "Product missing",
                    "details": {"id": product_id},
                }
            },
        )
    )
    response = await client.get(f"/api/products/{product_id}")
    assert response.status_code == 404
    assert response.json()["error"]["message"] == "Product missing"


@pytest.mark.asyncio
@respx.mock
async def test_upstream_404_unparsed_body_is_short(client: AsyncClient) -> None:
    product_id = "b1000001-0000-4000-8000-000000000098"
    respx.get(f"http://goods:8000/api/v1/goods/{product_id}").mock(
        return_value=Response(404, text="<html>missing</html>")
    )
    response = await client.get(f"/api/products/{product_id}")
    assert response.status_code == 404
    assert response.json()["error"]["message"] == "Не найдено"


@pytest.mark.asyncio
@respx.mock
async def test_upstream_400_and_403_hide_raw_body(client: AsyncClient) -> None:
    respx.get("http://goods:8000/api/v1/goods").mock(
        return_value=Response(400, text="not-json-body")
    )
    bad = await client.get("/api/products")
    assert bad.status_code == 400
    assert bad.json()["error"]["message"] == "Validation failed"

    seller_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"
    respx.put(
        f"http://users:8000/api/v1/users/{BUYER_ID}/subscriptions/{seller_id}"
    ).mock(return_value=Response(403, text='{"raw":true}'))
    forbidden = await client.post(f"/api/sellers/{seller_id}/follow", headers=BUYER_HEADER)
    assert forbidden.status_code == 403
    assert forbidden.json()["error"]["message"] == "Доступ запрещён"

    respx.post("http://users:8000/api/v1/auth/register").mock(
        return_value=Response(409, json={"message": "Email already taken"})
    )
    conflict = await client.post(
        "/api/auth/register",
        json={
            "email": "buyer1@example.com",
            "password": "secret123",
            "displayName": "Анна",
            "username": "anna",
        },
    )
    assert conflict.status_code == 409
    assert conflict.json()["error"]["message"] == "Email already taken"


@pytest.mark.asyncio
@respx.mock
async def test_posts_page_total_comes_from_feed(client: AsyncClient) -> None:
    seller_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"
    item = {
        "id": "e2000001-0000-4000-8000-000000000001",
        "slug": "post",
        "seller_id": seller_id,
        "title": "Пост",
        "summary": "кратко",
        "published_at": "2026-01-01T00:00:00Z",
        "likes_count": 0,
        "products": [],
    }
    respx.get("http://publications:8000/api/v1/posts").mock(
        return_value=Response(
            200,
            json={
                "items": [item, dict(item, id="e2000001-0000-4000-8000-000000000002")],
                "next_cursor": "cursor-1",
                "has_more": True,
                "total": 9,
            },
        )
    )
    respx.post("http://users:8000/api/v1/sellers/batch").mock(
        return_value=Response(
            200,
            json={
                "items": [
                    {
                        "id": seller_id,
                        "username": "maria-clay",
                        "display_name": "Мария",
                        "created_at": "2026-01-01T00:00:00Z",
                    }
                ]
            },
        )
    )
    response = await client.get("/api/posts?page=1&pageSize=2")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total"] == 9
    assert len(data["items"]) == 2

    cursor = await client.get("/api/posts?cursor=cursor-1&limit=2")
    assert cursor.status_code == 200
    cursor_data = cursor.json()["data"]
    assert cursor_data["nextCursor"] == "cursor-1"
    assert "total" not in cursor_data
