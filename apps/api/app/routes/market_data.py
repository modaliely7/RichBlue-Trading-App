"""Market data router (Phase 6): EGX-only live quotes, history, and refresh.

The router is intentionally thin. All heavy lifting (HTTP calls, DB
writes, cache lookups) lives in :mod:`app.market_data.service`. The
endpoints are:

  GET    /market-data/egx-symbols?query=...    Symbol picker lookup
  GET    /market-data/quote/{symbol}           Single live or cached quote
  GET    /market-data/quotes?symbols=A,B,C      Bulk quotes
  GET    /market-data/history/{symbol}?days=N  Daily OHLCV from DB or yfinance
  GET    /market-data/status                   Market calendar + last refresh
  POST   /market-data/refresh                  Manual refresh of held symbols
  POST   /market-data/refresh-symbols          Re-seed the symbols catalog
  GET    /settings/market-data/schedule        EOD schedule rows
  PATCH  /settings/market-data/schedule/{id}   Update EOD hour/minute
  POST   /settings/market-data/refresh-now     Force a full refresh
"""
from __future__ import annotations

import logging
from datetime import datetime, UTC
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from sqlalchemy import select

from ..db import session_scope
from ..market_data.egx_stocks import get_canonical
from ..market_data.service import get_service
from ..models import EodSchedule, Symbol
from ..schemas import (
    EodScheduleRead,
    EodScheduleUpdate,
    MarketStatusRead,
    PriceHistoryRead,
    PricePointRead,
    QuoteRead,
    QuotesRead,
    RefreshResultRead,
    SymbolRead,
)


logger = logging.getLogger(__name__)
router = APIRouter()


def _symbol_to_read(row: Symbol) -> SymbolRead:
    return SymbolRead(
        id=row.id,
        canonical=row.canonical,
        name_en=row.name_en,
        name_ar=row.name_ar,
        sector=row.sector,
        exchange=row.exchange,
        currency=row.currency,
        country=row.country,
        is_active=row.is_active,
        last_loaded_at=row.last_loaded_at,
        last_price=row.last_price,
        last_price_at=row.last_price_at,
    )


def _quote_to_read(q) -> QuoteRead:
    return QuoteRead(
        symbol=q.symbol,
        price=q.price,
        currency=q.currency,
        provider=q.provider,
        fetched_at=q.fetched_at,
        previous_close=q.previous_close,
        day_high=q.day_high,
        day_low=q.day_low,
        day_change=q.day_change,
        day_change_pct=q.day_change_pct,
        year_high=q.year_high,
        year_low=q.year_low,
        volume=q.volume,
        market_state=q.market_state,
        is_market_open=get_service()._is_market_open(),
    )


# ── Symbols (picker) ──────────────────────────────────────────────────────


