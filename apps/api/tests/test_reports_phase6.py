"""Phase 6 reports (PDF + Excel) endpoint tests.

The five new reports share the same shape:
    1. Current Valuation
    2. Realized vs Unrealized
    3. Cost vs Market
    4. Tax
    5. Monthly Digest

Each one has a PDF and XLSX variant. We seed a few trades + a couple
of Asset rows + a PriceHistory row, then hit each endpoint and assert
the response is the right media type and contains expected values.
"""
from __future__ import annotations

import os
import tempfile
from datetime import datetime, UTC

import pandas as pd
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
            return Quote(
                symbol=canonical,
                price=110.0,
                currency="EGP",
                provider="yahoo:stub",
                fetched_at=datetime.now(UTC).replace(tzinfo=None),
                previous_close=100.0,
                day_change=10.0,
                day_change_pct=10.0,
                year_high=120.0,
                year_low=80.0,
            )

        def get_history(self, canonical, days=180):
            from app.market_data.models import PricePoint
            now = datetime.now(UTC).replace(tzinfo=None)
            return [PricePoint(at=now, open=99, high=111, low=98, close=110, volume=1000)]

    stub = StubProvider()
    test_svc = svc_mod.MarketDataService()
    test_svc._provider = stub
    monkeypatch.setattr(svc_mod, "_service", test_svc)
    monkeypatch.setattr(svc_mod, "get_service", lambda: test_svc)

    from app.main import app
    import app.models as models_mod
    models_mod.Base.metadata.create_all(bind=test_engine)

    from app.models import Account, Asset, AssetClass, PriceHistory, Strategy, Trade, Market

    with TestSession() as s:
        s.add(Account(id=1, name="Test"))
        s.add(Strategy(id=1, account_id=1, name="Breakout", color="#10b981"))
        s.add(Asset(id=1, account_id=1, symbol="COMI", asset_class=AssetClass.stocks,
                    quantity=100.0, avg_cost=80.0, current_price=0.0, last_fetched_at=datetime.now(UTC).replace(tzinfo=None)))
        s.add(Asset(id=2, account_id=1, symbol="HRHO", asset_class=AssetClass.stocks,
                    quantity=200.0, avg_cost=20.0, current_price=0.0, last_fetched_at=datetime.now(UTC).replace(tzinfo=None)))
        s.add(PriceHistory(symbol="HRHO", provider="yahoo:stub",
                           at=datetime.now(UTC).replace(tzinfo=None),
                           open=20, high=21, low=19, close=22, volume=1000))
        s.add(Trade(
            id=1, account_id=1, symbol="COMI", market=Market.stocks,
            entry_price=80.0, exit_price=None, position_size=100.0,
            entry_date=datetime(2024, 1, 10), exit_date=None,
            fees=5.0, exit_fees=0.0, screenshot_path=None, notes=None, lessons_learned=None,
        ))
        s.add(Trade(
            id=2, account_id=1, symbol="HRHO", market=Market.stocks,
            entry_price=20.0, exit_price=None, position_size=200.0,
            entry_date=datetime(2024, 1, 12), exit_date=None,
            fees=2.0, exit_fees=0.0, screenshot_path=None, notes=None, lessons_learned=None,
        ))
        s.add(Trade(
            id=3, account_id=1, symbol="EAST", market=Market.stocks,
            entry_price=10.0, exit_price=12.0, position_size=50.0,
            entry_date=datetime(2024, 1, 15), exit_date=datetime(2024, 2, 20),
            fees=2.0, exit_fees=2.0, screenshot_path=None, notes=None, lessons_learned=None,
        ))
        s.add(Trade(
            id=4, account_id=1, symbol="SWDY", market=Market.stocks,
            entry_price=20.0, exit_price=18.0, position_size=30.0,
            entry_date=datetime(2024, 3, 1), exit_date=datetime(2024, 3, 25),
            fees=1.0, exit_fees=1.0, screenshot_path=None, notes=None, lessons_learned=None,
        ))
        s.commit()

    with TestClient(app) as c:
        yield c

    try:
        os.unlink(tmp.name)
    except OSError:
        pass


