from __future__ import annotations

import base64
import binascii
import re
import uuid
from collections.abc import AsyncIterator, Sequence
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from common.app import BadRequestError, ForbiddenError, NotFoundError
from common.db import Database
from models import Post, PostComment, PostLike, PostProduct

router = APIRouter(prefix="/api/v1")
_db: Database | None = None
_TAG = re.compile(r"<[^>]+>")


def _excerpt(value: str, limit: int = 280) -> str:
    text = " ".join(_TAG.sub(" ", value or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


async def fill_missing_summaries(session: AsyncSession) -> None:
    rows = (
        await session.scalars(select(Post).where(or_(Post.summary.is_(None), Post.summary == "")))
    ).all()
    for post in rows:
        post.summary = _excerpt(post.body) or post.title


def encode_cursor(published_at: datetime | None, item_id: uuid.UUID) -> str:
    timestamp = published_at.isoformat() if published_at else ""
    raw = f"{timestamp}|{item_id}".encode()
    return base64.urlsafe_b64encode(raw).decode()


def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        timestamp, item_id = raw.split("|", 1)
        return datetime.fromisoformat(timestamp), uuid.UUID(item_id)
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
        raise BadRequestError("Malformed cursor") from exc


def bind_db(database: Database) -> None:
    global _db
    _db = database


async def get_session() -> AsyncIterator[AsyncSession]:
    assert _db is not None
    async for session in _db.session():
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _as_datetime(value: object) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


async def unpublish_post(session: AsyncSession, post_id: uuid.UUID) -> bool:
    post = await session.get(Post, post_id)
    if post is None:
        return False
    post.is_published = False
    await session.flush()
    return True


async def upsert_published_post(session: AsyncSession, data: dict) -> Post:
    """Upsert a published post. Likes, comments, and their counters stay as they are."""
    post_id = uuid.UUID(str(data["id"]))
    seller_id = uuid.UUID(str(data.get("sellerId") or data["seller_id"]))
    title = (data.get("title") or "")[:300]
    body = data.get("body") or ""
    summary = (data.get("summary") or "")[:600] or _excerpt(body)
    cover = data.get("coverImage") if "coverImage" in data else data.get("cover_image")
    if cover == "":
        cover = None
    published_at = _as_datetime(data.get("publishedAt", data.get("published_at")))
    if published_at is None:
        published_at = _as_datetime(data.get("createdAt", data.get("created_at")))

    post = await session.get(Post, post_id)
    if post is None:
        post = Post(
            id=post_id,
            slug=str(post_id),
            seller_id=seller_id,
            title=title,
            summary=summary,
            body=body,
            cover_image=cover,
            published_at=published_at or datetime.now(UTC),
            is_published=True,
            likes_count=0,
            comments_count=0,
        )
        session.add(post)
        await session.flush()
    else:
        post.slug = str(post_id)
        post.seller_id = seller_id
        post.title = title
        post.summary = summary
        post.body = body
        post.cover_image = cover
        post.is_published = True
        if published_at is not None:
            post.published_at = published_at
        elif post.published_at is None:
            post.published_at = datetime.now(UTC)
        post.products.clear()
        await session.flush()

    raw_products = data.get("productIds", data.get("product_ids")) or []
    seen: set[uuid.UUID] = set()
    position = 0
    for raw in raw_products:
        try:
            product_id = uuid.UUID(str(raw))
        except ValueError:
            continue
        if product_id in seen:
            continue
        seen.add(product_id)
        post.products.append(PostProduct(product_id=product_id, position=position))
        position += 1
    await session.flush()
    return post


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class PostProductOut(ORMModel):
    product_id: uuid.UUID
    position: int


class PostOut(ORMModel):
    id: uuid.UUID
    slug: str
    seller_id: uuid.UUID
    title: str
    summary: str | None
    body: str
    cover_image: str | None
    published_at: datetime | None
    likes_count: int
    comments_count: int
    products: list[PostProductOut] = Field(default_factory=list)


class PostShortOut(ORMModel):
    id: uuid.UUID
    slug: str
    seller_id: uuid.UUID
    title: str
    summary: str | None
    cover_image: str | None
    published_at: datetime | None
    likes_count: int
    products: list[PostProductOut] = Field(default_factory=list)


class PostFeed(BaseModel):
    items: list[PostShortOut]
    next_cursor: str | None = None
    has_more: bool = False
    total: int = 0


def _apply_feed_filters(
    query: Any,
    *,
    seller_ids: Sequence[uuid.UUID] | None,
    product_id: uuid.UUID | None,
    q: str | None,
) -> Any:
    if q:
        like = f"%{q.strip()}%"
        query = query.where(
            or_(Post.title.ilike(like), Post.summary.ilike(like), Post.body.ilike(like))
        )
    if seller_ids:
        query = query.where(Post.seller_id.in_(seller_ids))
    if product_id is not None:
        query = query.where(
            Post.id.in_(
                select(PostProduct.post_id).where(PostProduct.product_id == product_id)
            )
        )
    return query


async def _published_total(
    session: AsyncSession,
    *,
    seller_ids: Sequence[uuid.UUID] | None,
    product_id: uuid.UUID | None,
    q: str | None,
) -> int:
    query = _apply_feed_filters(
        select(func.count(Post.id)).where(Post.is_published.is_(True)),
        seller_ids=seller_ids,
        product_id=product_id,
        q=q,
    )
    return int(await session.scalar(query) or 0)


async def _feed(
    session: AsyncSession,
    *,
    seller_ids: Sequence[uuid.UUID] | None = None,
    product_id: uuid.UUID | None = None,
    q: str | None = None,
    cursor: str | None = None,
    limit: int = 20,
) -> tuple[list[Post], bool]:
    query = _apply_feed_filters(
        select(Post).where(Post.is_published.is_(True)),
        seller_ids=seller_ids,
        product_id=product_id,
        q=q,
    )
    if cursor:
        published_at, item_id = decode_cursor(cursor)
        query = query.where(
            or_(
                Post.published_at < published_at,
                (Post.published_at == published_at) & (Post.id < item_id),
            )
        )

    query = query.order_by(Post.published_at.desc(), Post.id.desc())
    result = await session.scalars(query.limit(limit + 1))
    rows = list(result.all())
    return rows[:limit], len(rows) > limit


@router.get("/posts", response_model=PostFeed, tags=["posts"])
async def get_feed(
    session: SessionDep,
    seller_id: list[uuid.UUID] | None = Query(default=None),
    product_id: uuid.UUID | None = None,
    q: str | None = None,
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=50),
) -> PostFeed:
    items, has_more = await _feed(
        session,
        seller_ids=seller_id,
        product_id=product_id,
        q=q,
        cursor=cursor,
        limit=limit,
    )
    total = await _published_total(
        session, seller_ids=seller_id, product_id=product_id, q=q
    )
    next_cursor = encode_cursor(items[-1].published_at, items[-1].id) if items and has_more else None
    return PostFeed(
        items=[PostShortOut.model_validate(item) for item in items],
        next_cursor=next_cursor,
        has_more=has_more,
        total=total,
    )


@router.get("/posts/by-slug/{slug}", response_model=PostOut, tags=["posts"])
async def get_post_by_slug(slug: str, session: SessionDep) -> Post:
    result = await session.scalars(select(Post).where(Post.slug == slug))
    post = result.first()
    if post is None:
        raise NotFoundError(f"Post {slug} not found")
    return post


class LikesStatusIn(BaseModel):
    user_id: uuid.UUID
    post_ids: list[uuid.UUID] = Field(default_factory=list)


@router.post("/posts/likes/status", tags=["posts"])
async def likes_status(session: SessionDep, payload: LikesStatusIn) -> dict:
    user_id = payload.user_id
    post_ids = payload.post_ids
    if not post_ids:
        return {"liked": []}
    rows = await session.scalars(
        select(PostLike.post_id).where(
            PostLike.user_id == user_id, PostLike.post_id.in_(post_ids)
        )
    )
    return {"liked": [str(pid) for pid in rows.all()]}


@router.post("/posts/{post_id}/like", tags=["posts"])
async def like_post(
    post_id: uuid.UUID,
    session: SessionDep,
    user_id: uuid.UUID = Query(...),
) -> dict:
    post = await session.get(Post, post_id)
    if post is None:
        raise NotFoundError(f"Post {post_id} not found")
    exists = await session.scalar(
        select(PostLike.id).where(PostLike.post_id == post_id, PostLike.user_id == user_id)
    )
    if exists is None:
        session.add(PostLike(post_id=post_id, user_id=user_id))
        post.likes_count += 1
    await session.flush()
    return {"isLiked": True, "likesCount": post.likes_count}


@router.delete("/posts/{post_id}/like", tags=["posts"])
async def unlike_post(
    post_id: uuid.UUID,
    session: SessionDep,
    user_id: uuid.UUID = Query(...),
) -> dict:
    post = await session.get(Post, post_id)
    if post is None:
        raise NotFoundError(f"Post {post_id} not found")
    row = await session.scalar(
        select(PostLike).where(PostLike.post_id == post_id, PostLike.user_id == user_id)
    )
    if row is not None:
        await session.delete(row)
        post.likes_count = max(0, post.likes_count - 1)
    await session.flush()
    return {"isLiked": False, "likesCount": post.likes_count}


@router.get("/posts/{post_id}", response_model=PostOut, tags=["posts"])
async def get_post(post_id: uuid.UUID, session: SessionDep) -> Post:
    post = await session.get(Post, post_id)
    if post is None:
        raise NotFoundError(f"Post {post_id} not found")
    return post


class CommentOut(ORMModel):
    id: uuid.UUID
    post_id: uuid.UUID
    user_id: uuid.UUID
    body: str
    created_at: datetime
    updated_at: datetime


class CommentFeed(BaseModel):
    items: list[CommentOut]
    next_cursor: str | None = None
    has_more: bool = False


class CommentCreateIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class CommentUpdateIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


async def _comments_page(
    session: AsyncSession,
    post_id: uuid.UUID,
    *,
    cursor: str | None,
    limit: int,
) -> tuple[list[PostComment], bool]:
    query = select(PostComment).where(PostComment.post_id == post_id)
    if cursor:
        created_at, item_id = decode_cursor(cursor)
        query = query.where(
            or_(
                PostComment.created_at > created_at,
                (PostComment.created_at == created_at) & (PostComment.id > item_id),
            )
        )
    query = query.order_by(PostComment.created_at.asc(), PostComment.id.asc())
    result = await session.scalars(query.limit(limit + 1))
    rows = list(result.all())
    return rows[:limit], len(rows) > limit


@router.get("/posts/{post_id}/comments", response_model=CommentFeed, tags=["comments"])
async def list_comments(
    post_id: uuid.UUID,
    session: SessionDep,
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=50),
) -> CommentFeed:
    post = await session.get(Post, post_id)
    if post is None or not post.is_published:
        raise NotFoundError(f"Post {post_id} not found")
    items, has_more = await _comments_page(session, post_id, cursor=cursor, limit=limit)
    next_cursor = (
        encode_cursor(items[-1].created_at, items[-1].id) if items and has_more else None
    )
    return CommentFeed(
        items=[CommentOut.model_validate(item) for item in items],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.post(
    "/posts/{post_id}/comments",
    response_model=CommentOut,
    status_code=status.HTTP_201_CREATED,
    tags=["comments"],
)
async def create_comment(
    post_id: uuid.UUID,
    payload: CommentCreateIn,
    session: SessionDep,
    user_id: uuid.UUID = Query(...),
) -> PostComment:
    post = await session.get(Post, post_id)
    if post is None or not post.is_published:
        raise NotFoundError(f"Post {post_id} not found")
    body = payload.body.strip()
    if not body:
        raise BadRequestError("Comment body is required")
    comment = PostComment(post_id=post_id, user_id=user_id, body=body)
    session.add(comment)
    post.comments_count += 1
    await session.flush()
    await session.refresh(comment)
    return comment


@router.patch("/comments/{comment_id}", response_model=CommentOut, tags=["comments"])
async def update_comment(
    comment_id: uuid.UUID,
    payload: CommentUpdateIn,
    session: SessionDep,
    user_id: uuid.UUID = Query(...),
) -> PostComment:
    comment = await session.get(PostComment, comment_id)
    if comment is None:
        raise NotFoundError(f"Comment {comment_id} not found")
    if comment.user_id != user_id:
        raise ForbiddenError("You can only edit your own comments")
    body = payload.body.strip()
    if not body:
        raise BadRequestError("Comment body is required")
    comment.body = body
    await session.flush()
    await session.refresh(comment)
    return comment


@router.delete("/comments/{comment_id}", tags=["comments"])
async def delete_comment(
    comment_id: uuid.UUID,
    session: SessionDep,
    user_id: uuid.UUID = Query(...),
) -> dict:
    comment = await session.get(PostComment, comment_id)
    if comment is None:
        raise NotFoundError(f"Comment {comment_id} not found")
    if comment.user_id != user_id:
        raise ForbiddenError("You can only delete your own comments")
    post = await session.get(Post, comment.post_id)
    if post is not None:
        post.comments_count = max(0, post.comments_count - 1)
    await session.delete(comment)
    await session.flush()
    return {"deleted": True}
