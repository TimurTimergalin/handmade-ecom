"""B2B user-service compatibility routes. Success responses use the data/error envelope."""

from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import jwt
from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from common.app import AuthConfig
from models import Seller, Subscription, User
from routes import SessionDep

router = APIRouter(prefix="/api")


class SellerRoleIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    seller_id: uuid.UUID = Field(alias="sellerId")
    username: str | None = Field(default=None, max_length=120)
    display_name: str | None = Field(default=None, max_length=200, alias="displayName")
    bio: str | None = None
    avatar: str | None = None
    legal_type: str | None = Field(default=None, alias="legalType")
    last_name: str | None = Field(default=None, alias="lastName", max_length=100)
    first_name: str | None = Field(default=None, alias="firstName", max_length=100)
    patronymic: str | None = Field(default=None, max_length=100)
    legal_name: str | None = Field(default=None, alias="legalName", max_length=300)
    inn: str | None = Field(default=None, max_length=12)
    ogrn: str | None = Field(default=None, max_length=15)
    legal_address: str | None = Field(default=None, alias="legalAddress", max_length=500)

    @field_validator("username")
    @classmethod
    def _username(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if len(value) < 3:
            raise ValueError("username must be at least 3 characters")
        return value

    @field_validator("display_name")
    @classmethod
    def _display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class SellerUpsertIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: uuid.UUID
    username: str = Field(min_length=1, max_length=120)
    display_name: str = Field(alias="displayName", min_length=1, max_length=200)
    avatar: str | None = None
    bio: str | None = None
    joined_at: datetime | None = Field(default=None, alias="joinedAt")


def ok(data: Any) -> dict[str, Any]:
    return {"data": data, "error": None}


def with_seller_role(roles: list[Any] | None) -> list[str]:
    current = [role for role in list(roles or []) if isinstance(role, str)]
    if not current:
        current = ["buyer"]
    if "seller" not in current:
        current.append("seller")
    return current


def public_roles(roles: list[Any] | None) -> list[str]:
    current = [role for role in list(roles or []) if isinstance(role, str)]
    return current or ["buyer"]


def identity_user(user: User) -> dict[str, Any]:
    created = user.created_at
    if isinstance(created, datetime):
        created_at = created.isoformat()
    else:
        created_at = datetime.now(UTC).isoformat()
    return {
        "id": str(user.id),
        "roles": public_roles(user.roles),
        "displayName": user.display_name or "",
        "username": user.username or "",
        "avatar": user.avatar or "",
        "email": user.email or "",
        "bio": user.bio or "",
        "createdAt": created_at,
    }


def user_id_from_auth_token(token: str | None) -> uuid.UUID:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    secret = AuthConfig.jwt_secret or os.getenv("AUTH_JWT_SECRET", "changeme")
    algorithm = AuthConfig.jwt_algorithm or "HS256"
    try:
        payload = jwt.decode(token, secret, algorithms=[algorithm])
        return uuid.UUID(str(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from None


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


async def _username_taken(session: AsyncSession, username: str, seller_id: uuid.UUID) -> bool:
    owner = await session.scalar(
        select(Seller.id).where(Seller.username == username, Seller.id != seller_id)
    )
    return owner is not None


async def _free_username(
    session: AsyncSession, desired: str, seller_id: uuid.UUID, current: str | None
) -> str:
    candidate = desired.strip()
    if len(candidate) < 3:
        candidate = f"shop{seller_id.hex[:8]}"
    if not await _username_taken(session, candidate, seller_id):
        return candidate
    if current:
        return current
    fallback = f"shop{seller_id.hex[:8]}"
    if not await _username_taken(session, fallback, seller_id):
        return fallback
    return f"shop{seller_id.hex}"


def _seller_profile(
    user: User, payload: SellerRoleIn, seller: Seller | None
) -> tuple[str, str, str | None, str | None]:
    if payload.username:
        username = payload.username
    elif seller is not None and seller.username:
        username = seller.username
    else:
        username = (user.username or "").strip()
    if len(username) < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="username is required (min 3)",
        )
    if payload.display_name:
        display_name = payload.display_name
    elif seller is not None and seller.display_name:
        display_name = seller.display_name
    else:
        display_name = (user.display_name or "").strip() or "Магазин"
    if "bio" in payload.model_fields_set:
        bio = payload.bio
    elif seller is not None:
        bio = seller.bio
    else:
        bio = user.bio
    if "avatar" in payload.model_fields_set:
        avatar = payload.avatar
    elif seller is not None:
        avatar = seller.avatar
    else:
        avatar = user.avatar
    return username, display_name, bio, avatar


def _text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _assign_legal(seller: Seller, payload: SellerRoleIn) -> None:
    if payload.legal_type not in {"person", "company"}:
        return
    seller.legal_type = payload.legal_type
    seller.last_name = _text(payload.last_name)
    seller.first_name = _text(payload.first_name)
    seller.patronymic = _text(payload.patronymic)
    seller.legal_name = _text(payload.legal_name)
    seller.inn = _text(payload.inn)
    seller.ogrn = _text(payload.ogrn)
    seller.legal_address = _text(payload.legal_address)


@router.get("/auth/me", tags=["b2b"])
async def auth_me(request: Request, session: SessionDep) -> dict[str, Any]:
    user_id = user_id_from_auth_token(request.cookies.get(AuthConfig.auth_cookie_name))
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    return ok({"user": identity_user(user)})


@router.put("/internal/users/{user_id}/seller-role", tags=["b2b"])
async def put_seller_role(
    user_id: uuid.UUID, payload: SellerRoleIn, session: SessionDep
) -> dict[str, Any]:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    seller_by_id = await session.get(Seller, payload.seller_id)
    seller_by_user = await session.scalar(select(Seller).where(Seller.user_id == user.id))
    if (
        seller_by_id is not None
        and seller_by_id.user_id is not None
        and seller_by_id.user_id != user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Seller belongs to another user"
        )
    if seller_by_user is not None and seller_by_user.id != payload.seller_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="User already has a seller profile"
        )

    username, display_name, bio, avatar = _seller_profile(user, payload, seller_by_id)
    if await _username_taken(session, username, payload.seller_id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    user.roles = with_seller_role(user.roles)
    if seller_by_id is None:
        seller_by_id = Seller(
            id=payload.seller_id,
            user_id=user.id,
            username=username,
            display_name=display_name,
            bio=bio,
            avatar=avatar,
            rating=Decimal("0.0"),
            followers_count=0,
            products_count=0,
            posts_count=0,
        )
        session.add(seller_by_id)
    else:
        seller_by_id.user_id = user.id
        seller_by_id.username = username
        seller_by_id.display_name = display_name
        seller_by_id.bio = bio
        seller_by_id.avatar = avatar
    _assign_legal(seller_by_id, payload)
    try:
        await session.flush()
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Seller profile conflict"
        ) from None
    return ok({"user": identity_user(user)})


@router.post("/internal/sellers/upsert", tags=["b2b"])
async def upsert_seller(payload: SellerUpsertIn, session: SessionDep) -> dict[str, Any]:
    seller = await session.get(Seller, payload.id)
    username = await _free_username(
        session, payload.username, payload.id, seller.username if seller is not None else None
    )
    display_name = payload.display_name.strip() or "Магазин"
    if seller is None:
        seller = Seller(
            id=payload.id,
            user_id=None,
            username=username,
            display_name=display_name,
            bio=payload.bio,
            avatar=payload.avatar,
            rating=Decimal("0.0"),
            followers_count=0,
            products_count=0,
            posts_count=0,
        )
        if payload.joined_at is not None:
            seller.created_at = _aware(payload.joined_at)
        session.add(seller)
    else:
        seller.username = username
        seller.display_name = display_name
        if "avatar" in payload.model_fields_set:
            seller.avatar = payload.avatar
        if "bio" in payload.model_fields_set:
            seller.bio = payload.bio
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        existing = await session.get(Seller, payload.id)
        if existing is not None:
            return ok({"id": str(existing.id)})
        seller = Seller(
            id=payload.id,
            user_id=None,
            username=f"shop{payload.id.hex}",
            display_name=display_name,
            bio=payload.bio,
            avatar=payload.avatar,
            rating=Decimal("0.0"),
            followers_count=0,
            products_count=0,
            posts_count=0,
        )
        session.add(seller)
        await session.flush()
    return ok({"id": str(seller.id)})


@router.get("/internal/sellers/{seller_id}/followers", tags=["b2b"])
async def list_followers(
    seller_id: uuid.UUID,
    session: SessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any]:
    total = await session.scalar(
        select(func.count(Subscription.id)).where(Subscription.seller_id == seller_id)
    )
    rows = await session.execute(
        select(User.id, User.display_name, User.avatar)
        .join(Subscription, Subscription.user_id == User.id)
        .where(Subscription.seller_id == seller_id)
        .order_by(Subscription.created_at.desc(), Subscription.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [
        {
            "id": str(user_id),
            "displayName": display_name or "",
            "avatar": avatar or "",
        }
        for user_id, display_name, avatar in rows.all()
    ]
    return ok({"count": int(total or 0), "items": items, "page": page, "pageSize": page_size})


@router.get("/internal/sellers/{seller_id}/views", tags=["b2b"])
async def seller_views(seller_id: uuid.UUID) -> dict[str, Any]:
    """B2B dashboard calls this. View analytics are not collected yet."""
    return ok({"count": 0})
