"""Phase 8 — Hybrid Behavior Engine: pure-function unit tests + endpoint smoke test."""
from __future__ import annotations

import os
import tempfile
from datetime import datetime, UTC

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.insights import (
    closed_trades,
    compute_emotion_breakdown,
    compute_plan_accuracy,
    compute_playbook_breakdown,
    compute_process_grade_breakdown,
    compute_setup_breakdown,
    generate_insights,
)


def _t(
    id: int = 1,
    symbol: str = "X",
    pnl: float | None = 100.0,
    r_multiple_actual: float | None = 1.0,
    r_plan: float | None = None,
    process_grade: int | None = None,
    pre_trade_emotion: str | None = None,
    playbook_id: int | None = None,
    playbook_name: str | None = None,
    playbook_setup_id: int | None = None,
    playbook_setup_name: str | None = None,
    exit_price: float | None = 110.0,
    entry_date: str = "2024-06-01T10:00:00",
) -> dict:
    return {
        "id": id,
        "symbol": symbol,
        "pnl": pnl,
        "r_multiple_actual": r_multiple_actual,
        "r_plan": r_plan,
        "process_grade": process_grade,
        "r_multiple_grade": None,
        "pre_trade_emotion": pre_trade_emotion,
        "playbook_id": playbook_id,
        "playbook_name": playbook_name,
        "playbook_setup_id": playbook_setup_id,
        "playbook_setup_name": playbook_setup_name,
        "exit_price": exit_price,
        "entry_date": entry_date,
    }


def test_closed_trades_filters_open():
    out = closed_trades([_t(exit_price=None, pnl=None, r_multiple_actual=None)])
    assert out == []


def test_emotion_breakdown_groups_and_sorts():
    closed = [
        _t(id=1, pre_trade_emotion="Calm", pnl=200, r_multiple_actual=2.0),
        _t(id=2, pre_trade_emotion="Calm", pnl=100, r_multiple_actual=1.0),
        _t(id=3, pre_trade_emotion="FOMO", pnl=-50, r_multiple_actual=-0.5),
    ]
    stats = compute_emotion_breakdown(closed)
    assert len(stats) == 2
    calm = next(s for s in stats if s.emotion == "Calm")
    assert calm.trade_count == 2
    assert calm.win_rate == 100.0
    assert calm.avg_r_multiple == 1.5
    fomo = next(s for s in stats if s.emotion == "FOMO")
    assert fomo.trade_count == 1
    assert fomo.win_rate == 0.0


def test_playbook_breakdown_handles_untagged():
    closed = [
        _t(id=1, playbook_id=1, playbook_name="Momentum", pnl=200, r_multiple_actual=2.0),
        _t(id=2, playbook_id=None, playbook_name=None, pnl=-50, r_multiple_actual=-0.5),
    ]
    stats = compute_playbook_breakdown(closed)
    untagged = next(s for s in stats if s.playbook_id is None)
    assert untagged.playbook_name == "Untagged"
    assert untagged.trade_count == 1
    assert untagged.win_rate == 0.0


def test_setup_breakdown_only_counts_setups():
    closed = [
        _t(id=1, playbook_id=1, playbook_name="P", playbook_setup_id=10, playbook_setup_name="Pullback", pnl=100, r_multiple_actual=1.0),
        _t(id=2, playbook_id=1, playbook_name="P", playbook_setup_id=10, playbook_setup_name="Pullback", pnl=200, r_multiple_actual=2.0),
        _t(id=3, playbook_id=1, playbook_name="P", playbook_setup_id=None, playbook_setup_name=None, pnl=-50, r_multiple_actual=-0.5),
    ]
    stats = compute_setup_breakdown(closed)
    assert len(stats) == 1
    assert stats[0].setup_name == "Pullback"
    assert stats[0].trade_count == 2
    assert stats[0].win_rate == 100.0


def test_plan_accuracy_pairs_correctly():
    closed = [
        _t(id=1, r_plan=2.0, r_multiple_actual=2.5),
        _t(id=2, r_plan=2.0, r_multiple_actual=1.0),
        _t(id=3, r_plan=2.0, r_multiple_actual=3.0),
        _t(id=4, r_plan=None, r_multiple_actual=1.0),
    ]
    acc = compute_plan_accuracy(closed)
    assert acc is not None
    assert acc.trade_count == 3
    assert acc.avg_plan == 2.0
    assert acc.avg_actual == pytest.approx(2.1666, abs=0.01)
    assert acc.pct_meeting_plan == pytest.approx(66.66, abs=0.01)


def test_plan_accuracy_returns_none_when_no_pairs():
    closed = [_t(id=1, r_plan=None, r_multiple_actual=1.0)]
    assert compute_plan_accuracy(closed) is None


def test_process_grade_breakdown_groups_by_grade():
    closed = [
        _t(id=1, process_grade=5, pnl=300, r_multiple_actual=3.0),
        _t(id=2, process_grade=5, pnl=200, r_multiple_actual=2.0),
        _t(id=3, process_grade=2, pnl=-50, r_multiple_actual=-0.5),
    ]
    stats = compute_process_grade_breakdown(closed)
    by_grade = {s.grade: s for s in stats}
    assert by_grade[5].trade_count == 2
    assert by_grade[5].win_rate == 100.0
    assert by_grade[2].win_rate == 0.0


