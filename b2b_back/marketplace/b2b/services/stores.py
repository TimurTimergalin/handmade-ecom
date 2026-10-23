from __future__ import annotations

from datetime import UTC

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from marketplace.b2b.models.entities import DeliverySettings, Media, Store, Subscription
from marketplace.b2b.repositories.stores import StoresRepository
from marketplace.b2b.schemas.store import Delivery, StoredDelivery, StorePatch
from marketplace.shared.db import utcnow
from marketplace.shared.errors import DomainError, forbidden, invalid
from marketplace.shared.messaging.outbox import enqueue
from marketplace.shared.schemas import Entitlements, Tier


def aware(value):
    return value.replace(tzinfo=UTC) if value and value.tzinfo is None else value


def shop_card(store) -> dict:
    created = store.created_at.isoformat() if store.created_at else None
    return {
        "id": str(store.id),
        "username": store.username,
        "displayName": store.display_name,
        "bio": store.bio or "",
        "onboardingStatus": store.onboarding_status,
        "rejectionReason": store.rejection_reason,
        "legalType": store.legal_type,
        "lastName": store.last_name,
        "firstName": store.first_name,
        "patronymic": store.patronymic,
        "legalName": store.legal_name,
        "inn": store.inn,
        "ogrn": store.ogrn,
        "legalAddress": store.legal_address,
        "avatar": store.avatar or "",
        "createdAt": created,
    }


