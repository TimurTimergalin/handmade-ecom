from __future__ import annotations

from sqlalchemy import Text, false, func, literal_column, or_, select

from marketplace.goods.models.entities import Product
from marketplace.goods.repositories.catalog import CatalogRepository
from marketplace.goods.schemas.products import ProductRead, ProductStored
from marketplace.shared.db import paginate, utcnow
from marketplace.shared.errors import DomainError, forbidden, invalid
from marketplace.shared.messaging.outbox import enqueue
from marketplace.shared.schemas import SaleMode


def stored_gallery(product) -> tuple[str, list[str]]:
    raw = product.images or []
    urls = [url.strip() for url in raw if isinstance(url, str) and url.strip()]
    if not urls and product.image:
        urls = [product.image]
    image = urls[0] if urls else (product.image or "")
    return image, urls


class CatalogService:
    def __init__(self, db, policy):
        self.db, self.policy = db, policy
        self.repo = CatalogRepository(db)

    async def policy_for(self, seller_id):
        return await self.policy.entitlements(seller_id)

    async def ship_days(self, seller_id):
        cache = getattr(self, "_ship_days", None)
        if cache is None:
            cache = {}
            self._ship_days = cache
        if seller_id not in cache:
            cache[seller_id] = await self.policy.ship_days(seller_id)
        return cache[seller_id]

    async def present(self, product, policy):
        data = self.serialize(product, policy)
        data["cdekShipDays"] = await self.ship_days(product.seller_id)
        return data

    def serialize(self, product, policy):
        image, images = stored_gallery(product)
        data = {key: getattr(product, key) for key in ProductStored.model_fields}
        data["image"] = image
        data["images"] = images
        mode = product.sale_mode
        if product.deleted_at or (mode == SaleMode.ONLINE and not policy.online_payments):
            mode = SaleMode.OUT_OF_STOCK
        data.update(
            id=product.id,
            seller_id=product.seller_id,
            created_at=product.created_at,
            updated_at=product.updated_at,
            currency=product.currency,
            sale_mode=mode,
            deleted_at=product.deleted_at.isoformat() if product.deleted_at else None,
            purchasable=mode == SaleMode.ONLINE
            and product.in_stock > 0
            and not product.deleted_at
            and product.moderation_status == "active",
            moderation_status=product.moderation_status,
            draft_status=product.draft_status,
            rejection_reason=product.rejection_reason,
            draft=product.draft,
        )
        return ProductRead.model_validate(data).model_dump(mode="json", by_alias=True)

    async def validate(self, seller_id, payload, policy):
        if policy.tier == "free" and payload.sale_mode == SaleMode.ONLINE:
            forbidden("Free допускает только продажи по договорённости")
        if payload.sale_mode == SaleMode.ONLINE and not policy.online_payments:
            forbidden("Онлайн-продажи не подтверждены платёжным сервисом")
        for url in payload.images:
            await self.policy.media(seller_id, url)

    async def create(self, seller_id, payload):
        await self.repo.lock(seller_id)
        policy = await self.policy_for(seller_id)
        if (
            policy.product_limit is not None
            and await self.repo.count(seller_id) >= policy.product_limit
        ):
            raise DomainError(
                403, "QUOTA_EXCEEDED", "Достигнут лимит товаров", {"limit": policy.product_limit}
            )
        await self.validate(seller_id, payload, policy)
        obj = Product(
            seller_id=seller_id, moderation_status="pending", **payload.model_dump(mode="json")
        )
        self.db.add(obj)
        await self.db.flush()
        return await self.present(obj, policy)

    async def update(self, seller_id, product_id, patch):
        await self.repo.lock(seller_id)
        obj = await self.repo.get(seller_id, product_id, True)
        merged = {key: getattr(obj, key) for key in ProductStored.model_fields}
        incoming = patch.model_dump(exclude_unset=True)
        incoming.pop("image", None)
        if incoming.get("images"):
            incoming["image"] = incoming["images"][0]
        merged.update(incoming)
        payload = ProductStored.model_validate(merged)
        policy = await self.policy_for(seller_id)
        await self.validate(seller_id, payload, policy)
        if obj.moderation_status != "active":
            for key, value in payload.model_dump(mode="json").items():
                setattr(obj, key, value)
            obj.moderation_status = "pending"
            obj.rejection_reason = None
            obj.draft = None
            obj.draft_status = None
        else:
            dumped = payload.model_dump(mode="json")
            stored = self._stored_json(obj)
            immediate = (
                "available_deliveries",
                "pickup_points",
                "in_stock",
                "sale_mode",
                "deal_contacts",
            )
            immediate_changed = [
                ProductStored.model_fields[key].alias or key
                for key in immediate
                if dumped[key] != stored[key]
            ]
            for key in immediate:
                setattr(obj, key, dumped[key])
            moderated_changed = any(
                dumped[key] != stored[key]
                for key in ProductStored.model_fields
                if key not in immediate
            )
            if moderated_changed:
                self._queue_draft(obj, payload)
            elif obj.draft:
                draft = dict(obj.draft)
                aliased = payload.model_dump(mode="json", by_alias=True)
                for key in immediate:
                    alias = ProductStored.model_fields[key].alias or key
                    draft[alias] = aliased[alias]
                obj.draft = draft
            if immediate_changed:
                await enqueue(
                    self.db,
                    "product.updated",
                    obj.id,
                    {
                        "productId": obj.id,
                        "sellerId": seller_id,
                        "changedFields": immediate_changed,
                        "cdekShipDays": await self.ship_days(seller_id),
                    },
                )
        await self.db.flush()
        return await self.present(obj, policy)

    def _stored_json(self, obj) -> dict:
        data = {key: getattr(obj, key) for key in ProductStored.model_fields}
        return ProductStored.model_validate(data).model_dump(mode="json")

    def _queue_draft(self, obj, payload):
        draft = payload.model_dump(mode="json", by_alias=True)
        live = self._live_draft(obj)
        if draft == live:
            obj.draft = None
            obj.draft_status = None
            obj.rejection_reason = None
            return
        obj.draft = draft
        obj.draft_status = "pending"
        obj.rejection_reason = None

    def _live_draft(self, obj) -> dict:
        data = {key: getattr(obj, key) for key in ProductStored.model_fields}
        return ProductStored.model_validate(data).model_dump(mode="json", by_alias=True)

    async def adjust_stock(self, product_id, delta: int):
        if delta == 0:
            invalid("Изменение остатка не может быть нулевым", "delta")
        obj = await self.db.scalar(
            select(Product)
            .where(Product.id == product_id, Product.deleted_at.is_(None))
            .with_for_update()
        )
        if obj is None:
            from marketplace.shared.errors import missing

            missing()
        if obj.in_stock + delta < 0:
            raise DomainError(409, "CONFLICT", "Недостаточно товара на складе")
        obj.in_stock += delta
        if obj.draft:
            draft = dict(obj.draft)
            draft["inStock"] = obj.in_stock
            obj.draft = draft
        await self.db.flush()
        if obj.moderation_status == "active":
            await enqueue(
                self.db,
                "product.updated",
                obj.id,
                {
                    "productId": obj.id,
                    "sellerId": obj.seller_id,
                    "changedFields": ["inStock"],
                    "cdekShipDays": await self.ship_days(obj.seller_id),
                },
            )
        return {"inStock": obj.in_stock}

    async def discard_draft(self, seller_id, product_id):
        obj = await self.repo.get(seller_id, product_id, True)
        obj.draft = None
        obj.draft_status = None
        obj.rejection_reason = None if obj.moderation_status == "active" else obj.rejection_reason
        await self.db.flush()
        return await self.present(obj, await self.policy_for(seller_id))

    async def pending_moderation(self):
        rows = (
            await self.db.scalars(
                select(Product)
                .where(
                    Product.deleted_at.is_(None),
                    or_(Product.moderation_status == "pending", Product.draft_status == "pending"),
                )
                .order_by(Product.created_at.asc())
            )
        ).all()
        return [self._moderation_card(row) for row in rows]

    def _moderation_card(self, obj) -> dict:
        return {
            "id": str(obj.id),
            "sellerId": str(obj.seller_id),
            "title": obj.title,
            "description": obj.description or "",
            "price": obj.price,
            "images": obj.images or [],
            "moderationStatus": obj.moderation_status,
            "draftStatus": obj.draft_status,
            "rejectionReason": obj.rejection_reason,
            "draft": obj.draft,
        }

    async def accept_moderation(self, product_id):
        obj = await self.db.scalar(
            select(Product).where(Product.id == product_id, Product.deleted_at.is_(None)).with_for_update()
        )
        if obj is None:
            from marketplace.shared.errors import missing

            missing("Товар не найден")
        if obj.moderation_status == "pending":
            obj.moderation_status = "active"
            obj.rejection_reason = None
            await self.db.flush()
            await enqueue(
                self.db,
                "product.created",
                obj.id,
                {
                    "productId": obj.id,
                    "sellerId": obj.seller_id,
                    "cdekShipDays": await self.ship_days(obj.seller_id),
                },
            )
        elif obj.draft_status == "pending" and obj.draft:
            stored = ProductStored.model_validate(obj.draft)
            changed = [
                ProductStored.model_fields[key].alias or key
                for key, value in stored.model_dump(mode="json").items()
                if getattr(obj, key) != value
            ]
            for key, value in stored.model_dump(mode="json").items():
                setattr(obj, key, value)
            obj.draft = None
            obj.draft_status = None
            obj.rejection_reason = None
            await self.db.flush()
            await enqueue(
                self.db,
                "product.updated",
                obj.id,
                {
                    "productId": obj.id,
                    "sellerId": obj.seller_id,
                    "changedFields": sorted(changed),
                    "cdekShipDays": await self.ship_days(obj.seller_id),
                },
            )
        else:
            invalid("Товар нельзя принять")
        return self._moderation_card(obj)

    async def reject_moderation(self, product_id, reason: str):
        obj = await self.db.scalar(
            select(Product).where(Product.id == product_id, Product.deleted_at.is_(None)).with_for_update()
        )
        if obj is None:
            from marketplace.shared.errors import missing

            missing("Товар не найден")
        reason = reason.strip()
        if obj.moderation_status == "pending":
            obj.moderation_status = "rejected"
            obj.rejection_reason = reason
        elif obj.draft_status == "pending":
            obj.draft_status = "rejected"
            obj.rejection_reason = reason
        else:
            invalid("Товар нельзя отклонить")
        await self.db.flush()
        return self._moderation_card(obj)

    async def delete(self, seller_id, product_id):
        await self.repo.lock(seller_id)
        obj = await self.repo.get(seller_id, product_id, True)
        obj.deleted_at = utcnow()
        await self.db.flush()
        await enqueue(
            self.db,
            "product.deleted",
            obj.id,
            {
                "productId": obj.id,
                "sellerId": seller_id,
            },
        )

    async def get(self, seller_id, product_id):
        return await self.present(
            await self.repo.get(seller_id, product_id), await self.policy_for(seller_id)
        )

    async def list(self, seller_id, page, page_size, q, sale_mode, delivery=None):
        policy = await self.policy_for(seller_id)
        query = self.repo.query(seller_id)
        if q:
            escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            term = Product.title.ilike(f"%{escaped}%", escape="\\")
            if self.db.bind.dialect.name == "postgresql":
                config = literal_column("'simple'::regconfig")
                term = or_(
                    term,
                    func.to_tsvector(config, Product.title).op("@@")(
                        func.websearch_to_tsquery(config, q)
                    ),
                )
            query = query.where(term)
        if sale_mode:
            if not policy.online_payments and sale_mode == SaleMode.ONLINE:
                query = query.where(false())
            elif not policy.online_payments and sale_mode == SaleMode.OUT_OF_STOCK:
                query = query.where(Product.sale_mode.in_([SaleMode.ONLINE, SaleMode.OUT_OF_STOCK]))
            else:
                query = query.where(Product.sale_mode == sale_mode)
        # JSON delivery filtering is performed with a dialect-independent EXISTS-free predicate.
        if delivery:
            query = query.where(Product.available_deliveries.cast(Text).like(f'%"{delivery}"%'))
        page_data = await paginate(
            self.db, query, page, page_size, lambda p: self.serialize(p, policy)
        )
        days = await self.ship_days(seller_id)
        for item in page_data["items"]:
            item["cdekShipDays"] = days
        return page_data

    async def batch(self, seller_id, payload):
        if len(set(payload.ids)) != len(payload.ids):
            invalid("Повторяющиеся идентификаторы", "ids")
        query = select(Product).where(Product.seller_id == seller_id, Product.id.in_(payload.ids))
        if not payload.include_deleted:
            query = query.where(Product.deleted_at.is_(None))
        found = {p.id: p for p in (await self.db.scalars(query)).all()}
        policy = await self.policy_for(seller_id)
        days = await self.ship_days(seller_id)
        items = [self.serialize(found[i], policy) for i in payload.ids if i in found]
        for item in items:
            item["cdekShipDays"] = days
        return items

    async def summary(self, seller_id, threshold):
        query = self.repo.query(seller_id).where(Product.in_stock < threshold).limit(100)
        return {
            "totalProductsCount": await self.repo.count(seller_id),
            "lowStockProducts": [
                {"id": str(p.id), "title": p.title, "inStock": p.in_stock}
                for p in (await self.db.scalars(query)).all()
            ],
        }

    async def read_catalog(self, page, page_size, q, seller_id=None, sale_mode=None, delivery=None):
        query = (
            select(Product)
            .where(Product.deleted_at.is_(None), Product.moderation_status == "active")
            .order_by(Product.created_at.desc(), Product.id)
        )
        if seller_id:
            query = query.where(Product.seller_id == seller_id)
        if q:
            escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            query = query.where(Product.title.ilike(f"%{escaped}%", escape="\\"))
        if delivery:
            query = query.where(Product.available_deliveries.cast(Text).like(f'%"{delivery}"%'))
        # Effective sale mode depends on current entitlements: use the seller-specific
        # API for that filter rather than silently filtering by stale stored values.
        if sale_mode:
            if not seller_id:
                invalid("saleMode требует sellerId для учёта актуального тарифа", "sellerId")
            return await self.list(seller_id, page, page_size, q, sale_mode, delivery)
        result = await paginate(self.db, query, page, page_size, lambda row: row)
        sellers = list(dict.fromkeys(row.seller_id for row in result["items"]))
        policies = {p.seller_id: p for p in await self.policy.batch(sellers)} if sellers else {}
        if set(policies) != set(sellers):
            from marketplace.shared.errors import unavailable

            unavailable("b2b")
        items = []
        for row in result["items"]:
            data = self.serialize(row, policies[row.seller_id])
            data["cdekShipDays"] = await self.ship_days(row.seller_id)
            items.append(data)
        result["items"] = items
        return result

    async def read_one(self, product_id):
        obj = await self.db.scalar(
            select(Product).where(
                Product.id == product_id,
                Product.deleted_at.is_(None),
                Product.moderation_status == "active",
            )
        )
        if obj is None:
            from marketplace.shared.errors import missing

            missing()
        return await self.present(obj, await self.policy_for(obj.seller_id))

    async def media_references(self, seller_id):
        rows = (
            await self.db.execute(
                select(Product.image, Product.images).where(Product.seller_id == seller_id)
            )
        ).all()
        seen: list[str] = []
        for image, images in rows:
            for url in [*(images or []), image]:
                if url and url not in seen:
                    seen.append(url)
        return seen

    async def read_batch(self, payload):
        if len(set(payload.ids)) != len(payload.ids):
            invalid("Повторяющиеся идентификаторы", "ids")
        query = select(Product).where(Product.id.in_(payload.ids))
        if not payload.include_deleted:
            query = query.where(Product.deleted_at.is_(None))
        found = {p.id: p for p in (await self.db.scalars(query)).all()}
        sellers = list(dict.fromkeys(p.seller_id for p in found.values()))
        policies = {p.seller_id: p for p in await self.policy.batch(sellers)} if sellers else {}
        if set(policies) != set(sellers):
            from marketplace.shared.errors import unavailable

            unavailable("b2b")
        items = []
        for product_id in payload.ids:
            if product_id not in found:
                continue
            row = found[product_id]
            data = self.serialize(row, policies[row.seller_id])
            data["cdekShipDays"] = await self.ship_days(row.seller_id)
            items.append(data)
        return items

    async def broadcast_ship_days(self, seller_id, ship_days):
        product_ids = (
            await self.db.scalars(
                select(Product.id).where(
                    Product.seller_id == seller_id, Product.deleted_at.is_(None)
                )
            )
        ).all()
        for product_id in product_ids:
            await enqueue(
                self.db,
                "product.updated",
                product_id,
                {
                    "productId": product_id,
                    "sellerId": seller_id,
                    "changedFields": ["cdekShipDays"],
                    "cdekShipDays": list(ship_days),
                },
            )
