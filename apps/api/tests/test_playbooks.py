"""Phase 7 — Playbook + PlaybookSetup endpoint tests."""
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


def test_create_playbook(client):
    r = client.post("/playbooks", json={"name": "Momentum", "description": "Trend-following", "color": "#10b981"})
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Momentum"
    assert body["setup_count"] == 0
    assert body["setups"] == []


def test_duplicate_playbook_409(client):
    client.post("/playbooks", json={"name": "Momentum", "color": "#10b981"})
    r = client.post("/playbooks", json={"name": "Momentum", "color": "#ff0000"})
    assert r.status_code == 409


def test_list_playbooks(client):
    client.post("/playbooks", json={"name": "Momentum", "color": "#10b981"})
    client.post("/playbooks", json={"name": "Reversal", "color": "#f43f5e"})
    r = client.get("/playbooks?account_id=1")
    assert r.status_code == 200
    items = r.json()
    assert {p["name"] for p in items} == {"Momentum", "Reversal"}


def test_create_setup_then_list(client):
    pid = client.post("/playbooks", json={"name": "Momentum"}).json()["id"]
    for i in range(3):
        r = client.post(f"/playbooks/{pid}/setups", json={"name": f"Setup {i}", "entry_rules": "Above 20-EMA", "order_index": i})
        assert r.status_code == 200
    r = client.get(f"/playbooks/{pid}/setups")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 3
    assert [s["name"] for s in items] == ["Setup 0", "Setup 1", "Setup 2"]


def test_setup_hard_cap_at_5(client):
    pid = client.post("/playbooks", json={"name": "Momentum"}).json()["id"]
    for i in range(5):
        r = client.post(f"/playbooks/{pid}/setups", json={"name": f"S{i}"})
        assert r.status_code == 200
    r = client.post(f"/playbooks/{pid}/setups", json={"name": "S5"})
    assert r.status_code == 400
    assert "maximum" in r.json()["detail"].lower()


def test_setup_duplicate_name_409(client):
    pid = client.post("/playbooks", json={"name": "Momentum"}).json()["id"]
    client.post(f"/playbooks/{pid}/setups", json={"name": "Pullback"})
    r = client.post(f"/playbooks/{pid}/setups", json={"name": "Pullback"})
    assert r.status_code == 409


def test_get_playbook_includes_setups_and_count(client):
    pid = client.post("/playbooks", json={"name": "Momentum"}).json()["id"]
    for i in range(4):
        client.post(f"/playbooks/{pid}/setups", json={"name": f"S{i}"})
    r = client.get(f"/playbooks/{pid}")
    body = r.json()
    assert body["setup_count"] == 4
    assert len(body["setups"]) == 4


def test_update_playbook_renames_and_updates_color(client):
    pid = client.post("/playbooks", json={"name": "Momentum", "color": "#000000"}).json()["id"]
    r = client.patch(f"/playbooks/{pid}", json={"name": "Trend", "color": "#10b981"})
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Trend"
    assert body["color"] == "#10b981"


def test_update_setup(client):
    pid = client.post("/playbooks", json={"name": "Momentum"}).json()["id"]
    sid = client.post(f"/playbooks/{pid}/setups", json={"name": "Old"}).json()["id"]
    r = client.patch(f"/playbooks/{pid}/setups/{sid}", json={"name": "New", "entry_rules": "RSI<30"})
    assert r.status_code == 200
    assert r.json()["name"] == "New"
    assert r.json()["entry_rules"] == "RSI<30"


def test_delete_setup(client):
    pid = client.post("/playbooks", json={"name": "Momentum"}).json()["id"]
    sid = client.post(f"/playbooks/{pid}/setups", json={"name": "S1"}).json()["id"]
    r = client.delete(f"/playbooks/{pid}/setups/{sid}")
    assert r.status_code == 200
    r = client.get(f"/playbooks/{pid}/setups")
    assert len(r.json()) == 0


def test_delete_playbook_cascades_setups(client):
    pid = client.post("/playbooks", json={"name": "Momentum"}).json()["id"]
    client.post(f"/playbooks/{pid}/setups", json={"name": "S1"})
    r = client.delete(f"/playbooks/{pid}")
    assert r.status_code == 200
    r = client.get(f"/playbooks/{pid}/setups")
    assert r.status_code == 200
    assert r.json() == []


def test_trade_with_playbook_fields_roundtrip(client):
    pid = client.post("/playbooks", json={"name": "Momentum"}).json()["id"]
    sid = client.post(f"/playbooks/{pid}/setups", json={"name": "Pullback"}).json()["id"]

    r = client.post("/cash/deposit", json={"amount": 100_000.0, "note": "seed"})
    assert r.status_code == 200

    r = client.post("/trades", json={
        "symbol": "COMI",
        "market": "Stocks",
        "entry_price": 80.0,
        "position_size": 100.0,
        "entry_date": "2024-06-01T10:00:00",
        "fees": 5.0,
        "pre_trade_plan": "Buy pullback to 20-EMA",
        "pre_trade_emotion": "Calm",
        "r_plan": 2.0,
        "process_grade": 4,
        "r_multiple_grade": 5,
        "playbook_id": pid,
        "playbook_setup_id": sid,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pre_trade_plan"] == "Buy pullback to 20-EMA"
    assert body["r_plan"] == 2.0
    assert body["process_grade"] == 4
    assert body["r_multiple_grade"] == 5
    assert body["playbook_name"] == "Momentum"
    assert body["playbook_setup_name"] == "Pullback"


def test_trade_process_grade_out_of_range_422(client):
    r = client.post("/cash/deposit", json={"amount": 100_000.0})
    assert r.status_code == 200
    r = client.post("/trades", json={
        "symbol": "COMI",
        "market": "Stocks",
        "entry_price": 80.0,
        "position_size": 100.0,
        "entry_date": "2024-06-01T10:00:00",
        "fees": 0.0,
        "process_grade": 7,
    })
    assert r.status_code == 422
