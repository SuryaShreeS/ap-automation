"""Tests run against a dedicated PostgreSQL database (apinvoice_test) on the local
cluster — same engine as production, no SQLite. The local Postgres server must be
running (scripts/pg-start.ps1). The test DB is created if missing and its schema is
rebuilt clean at the start of the session."""

import os

import psycopg

PG_HOST = os.environ.get("PGTEST_HOST", "localhost")
PG_PORT = os.environ.get("PGTEST_PORT", "5432")
PG_USER = os.environ.get("PGTEST_USER", "apuser")
PG_PASS = os.environ.get("PGTEST_PASS", "appass")
TEST_DB = os.environ.get("PGTEST_DB", "apinvoice_test")

os.environ["DATABASE_URL"] = f"postgresql+psycopg://{PG_USER}:{PG_PASS}@{PG_HOST}:{PG_PORT}/{TEST_DB}"
os.environ["SEED_ON_START"] = "true"


def _ensure_test_db() -> None:
    admin_dsn = f"postgresql://{PG_USER}:{PG_PASS}@{PG_HOST}:{PG_PORT}/postgres"
    with psycopg.connect(admin_dsn, autocommit=True) as conn:
        exists = conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DB,)).fetchone()
        if not exists:
            conn.execute(f'CREATE DATABASE "{TEST_DB}" OWNER {PG_USER}')


_ensure_test_db()

import pytest
from fastapi.testclient import TestClient

from app.db import Base, engine
from app.main import app


@pytest.fixture(scope="session")
def client():
    # Clean slate: drop + recreate schema, then let the app lifespan seed it.
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:  # triggers lifespan: create_all + seed
        yield c
