from __future__ import annotations

import os
import uuid
from typing import Any

from common.app import get_logger
from common.b2b_catalog import ensure_seller, get_json_data
from common.db import Database
from common.kafka import ConsumerRunner, Topics

import routes

logger = get_logger("goods.consumer")
_db: Database | None = None

_B2B_PRODUCT_EVENTS = frozenset({"product.created", "product.updated", "product.deleted"})


def bind_db(database: Database) -> None:
    global _db
    _db = database


def consumer_topics() -> list[str]:
    configured = os.getenv("KAFKA_PRODUCTS_TOPIC", "handmade.products.v1")
    topics: list[str] = []
    for name in (Topics.GOODS_CHANGED, configured):
        if name and name not in topics:
            topics.append(name)
    return topics


def _pick(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in data:
            return data[key]
    return None


def product_deleted(product: dict[str, Any]) -> bool:
    deleted = _pick(product, "deletedAt", "deleted_at")
    return deleted is not None and deleted != ""


def product_to_upsert_payload(product: dict[str, Any]) -> dict[str, Any]:
    raw_id = _pick(product, "id", "productId")
    product_id = "" if raw_id is None else str(raw_id)
    seller_raw = _pick(product, "sellerId", "seller_id")
    image = product.get("image") or ""
    title = product.get("title") or ""
    price = _pick(product, "price")
    stock = _pick(product, "inStock", "in_stock")
    deliveries = _pick(product, "availableDeliveries", "available_deliveries")
    pickup = _pick(product, "pickupPoints", "pickup_points")
    return {
        "id": product_id,
        "slug": product_id,
        "title": title,
        "description": product.get("description") or "",
        "seller_id": "" if seller_raw is None else str(seller_raw),
        "images": [{"url": image}] if image else [],
        "is_active": True,
        "sale_mode": product.get("saleMode") or product.get("sale_mode") or "online",
        "available_deliveries": deliveries if isinstance(deliveries, list) else [],
        "pickup_points": pickup if isinstance(pickup, list) else [],
        "deal_contacts": _pick(product, "dealContacts", "deal_contacts"),
        "offers": [
            {
                "id": product_id,
                "price_amount": 0 if price is None else price,
                "currency": "RUB",
                "stock": 0 if stock is None else stock,
                "is_default": True,
                "is_active": True,
                "title": title,
            }
        ],
    }


def _b2b_goods_url() -> str:
    return os.getenv("B2B_GOODS_URL", "http://b2b-goods:8000/api").rstrip("/")


async def _delete_local(product_id: uuid.UUID, topic: str) -> None:
    assert _db is not None
    async with _db.session_factory() as session:
        removed = await routes.delete_product(session, product_id)
        await session.commit()
    logger.info("product_deleted", topic=topic, product_id=str(product_id), found=removed)


async def _handle_b2b_product(topic: str, payload: dict[str, Any]) -> None:
    assert _db is not None
    event_type = str(payload.get("eventType") or payload.get("event_type") or "")
    inner = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}
    raw_id = inner.get("productId") or inner.get("product_id")
    if not raw_id:
        logger.warning("b2b_product_missing_id", topic=topic, event_type=event_type)
        return
    try:
        product_id = uuid.UUID(str(raw_id))
    except ValueError:
        logger.warning("b2b_product_bad_id", topic=topic, product_id=str(raw_id))
        return
    if event_type == "product.deleted":
        await _delete_local(product_id, topic)
        return

    status, product = await get_json_data(f"{_b2b_goods_url()}/internal/products/{product_id}")
    if status == 404:
        logger.info("b2b_product_not_found", product_id=str(product_id))
        return
    if status != 200 or not isinstance(product, dict):
        if status != 0:
            logger.warning("b2b_product_fetch_failed", product_id=str(product_id), status=status)
        return
    if product_deleted(product):
        await _delete_local(product_id, topic)
        return

    seller_raw = product.get("sellerId") or product.get("seller_id") or inner.get("sellerId")
    if seller_raw:
        await ensure_seller(str(seller_raw))
    mapped = product_to_upsert_payload(product)
    if not mapped["seller_id"]:
        logger.warning("b2b_product_missing_seller", product_id=str(product_id))
        return
    async with _db.session_factory() as session:
        await routes.upsert_from_event(session, mapped)
        await session.commit()
    logger.info("product_upserted", topic=topic, product_id=str(product_id))


async def handle_goods_changed(topic: str, payload: dict[str, Any]) -> None:
    if not isinstance(payload, dict):
        logger.warning("unknown_goods_event", topic=topic)
        return
    event_type = payload.get("eventType") or payload.get("event_type")
    if event_type in _B2B_PRODUCT_EVENTS:
        await _handle_b2b_product(topic, payload)
        return

    assert _db is not None
    action = payload.get("action")
    async with _db.session_factory() as session:
        if action == "upserted" and payload.get("product"):
            product_payload = payload["product"]
            known_id = str(product_payload.get("id") or "")
            await routes.upsert_from_event(session, product_payload)
            await session.commit()
            logger.info("product_upserted", topic=topic, product_id=known_id)
        elif action == "deleted" and payload.get("product_id"):
            removed = await routes.delete_product(session, uuid.UUID(str(payload["product_id"])))
            await session.commit()
            logger.info("product_deleted", topic=topic, found=removed)
        else:
            logger.warning("unknown_goods_event", topic=topic, action=action)


def build_consumer() -> ConsumerRunner:
    bootstrap = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    enabled = os.getenv("KAFKA_ENABLED", "true").lower() == "true"
    group_id = os.getenv("KAFKA_CONSUMER_GROUP", "goods-read-model")
    return ConsumerRunner(
        bootstrap,
        topics=consumer_topics(),
        group_id=group_id,
        handler=handle_goods_changed,
        enabled=enabled,
    )