@router.get("/market-data/egx-symbols", response_model=list[SymbolRead])
def list_egx_symbols(
    query: str | None = Query(default=None, max_length=64),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[SymbolRead]:
    """Active EGX symbols filtered by ticker or name. Powers the SymbolPicker."""
    with session_scope() as s:
        svc = get_service()
        return [SymbolRead.model_validate(_row_to_payload(r)) for r in svc._search_symbols_in_session(s, query, limit)]


def _row_to_payload(row: Symbol) -> dict:
    return {
        "id": row.id,
        "canonical": row.canonical,
        "name_en": row.name_en,
        "name_ar": row.name_ar,
        "sector": row.sector,
        "exchange": row.exchange,
        "currency": row.currency,
        "country": row.country,
        "is_active": row.is_active,
        "last_loaded_at": row.last_loaded_at,
        "last_price": row.last_price,
        "last_price_at": row.last_price_at,
    }


# ── Quotes ────────────────────────────────────────────────────────────────


@router.get("/market-data/quote/{symbol}", response_model=QuoteRead)
def get_quote(symbol: str, use_cache: bool = Query(default=True)) -> QuoteRead:
    canon = get_canonical(symbol)
    if not canon:
        raise HTTPException(status_code=400, detail="symbol is required")
    svc = get_service()
    q = svc.get_quote(canon, use_cache=use_cache)
    if q is None:
        raise HTTPException(status_code=404, detail=f"No live data for {canon}")
    return _quote_to_read(q)


@router.get("/market-data/quotes", response_model=QuotesRead)
def get_quotes(
    symbols: Annotated[list[str], Query(description="Repeat ?symbols=A&symbols=B...")],
) -> QuotesRead:
    if not symbols:
        return QuotesRead(quotes=[])
    canon_list = [get_canonical(s) for s in symbols if (s or "").strip()]
    svc = get_service()
    quotes_map = svc.get_quotes(canon_list)
    return QuotesRead(quotes=[_quote_to_read(q) for q in quotes_map.values()])


# ── History ───────────────────────────────────────────────────────────────


@router.get("/market-data/history/{symbol}", response_model=PriceHistoryRead)
def get_history(symbol: str, days: int = Query(default=180, ge=1, le=730)) -> PriceHistoryRead:
    canon = get_canonical(symbol)
    if not canon:
        raise HTTPException(status_code=400, detail="symbol is required")
    svc = get_service()
    points = svc.get_history(canon, days=days)
    return PriceHistoryRead(
        symbol=canon,
        points=[PricePointRead(at=p.at, open=p.open, high=p.high, low=p.low, close=p.close, volume=p.volume) for p in points],
    )


# ── Status ────────────────────────────────────────────────────────────────


@router.get("/market-data/status", response_model=MarketStatusRead)
def market_status() -> MarketStatusRead:
    st = get_service().get_status()
    return MarketStatusRead(
        is_market_open=st.is_market_open,
        session_label=st.session_label,
        next_open_at=st.next_open_at,
        next_close_at=st.next_close_at,
        last_refresh_at=st.last_refresh_at,
        symbols_in_db=st.symbols_in_db,
        provider=st.provider,
        note=st.note,
    )


# ── Refresh ───────────────────────────────────────────────────────────────


def _run_refresh(canons: list[str] | None) -> None:
    try:
        get_service().refresh(canonicals=canons)
    except Exception as e:  # pragma: no cover - defensive
        logger.exception("Background refresh failed: %s", e)


@router.post("/market-data/refresh", response_model=RefreshResultRead)
def refresh_market_data(
    bg: BackgroundTasks,
    symbols: Annotated[list[str] | None, Query()] = None,
) -> RefreshResultRead:
    """Synchronous refresh of either every held symbol (no ``symbols``) or a subset.

    For very large refreshes the client should use ``/settings/market-data/refresh-now``
    which delegates to a background task.
    """
    svc = get_service()
    canon_list = [get_canonical(s) for s in (symbols or []) if (s or "").strip()] or None
    if canon_list and len(canon_list) > 30:
        bg.add_task(_run_refresh, canon_list)
        return RefreshResultRead(
            requested=canon_list,
            success=[],
            errors={},
            started_at=datetime.utcnow(),
            ok_count=0,
            fail_count=0,
        )
    result = svc.refresh(canonicals=canon_list)
    return RefreshResultRead(
        requested=result.requested,
        success=result.success,
        errors=result.errors,
        started_at=result.started_at,
        finished_at=result.finished_at,
        ok_count=result.ok_count,
        fail_count=result.fail_count,
    )


@router.post("/market-data/refresh-symbols")
def refresh_symbols_catalog(bg: BackgroundTasks) -> dict:
    """Re-seed the ``symbols`` table from the in-process EGX catalog."""
    svc = get_service()
    touched = svc.ensure_symbols_seeded()
    return {"touched": touched}


# ── EOD schedule (Settings > Market Data) ────────────────────────────────


@router.get("/settings/market-data/schedule", response_model=list[EodScheduleRead])
def get_eod_schedule() -> list[EodScheduleRead]:
    with session_scope() as s:
        rows = s.execute(select(EodSchedule).order_by(EodSchedule.id)).scalars().all()
        return [
            EodScheduleRead(
                id=r.id,
                market_code=r.market_code,
                market_name=r.market_name,
                eod_hour=r.eod_hour,
                eod_minute=r.eod_minute,
                timezone=r.timezone,
                is_active=r.is_active,
                updated_at=r.updated_at,
            )
            for r in rows
        ]


@router.patch("/settings/market-data/schedule/{schedule_id}", response_model=EodScheduleRead)
def patch_eod_schedule(schedule_id: int, body: EodScheduleUpdate) -> EodScheduleRead:
    with session_scope() as s:
        row = s.get(EodSchedule, schedule_id)
        if row is None:
            raise HTTPException(status_code=404, detail="schedule not found")
        if body.eod_hour is not None:
            row.eod_hour = body.eod_hour
        if body.eod_minute is not None:
            row.eod_minute = body.eod_minute
        if body.timezone is not None:
            row.timezone = body.timezone
        if body.is_active is not None:
            row.is_active = body.is_active
        row.updated_at = datetime.now(UTC)
        s.flush()
        out = EodScheduleRead(
            id=row.id,
            market_code=row.market_code,
            market_name=row.market_name,
            eod_hour=row.eod_hour,
            eod_minute=row.eod_minute,
            timezone=row.timezone,
            is_active=row.is_active,
            updated_at=row.updated_at,
        )

    try:
        from ..market_data.scheduler import get_scheduler

        get_scheduler().reschedule()
    except Exception as e:  # pragma: no cover - defensive
        logger.exception("Failed to reschedule market data jobs: %s", e)

    return out


@router.post("/settings/market-data/refresh-now", response_model=RefreshResultRead)
def refresh_now(bg: BackgroundTasks) -> RefreshResultRead:
    """Kick a background refresh of every EGX symbol the user holds."""
    svc = get_service()
    canon_list = svc._symbols_held_by_user()
    bg.add_task(_run_refresh, canon_list)
    return RefreshResultRead(
        requested=canon_list,
        success=[],
        errors={},
        started_at=datetime.now(UTC),
        ok_count=0,
        fail_count=0,
    )
