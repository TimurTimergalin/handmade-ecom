from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from common.app import NotFoundError, _error_json, create_app, get_logger
from contract_api.errors import ApiError
from contract_api.envelope import err
from contract_api.router import bind as bind_contract
from contract_api.router import router as contract_router
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError

import pages
from clients import Upstreams
from config import B2CSettings
from facade import FrontendFacade
from routes_actions import bind as bind_actions
from routes_actions import router as actions_router
from routes_pages import router as pages_router

logger = get_logger("b2c")

settings = B2CSettings(
    users_url=os.getenv("B2C_USERS_URL", "http://users:8000"),
    publications_url=os.getenv("B2C_PUBLICATIONS_URL", "http://publications:8000"),
    cart_url=os.getenv("B2C_CART_URL", "http://cart:8000"),
    orders_url=os.getenv("B2C_ORDERS_URL", "http://orders:8000"),
    goods_url=os.getenv("B2C_GOODS_URL", "http://goods:8000"),
    search_url=os.getenv("B2C_SEARCH_URL", "http://search:8000"),
    eventer_url=os.getenv("B2C_EVENTER_URL", "http://eventer:8000"),
    gorse_url=os.getenv("B2C_GORSE_URL", "http://gorse:8088"),
    gorse_api_key=os.getenv("B2C_GORSE_API_KEY", "gorseApiKeyForLocalDevOnly"),
    upstream_timeout_seconds=float(os.getenv("B2C_UPSTREAM_TIMEOUT_SECONDS", "2.0")),
    upstream_retries=int(os.getenv("B2C_UPSTREAM_RETRIES", "2")),
    cors_origin=os.getenv("B2C_CORS_ORIGIN", "http://localhost:3000"),
    auth_jwt_secret=os.getenv("AUTH_JWT_SECRET", "changeme"),
    auth_cookie_secure=os.getenv("AUTH_COOKIE_SECURE", "false").lower() == "true",
    auth_dev_mode=os.getenv("AUTH_DEV_MODE", "true").lower() == "true",
    payment_stub_url=os.getenv("B2C_PAYMENT_STUB_URL", "https://yoomoney.ru/checkout/demo"),
    b2b_url=os.getenv("B2C_B2B_URL", ""),
    service_key=os.getenv("SERVICE_KEY", ""),
    yookassa_account_id=os.getenv("YOOKASSA_ACCOUNT_ID", ""),
    order_processor_url=os.getenv("ORDER_PROCESSOR_URL", ""),
    yandex_client_id=os.getenv("YANDEX_CLIENT_ID", ""),
    yandex_client_secret=os.getenv("YANDEX_CLIENT_SECRET", ""),
    yandex_redirect_uri=os.getenv(
        "YANDEX_REDIRECT_URI", "http://localhost:3000/auth/yandex/callback"
    ),
)
upstreams = Upstreams(settings)
facade = FrontendFacade(upstreams)
pages.bind(upstreams)
bind_actions(upstreams)
bind_contract(facade, settings)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
    await upstreams.aclose()


app = create_app(
    settings,
    routers=[contract_router, pages_router, actions_router],
    lifespan=lifespan,
    cors_origins=[settings.cors_origin],
    auth_dev_mode=settings.auth_dev_mode,
    auth_jwt_secret=settings.auth_jwt_secret,
    auth_cookie_name=settings.auth_cookie_name,
)

def _contract_path(path: str) -> bool:
    return path.startswith("/api/") and not path.startswith("/api/v1/")


def _register_contract_handlers(application: FastAPI) -> None:
    @application.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError):
        if not _contract_path(request.url.path):
            from common.app import _error_json

            return _error_json(exc.http_status, exc.code, exc.message, exc.details)
        return err(code=exc.code, message=exc.message, status_code=exc.http_status, details=exc.details)

    @application.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        if _contract_path(request.url.path):
            return err(
                code="VALIDATION_ERROR",
                message="Невалидные данные",
                status_code=400,
                details={"errors": exc.errors()},
            )
        return _error_json(
            422,
            "validation_error",
            "Request validation failed",
            {"errors": exc.errors()},
        )

    @application.exception_handler(NotFoundError)
    async def _not_found(request: Request, exc: NotFoundError):
        if _contract_path(request.url.path):
            return err(code="NOT_FOUND", message=str(exc), status_code=404)
        return _error_json(404, "not_found", str(exc), {})

    async def _invalid_value(request: Request, exc: Exception):
        if _contract_path(request.url.path):
            return err(code="VALIDATION_ERROR", message="Невалидные данные", status_code=400)
        logger.exception("unhandled", error=str(exc))
        return _error_json(500, "internal_error", "Internal server error", {})

    application.add_exception_handler(ValueError, _invalid_value)
    application.add_exception_handler(ValidationError, _invalid_value)


_register_contract_handlers(app)
