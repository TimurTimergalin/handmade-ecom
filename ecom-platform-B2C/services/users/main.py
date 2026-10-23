from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from common.app import DatabaseSettings, create_app
from common.db import Database, init_tables
from fastapi import FastAPI
from sqlalchemy import text

import b2b_compat
import routes
from models import Base

settings = DatabaseSettings(
    service_name="users",
    service_title="Users service",
    database_url=os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://ecom:ecom@postgres:5432/ecom_users",
    ),
)
db = Database(settings.database_url, echo=settings.db_echo)
routes.bind_db(db)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await init_tables(db.engine, Base.metadata)
    async with db.engine.begin() as conn:
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS yandex_id VARCHAR(64)"))
        await conn.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_yandex_id ON users (yandex_id)")
        )
        for statement in (
            "ALTER TABLE sellers ADD COLUMN IF NOT EXISTS legal_type VARCHAR(16)",
            "ALTER TABLE sellers ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)",
            "ALTER TABLE sellers ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)",
            "ALTER TABLE sellers ADD COLUMN IF NOT EXISTS patronymic VARCHAR(100)",
            "ALTER TABLE sellers ADD COLUMN IF NOT EXISTS legal_name VARCHAR(300)",
            "ALTER TABLE sellers ADD COLUMN IF NOT EXISTS inn VARCHAR(12)",
            "ALTER TABLE sellers ADD COLUMN IF NOT EXISTS ogrn VARCHAR(15)",
            "ALTER TABLE sellers ADD COLUMN IF NOT EXISTS legal_address TEXT",
        ):
            await conn.execute(text(statement))
    yield
    await db.dispose()


app = create_app(
    settings,
    routers=[routes.router, b2b_compat.router],
    lifespan=lifespan,
    readiness_checks={"postgres": db.healthcheck},
    auth_dev_mode=os.getenv("AUTH_DEV_MODE", "true").lower() == "true",
    auth_jwt_secret=os.getenv("AUTH_JWT_SECRET", "changeme"),
)
