from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import Base, SessionLocal, engine
from .routers import (
    admin,
    ap_review,
    approvals,
    audit,
    credits,
    dashboards,
    home,
    inflow,
    invoices,
    matching,
    prepayments,
    queues,
    reports,
    search,
)
from .routers import engine as engine_router  # aliased: `engine` is the DB engine here
from .seed import seed

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev bootstrap: create tables and seed if empty. Production uses Alembic migrations;
    # create_all is a no-op when the schema already exists.
    Base.metadata.create_all(bind=engine)
    if settings.seed_on_start:
        with SessionLocal() as db:
            seed(db)
    yield


app = FastAPI(title="AP Invoice Platform API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (
    home, inflow, dashboards, search, invoices, matching, approvals, ap_review,
    prepayments, credits, admin, queues, audit, reports, engine_router,
):
    app.include_router(router.router)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "db": settings.database_url.split("://", 1)[0]}
