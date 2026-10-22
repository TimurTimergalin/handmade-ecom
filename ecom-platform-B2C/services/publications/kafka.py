from __future__ import annotations

import os
import uuid
from typing import Any

from common.app import get_logger
from common.b2b_catalog import ensure_seller, get_json_data
from common.db import Database
from common.kafka import ConsumerRunner

import routes

logger = get_logger("publications.consumer")
_db: Database | None = None

_PUBLISHED_EVENTS = frozenset({"publication.published", "publication.updated"})
_EVENTS = _PUBLISHED_EVENTS | {"publication.deleted"}


def bind_db(database: Database) -> None:
    global _db
    _db = database


def consumer_topics() -> list[str]:
    topic = os.getenv("KAFKA_PUBLICATIONS_TOPIC", "handmade.publications.v1")
    return [topic] if topic else []


def _b2b_publications_url() -> str:
    return os.getenv("B2B_PUBLICATIONS_URL", "http://b2b-publications:8000/api").rstrip("/")


async def _unpublish(post_id: uuid.UUID, topic: str) -> None:
    assert _db is not None
    async with _db.session_factory() as session:
        found = await routes.unpublish_post(session, post_id)
        await session.commit()
    logger.info("publication_unpublished", topic=topic, post_id=str(post_id), found=found)


async def handle_publication(topic: str, payload: dict[str, Any]) -> None:
    if not isinstance(payload, dict):
        logger.warning("unknown_publication_event", topic=topic)
        return
    event_type = str(payload.get("eventType") or payload.get("event_type") or "")
    if event_type not in _EVENTS:
        logger.warning("unknown_publication_event", topic=topic, event_type=event_type)
        return
    inner = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}
    raw_id = inner.get("publicationId") or inner.get("publication_id")
    if not raw_id:
        logger.warning("publication_event_missing_id", topic=topic, event_type=event_type)
        return
    try:
        publication_id = uuid.UUID(str(raw_id))
    except ValueError:
        logger.warning("publication_event_bad_id", topic=topic, publication_id=str(raw_id))
        return
    if event_type == "publication.deleted":
        await _unpublish(publication_id, topic)
        return

    status, post = await get_json_data(
        f"{_b2b_publications_url()}/internal/posts/{publication_id}"
    )
    if status == 404:
        logger.info("b2b_publication_not_found", publication_id=str(publication_id))
        return
    if status != 200 or not isinstance(post, dict):
        if status != 0:
            logger.warning(
                "b2b_publication_fetch_failed",
                publication_id=str(publication_id),
                status=status,
            )
        return
    post_status = post.get("status") or inner.get("status") or ""
    if post_status != "published":
        await _unpublish(publication_id, topic)
        return

    seller_raw = post.get("sellerId") or post.get("seller_id") or inner.get("sellerId")
    if not seller_raw:
        logger.warning("b2b_publication_missing_seller", publication_id=str(publication_id))
        return
    post.setdefault("id", str(publication_id))
    if "sellerId" not in post and "seller_id" not in post:
        post["sellerId"] = str(seller_raw)
    await ensure_seller(str(seller_raw))
    assert _db is not None
    async with _db.session_factory() as session:
        saved = await routes.upsert_published_post(session, post)
        await session.commit()
    logger.info("publication_upserted", topic=topic, post_id=str(saved.id))


def build_consumer() -> ConsumerRunner:
    bootstrap = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    enabled = os.getenv("KAFKA_ENABLED", "true").lower() == "true"
    group_id = os.getenv("KAFKA_CONSUMER_GROUP", "publications-read-model")
    return ConsumerRunner(
        bootstrap,
        topics=consumer_topics(),
        group_id=group_id,
        handler=handle_publication,
        enabled=enabled,
    )
