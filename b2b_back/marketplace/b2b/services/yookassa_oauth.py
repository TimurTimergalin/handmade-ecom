"""YooKassa OAuth: the seller picks a shop, and we store its account_id."""

from __future__ import annotations

import time
from urllib.parse import urlencode

import httpx
import jwt

from marketplace.shared.errors import DomainError, invalid

AUTHORIZE = "https://yookassa.ru/oauth/v2/authorize"
TOKEN = "https://yookassa.ru/oauth/v2/token"
ME = "https://api.yookassa.ru/v3/me"


def connect_url(settings, store_id: str) -> str:
    state = jwt.encode(
        {"storeId": store_id, "exp": int(time.time()) + 600},
        settings.moderator_secret,
        algorithm="HS256",
    )
    if settings.yookassa_oauth_fake:
        base = settings.yookassa_stub_public_url.rstrip("/")
        return f"{base}/oauth/v2/authorize?" + urlencode(
            {
                "response_type": "code",
                "state": state,
                "redirect_uri": settings.yookassa_oauth_redirect_uri,
            }
        )
    client_id = settings.yookassa_oauth_client_id.strip()
    if not client_id or not settings.yookassa_oauth_client_secret.strip():
        invalid("Подключение ЮKassa не настроено")
    return AUTHORIZE + "?" + urlencode(
        {"response_type": "code", "client_id": client_id, "state": state}
    )


def store_id_from_state(settings, state: str) -> str:
    try:
        claims = jwt.decode(state, settings.moderator_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise DomainError(400, "VALIDATION_ERROR", "Сессия подключения ЮKassa истекла") from exc
    store_id = claims.get("storeId")
    if not isinstance(store_id, str) or not store_id:
        invalid("Сессия подключения ЮKassa некорректна")
    return store_id


async def account_id_from_code(settings, code: str) -> str:
    if settings.yookassa_oauth_fake:
        base = settings.yookassa_stub_url.rstrip("/")
        token_url = f"{base}/oauth/v2/token"
        me_url = f"{base}/v3/me"
        auth = None
    else:
        token_url = TOKEN
        me_url = ME
        client_id = settings.yookassa_oauth_client_id.strip()
        secret = settings.yookassa_oauth_client_secret.strip()
        auth = (client_id, secret)
    async with httpx.AsyncClient(timeout=settings.upstream_timeout_seconds) as client:
        token_response = await client.post(
            token_url,
            data={"grant_type": "authorization_code", "code": code},
            auth=auth,
        )
        if token_response.status_code >= 400:
            invalid("ЮKassa не выдала доступ к магазину")
        access_token = (token_response.json() or {}).get("access_token")
        if not isinstance(access_token, str) or not access_token:
            invalid("ЮKassa не выдала доступ к магазину")
        me = await client.get(me_url, headers={"Authorization": f"Bearer {access_token}"})
    if me.status_code >= 400:
        invalid("ЮKassa не подтвердила магазин")
    raw_id = (me.json() or {}).get("account_id")
    account_id = str(raw_id) if raw_id is not None else ""
    if not account_id.isdigit():
        invalid("ЮKassa не подтвердила магазин")
    return account_id
