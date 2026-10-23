import asyncio
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from jobs import Jobs
from models import Base
from settings import Settings

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("scheduler")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()
    engine = create_async_engine(settings.database_url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    http = httpx.AsyncClient(timeout=30)
    jobs = Jobs(sessions, http, settings)
    stop = asyncio.Event()

    async def loop(name: str, work) -> None:
        while not stop.is_set():
            try:
                await work()
            except Exception:
                log.exception("periodic task %s failed", name)
            try:
                await asyncio.wait_for(stop.wait(), timeout=settings.poll_seconds)
            except TimeoutError:
                pass

    runners = [
        asyncio.create_task(loop("register", jobs.register)),
        asyncio.create_task(loop("execute", jobs.execute)),
    ]
    yield
    stop.set()
    for runner in runners:
        runner.cancel()
    await asyncio.gather(*runners, return_exceptions=True)
    await http.aclose()
    await engine.dispose()


app = FastAPI(lifespan=lifespan)


@app.get("/readyz")
async def readyz() -> dict:
    return {"ok": True}
