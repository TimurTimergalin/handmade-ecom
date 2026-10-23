from __future__ import annotations

from fastapi import Response

from config import B2CSettings


def set_auth_cookie(response: Response, settings: B2CSettings, token: str) -> None:
    # Кука живёт столько же, сколько refresh: middleware видит её после истечения JWT
    # и может обменять refresh. Сам JWT короткий, просроченный access API не принимает.
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        path="/",
        max_age=settings.auth_refresh_ttl_seconds,
    )


def set_refresh_cookie(response: Response, settings: B2CSettings, token: str) -> None:
    response.set_cookie(
        key=settings.auth_refresh_cookie_name,
        value=token,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        path="/",
        max_age=settings.auth_refresh_ttl_seconds,
    )


def clear_auth_cookie(response: Response, settings: B2CSettings) -> None:
    for key in (settings.auth_cookie_name, settings.auth_refresh_cookie_name):
        response.set_cookie(
            key=key,
            value="",
            httponly=True,
            secure=settings.auth_cookie_secure,
            samesite=settings.auth_cookie_samesite,
            path="/",
            max_age=0,
        )
