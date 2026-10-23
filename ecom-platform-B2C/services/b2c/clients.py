from __future__ import annotations

import uuid
from typing import Any

import httpx

from common.app import NotFoundError, UpstreamUnavailableError
from config import B2CSettings
from contract_api.errors import ApiError, conflict, forbidden, unauthorized


def _upstream_message(response: httpx.Response, fallback: str) -> str:
    """Human-readable upstream error, never the raw body."""
    try:
        body = response.json()
    except ValueError:
        return fallback
    if not isinstance(body, dict):
        return fallback
    error = body.get("error")
    if isinstance(error, dict):
        message = error.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()
    message = body.get("message")
    if isinstance(message, str) and message.strip():
        return message.strip()
    return fallback


class Upstreams:
    def __init__(self, settings: B2CSettings) -> None:
        self._settings = settings
        self._client = httpx.AsyncClient(timeout=settings.upstream_timeout_seconds)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _request(self, method: str, base: str, path: str, **kwargs: Any) -> Any:
        last_exc: Exception | None = None
        for _ in range(max(1, self._settings.upstream_retries)):
            try:
                response = await self._client.request(method, f"{base.rstrip('/')}{path}", **kwargs)
                if response.status_code == 404:
                    raise NotFoundError(_upstream_message(response, "Не найдено"))
                if response.status_code == 401:
                    raise unauthorized()
                if response.status_code == 403:
                    raise forbidden(_upstream_message(response, "Доступ запрещён"))
                if response.status_code == 409:
                    raise conflict(_upstream_message(response, "Conflict"))
                if response.status_code in (400, 422):
                    fallback = (
                        "Невалидные данные"
                        if response.status_code == 422
                        else "Validation failed"
                    )
                    raise ApiError(
                        http_status=400,
                        code="VALIDATION_ERROR",
                        message=_upstream_message(response, fallback),
                    )
                response.raise_for_status()
                if response.status_code == 204:
                    return None
                return response.json()
            except ApiError:
                raise
            except NotFoundError:
                raise
            except Exception as exc:
                last_exc = exc
        raise UpstreamUnavailableError(base, details={"error": str(last_exc)})

    async def login(self, email: str, password: str) -> dict:
        try:
            data = await self._request(
                "POST",
                self._settings.users_url,
                "/api/v1/auth/login",
                json={"email": email, "password": password},
            )
        except ApiError as exc:
            if exc.http_status == 401:
                raise unauthorized("Неверный email или пароль") from exc
            raise
        return data["user"]

    async def issue_refresh(self, user_id: uuid.UUID) -> str:
        data = await self._request(
            "POST",
            self._settings.users_url,
            "/api/v1/auth/sessions",
            json={"user_id": str(user_id)},
        )
        return str(data["refreshToken"])

    async def rotate_refresh(self, refresh_token: str) -> tuple[uuid.UUID, str]:
        data = await self._request(
            "POST",
            self._settings.users_url,
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        return uuid.UUID(str(data["userId"])), str(data["refreshToken"])

    async def revoke_refresh(self, refresh_token: str) -> None:
        await self._request(
            "POST",
            self._settings.users_url,
            "/api/v1/auth/logout",
            json={"refresh_token": refresh_token},
        )

    async def login_yandex(self, payload: dict) -> dict:
        data = await self._request(
            "POST",
            self._settings.users_url,
            "/api/v1/auth/yandex",
            json=payload,
        )
        return data["user"]

    async def register(self, payload: dict) -> dict:
        data = await self._request(
            "POST",
            self._settings.users_url,
            "/api/v1/auth/register",
            json={
                "email": payload["email"],
                "password": payload["password"],
                "username": payload["username"],
                "display_name": payload.get("displayName") or payload["display_name"],
            },
        )
        return data["user"]

    async def patch_user(self, user_id: uuid.UUID, payload: dict) -> dict:
        body = {}
        if "displayName" in payload:
            body["display_name"] = payload["displayName"]
        if "bio" in payload:
            body["bio"] = payload["bio"]
        data = await self._request(
            "PATCH",
            self._settings.users_url,
            f"/api/v1/users/{user_id}",
            json=body,
        )
        return data["user"]

    async def become_seller(self, user_id: uuid.UUID, payload: dict) -> dict:
        return await self._request(
            "POST",
            self._settings.users_url,
            f"/api/v1/users/{user_id}/become-seller",
            json={
                "username": payload["username"],
                "display_name": payload.get("displayName") or payload["display_name"],
                "bio": payload.get("bio"),
            },
        )

    async def list_sellers(self, *, q: str | None, page: int, page_size: int) -> dict:
        params: dict[str, Any] = {"page": page, "pageSize": page_size}
        if q:
            params["q"] = q
        return await self._request("GET", self._settings.users_url, "/api/v1/sellers", params=params)

    async def seller_by_username(self, username: str) -> dict:
        data = await self._request(
            "GET", self._settings.users_url, f"/api/v1/sellers/by-username/{username}"
        )
        return data["seller"]

    async def get_user(self, user_id: uuid.UUID) -> dict:
        data = await self._request("GET", self._settings.users_url, f"/api/v1/users/{user_id}")
        return data["user"]

    async def users_batch(self, user_ids: list[uuid.UUID]) -> list[dict]:
        if not user_ids:
            return []
        data = await self._request(
            "POST",
            self._settings.users_url,
            "/api/v1/users/batch",
            json={"ids": [str(uid) for uid in user_ids]},
        )
        return list(data.get("items") or [])

    async def popular_sellers(self, limit: int = 12) -> list[dict]:
        data = await self._request("GET", self._settings.users_url, f"/api/v1/sellers/popular?limit={limit}")
        return list(data.get("items") or [])

    async def sellers_batch(self, ids: list[uuid.UUID]) -> list[dict]:
        if not ids:
            return []
        data = await self._request(
            "POST",
            self._settings.users_url,
            "/api/v1/sellers/batch",
            json={"ids": [str(i) for i in ids]},
        )
        return list(data.get("items") or [])

    async def get_seller(self, seller_id: uuid.UUID) -> dict:
        data = await self._request("GET", self._settings.users_url, f"/api/v1/sellers/{seller_id}")
        return data["seller"]

    async def list_subscriptions(self, user_id: uuid.UUID) -> list[dict]:
        data = await self._request(
            "GET", self._settings.users_url, f"/api/v1/users/{user_id}/subscriptions"
        )
        return list(data.get("items") or [])

    async def subscribe(self, user_id: uuid.UUID, seller_id: uuid.UUID) -> None:
        await self._request(
            "PUT",
            self._settings.users_url,
            f"/api/v1/users/{user_id}/subscriptions/{seller_id}",
            json={"notifications_enabled": True},
        )

    async def unsubscribe(self, user_id: uuid.UUID, seller_id: uuid.UUID) -> None:
        await self._request(
            "DELETE",
            self._settings.users_url,
            f"/api/v1/users/{user_id}/subscriptions/{seller_id}",
        )

    async def get_categories(self) -> list[dict]:
        raw = await self._request("GET", self._settings.goods_url, "/api/v1/categories")
        return list(raw) if isinstance(raw, list) else []

    async def post_feed(
        self,
        *,
        seller_ids: list[uuid.UUID] | None = None,
        product_id: uuid.UUID | None = None,
        q: str | None = None,
        cursor: str | None = None,
        limit: int = 20,
    ) -> dict:
        params: list[tuple[str, str | int]] = [("limit", limit)]
        if cursor:
            params.append(("cursor", cursor))
        if q:
            params.append(("q", q))
        if product_id:
            params.append(("product_id", str(product_id)))
        if seller_ids:
            for sid in seller_ids:
                params.append(("seller_id", str(sid)))
        return await self._request(
            "GET", self._settings.publications_url, "/api/v1/posts", params=params
        )

    async def like_post(self, user_id: uuid.UUID, post_id: uuid.UUID) -> dict:
        return await self._request(
            "POST",
            self._settings.publications_url,
            f"/api/v1/posts/{post_id}/like",
            params={"user_id": str(user_id)},
        )

    async def unlike_post(self, user_id: uuid.UUID, post_id: uuid.UUID) -> dict:
        return await self._request(
            "DELETE",
            self._settings.publications_url,
            f"/api/v1/posts/{post_id}/like",
            params={"user_id": str(user_id)},
        )

    async def liked_posts(self, user_id: uuid.UUID, post_ids: list[Any]) -> list[str]:
        if not post_ids:
            return []
        data = await self._request(
            "POST",
            self._settings.publications_url,
            "/api/v1/posts/likes/status",
            json={"user_id": str(user_id), "post_ids": [str(p) for p in post_ids]},
        )
        return list(data.get("liked") or [])

    async def get_post(self, post_id: uuid.UUID) -> dict:
        return await self._request(
            "GET", self._settings.publications_url, f"/api/v1/posts/{post_id}"
        )

    async def list_post_comments(
        self,
        post_id: uuid.UUID,
        *,
        cursor: str | None = None,
        limit: int = 20,
    ) -> dict:
        params: dict[str, Any] = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        return await self._request(
            "GET",
            self._settings.publications_url,
            f"/api/v1/posts/{post_id}/comments",
            params=params,
        )

    async def create_post_comment(
        self, user_id: uuid.UUID, post_id: uuid.UUID, body: str
    ) -> dict:
        return await self._request(
            "POST",
            self._settings.publications_url,
            f"/api/v1/posts/{post_id}/comments",
            params={"user_id": str(user_id)},
            json={"body": body},
        )

    async def update_post_comment(
        self, user_id: uuid.UUID, comment_id: uuid.UUID, body: str
    ) -> dict:
        return await self._request(
            "PATCH",
            self._settings.publications_url,
            f"/api/v1/comments/{comment_id}",
            params={"user_id": str(user_id)},
            json={"body": body},
        )

    async def delete_post_comment(self, user_id: uuid.UUID, comment_id: uuid.UUID) -> None:
        await self._request(
            "DELETE",
            self._settings.publications_url,
            f"/api/v1/comments/{comment_id}",
            params={"user_id": str(user_id)},
        )

    async def list_goods(
        self,
        *,
        seller_id: uuid.UUID | None = None,
        q: str | None = None,
        sale_mode: str | None = None,
        delivery: str | None = None,
        limit: int = 24,
        offset: int = 0,
    ) -> dict:
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if seller_id:
            params["seller_id"] = str(seller_id)
        if q:
            params["q"] = q
        if sale_mode:
            params["sale_mode"] = sale_mode
        if delivery:
            params["delivery"] = delivery
        return await self._request("GET", self._settings.goods_url, "/api/v1/goods", params=params)

    async def goods_batch(self, ids: list[uuid.UUID]) -> list[dict]:
        if not ids:
            return []
        return await self._request(
            "POST",
            self._settings.goods_url,
            "/api/v1/goods/batch",
            json={"ids": [str(i) for i in ids]},
        )

    async def get_product(self, product_id: uuid.UUID) -> dict:
        return await self._request("GET", self._settings.goods_url, f"/api/v1/goods/{product_id}")

    async def search(self, q: str, page: int = 1, limit: int = 24) -> dict:
        return await self._request(
            "GET",
            self._settings.search_url,
            "/api/v1/search",
            params={"q": q, "page": page, "limit": limit},
        )

    async def get_cart(self, user_id: uuid.UUID) -> dict:
        return await self._request("GET", self._settings.cart_url, f"/api/v1/carts/{user_id}")

    async def add_cart_item(self, user_id: uuid.UUID, payload: dict) -> dict:
        return await self._request(
            "POST",
            self._settings.cart_url,
            f"/api/v1/carts/{user_id}/items",
            json=payload,
        )

    async def patch_cart_item(self, user_id: uuid.UUID, item_id: uuid.UUID, payload: dict) -> dict:
        return await self._request(
            "PATCH",
            self._settings.cart_url,
            f"/api/v1/carts/{user_id}/items/{item_id}",
            json=payload,
        )

    async def delete_cart_item(self, user_id: uuid.UUID, item_id: uuid.UUID) -> None:
        await self._request(
            "DELETE",
            self._settings.cart_url,
            f"/api/v1/carts/{user_id}/items/{item_id}",
        )

    async def delivery_options(self) -> list[dict]:
        data = await self._request("GET", self._settings.orders_url, "/api/v1/delivery-options")
        return list(data) if isinstance(data, list) else list(data.get("items") or [])

    async def seller_yookassa_shop_id(self, seller_id: uuid.UUID) -> str | None:
        """Shop id from the B2B payout-token endpoint (field yookassaShopId)."""
        base = self._settings.b2b_url.strip().rstrip("/")
        key = self._settings.service_key.strip()
        if not base or not key:
            return None
        try:
            response = await self._client.get(
                f"{base}/internal/sellers/{seller_id}/payout-token",
                headers={"X-Service-Key": key},
            )
        except httpx.HTTPError:
            return None
        if response.status_code != 200:
            return None
        body = response.json()
        data = body.get("data") if isinstance(body, dict) else None
        if not isinstance(data, dict):
            return None
        shop_id = data.get("yookassaShopId") or data.get("yookassa_shop_id")
        if shop_id is None:
            return None
        text = str(shop_id).strip()
        return text or None

    async def adjust_catalog_stock(self, product_id: uuid.UUID, delta: int) -> int:
        base = self._settings.b2b_goods_url.strip().rstrip("/")
        key = self._settings.service_key.strip()
        if not base or not key:
            raise UpstreamUnavailableError(base or "b2b-goods")
        data = await self._once(
            base,
            f"/internal/products/{product_id}/stock",
            delta,
            {"X-Service-Key": key},
        )
        payload = data.get("data") if isinstance(data, dict) else None
        stock = payload.get("inStock") if isinstance(payload, dict) else None
        return int(stock or 0)

    async def adjust_storefront_stock(self, product_id: uuid.UUID, delta: int) -> int:
        data = await self._once(
            self._settings.goods_url,
            f"/api/v1/internal/goods/{product_id}/stock",
            delta,
            None,
        )
        return int(data.get("stock") or 0) if isinstance(data, dict) else 0

    async def _once(
        self, base: str, path: str, delta: int, headers: dict[str, str] | None
    ) -> Any:
        try:
            response = await self._client.post(
                f"{base.rstrip('/')}{path}",
                json={"delta": delta},
                headers=headers,
            )
        except httpx.HTTPError as exc:
            raise UpstreamUnavailableError(base, details={"error": str(exc)}) from exc
        if response.status_code == 409:
            raise conflict(_upstream_message(response, "Недостаточно на складе"))
        if response.status_code == 404:
            raise NotFoundError(_upstream_message(response, "Не найдено"))
        if response.status_code >= 400:
            response.raise_for_status()
        return response.json()

    async def create_order(self, payload: dict) -> dict:
        return await self._request("POST", self._settings.orders_url, "/api/v1/orders", json=payload)

    async def create_checkout(self, payload: dict) -> dict:
        return await self._request(
            "POST", self._settings.orders_url, "/api/v1/checkouts", json=payload
        )

    async def cancel_order(self, order_id: uuid.UUID, user_id: uuid.UUID) -> dict:
        return await self._request(
            "POST",
            self._settings.orders_url,
            f"/api/v1/orders/{order_id}/cancel",
            params={"user_id": str(user_id)},
        )

    async def repay_order(self, order_id: uuid.UUID) -> dict:
        return await self._request(
            "POST", self._settings.orders_url, f"/api/v1/orders/{order_id}/repay"
        )

    async def list_orders(self, user_id: uuid.UUID, page: int = 1, limit: int = 20) -> dict:
        return await self._request(
            "GET",
            self._settings.orders_url,
            "/api/v1/orders",
            params={"user_id": str(user_id), "page": page, "limit": limit},
        )

    async def get_order(self, order_id: uuid.UUID) -> dict:
        return await self._request("GET", self._settings.orders_url, f"/api/v1/orders/{order_id}")

    async def admin_orders(self) -> list:
        return await self._request("GET", self._settings.orders_url, "/api/v1/admin/orders")

    async def set_status_override(self, order_id: uuid.UUID, status: str | None) -> dict:
        return await self._request(
            "PATCH",
            self._settings.orders_url,
            f"/api/v1/admin/orders/{order_id}",
            json={"status": status},
        )

    async def receive_order(
        self, order_id: uuid.UUID, user_id: uuid.UUID, receival_code: str
    ) -> dict:
        return await self._request(
            "POST",
            self._settings.orders_url,
            f"/api/v1/orders/{order_id}/receive",
            params={"user_id": str(user_id)},
            json={"receival_code": receival_code, "user_id": str(user_id)},
        )

    async def post_event(self, payload: dict) -> None:
        await self._request("POST", self._settings.eventer_url, "/api/v1/events", json=payload)

    async def gorse_recommend(self, user_id: uuid.UUID, n: int = 12) -> list[str]:
        headers = {"X-Api-Key": self._settings.gorse_api_key}
        try:
            data = await self._request(
                "GET",
                self._settings.gorse_url,
                f"/api/recommend/{user_id}",
                params={"n": n},
                headers=headers,
            )
            if isinstance(data, list):
                return [str(x) for x in data]
            return [str(x) for x in (data.get("items") or data.get("Ids") or [])]
        except Exception:
            return []
