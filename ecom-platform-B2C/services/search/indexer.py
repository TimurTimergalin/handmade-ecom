from __future__ import annotations

import os
import uuid
from decimal import Decimal
from typing import Any

import httpx

from common.app import get_logger
from common.kafka import ConsumerRunner, Topics

logger = get_logger("search.indexer")

INDEX_UID = "products"
_meili: httpx.AsyncClient | None = None


def _meili_client() -> httpx.AsyncClient:
    global _meili
    if _meili is None:
        base = os.getenv("MEILI_URL", "http://meilisearch:7700").rstrip("/")
        key = os.getenv("MEILI_MASTER_KEY", "masterKeyForLocalDevOnly")
        _meili = httpx.AsyncClient(
            base_url=base,
            headers={"Authorization": f"Bearer {key}"},
            timeout=10.0,
        )
    return _meili


async def aclose_meili() -> None:
    global _meili
    if _meili is not None:
        await _meili.aclose()
        _meili = None


def _decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def product_to_document(product: dict[str, Any]) -> dict[str, Any]:
    offers = product.get("offers") or []
    active_prices = [
        _decimal(o.get("price_amount"))
        for o in offers
        if o.get("is_active", True) and _decimal(o.get("price_amount")) is not None
    ]
    min_price = min(active_prices) if active_prices else None
    category = product.get("category") or {}
    return {
        "product_id": str(product["id"]),
        "slug": product.get("slug", ""),
        "title": product.get("title", ""),
        "subtitle": product.get("subtitle"),
        "description": product.get("description"),
        "seller_id": str(product.get("seller_id") or product.get("master_id", "")),
        "category_id": str(product["category_id"]) if product.get("category_id") else None,
        "category_slug": category.get("slug"),
        "category_title": category.get("title"),
        "tags": product.get("tags") or [],
        "rating": float(_decimal(product.get("rating")) or 0),
        "reviews_count": int(product.get("reviews_count") or 0),
        "is_active": bool(product.get("is_active", True)),
        "min_price": float(min_price) if min_price is not None else None,
        "created_at": product.get("created_at"),
    }


async def ensure_index() -> None:
    client = _meili_client()
    response = await client.get(f"/indexes/{INDEX_UID}")
    if response.status_code == 404:
        await client.post(
            "/indexes",
            json={"uid": INDEX_UID, "primaryKey": "product_id"},
        )
        await client.patch(
            f"/indexes/{INDEX_UID}/settings",
            json={
                "searchableAttributes": [
                    "title",
                    "subtitle",
                    "description",
                    "tags",
                    "category_title",
                ],
                "filterableAttributes": [
                    "category_id",
                    "category_slug",
                    "seller_id",
                    "is_active",
                    "tags",
                ],
                "sortableAttributes": ["rating", "reviews_count", "min_price", "created_at"],
            },
        )


async def upsert_documents(documents: list[dict[str, Any]]) -> None:
    if not documents:
        return
    client = _meili_client()
    await ensure_index()
    response = await client.post(f"/indexes/{INDEX_UID}/documents", json=documents)
    response.raise_for_status()


async def delete_document(product_id: uuid.UUID | str) -> None:
    client = _meili_client()
    pid = str(product_id)
    response = await client.delete(f"/indexes/{INDEX_UID}/documents/{pid}")
    if response.status_code not in (200, 202, 404):
        response.raise_for_status()


_B2B_PRODUCT_EVENTS = frozenset({"product.created", "product.updated", "product.deleted"})


def _b2b_document(product: dict[str, Any]) -> dict[str, Any]:
    product_id = str(product.get("id") or product.get("productId") or "")
    price = product.get("price")
    return {
        "product_id": product_id,
        "slug": product_id,
        "title": product.get("title") or "",
        "subtitle": None,
        "description": product.get("description") or "",
        "seller_id": str(product.get("sellerId") or product.get("seller_id") or ""),
        "category_id": None,
        "category_slug": None,
        "category_title": None,
        "tags": [],
        "rating": 0,
        "reviews_count": 0,
        "is_active": True,
        "min_price": float(price) if price is not None else None,
        "created_at": product.get("createdAt") or product.get("created_at"),
    }


async def _handle_b2b_product(payload: dict[str, Any]) -> None:
    from common.b2b_catalog import get_json_data

    event_type = str(payload.get("eventType") or payload.get("event_type") or "")
    inner = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}
    raw_id = inner.get("productId") or inner.get("product_id")
    if not raw_id:
        logger.warning("b2b_product_missing_id", event_type=event_type)
        return
    if event_type == "product.deleted":
        await delete_document(raw_id)
        logger.info("removed_product", product_id=str(raw_id))
        return
    base = os.getenv("B2B_GOODS_URL", "http://b2b-goods:8000/api").rstrip("/")
    status, product = await get_json_data(f"{base}/internal/products/{raw_id}")
    if status != 200 or not isinstance(product, dict):
        logger.warning("b2b_product_index_skipped", product_id=str(raw_id), status=status)
        return
    if product.get("deletedAt") or product.get("deleted_at"):
        await delete_document(raw_id)
        return
    doc = _b2b_document(product)
    await upsert_documents([doc])
    logger.info("indexed_product", product_id=doc["product_id"])


async def handle_goods_changed(_topic: str, payload: dict[str, Any]) -> None:
    event_type = str(payload.get("eventType") or payload.get("event_type") or "")
    if event_type in _B2B_PRODUCT_EVENTS:
        await _handle_b2b_product(payload)
        return
    action = payload.get("action")
    if action == "upserted" and payload.get("product"):
        doc = product_to_document(payload["product"])
        await upsert_documents([doc])
        logger.info("indexed_product", product_id=doc["product_id"])
    elif action == "deleted" and payload.get("product_id"):
        await delete_document(payload["product_id"])
        logger.info("removed_product", product_id=str(payload["product_id"]))
    else:
        logger.warning("unknown_goods_event", action=action, event_type=event_type)


def build_consumer() -> ConsumerRunner:
    bootstrap = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    enabled = os.getenv("KAFKA_ENABLED", "true").lower() == "true"
    group_id = os.getenv("KAFKA_CONSUMER_GROUP", "search-indexer")
    products_topic = os.getenv("KAFKA_PRODUCTS_TOPIC", "handmade.products.v1")
    topics: list[str] = []
    for name in (Topics.GOODS_CHANGED, products_topic):
        if name and name not in topics:
            topics.append(name)
    return ConsumerRunner(
        bootstrap,
        topics=topics,
        group_id=group_id,
        handler=handle_goods_changed,
        enabled=enabled,
    )
