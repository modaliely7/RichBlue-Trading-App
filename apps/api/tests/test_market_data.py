"""Phase 6 market-data endpoint tests.

These tests use an in-process FastAPI TestClient with a temp SQLite DB
overriding ``db.engine``. The yfinance provider is monkey-patched to a
synchronous stub so the tests stay offline.
"""
from __future__ import annotations

import os
import tempfile
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


@pytest.fixture()
def client(monkeypatch):
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    db_url = f"sqlite:///{tmp.name}"
    test_engine = create_engine(db_url, connect_args={"check_same_thread": False})
    TestSession = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)

    # Patch db.engine BEFORE importing app.main
    from app import db as db_mod
    monkeypatch.setattr(db_mod, "engine", test_engine)
    monkeypatch.setattr(db_mod, "SessionLocal", TestSession)

    from app.market_data import service as svc_mod
    from app.market_data.models import Quote

    class StubProvider:
        def get_quote(self, canonical):
            return Quote(
                symbol=canonical,
                price=100.0,
                currency="EGP",
                provider="yahoo:stub",
                fetched_at=datetime.now(timezone.utc).replace(tzinfo=None),
                previous_close=99.0,
                day_change=1.0,
                day_change_pct=1.0101,
                year_high=120.0,
                year_low=80.0,
            )

        def get_history(self, canonical, days=180):
            from app.market_data.models import PricePoint
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            return [
                PricePoint(at=now, open=99, high=101, low=98, close=100, volume=1000),
            ]

    stub = StubProvider()
    test_svc = svc_mod.MarketDataService()
    test_svc._provider = stub
    monkeypatch.setattr(svc_mod, "_service", test_svc)
    monkeypatch.setattr(svc_mod, "get_service", lambda: test_svc)

    from app.main import app
    import app.models as models_mod
    models_mod.Base.metadata.create_all(bind=test_engine)

    # Seed a default EodSchedule row (matches the lifespan hook)
    from app.models import EodSchedule, Symbol

    with TestSession() as s:
        s.add(EodSchedule(market_code="EGX", market_name="Egyptian Exchange",
                          eod_hour=14, eod_minute=35, timezone="Africa/Cairo", is_active=True))
        s.commit()

    with TestClient(app) as c:
        yield c

    try:
        os.unlink(tmp.name)
    except OSError:
        pass


def test_ensure_symbols_seeded(client):
    r = client.get("/market-data/egx-symbols?limit=200")
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 50
    canons = {row["canonical"] for row in items}
    assert "COMI" in canons
    assert "HRHO" in canons
    assert all(row["exchange"] == "EGX" for row in items)


def test_get_quote(client):
    r = client.get("/market-data/quote/COMI")
    assert r.status_code == 200
    body = r.json()
    assert body["symbol"] == "COMI"
    assert body["price"] == 100.0
    assert body["currency"] == "EGP"


def test_get_quotes_bulk(client):
    r = client.get("/market-data/quotes?symbols=COMI&symbols=HRHO")
    assert r.status_code == 200
    body = r.json()
    assert {q["symbol"] for q in body["quotes"]} >= {"COMI", "HRHO"}


def test_history(client):
    r = client.get("/market-data/history/COMI?days=30")
    assert r.status_code == 200
    body = r.json()
    assert body["symbol"] == "COMI"
    assert len(body["points"]) >= 1


def test_status(client):
    r = client.get("/market-data/status")
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "yahoo"
    assert body["symbols_in_db"] >= 50
    assert "is_market_open" in body
    assert "session_label" in body


def test_refresh_now_runs(client):
    r = client.post("/settings/market-data/refresh-now")
    assert r.status_code == 200
    body = r.json()
    assert "requested" in body


def test_eod_schedule_crud(client):
    r = client.get("/settings/market-data/schedule")
    assert r.status_code == 200
    sched = r.json()
    assert len(sched) == 1
    schedule_id = sched[0]["id"]
    assert sched[0]["eod_hour"] == 14
    assert sched[0]["eod_minute"] == 35

    r2 = client.patch(f"/settings/market-data/schedule/{schedule_id}",
                      json={"eod_hour": 15, "eod_minute": 0})
    assert r2.status_code == 200
    body = r2.json()
    assert body["eod_hour"] == 15
    assert body["eod_minute"] == 0


def test_search_filter(client):
    r = client.get("/market-data/egx-symbols?query=COMI")
    assert r.status_code == 200
    items = r.json()
    assert any(row["canonical"] == "COMI" for row in items)
    assert all("COMI" in (row["canonical"] + " " + (row["name_en"] or "")) for row in items)


def test_refresh_uses_cache_after_first_call(client):
    r1 = client.get("/market-data/quote/COMI")
    assert r1.status_code == 200
    first = r1.json()["provider"]
    r2 = client.get("/market-data/quote/COMI")
    assert r2.status_code == 200
    assert r2.json()["provider"] == first


def test_scheduler_starts_and_reschedules(client):
    from app.market_data.scheduler import get_scheduler
    sched = get_scheduler()
    assert sched._started
    sched.reschedule()
    job_ids = {j.id for j in sched._sched.get_jobs()}
    assert "refresh_on_open" in job_ids
    assert any(j.startswith("refresh_eod_") for j in job_ids)


def test_patch_schedule_reschedules(client):
    from app.market_data.scheduler import get_scheduler
    sched = get_scheduler()
    r = client.get("/settings/market-data/schedule")
    sched_id = r.json()[0]["id"]
    client.patch(f"/settings/market-data/schedule/{sched_id}", json={"eod_hour": 15, "eod_minute": 5})
    jobs = sched._sched.get_jobs()
    eod_job = next(j for j in jobs if j.id.startswith("refresh_eod_"))
    assert eod_job is not None


def test_scheduler_off_when_no_active_rows(client):
    from app.models import EodSchedule
    from app.market_data.scheduler import get_scheduler
    from app.db import session_scope

    with session_scope() as s:
        for row in s.query(EodSchedule).all():
            row.is_active = False
        s.commit()

    sched = get_scheduler()
    sched.reschedule()
    job_ids = {j.id for j in sched._sched.get_jobs()}
    assert "refresh_on_open" in job_ids
    assert not any(j.startswith("refresh_eod_") for j in job_ids)
