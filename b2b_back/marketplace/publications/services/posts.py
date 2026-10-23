from __future__ import annotations

import re
from html import unescape

import bleach
from sqlalchemy import select

from marketplace.publications.models.entities import Post, PostProduct
from marketplace.publications.repositories.posts import PostsRepository
from marketplace.publications.schemas.posts import PostCreate, PostRead
from marketplace.shared.db import paginate, utcnow
from marketplace.shared.errors import DomainError, invalid
from marketplace.shared.messaging.outbox import enqueue

TAGS = ["p", "h1", "h2", "h3", "strong", "em", "s", "ul", "ol", "li", "blockquote", "br"]


def sanitize(body: str) -> str:
    return bleach.clean(
        body, tags=TAGS, attributes={}, protocols=[], strip=True, strip_comments=True
    )


def plain_text(value: str) -> str:
    return " ".join(unescape(bleach.clean(value or "", tags=[], strip=True)).split())


def excerpt(value: str, limit: int = 280) -> str:
    text = plain_text(value)
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def description(summary: str, body: str) -> str:
    text = plain_text(summary)[:600]
    return text or excerpt(body)


def has_text(body: str) -> bool:
    return bool(plain_text(body))


class PostsService:
    def __init__(self, db, policy, goods):
        self.db, self.policy, self.goods = db, policy, goods
        self.repo = PostsRepository(db)

    def serialize(self, post):
        return PostRead(
            id=post.id,
            seller_id=post.seller_id,
            title=post.title,
            summary=post.summary,
            body=post.body,
            cover_image=post.cover_image,
            status=post.status,
            product_ids=[x.product_id for x in post.links],
            published_at=post.published_at,
            created_at=post.created_at,
            updated_at=post.updated_at,
            moderation_status=post.moderation_status,
            draft_status=post.draft_status,
            rejection_reason=post.rejection_reason,
            draft=post.draft,
        ).model_dump(mode="json", by_alias=True)

    async def validate(self, seller_id, payload, old_ids=()):
        payload = payload.model_copy(
            update={
                "body": sanitize(payload.body),
                "title": payload.title.strip(),
                "summary": description(payload.summary, payload.body),
            }
        )
        if payload.status == "published" and not payload.title:
            invalid("Для публикации нужен заголовок", "title")
        if payload.status == "published" and not payload.summary:
            invalid("Для публикации нужно описание", "summary")
        if payload.status == "published" and not has_text(payload.body):
            invalid("Для публикации нужен полный текст", "body")
        # Existing historical links remain valid after a product's soft deletion.
        new_ids = [i for i in payload.product_ids if i not in old_ids]
        if new_ids:
            products = await self.goods.batch(seller_id, new_ids)
            if {p.id for p in products} != set(new_ids):
                invalid("Товар отсутствует, удалён или принадлежит другому продавцу", "productIds")
        if payload.cover_image:
            await self.policy.media(seller_id, payload.cover_image)
        return payload

    async def create(self, seller_id, payload):
        await self.repo.lock(seller_id)
        policy = await self.policy.entitlements(seller_id)
        if policy.post_limit is not None and await self.repo.count(seller_id) >= policy.post_limit:
            raise DomainError(
                403, "QUOTA_EXCEEDED", "Достигнут лимит публикаций", {"limit": policy.post_limit}
            )
        payload = await self.validate(seller_id, payload)
        submitted = payload.status == "published"
        stored = payload.model_dump(exclude={"product_ids"}, mode="json")
        if submitted:
            stored["status"] = "draft"
        obj = Post(
            seller_id=seller_id,
            moderation_status="pending" if submitted else None,
            **stored,
        )
        obj.links = [
            PostProduct(product_id=p, position=n) for n, p in enumerate(payload.product_ids)
        ]
        self.db.add(obj)
        await self.db.flush()
        return self.serialize(obj)

    async def update(self, seller_id, post_id, patch):
        await self.repo.lock(seller_id)
        policy = await self.policy.entitlements(seller_id)
        obj = await self.repo.get(seller_id, post_id, True)
        previous_status = obj.status
        merged = self.serialize(obj)
        values = {k: merged[PostCreate.model_fields[k].alias or k] for k in PostCreate.model_fields}
        values.update(patch.model_dump(exclude_unset=True))
        payload = await self.validate(
            seller_id, PostCreate.model_validate(values), [x.product_id for x in obj.links]
        )
        changed = [
            PostCreate.model_fields[k].alias or k
            for k, v in payload.model_dump(mode="json").items()
            if merged[PostCreate.model_fields[k].alias or k] != v
        ]
        if (
            payload.status == "published"
            and policy.post_limit is not None
            and await self.repo.count(seller_id) > policy.post_limit
        ):
            raise DomainError(403, "QUOTA_EXCEEDED", "Превышен лимит публикаций после смены тарифа")
        live = previous_status == "published" and obj.moderation_status == "active"
        if live:
            if changed:
                draft = payload.model_dump(mode="json", by_alias=True)
                if draft == self._live_draft(obj):
                    obj.draft = None
                    obj.draft_status = None
                    obj.rejection_reason = None
                else:
                    obj.draft = draft
                    obj.draft_status = "pending"
                    obj.rejection_reason = None
            await self.db.flush()
            return self.serialize(obj)
        for key, value in payload.model_dump(exclude={"product_ids"}, mode="json").items():
            setattr(obj, key, value)
        if payload.status == "published":
            obj.status = "draft"
            obj.moderation_status = "pending"
            obj.rejection_reason = None
            obj.published_at = None
        obj.links.clear()
        await self.db.flush()
        obj.links.extend(
            PostProduct(product_id=p, position=n) for n, p in enumerate(payload.product_ids)
        )
        await self.db.flush()
        return self.serialize(obj)

    def _live_draft(self, obj) -> dict:
        data = self.serialize(obj)
        return {key: data[PostCreate.model_fields[key].alias or key] for key in PostCreate.model_fields}

    async def pending_moderation(self):
        rows = (
            await self.db.scalars(
                select(Post)
                .where(
                    Post.deleted_at.is_(None),
                    (Post.moderation_status == "pending") | (Post.draft_status == "pending"),
                )
                .order_by(Post.created_at.asc())
            )
        ).all()
        return [self._card(row) for row in rows]

    def _card(self, obj) -> dict:
        return {
            "id": str(obj.id),
            "sellerId": str(obj.seller_id),
            "title": obj.title,
            "summary": obj.summary or "",
            "body": obj.body or "",
            "coverImage": obj.cover_image,
            "moderationStatus": obj.moderation_status,
            "draftStatus": obj.draft_status,
            "rejectionReason": obj.rejection_reason,
            "draft": obj.draft,
        }

    async def accept_moderation(self, post_id):
        obj = await self.db.scalar(
            select(Post).where(Post.id == post_id, Post.deleted_at.is_(None)).with_for_update()
        )
        if obj is None:
            from marketplace.shared.errors import missing

            missing("Публикация не найдена")
        if obj.moderation_status == "pending":
            obj.status = "published"
            obj.moderation_status = "active"
            obj.published_at = utcnow()
            obj.rejection_reason = None
            await self.db.flush()
            await enqueue(
                self.db,
                "publication.published",
                obj.id,
                {"publicationId": obj.id, "sellerId": obj.seller_id, "status": "published"},
            )
        elif obj.draft_status == "pending" and obj.draft:
            payload = PostCreate.model_validate(obj.draft)
            live = self._live_draft(obj)
            incoming = payload.model_dump(mode="json", by_alias=True)
            changed = sorted(
                key for key, value in incoming.items() if live.get(key) != value
            )
            for key, value in payload.model_dump(exclude={"product_ids"}, mode="json").items():
                if key != "status":
                    setattr(obj, key, value)
            obj.links.clear()
            await self.db.flush()
            obj.links.extend(
                PostProduct(product_id=p, position=n) for n, p in enumerate(payload.product_ids)
            )
            obj.draft = None
            obj.draft_status = None
            obj.rejection_reason = None
            await self.db.flush()
            if changed:
                await enqueue(
                    self.db,
                    "publication.updated",
                    obj.id,
                    {
                        "publicationId": obj.id,
                        "sellerId": obj.seller_id,
                        "status": obj.status,
                        "changedFields": changed,
                    },
                )
        else:
            invalid("Публикацию нельзя принять")
        return self._card(obj)

    async def reject_moderation(self, post_id, reason: str):
        obj = await self.db.scalar(
            select(Post).where(Post.id == post_id, Post.deleted_at.is_(None)).with_for_update()
        )
        if obj is None:
            from marketplace.shared.errors import missing

            missing("Публикация не найдена")
        reason = reason.strip()
        if obj.moderation_status == "pending":
            obj.moderation_status = "rejected"
            obj.status = "draft"
            obj.rejection_reason = reason
        elif obj.draft_status == "pending":
            obj.draft_status = "rejected"
            obj.rejection_reason = reason
        else:
            invalid("Публикацию нельзя отклонить")
        await self.db.flush()
        return self._card(obj)

    async def discard_draft(self, seller_id, post_id):
        obj = await self.repo.get(seller_id, post_id, True)
        obj.draft = None
        obj.draft_status = None
        if obj.moderation_status == "active":
            obj.rejection_reason = None
        await self.db.flush()
        return self.serialize(obj)

    async def get(self, seller_id, post_id):
        return self.serialize(await self.repo.get(seller_id, post_id))

    async def delete(self, seller_id, post_id):
        await self.repo.lock(seller_id)
        obj = await self.repo.get(seller_id, post_id, True)
        obj.deleted_at = utcnow()
        await self.db.flush()
        await enqueue(
            self.db,
            "publication.deleted",
            obj.id,
            {
                "publicationId": obj.id,
                "sellerId": seller_id,
            },
        )

    async def list(self, seller_id, page, page_size, q, status=None):
        query = self.repo.query(seller_id)
        if q:
            escaped = re.sub(r"([%_\\])", r"\\\1", q)
            query = query.where(Post.title.ilike(f"%{escaped}%", escape="\\"))
        if status:
            query = query.where(Post.status == status)
        return await paginate(self.db, query, page, page_size, self.serialize)

    async def read_published(self, page, page_size, q, seller_id=None):
        query = (
            select(Post)
            .where(
                Post.status == "published",
                Post.moderation_status == "active",
                Post.deleted_at.is_(None),
            )
            .order_by(Post.published_at.desc(), Post.id)
        )
        if seller_id:
            query = query.where(Post.seller_id == seller_id)
        if q:
            escaped = re.sub(r"([%_\\])", r"\\\1", q)
            query = query.where(Post.title.ilike(f"%{escaped}%", escape="\\"))
        return await paginate(self.db, query, page, page_size, self.serialize)

    async def read_one(self, post_id):
        obj = await self.db.scalar(
            select(Post).where(
                Post.id == post_id,
                Post.status == "published",
                Post.moderation_status == "active",
                Post.deleted_at.is_(None),
            )
        )
        if obj is None:
            from marketplace.shared.errors import missing

            missing()
        return self.serialize(obj)

    async def media_references(self, seller_id):
        return list(
            (
                await self.db.scalars(
                    select(Post.cover_image)
                    .where(Post.seller_id == seller_id, Post.cover_image.is_not(None))
                    .distinct()
                )
            ).all()
        )
