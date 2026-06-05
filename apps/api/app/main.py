"""FastAPI application entry point.

This module is intentionally thin: it wires up the lifespan handler, middleware,
static file mount, and includes all the route modules from ``app.routes``.

Each route module owns a logical group of endpoints (accounts, trades, cash,
portfolio, etc.). See ``app/routes/`` for the full list.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .models import Base
from .routes import (
    analytics,
    assets,
    cash,
    health_accounts,
    lessons,
    overview,
    portfolio,
    psychology,
    reports,
    settings,
    strategies,
    symbols,
    trades,
)


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from .db import engine as _engine
    Base.metadata.create_all(bind=_engine)
    obsolete_tables = [
        "stock_raw_data",
        "stock_metrics",
        "smart_money_signals",
        "technical_metrics",
        "quantitative_metrics",
        "stock_scores",
        "symbol_mappings",
    ]
    try:
        from sqlalchemy import inspect, text
        insp = inspect(_engine)
        existing = set(insp.get_table_names())
        with _engine.begin() as conn:
            for tbl in obsolete_tables:
                if tbl in existing:
                    conn.execute(text(f"DROP TABLE IF EXISTS {tbl}"))
                    logger.info("Dropped obsolete table: %s", tbl)
    except Exception as e:
        logger.debug("Table cleanup skipped: %s", e)
    yield


app = FastAPI(title="Trading Journal API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

_API_DATA_BASE = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data")))
_API_DATA_BASE.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_API_DATA_BASE)), name="static")

# Include all routers. Order does not matter for the API; the path on each
# @router.* decorator is what determines the URL.
app.include_router(health_accounts.router)
app.include_router(strategies.router)
app.include_router(assets.router)
app.include_router(symbols.router)
app.include_router(trades.router)
app.include_router(cash.router)
app.include_router(portfolio.router)
app.include_router(overview.router)
app.include_router(psychology.router)
app.include_router(lessons.router)
app.include_router(analytics.router)
app.include_router(reports.router)
app.include_router(settings.router)
