"""Hydrate B2B store profiles into the users service and read remote envelopes."""

from __future__ import annotations

import os
import uuid
from typing import Any

import httpx

from common.app import get_logger

logger = get_logger("b2b.catalog")


def service_headers() -> dict[str, str]:
    return {"X-Service-Key": os.getenv("SERVICE_KEY", "")}


def b2b_url() -> str:
    return os.getenv("B2B_URL", "http://b2b:8000/api").rstrip("/")


def users_url() -> str:
    return os.getenv("USERS_URL", "http://users:8000").rstrip("/")


def seller_upsert_body(seller_id: uuid.UUID, store: dict[str, Any] | None) -> dict[str, Any]:
    """Map a B2B store, or a local fallback, into the users upsert payload."""
    username = ""
    display_name = "Магазин"
    avatar: Any = None
    bio: Any = None
    joined: Any = None
    if isinstance(store, dict):
        username = str(store.get("username") or "").strip()
        display_name = (
            str(store.get("displayName") or store.get("display_name") or "").strip() or "Магазин"
        )
        avatar = store.get("avatar")
        bio = store.get("bio")
        if "joinedAt" in store:
            joined = store.get("joinedAt")
        elif "joined_at" in store:
            joined = store.get("joined_at")
    if len(username) < 3:
        username = f"shop{seller_id.hex[:8]}"
    body: dict[str, Any] = {
        "id": str(seller_id),
        "username": username,
        "displayName": display_name or "Магазин",
    }
    if avatar is not None:
        body["avatar"] = avatar or ""
    if bio is not None:
        body["bio"] = bio or ""
    if joined:
        body["joinedAt"] = joined
    return body


async def get_json_data(url: str) -> tuple[int, Any]:
    """GET an envelope. Status 0 means the request never completed."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=service_headers())
    except httpx.HTTPError as exc:
        logger.warning("b2b_get_failed", url=url, error=str(exc))
        return 0, None
    try:
        body = response.json()
    except ValueError:
        body = None
    if response.status_code >= 400:
        return response.status_code, None
    if not isinstance(body, dict) or "data" not in body or body.get("error") is not None:
        logger.warning("b2b_get_invalid_envelope", url=url, status=response.status_code)
        return response.status_code, None
    return response.status_code, body.get("data")


async def ensure_seller(seller_id: str) -> None:
    """Upsert a seller read-model. Failures are logged and do not raise."""
    try:
        seller_uuid = uuid.UUID(str(seller_id))
    except ValueError:
        logger.warning("seller_upsert_bad_id", seller_id=str(seller_id))
        return
    headers = service_headers()
    store: dict[str, Any] | None = None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.post(
                    f"{b2b_url()}/internal/stores/batch",
                    json={"ids": [str(seller_uuid)]},
                    headers=headers,
                )
                if response.status_code == 200:
                    body = response.json()
                    data = body.get("data") if isinstance(body, dict) else None
                    if isinstance(data, list):
                        store = next(
                            (
                                item
                                for item in data
                                if isinstance(item, dict)
                                and str(item.get("id")).lower() == str(seller_uuid)
                            ),
                            None,
                        )
                else:
                    logger.warning(
                        "b2b_store_batch_failed",
                        seller_id=str(seller_uuid),
                        status=response.status_code,
                    )
            except (httpx.HTTPError, ValueError) as exc:
                logger.warning("b2b_store_batch_failed", seller_id=str(seller_uuid), error=str(exc))
            if store is None:
                logger.info("seller_upsert_fallback", seller_id=str(seller_uuid))
            payload = seller_upsert_body(seller_uuid, store)
            try:
                upserted = await client.post(
                    f"{users_url()}/api/internal/sellers/upsert",
                    json=payload,
                    headers=headers,
                )
                if upserted.status_code >= 400:
                    logger.warning(
                        "seller_upsert_failed",
                        seller_id=str(seller_uuid),
                        status=upserted.status_code,
                    )
            except httpx.HTTPError as exc:
                logger.warning("seller_upsert_failed", seller_id=str(seller_uuid), error=str(exc))
    except Exception as exc:
        logger.warning("seller_upsert_failed", seller_id=str(seller_uuid), error=str(exc))
