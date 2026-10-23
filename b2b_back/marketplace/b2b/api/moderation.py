"""Moderator login and shop applications. Separate from buyer and seller sessions."""

from __future__ import annotations

import time
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import Field

from marketplace.b2b.api.routes import DB
from marketplace.b2b.services.facade import SellerFacade
from marketplace.b2b.services.stores import StoreService, shop_card
from marketplace.shared.errors import DomainError, forbidden, invalid
from marketplace.shared.schemas import DTO

router = APIRouter(tags=["Moderation"])
COOKIE = "moderator-token"


class ModeratorLogin(DTO):
    login: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=200)


class RejectShop(DTO):
    reason: str = Field(min_length=1, max_length=500)


def _token(settings) -> str:
    now = int(time.time())
    return jwt.encode(
        {"role": "moderator", "iat": now, "exp": now + 12 * 3600},
        settings.moderator_secret,
        algorithm="HS256",
    )


def _csrf(request: Request) -> None:
    settings = request.app.state.settings
    if settings.auth_dev_mode:
        return
    if (
        request.headers.get("Origin") not in settings.cors_origins
        or request.headers.get("X-CSRF-Protection") != "1"
    ):
        forbidden("Не пройдена проверка CSRF")


async def moderator(request: Request) -> None:
    token = request.cookies.get(COOKIE)
    if not token:
        raise DomainError(401, "UNAUTHORIZED", "Нужен вход модератора")
    try:
        claims = jwt.decode(
            token,
            request.app.state.settings.moderator_secret,
            algorithms=["HS256"],
            options={"require": ["exp", "role"]},
        )
    except jwt.PyJWTError as exc:
        raise DomainError(401, "UNAUTHORIZED", "Сессия модератора истекла") from exc
    if claims.get("role") != "moderator":
        raise DomainError(401, "UNAUTHORIZED", "Нужен вход модератора")


Mod = Annotated[None, Depends(moderator)]


def _ok(data) -> dict:
    return {"data": data, "error": None}


@router.post("/moderation/login")
async def login(request: Request, body: ModeratorLogin) -> JSONResponse:
    _csrf(request)
    settings = request.app.state.settings
    login_ok = body.login == settings.moderator_login
    password_ok = body.password == settings.moderator_password
    if not (login_ok and password_ok):
        raise DomainError(401, "UNAUTHORIZED", "Неверный логин или пароль")
    response = JSONResponse(_ok({"ok": True}))
    response.set_cookie(
        COOKIE,
        _token(settings),
        httponly=True,
        samesite="lax",
        max_age=12 * 3600,
        path="/",
    )
    return response


@router.post("/moderation/logout")
async def logout(request: Request, _: Mod) -> JSONResponse:
    _csrf(request)
    response = JSONResponse(_ok({"ok": True}))
    response.delete_cookie(COOKIE, path="/")
    return response


def profile_card(store) -> dict:
    draft = store.profile_draft or {}
    return {
        "id": str(store.id),
        "username": store.username,
        "displayName": store.display_name,
        "bio": store.bio or "",
        "avatar": store.avatar or "",
        "draft": draft,
    }


@router.get("/moderation/shops")
async def shops(request: Request, db: DB, _: Mod) -> dict:
    rows = await StoreService(db, request.app.state).pending_shops()
    return _ok([shop_card(row) for row in rows])


@router.get("/moderation/profiles")
async def profiles(request: Request, db: DB, _: Mod) -> dict:
    rows = await StoreService(db, request.app.state).pending_profile_changes()
    return _ok([profile_card(row) for row in rows])


@router.post("/moderation/shops/{shop_id}/accept")
async def accept(shop_id: UUID, request: Request, db: DB, _: Mod) -> dict:
    _csrf(request)
    svc = StoreService(db, request.app.state)
    store = await svc.accept(shop_id)
    seller = await SellerFacade(db, request.app.state).profile(store)
    seller["onboardingStatus"] = store.onboarding_status
    return _ok(seller)


@router.post("/moderation/shops/{shop_id}/reject")
async def reject(shop_id: UUID, body: RejectShop, request: Request, db: DB, _: Mod) -> dict:
    _csrf(request)
    reason = body.reason.strip()
    if not reason:
        invalid("Укажите причину")
    store = await StoreService(db, request.app.state).reject(shop_id, reason)
    return _ok(shop_card(store))


@router.post("/moderation/profiles/{shop_id}/accept")
async def accept_profile(shop_id: UUID, request: Request, db: DB, _: Mod) -> dict:
    _csrf(request)
    store = await StoreService(db, request.app.state).accept_profile(shop_id)
    seller = await SellerFacade(db, request.app.state).profile(store)
    return _ok(seller)


@router.get("/moderation/posts")
async def posts(request: Request, _: Mod) -> dict:
    return _ok(await request.app.state.publications.pending_post_moderation())


@router.post("/moderation/posts/{post_id}/accept")
async def accept_post(post_id: UUID, request: Request, _: Mod) -> dict:
    _csrf(request)
    return _ok(await request.app.state.publications.accept_post(post_id))


@router.post("/moderation/posts/{post_id}/reject")
async def reject_post(post_id: UUID, body: RejectShop, request: Request, _: Mod) -> dict:
    _csrf(request)
    reason = body.reason.strip()
    if not reason:
        invalid("Укажите причину")
    return _ok(await request.app.state.publications.reject_post(post_id, reason))


@router.get("/moderation/products")
async def products(request: Request, _: Mod) -> dict:
    return _ok(await request.app.state.goods.pending_product_moderation())


@router.post("/moderation/products/{product_id}/accept")
async def accept_product(product_id: UUID, request: Request, _: Mod) -> dict:
    _csrf(request)
    return _ok(await request.app.state.goods.accept_product(product_id))


@router.post("/moderation/products/{product_id}/reject")
async def reject_product(product_id: UUID, body: RejectShop, request: Request, _: Mod) -> dict:
    _csrf(request)
    reason = body.reason.strip()
    if not reason:
        invalid("Укажите причину")
    return _ok(await request.app.state.goods.reject_product(product_id, reason))


@router.post("/moderation/profiles/{shop_id}/reject")
async def reject_profile(shop_id: UUID, body: RejectShop, request: Request, db: DB, _: Mod) -> dict:
    _csrf(request)
    reason = body.reason.strip()
    if not reason:
        invalid("Укажите причину")
    store = await StoreService(db, request.app.state).reject_profile(shop_id, reason)
    return _ok(profile_card(store))
