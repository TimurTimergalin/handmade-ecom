from __future__ import annotations

from datetime import timedelta
from uuid import UUID, uuid4

from sqlalchemy import select

from marketplace.b2b.models.entities import Store, Subscription
from marketplace.b2b.services.stores import aware
from marketplace.shared.db import utcnow
from marketplace.shared.errors import DomainError, invalid

PERIOD = timedelta(days=30)


class SubscriptionService:
    def __init__(self, db, state):
        self.db, self.state = db, state

    def plans(self):
        return [
            {
                "tier": "free",
                "name": "Free",
                "price": 0,
                "features": [
                    {
                        "label": f"Товаров до {self.state.settings.free_product_limit}",
                        "included": True,
                    },
                    {
                        "label": f"Публикаций до {self.state.settings.free_post_limit}",
                        "included": True,
                    },
                    {"label": "Продажи по договорённости", "included": True},
                    {"label": "Онлайн-оплата", "included": False},
                ],
            },
            {
                "tier": "premium",
                "name": "Premium",
                "price": self.state.settings.premium_price,
                "features": [
                    {"label": "Товары и публикации без лимита", "included": True},
                    {
                        "label": "Онлайн-продажи после подтверждения платежных прав",
                        "included": True,
                    },
                    {"label": "Расширенная аналитика (не реализована в MVP)", "included": False},
                    {"label": "Приоритет в поиске (не реализован в MVP)", "included": False},
                ],
            },
        ]

    async def initiate(self, store, key):
        if not (store.yookassa_shop_id or "").strip():
            invalid(
                "Чтобы оформить Premium, подключите магазин ЮKassa в профиле",
                "yookassaShopId",
            )
        sub = await self.db.scalar(
            select(Subscription).where(Subscription.seller_id == store.id).with_for_update()
        )
        reused = (
            sub.provider_reference
            and sub.status in {"pending", "confirmed"}
            and (not sub.valid_until or aware(sub.valid_until) > utcnow())
            and not (sub.payment_url or "").startswith("http://localhost")
        )
        if reused:
            if sub.checkout_key != key:
                raise DomainError(
                    409, "CONFLICT", "Предыдущая подписка активна или ожидает подтверждения"
                )
            return {
                "reference": sub.provider_reference,
                "paymentUrl": sub.payment_url,
                "status": sub.status,
            }
        charge = await self.state.payments.initiate(
            store.id, self.state.settings.premium_price, key
        )
        sub.checkout_key, sub.payment_url = key, charge.payment_url
        sub.provider_reference = charge.reference
        sub.status = "pending"
        sub.online_payments = False
        await self.db.flush()
        return {
            "reference": charge.reference,
            "paymentUrl": charge.payment_url,
            "status": "pending" if sub.status != "confirmed" else "confirmed",
        }

    async def sync(self, store):
        sub = await self.db.scalar(
            select(Subscription).where(Subscription.seller_id == store.id).with_for_update()
        )
        if not sub.provider_reference:
            invalid("Сначала инициируйте подписку")
        confirmed = await self.state.payments.state(store.id, sub.provider_reference)
        if confirmed.seller_id != store.id or confirmed.reference != sub.provider_reference:
            raise DomainError(502, "UPSTREAM_ERROR", "Несогласованный ответ Subscription Service")
        if confirmed.status == "confirmed":
            if (
                confirmed.tier != "premium"
                or not aware(confirmed.valid_until)
                or aware(confirmed.valid_until) <= utcnow()
            ):
                raise DomainError(502, "UPSTREAM_ERROR", "Некорректное подтверждение подписки")
            already = (
                sub.status == "confirmed"
                and sub.valid_until is not None
                and aware(sub.valid_until) > utcnow()
            )
            if not already:
                sub.valid_until = utcnow() + PERIOD
                if confirmed.payment_method_id:
                    sub.payment_method_id = confirmed.payment_method_id
                    sub.auto_renew = True
                    self._queue_renewal(sub)
            sub.status = "confirmed"
            sub.online_payments = confirmed.online_payments
            store.plan_tier = "premium"
        elif confirmed.status in {"rejected", "expired", "cancelled"}:
            sub.status, sub.online_payments, store.plan_tier = confirmed.status, False, "free"
        elif confirmed.status != "pending":
            raise DomainError(502, "UPSTREAM_ERROR", "Неизвестное состояние подписки")
        await self.db.flush()
        return {"status": sub.status, "tier": store.plan_tier, "validUntil": sub.valid_until}

    async def set_auto_renew(self, store, enabled: bool):
        sub = await self.db.scalar(
            select(Subscription).where(Subscription.seller_id == store.id).with_for_update()
        )
        active = (
            sub is not None
            and sub.status == "confirmed"
            and sub.valid_until is not None
            and aware(sub.valid_until) > utcnow()
        )
        if not active:
            invalid("Нет действующей подписки Premium")
        if enabled:
            invalid("Автопродление включается только при оплате Premium")
        sub.auto_renew = False
        await self.db.flush()
        return {"autoRenew": sub.auto_renew, "validUntil": sub.valid_until}

    def _queue_renewal(self, sub):
        sub.renewal_task_id = uuid4()
        sub.renewal_registered = False

    async def unregistered_renewals(self):
        rows = (
            await self.db.scalars(
                select(Subscription).where(
                    Subscription.renewal_registered.is_(False),
                    Subscription.auto_renew.is_(True),
                    Subscription.renewal_task_id.is_not(None),
                    Subscription.payment_method_id.is_not(None),
                    Subscription.valid_until.is_not(None),
                    Subscription.status == "confirmed",
                )
            )
        ).all()
        return [
            {
                "id": str(row.renewal_task_id),
                "runAt": aware(row.valid_until).isoformat(),
                "sellerId": str(row.seller_id),
                "paymentMethodId": row.payment_method_id,
                "amount": self.state.settings.premium_price,
            }
            for row in rows
        ]

    async def mark_renewal_registered(self, task_id: UUID):
        sub = await self.db.scalar(
            select(Subscription).where(Subscription.renewal_task_id == task_id).with_for_update()
        )
        if sub is None:
            return False
        sub.renewal_registered = True
        await self.db.flush()
        return True

    async def begin_renewal(self, task_id: UUID):
        sub = await self.db.scalar(
            select(Subscription).where(Subscription.renewal_task_id == task_id).with_for_update()
        )
        ready = (
            sub is not None
            and sub.auto_renew
            and sub.status == "confirmed"
            and sub.payment_method_id
            and sub.valid_until is not None
        )
        if not ready:
            return {"action": "skip"}
        return {
            "action": "charge",
            "sellerId": str(sub.seller_id),
            "paymentMethodId": sub.payment_method_id,
            "amount": self.state.settings.premium_price,
        }

    async def finish_renewal(self, task_id: UUID, status: str, payment_id: str | None):
        sub = await self.db.scalar(
            select(Subscription).where(Subscription.renewal_task_id == task_id).with_for_update()
        )
        if sub is None:
            return {"ok": True}
        store = await self.db.scalar(select(Store).where(Store.id == sub.seller_id).with_for_update())
        if status == "succeeded":
            base = aware(sub.valid_until) if sub.valid_until else utcnow()
            if base < utcnow():
                base = utcnow()
            sub.valid_until = base + PERIOD
            sub.status = "confirmed"
            sub.online_payments = True
            if store is not None:
                store.plan_tier = "premium"
            if payment_id:
                sub.provider_reference = payment_id
            if sub.auto_renew and sub.payment_method_id:
                self._queue_renewal(sub)
            else:
                sub.renewal_task_id = None
                sub.renewal_registered = True
        else:
            sub.auto_renew = False
            sub.renewal_task_id = None
            sub.renewal_registered = True
            if sub.valid_until is None or aware(sub.valid_until) <= utcnow():
                sub.status = "expired"
                sub.online_payments = False
                if store is not None:
                    store.plan_tier = "free"
        await self.db.flush()
        return {"ok": True}
