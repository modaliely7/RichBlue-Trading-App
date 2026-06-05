"""Phase 9 — Trade immutability + close-trade workflow."""
from __future__ import annotations

import os
import tempfile
from datetime import datetime, UTC

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

    from app import db as db_mod
    monkeypatch.setattr(db_mod, "engine", test_engine)
    monkeypatch.setattr(db_mod, "SessionLocal", TestSession)

    from app.market_data import service as svc_mod
    from app.market_data.models import Quote
    class StubProvider:
        def get_quote(self, canonical):
            return Quote(symbol=canonical, price=100.0, currency="EGP", provider="yahoo:stub",
                         fetched_at=datetime.now(UTC).replace(tzinfo=None))
        def get_history(self, canonical, days=180):
            from app.market_data.models import PricePoint
            return [PricePoint(at=datetime.now(UTC).replace(tzinfo=None), open=99, high=101, low=98, close=100, volume=1000)]
    test_svc = svc_mod.MarketDataService()
    test_svc._provider = StubProvider()
    monkeypatch.setattr(svc_mod, "_service", test_svc)
    monkeypatch.setattr(svc_mod, "get_service", lambda: test_svc)

    from app.main import app
    import app.models as models_mod
    models_mod.Base.metadata.create_all(bind=test_engine)

    from app.models import Account
    with TestSession() as s:
        s.add(Account(id=1, name="Test"))
        s.commit()

    with TestClient(app) as c:
        yield c

    try:
        os.unlink(tmp.name)
    except OSError:
        pass


def _open_trade(client, **overrides) -> dict:
    client.post("/cash/deposit", json={"amount": 100_000.0})
    payload = {
        "symbol": "COMI",
        "market": "Stocks",
        "entry_price": 80.0,
        "stop_loss": 70.0,
        "position_size": 100.0,
        "entry_date": "2024-06-01T10:00:00",
        "fees": 0.0,
    }
    payload.update(overrides)
    r = client.post("/trades", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def _close(client, trade_id: int, **overrides) -> dict:
    payload = {
        "exit_price": 100.0,
        "exit_date": "2024-06-05T14:00:00",
        "process_grade": 4,
        "r_multiple_grade": 4,
    }
    payload.update(overrides)
    r = client.post(f"/trades/{trade_id}/close", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def test_open_trade_can_be_edited(client):
    t = _open_trade(client)
    r = client.patch(f"/trades/{t['id']}", json={"notes": "Updated note"})
    assert r.status_code == 200
    assert r.json()["notes"] == "Updated note"


def test_open_trade_can_be_deleted(client):
    t = _open_trade(client)
    r = client.delete(f"/trades/{t['id']}")
    assert r.status_code == 200
    assert r.json() == {"deleted": True}


def test_closed_trade_cannot_be_edited(client):
    t = _open_trade(client)
    _close(client, t["id"])
    r = client.patch(f"/trades/{t['id']}", json={"notes": "Trying to edit"})
    assert r.status_code == 409
    assert "immutable" in r.json()["detail"].lower()


def test_closed_trade_cannot_be_deleted(client):
    t = _open_trade(client)
    _close(client, t["id"])
    r = client.delete(f"/trades/{t['id']}")
    assert r.status_code == 409
    assert "immutable" in r.json()["detail"].lower()


def test_close_trade_persists_grades_and_becomes_closed(client):
    t = _open_trade(client)
    body = _close(client, t["id"], process_grade=5, r_multiple_grade=3, lessons_learned="Waited for confirmation")
    assert body["exit_price"] == 100.0
    assert body["process_grade"] == 5
    assert body["r_multiple_grade"] == 3
    assert body["lessons_learned"] == "Waited for confirmation"
    r = client.get("/trades")
    found = next(tr for tr in r.json() if tr["id"] == t["id"])
    assert found["exit_price"] == 100.0
    assert found["pnl"] is not None


def test_close_trade_with_missing_grade_returns_422(client):
    t = _open_trade(client)
    r = client.post(f"/trades/{t['id']}/close", json={
        "exit_price": 100.0,
        "exit_date": "2024-06-05T14:00:00",
        "process_grade": 4,
    })
    assert r.status_code == 422


def test_close_trade_with_out_of_range_grade_returns_422(client):
    t = _open_trade(client)
    r = client.post(f"/trades/{t['id']}/close", json={
        "exit_price": 100.0,
        "exit_date": "2024-06-05T14:00:00",
        "process_grade": 7,
        "r_multiple_grade": 4,
    })
    assert r.status_code == 422


def test_cannot_close_already_closed_trade(client):
    t = _open_trade(client)
    _close(client, t["id"])
    r = client.post(f"/trades/{t['id']}/close", json={
        "exit_price": 110.0,
        "exit_date": "2024-06-05T14:00:00",
        "process_grade": 4,
        "r_multiple_grade": 4,
    })
    assert r.status_code == 409


def test_close_nonexistent_trade_returns_404(client):
    r = client.post("/trades/99999/close", json={
        "exit_price": 100.0,
        "exit_date": "2024-06-05T14:00:00",
        "process_grade": 4,
        "r_multiple_grade": 4,
    })
    assert r.status_code == 404


def test_create_with_exit_and_grades_creates_closed_immutable_trade(client):
    client.post("/cash/deposit", json={"amount": 100_000.0})
    r = client.post("/trades", json={
        "symbol": "COMI",
        "market": "Stocks",
        "entry_price": 80.0,
        "stop_loss": 70.0,
        "exit_price": 100.0,
        "position_size": 100.0,
        "entry_date": "2024-06-01T10:00:00",
        "exit_date": "2024-06-05T14:00:00",
        "fees": 0.0,
        "process_grade": 4,
        "r_multiple_grade": 5,
        "lessons_learned": "Stuck to the plan",
    })
    assert r.status_code == 200
    tid = r.json()["id"]
    edit = client.patch(f"/trades/{tid}", json={"notes": "Edit attempt"})
    assert edit.status_code == 409
