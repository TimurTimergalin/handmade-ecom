"""Two loops: copy unregistered renewals, then run the due ones."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from models import Task

log = logging.getLogger("scheduler")
STALE_AFTER = timedelta(minutes=2)
ATTEMPT_LIMIT = 8


def _now() -> datetime:
    return datetime.now(UTC)


class Jobs:
    def __init__(self, sessions: async_sessionmaker[AsyncSession], http, settings):
        self.sessions, self.http, self.settings = sessions, http, settings

    def _headers(self) -> dict:
        return {"X-Service-Key": self.settings.service_key}

    async def register(self) -> None:
        response = await self.http.get(
            f"{self.settings.b2b_url}/internal/subscription-tasks/pending",
            headers=self._headers(),
        )
        response.raise_for_status()
        rows = (response.json() or {}).get("data") or []
        for row in rows:
            task_id = UUID(str(row["id"]))
            run_at = datetime.fromisoformat(str(row["runAt"]).replace("Z", "+00:00"))
            async with self.sessions() as db:
                await db.execute(
                    insert(Task)
                    .values(
                        id=task_id,
                        run_at=run_at,
                        status="pending",
                        seller_id=UUID(str(row["sellerId"])),
                        payment_method_id=row["paymentMethodId"],
                        amount=int(row["amount"]),
                        attempts=0,
                        updated_at=_now(),
                    )
                    .on_conflict_do_nothing(index_elements=[Task.id])
                )
                await db.commit()
            marked = await self.http.post(
                f"{self.settings.b2b_url}/internal/subscription-tasks/{task_id}/registered",
                headers=self._headers(),
            )
            marked.raise_for_status()

    async def execute(self) -> None:
        async with self.sessions() as db:
            due = (
                await db.scalars(
                    select(Task)
                    .where(
                        Task.run_at <= _now(),
                        or_(
                            Task.status == "pending",
                            (Task.status == "running") & (Task.updated_at <= _now() - STALE_AFTER),
                        ),
                    )
                    .with_for_update(skip_locked=True)
                    .limit(10)
                )
            ).all()
            for task in due:
                task.status = "running"
                task.updated_at = _now()
            tasks = list(due)
            await db.commit()
        for task in tasks:
            await self._run(task.id)

    async def _run(self, task_id: UUID) -> None:
        try:
            begun = await self.http.post(
                f"{self.settings.b2b_url}/internal/subscription-tasks/{task_id}/begin",
                headers=self._headers(),
            )
            begun.raise_for_status()
            action = (begun.json() or {}).get("data") or {}
            if action.get("action") != "charge":
                await self._finish_local(task_id, "cancelled")
                return
            payment = await self.http.post(
                f"{self.settings.payment_url}/internal/subscriptions/renew",
                headers={**self._headers(), "Idempotency-Key": str(task_id)},
                json={
                    "sellerId": str(action["sellerId"]),
                    "paymentMethodId": action["paymentMethodId"],
                    "amount": action["amount"],
                    "currency": "RUB",
                },
            )
            if payment.status_code >= 400:
                await self._retry_or_fail(task_id)
                return
            body = (payment.json() or {}).get("data") or {}
            status = body.get("status")
            payment_id = body.get("reference")
            if status == "confirmed" and payment_id:
                done = await self.http.post(
                    f"{self.settings.b2b_url}/internal/subscription-tasks/{task_id}/finish",
                    headers=self._headers(),
                    json={"status": "succeeded", "paymentId": payment_id},
                )
                done.raise_for_status()
                await self._finish_local(task_id, "done", payment_id)
                return
            if status == "cancelled":
                failed = await self.http.post(
                    f"{self.settings.b2b_url}/internal/subscription-tasks/{task_id}/finish",
                    headers=self._headers(),
                    json={"status": "failed", "paymentId": payment_id},
                )
                failed.raise_for_status()
                await self._finish_local(task_id, "failed", payment_id)
                return
            await self._remember_payment(task_id, payment_id)
            await self._retry_or_fail(task_id, payment_id)
        except Exception:
            log.exception("renewal task failed")
            await self._retry_or_fail(task_id)

    async def _retry_or_fail(self, task_id: UUID, payment_id: str | None = None) -> None:
        async with self.sessions() as db:
            task = await db.get(Task, task_id)
            if task is None or task.status in {"done", "cancelled", "failed"}:
                return
            task.attempts += 1
            task.updated_at = _now()
            if payment_id:
                task.payment_id = payment_id
            if task.attempts >= ATTEMPT_LIMIT:
                task.status = "failed"
                await db.commit()
                await self.http.post(
                    f"{self.settings.b2b_url}/internal/subscription-tasks/{task_id}/finish",
                    headers=self._headers(),
                    json={"status": "failed", "paymentId": task.payment_id},
                )
                return
            task.status = "pending"
            await db.commit()

    async def _remember_payment(self, task_id: UUID, payment_id: str | None) -> None:
        if not payment_id:
            return
        async with self.sessions() as db:
            task = await db.get(Task, task_id)
            if task is not None:
                task.payment_id = payment_id
                task.updated_at = _now()
                await db.commit()

    async def _finish_local(self, task_id: UUID, status: str, payment_id: str | None = None) -> None:
        async with self.sessions() as db:
            task = await db.get(Task, task_id)
            if task is None:
                return
            task.status = status
            task.updated_at = _now()
            if payment_id:
                task.payment_id = payment_id
            await db.commit()