def _assert_pdf(resp) -> None:
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    body = resp.content
    assert body.startswith(b"%PDF-")


def _assert_xlsx(resp) -> None:
    assert resp.status_code == 200, resp.text
    assert "spreadsheetml" in resp.headers["content-type"]
    import io
    df = pd.read_excel(io.BytesIO(resp.content), sheet_name=None)
    assert isinstance(df, dict) and df


def test_valuation_report(client):
    r = client.get("/reports/valuation.pdf?account_id=1")
    _assert_pdf(r)
    r = client.get("/reports/valuation.xlsx?account_id=1")
    _assert_xlsx(r)


def test_valuation_includes_open_positions(client):
    r = client.get("/reports/valuation.xlsx?account_id=1")
    assert r.status_code == 200
    import io
    sheets = pd.read_excel(io.BytesIO(r.content), sheet_name=None)
    holdings = sheets["Holdings"]
    syms = set(holdings["Symbol"].tolist())
    assert {"COMI", "HRHO"}.issubset(syms)
    row = holdings[holdings["Symbol"] == "HRHO"].iloc[0]
    assert float(row["Current Price"]) == 22.0
    assert float(row["Market Value"]) == pytest.approx(200.0 * 22.0)
    assert float(row["Unrealized P&L"]) == pytest.approx(200.0 * 22.0 - (20.0 * 200.0 + 2.0))


def test_realized_vs_unrealized(client):
    r = client.get("/reports/realized-unrealized.pdf?account_id=1")
    _assert_pdf(r)
    r = client.get("/reports/realized-unrealized.xlsx?account_id=1&start=2024-02-01&end=2024-02-28")
    _assert_xlsx(r)


def test_realized_vs_unrealized_period_filter(client):
    import io
    r = client.get("/reports/realized-unrealized.xlsx?account_id=1&start=2024-03-01&end=2024-03-31")
    assert r.status_code == 200
    sheets = pd.read_excel(io.BytesIO(r.content), sheet_name=None)
    df = sheets["Realized vs Unrealized"]
    realized = df[df["Type"] == "Realized"]
    assert len(realized) == 1
    assert realized.iloc[0]["Symbol"] == "SWDY"


def test_cost_vs_market(client):
    r = client.get("/reports/cost-vs-market.pdf?account_id=1")
    _assert_pdf(r)
    r = client.get("/reports/cost-vs-market.xlsx?account_id=1")
    _assert_xlsx(r)


def test_tax_report(client):
    r = client.get("/reports/tax.pdf?account_id=1")
    _assert_pdf(r)
    r = client.get("/reports/tax.xlsx?account_id=1&start=2024-01-01&end=2024-12-31")
    _assert_xlsx(r)
    import io
    sheets = pd.read_excel(io.BytesIO(r.content), sheet_name=None)
    assert "Closed Trades" in sheets
    assert "Monthly" in sheets
    assert len(sheets["Closed Trades"]) == 2


def test_monthly_digest(client):
    r = client.get("/reports/monthly-digest.pdf?account_id=1")
    _assert_pdf(r)
    r = client.get("/reports/monthly-digest.xlsx?account_id=1&start=2024-01-01&end=2024-12-31")
    _assert_xlsx(r)
    import io
    sheets = pd.read_excel(io.BytesIO(r.content), sheet_name=None)
    assert "Monthly Summary" in sheets
    months = set(sheets["Monthly Summary"]["Month"].tolist())
    assert months == {"2024-02", "2024-03"}


def test_reports_no_account_match(client):
    r = client.get("/reports/valuation.xlsx?account_id=999")
    assert r.status_code == 200
    import io
    sheets = pd.read_excel(io.BytesIO(r.content), sheet_name=None)
    df = sheets["Holdings"]
    assert "Message" in df.columns or len(df) == 0
