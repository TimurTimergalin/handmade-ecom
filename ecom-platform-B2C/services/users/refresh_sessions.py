"""Одноразовые refresh-токены. Повтор старого токена после окна гонки гасит все сессии пользователя."""

from __future__ import annotations

import hashlib
import os
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from common.app import UnauthorizedError
from models import RefreshToken

GRACE = timedelta(seconds=60)


def _ttl() -> timedelta:
    seconds = int(os.getenv("AUTH_REFRESH_TTL_SECONDS", str(30 * 24 * 3600)))
    return timedelta(seconds=seconds)


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _new_raw() -> str:
    return secrets.token_urlsafe(32)


async def issue(session: AsyncSession, user_id: uuid.UUID) -> str:
    raw = _new_raw()
    session.add(
        RefreshToken(
            user_id=user_id,
            token_hash=_hash(raw),
            expires_at=datetime.now(UTC) + _ttl(),
        )
    )
    await session.flush()
    return raw


async def rotate(session: AsyncSession, raw: str) -> tuple[uuid.UUID, str]:
    now = datetime.now(UTC)
    row = await session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == _hash(raw)).with_for_update()
    )
    if row is None or row.expires_at <= now:
        raise UnauthorizedError("Сессия истекла")
    if row.revoked_at is not None:
        if row.successor and now - row.revoked_at <= GRACE:
            return row.user_id, row.successor
        await _revoke_family(session, row.user_id, now)
        raise UnauthorizedError("Сессия истекла")

    successor = _new_raw()
    row.revoked_at = now
    row.successor = successor
    session.add(
        RefreshToken(
            user_id=row.user_id,
            token_hash=_hash(successor),
            expires_at=now + _ttl(),
        )
    )
    await session.flush()
    return row.user_id, successor


async def revoke(session: AsyncSession, raw: str) -> None:
    now = datetime.now(UTC)
    row = await session.scalar(select(RefreshToken).where(RefreshToken.token_hash == _hash(raw)))
    if row is None:
        return
    await _revoke_family(session, row.user_id, now)


async def _revoke_family(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now, successor=None)
    )
    await session.flush()