class StoreService:
    def __init__(self, db, state):
        self.db, self.state = db, state
        self.repo = StoresRepository(db)

    async def current(self, user, lock=False):
        if "seller" not in user.roles:
            forbidden("Требуется роль seller")
        store = await self.repo.by_owner(user.id, lock)
        if store is None or store.onboarding_status != "active":
            forbidden("Завершите регистрацию магазина")
        return store

    async def onboard(self, user, payload):
        store = await self.repo.by_owner(user.id)
        if store is not None and store.onboarding_status == "active":
            return store
        if store is not None and store.onboarding_status == "pending":
            raise DomainError(409, "CONFLICT", "Заявка уже на рассмотрении")
        if store is None:
            store = Store(
                owner_user_id=user.id,
                **payload.model_dump(),
                onboarding_status="pending",
                plan_tier="free",
                rejection_reason=None,
            )
            self.db.add(store)
            try:
                await self.db.flush()
                self.db.add(DeliverySettings(seller_id=store.id))
                self.db.add(Subscription(seller_id=store.id, status="free"))
                await self.db.commit()
            except IntegrityError:
                await self.db.rollback()
                raise DomainError(409, "CONFLICT", "Username занят") from None
            return await self.repo.by_id(store.id)
        return await self._submit_application(user, store, payload)

    async def _submit_application(self, user, store, payload):
        del user
        for key, value in payload.model_dump().items():
            setattr(store, key, value)
        store.onboarding_status = "pending"
        store.rejection_reason = None
        await self.db.flush()
        return store

    async def accept(self, store_id):
        store = await self.repo.by_id(store_id, lock=True)
        if store is None:
            from marketplace.shared.errors import missing

            missing("Заявка не найдена")
        if store.onboarding_status == "active":
            return store
        if store.onboarding_status != "pending":
            invalid("Заявку нельзя принять")
        confirmed = await self.state.users.ensure_seller(
            store.owner_user_id,
            store.id,
            profile={
                "username": store.username,
                "displayName": store.display_name,
                "bio": store.bio or "",
                "avatar": store.avatar or "",
                "legalType": store.legal_type,
                "lastName": store.last_name,
                "firstName": store.first_name,
                "patronymic": store.patronymic,
                "legalName": store.legal_name,
                "inn": store.inn,
                "ogrn": store.ogrn,
                "legalAddress": store.legal_address,
            },
        )
        if confirmed.id != store.owner_user_id or "seller" not in confirmed.roles:
            raise DomainError(502, "UPSTREAM_ERROR", "User Service не подтвердил роль seller")
        store.onboarding_status = "active"
        store.rejection_reason = None
        await self.db.flush()
        await enqueue(
            self.db,
            "seller.created",
            store.id,
            {
                "sellerId": store.id,
                "ownerUserId": store.owner_user_id,
                "username": store.username,
            },
        )
        return store

    async def reject(self, store_id, reason: str):
        store = await self.repo.by_id(store_id, lock=True)
        if store is None:
            from marketplace.shared.errors import missing

            missing("Заявка не найдена")
        if store.onboarding_status != "pending":
            invalid("Заявку нельзя отклонить")
        store.onboarding_status = "rejected"
        store.rejection_reason = reason.strip()
        await self.db.flush()
        return store

    async def pending_shops(self):
        rows = await self.db.scalars(
            select(Store).where(Store.onboarding_status == "pending").order_by(Store.created_at.asc())
        )
        return list(rows.all())

    def application(self, store):
        if store is None:
            return {"status": None, "rejectionReason": None}
        return {
            "status": store.onboarding_status,
            "rejectionReason": store.rejection_reason,
            "displayName": store.display_name,
        }

    async def entitlement(self, seller_id):
        store = await self.repo.by_id(seller_id)
        if store.onboarding_status != "active":
            forbidden("Магазин не активирован")
        sub = await self.db.scalar(select(Subscription).where(Subscription.seller_id == seller_id))
        return self.entitlement_values(store, sub)

    def entitlement_values(self, store, sub):
        premium = bool(
            store.plan_tier == "premium"
            and sub
            and sub.status == "confirmed"
            and aware(sub.valid_until)
            and aware(sub.valid_until) > utcnow()
        )
        return Entitlements(
            seller_id=store.id,
            tier=Tier.PREMIUM if premium else Tier.FREE,
            product_limit=None if premium else self.state.settings.free_product_limit,
            post_limit=None if premium else self.state.settings.free_post_limit,
            online_payments=bool(premium and sub.online_payments),
            valid_until=aware(sub.valid_until) if premium and sub.valid_until else None,
            auto_renew=bool(premium and sub.auto_renew),
        )

    async def entitlement_batch(self, ids):
        rows = (
            await self.db.execute(
                select(Store, Subscription)
                .join(Subscription, Subscription.seller_id == Store.id)
                .where(Store.id.in_(ids), Store.onboarding_status == "active")
            )
        ).all()
        mapped = {store.id: self.entitlement_values(store, sub) for store, sub in rows}
        return [mapped[i] for i in ids if i in mapped]

    async def validate_media(self, seller_id, url):
        media = await self.db.scalar(
            select(Media).where(Media.owner_seller_id == seller_id, Media.url == url)
        )
        if media is None:
            invalid("Используйте URL изображения, загруженного этим магазином", "image")
        return media

    async def update(self, store, payload: StorePatch):
        values = payload.model_dump(exclude_unset=True)
        for key, value in values.items():
            if value is None and key != "yookassa_shop_id":
                invalid("Поле не может быть null", key)
        if values.get("avatar"):
            await self.validate_media(store.id, values["avatar"])
        public = {
            key: values[key]
            for key in ("display_name", "bio", "avatar")
            if key in values
        }
        for key, value in public.items():
            if value is None:
                invalid("Поле не может быть null", key)
        if public:
            self._queue_profile(store, public)
        rest = {
            key: value
            for key, value in values.items()
            if key not in {"display_name", "bio", "avatar"}
        }
        for key, value in rest.items():
            setattr(store, key, value)
        await self.db.flush()
        return store

    def _queue_profile(self, store, public: dict) -> None:
        base = dict(store.profile_draft or {})
        draft = {
            "displayName": base.get("displayName", store.display_name),
            "bio": base.get("bio", store.bio or ""),
            "avatar": base.get("avatar", store.avatar or ""),
        }
        if "display_name" in public:
            draft["displayName"] = public["display_name"]
        if "bio" in public:
            draft["bio"] = public["bio"] or ""
        if "avatar" in public:
            draft["avatar"] = public["avatar"] or ""
        current = {
            "displayName": store.display_name,
            "bio": store.bio or "",
            "avatar": store.avatar or "",
        }
        if draft == current:
            store.profile_draft = None
            store.profile_status = None
            store.profile_rejection_reason = None
            return
        store.profile_draft = draft
        store.profile_status = "pending"
        store.profile_rejection_reason = None

    async def discard_profile_draft(self, store):
        store.profile_draft = None
        store.profile_status = None
        store.profile_rejection_reason = None
        await self.db.flush()
        return store

    async def pending_profile_changes(self):
        rows = await self.db.scalars(
            select(Store)
            .where(Store.profile_status == "pending", Store.onboarding_status == "active")
            .order_by(Store.updated_at.asc())
        )
        return list(rows.all())

    async def accept_profile(self, store_id):
        store = await self.repo.by_id(store_id, lock=True)
        if store is None:
            from marketplace.shared.errors import missing

            missing("Заявка не найдена")
        draft = store.profile_draft or {}
        if store.profile_status != "pending" or not draft:
            invalid("Изменения профиля нельзя принять")
        store.display_name = draft.get("displayName") or store.display_name
        store.bio = draft.get("bio") or ""
        store.avatar = draft.get("avatar") or ""
        store.profile_draft = None
        store.profile_status = None
        store.profile_rejection_reason = None
        await self.db.flush()
        confirmed = await self.state.users.ensure_seller(
            store.owner_user_id,
            store.id,
            profile={
                "username": store.username,
                "displayName": store.display_name,
                "bio": store.bio or "",
                "avatar": store.avatar or "",
            },
        )
        if confirmed.id != store.owner_user_id or "seller" not in confirmed.roles:
            raise DomainError(502, "UPSTREAM_ERROR", "User Service не подтвердил профиль")
        return store

    async def reject_profile(self, store_id, reason: str):
        store = await self.repo.by_id(store_id, lock=True)
        if store is None:
            from marketplace.shared.errors import missing

            missing("Заявка не найдена")
        if store.profile_status != "pending":
            invalid("Изменения профиля нельзя отклонить")
        store.profile_status = "rejected"
        store.profile_rejection_reason = reason.strip()
        await self.db.flush()
        return store

    async def delivery(self, store):
        obj = await self.db.get(DeliverySettings, store.id)
        return StoredDelivery.model_validate(obj)

    async def update_delivery(self, store, patch):
        obj = await self.db.get(DeliverySettings, store.id)
        values = StoredDelivery.model_validate(obj).model_dump()
        values.update(patch.model_dump(exclude_unset=True))
        checked = Delivery.model_validate(values)
        for key, value in checked.model_dump(mode="json").items():
            setattr(obj, key, value)
        await self.db.flush()
        days = list(checked.cdek_ship_days) if checked.cdek_enabled else []
        await self.state.goods.broadcast_ship_days(store.id, days)
        return checked

    async def normalized_shop_id(self, store, raw):
        if raw is None:
            invalid("Поле не может быть null", "yookassaShopId")
        shop_id = str(raw).strip()
        if shop_id and not shop_id.isdigit():
            invalid("Укажите числовой shopId магазина ЮKassa", "yookassaShopId")
        if not shop_id:
            policy = await self.entitlement(store.id)
            if policy.tier == Tier.PREMIUM:
                invalid("Премиум-магазину нужен shopId ЮKassa в профиле", "yookassaShopId")
            return None
        return shop_id

    async def require_payout_for_premium_online(self, store, sale_mode):
        if getattr(sale_mode, "value", sale_mode) != "online":
            return
        policy = await self.entitlement(store.id)
        if policy.tier != Tier.PREMIUM:
            return
        if not (store.yookassa_shop_id or "").strip():
            invalid(
                "Для онлайн-товара на Premium укажите shopId магазина ЮKassa в профиле",
                "yookassaShopId",
            )

    async def public_batch(self, ids):
        from marketplace.b2b.schemas.responses import StorePublic

        stores = (
            await self.db.scalars(
                select(Store).where(Store.id.in_(ids), Store.onboarding_status == "active")
            )
        ).all()
        mapped = {
            s.id: StorePublic(
                id=s.id,
                username=s.username,
                display_name=s.display_name,
                avatar=s.avatar,
                bio=s.bio,
                joined_at=s.created_at,
            )
            for s in stores
        }
        return [mapped[i] for i in ids if i in mapped]
