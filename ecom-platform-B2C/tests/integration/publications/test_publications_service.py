from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration

POST_ID = "f0000001-0000-4000-8000-000000000099"


@pytest.mark.asyncio
async def test_comments_and_likes(publications_client: AsyncClient) -> None:
    user_id = uuid.uuid4()
    post_id = POST_ID

    create = await publications_client.post(
        f"/api/v1/posts/{post_id}/comments",
        params={"user_id": str(user_id)},
        json={"body": "First comment"},
    )
    assert create.status_code == 201
    comment_id = create.json()["id"]

    listing = await publications_client.get(f"/api/v1/posts/{post_id}/comments")
    assert listing.status_code == 200
    assert any(item["id"] == comment_id for item in listing.json()["items"])

    update = await publications_client.patch(
        f"/api/v1/comments/{comment_id}",
        params={"user_id": str(user_id)},
        json={"body": "Updated"},
    )
    assert update.status_code == 200
    assert update.json()["body"] == "Updated"

    delete = await publications_client.delete(
        f"/api/v1/comments/{comment_id}",
        params={"user_id": str(user_id)},
    )
    assert delete.status_code == 200

    like = await publications_client.post(
        f"/api/v1/posts/{post_id}/like",
        params={"user_id": str(user_id)},
    )
    assert like.status_code == 200
    assert like.json()["isLiked"] is True

    unlike = await publications_client.delete(
        f"/api/v1/posts/{post_id}/like",
        params={"user_id": str(user_id)},
    )
    assert unlike.json()["isLiked"] is False


@pytest.mark.asyncio
async def test_feed_total_ignores_limit_and_cursor(
    publications_client: AsyncClient, publications_db
) -> None:
    database, post_model = publications_db
    token = f"totaltoken{uuid.uuid4().hex[:8]}"
    seller_id = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1")
    published_ids = [uuid.uuid4() for _ in range(3)]
    hidden_id = uuid.uuid4()
    async with database.session_factory() as session:
        for index, post_id in enumerate(published_ids):
            session.add(
                post_model(
                    id=post_id,
                    slug=f"total-{post_id.hex[:12]}",
                    seller_id=seller_id,
                    title=f"{token} {index}",
                    body="body",
                    published_at=datetime.now(UTC),
                    is_published=True,
                )
            )
        session.add(
            post_model(
                id=hidden_id,
                slug=f"total-hidden-{hidden_id.hex[:12]}",
                seller_id=seller_id,
                title=f"{token} hidden",
                body="body",
                published_at=datetime.now(UTC),
                is_published=False,
            )
        )
        await session.commit()
    try:
        first = await publications_client.get("/api/v1/posts", params={"limit": 1, "q": token})
        assert first.status_code == 200
        payload = first.json()
        assert payload["total"] == 3
        assert len(payload["items"]) == 1
        assert payload["has_more"] is True
        second = await publications_client.get(
            "/api/v1/posts",
            params={"limit": 1, "q": token, "cursor": payload["next_cursor"]},
        )
        assert second.status_code == 200
        assert second.json()["total"] == 3
        assert len(second.json()["items"]) == 1
    finally:
        async with database.session_factory() as session:
            for post_id in [*published_ids, hidden_id]:
                row = await session.get(post_model, post_id)
                if row is not None:
                    await session.delete(row)
            await session.commit()
