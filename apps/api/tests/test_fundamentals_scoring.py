from datetime import datetime

from sqlalchemy import select

from apps.api.app import data_providers
from apps.api.app import fundamentals as fundamentals_mod
from apps.api.app.fundamentals import refresh_fundamentals as _refresh_fundamentals
from apps.api.app.models import StockMetrics, Base
from apps.api.app.db import session_scope, engine


# Ensure DB tables exist for tests
Base.metadata.create_all(bind=engine)


def test_refresh_fundamentals_and_scoring(monkeypatch):
    payload = {
        "symbol": "TEST",
        "current_price": 100.0,
        "market_cap": 1_000_000_000,
        "eps": 5.0,
        "revenue": 500_000_000,
        "net_income": 50_000_000,
        "ebitda": 80_000_000,
        "total_debt": 50_000_000,
        "cash": 10_000_000,
        "shares_outstanding": 1_000_000,
        "shareholder_equity": 200_000_000,
        "revenue_history": [500000000, 450000000, 400000000],
        "eps_history": [4.0, 3.5, 3.0],
        "free_cash_flow": 40_000_000,
        "current_ratio": 1.8,
        "raw": {},
        "fetched_at": datetime.utcnow(),
    }

    # patch the function used inside the fundamentals module (it imports the function at module import time)
    monkeypatch.setattr(fundamentals_mod, "fetch_price_and_fundamentals_yfinance", lambda symbol: payload)
    monkeypatch.setattr(fundamentals_mod, "fetch_price_history_yfinance", lambda symbol, period="1y", interval="1d": [])

    with session_scope() as s:
        res = _refresh_fundamentals(s, "TEST")
        row = s.execute(select(StockMetrics).where(StockMetrics.symbol == "TEST").order_by(StockMetrics.fetched_at.desc())).scalars().first()
        assert row is not None
        assert row.fundamental_score is not None
        assert 0 <= row.fundamental_score <= 100
        assert row.pe_ratio is not None
        assert row.ev is not None