def test_generate_emotion_alarm_and_sweet_spot():
    closed = [
        _t(id=i, pre_trade_emotion="Revenge", pnl=-100, r_multiple_actual=-1.5)
        for i in range(1, 5)
    ] + [
        _t(id=i, pre_trade_emotion="Calm", pnl=200, r_multiple_actual=2.0)
        for i in range(5, 9)
    ]
    insights = generate_insights(
        closed=closed,
        emotion_stats=compute_emotion_breakdown(closed),
        playbook_stats=[],
        plan_accuracy=None,
        process_stats=[],
        total_trade_count=8,
    )
    titles = [i.title for i in insights]
    assert any("Revenge" in t for t in titles)
    assert any("Calm" in t for t in titles)
    severities = {i.title: i.severity for i in insights}
    rev = next(i for i in insights if "Revenge" in i.title)
    calm = next(i for i in insights if "Calm" in i.title)
    assert rev.severity == "warning"
    assert calm.severity == "good"


def test_generate_strong_and_weak_playbook_insights():
    closed = (
        [_t(id=i, playbook_id=1, playbook_name="Momentum", pnl=100, r_multiple_actual=1.5) for i in range(1, 7)]
        + [_t(id=i, playbook_id=2, playbook_name="MeanRev", pnl=-100, r_multiple_actual=-1.0) for i in range(7, 13)]
    )
    insights = generate_insights(
        closed=closed,
        emotion_stats=[],
        playbook_stats=compute_playbook_breakdown(closed),
        plan_accuracy=None,
        process_stats=[],
        total_trade_count=12,
    )
    titles = [i.title for i in insights]
    assert any("Strong edge in Momentum" in t for t in titles)
    assert any("Weak edge in MeanRev" in t for t in titles)


def test_generate_sample_size_warning():
    closed = [_t(id=1, playbook_id=1, playbook_name="Tiny", pnl=100, r_multiple_actual=2.0)]
    insights = generate_insights(
        closed=closed,
        emotion_stats=[],
        playbook_stats=compute_playbook_breakdown(closed),
        plan_accuracy=None,
        process_stats=[],
        total_trade_count=1,
    )
    assert any("small sample" in i.title for i in insights)


def test_generate_plan_drift_insight():
    closed = [_t(id=i, r_plan=2.0, r_multiple_actual=1.0) for i in range(1, 6)]
    acc = compute_plan_accuracy(closed)
    insights = generate_insights(
        closed=closed,
        emotion_stats=[],
        playbook_stats=[],
        plan_accuracy=acc,
        process_stats=[],
        total_trade_count=5,
    )
    assert any("fell short of" in i.title for i in insights)
    assert any("Hit planned R" in i.title for i in insights)


def test_generate_process_grade_correlation_insight():
    closed = (
        [_t(id=i, process_grade=5, r_multiple_actual=2.5) for i in range(1, 5)]
        + [_t(id=i, process_grade=1, r_multiple_actual=-0.8) for i in range(5, 9)]
    )
    insights = generate_insights(
        closed=closed,
        emotion_stats=[],
        playbook_stats=[],
        plan_accuracy=None,
        process_stats=compute_process_grade_breakdown(closed),
        total_trade_count=8,
    )
    assert any("Process grade predicts" in i.title for i in insights)


def test_generate_tagging_gap_insight():
    closed = [_t(id=i, playbook_id=None) for i in range(1, 8)]
    insights = generate_insights(
        closed=closed,
        emotion_stats=[],
        playbook_stats=compute_playbook_breakdown(closed),
        plan_accuracy=None,
        process_stats=[],
        total_trade_count=7,
    )
    assert any("untagged" in i.title for i in insights)


def test_generate_empty_trades_returns_tagging_insight_when_none():
    closed: list = []
    insights = generate_insights(
        closed=closed,
        emotion_stats=[],
        playbook_stats=[],
        plan_accuracy=None,
        process_stats=[],
        total_trade_count=0,
    )
    assert insights == []


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


def _seed_trade(client, **kwargs):
    client.post("/cash/deposit", json={"amount": 100_000.0})
    base = {
        "symbol": "COMI",
        "market": "Stocks",
        "entry_price": 80.0,
        "position_size": 100.0,
        "entry_date": "2024-06-01T10:00:00",
        "fees": 0.0,
    }
    base.update(kwargs)
    r = client.post("/trades", json=base)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_endpoint_returns_full_payload(client):
    pid = client.post("/playbooks", json={"name": "P1"}).json()["id"]
    sid = client.post(f"/playbooks/{pid}/setups", json={"name": "S1"}).json()["id"]
    _seed_trade(client, exit_price=100.0, stop_loss=70.0, pre_trade_emotion="Calm", r_plan=2.0, process_grade=5,
                playbook_id=pid, playbook_setup_id=sid)
    r = client.get("/insights?account_id=1")
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["closed_count"] == 1
    assert body["summary"]["trade_count"] == 1
    assert len(body["emotions"]) == 1
    assert body["emotions"][0]["emotion"] == "Calm"
    assert len(body["playbooks"]) == 1
    assert body["playbooks"][0]["playbook_name"] == "P1"
    assert len(body["setups"]) == 1
    assert body["setups"][0]["setup_name"] == "S1"
    assert body["plan_accuracy"] is not None
    assert body["plan_accuracy"]["trade_count"] == 1
    assert len(body["process_grades"]) == 1
    assert body["process_grades"][0]["grade"] == 5
    assert isinstance(body["insights"], list)


def test_endpoint_empty_account(client):
    r = client.get("/insights?account_id=1")
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["trade_count"] == 0
    assert body["insights"] == []
    assert body["emotions"] == []
