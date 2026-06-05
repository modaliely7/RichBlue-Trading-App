"""Market data orchestrator: cache, DB persistence, and status logic.

The service is the only module that touches the DB. Routes call
``MarketDataService`` methods; ``MarketDataService`` in turn calls the
yfinance provider and persists to the ``symbols`` and ``price_history``
tables. There is no direct API -> provider coupling.

The in-process TTL cache avoids re-hitting Yahoo for hot symbols. The DB
acts as the long-term store: ``Symbol.last_price`` / ``Symbol.last_price_at``
hold the most recent snapshot; ``PriceHistory`` holds daily OHLCV.
"""
from __future__ import annotations

import logging
from datetime import datetime, time, timedelta, timezone
from typing import Iterable
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from ..db import session_scope
from ..models import PriceHistory, Symbol
from .egx_stocks import EGX_STOCKS, get_canonical, get_yahoo_symbol
from .cache import TtlCache
from .models import MarketStatus, PricePoint, Quote, RefreshResult
from .providers.yahoo import YahooProvider


logger = logging.getLogger(__name__)


# ── Market calendar (Africa/Cairo; Egypt stayed on EET year-round after
#    the 2023 DST cancellation) ───────────────────────────────────────────
_CAIRO_TZ = ZoneInfo("Africa/Cairo")
_OPEN_TIME = time(hour=10, minute=0)
_CLOSE_TIME = time(hour=14, minute=35)
_EARLIEST_TICKER = "EGX"  # sentinel used by ``is_symbol_in_egx`` to short-circuit
_DEFAULT_TTL_SECONDS = 900       # 15 min during market hours
_OFF_HOURS_TTL_SECONDS = 86_400  # 24 h when market is closed


class MarketDataService:
    """Singleton-style orchestrator. One instance per process is enough."""

    def __init__(self) -> None:
        self._quote_cache: TtlCache[Quote] = TtlCache(default_ttl=_DEFAULT_TTL_SECONDS)
        self._provider = YahooProvider()

    # ── Symbol table management ────────────────────────────────────────

    def ensure_symbols_seeded(self) -> int:
        """Upsert every entry in :data:`EGX_STOCKS` into the ``symbols`` table.

        Returns the number of rows touched. Safe to call on every startup.
        Defensive against duplicate entries in the in-process catalog (the
        first occurrence wins; later duplicates are skipped).
        """
        seen: set[str] = set()
        unique_catalog: list[dict] = []
        for entry in EGX_STOCKS:
            if entry["canonical"] in seen:
                continue
            seen.add(entry["canonical"])
            unique_catalog.append(entry)
        with session_scope() as s:
            existing = {row.canonical: row for row in s.execute(select(Symbol)).scalars().all()}
            touched = 0
            for entry in unique_catalog:
                canon = entry["canonical"]
                existing_row = existing.get(canon)
                if existing_row is None:
                    s.add(
                        Symbol(
                            canonical=canon,
                            name_en=entry["name_en"],
                            name_ar=entry["name_ar"],
                            sector=entry["sector"],
                            exchange="EGX",
                            currency="EGP",
                            country="EG",
                            is_active=True,
                            last_loaded_at=datetime.utcnow(),
                        )
                    )
                    touched += 1
                else:
                    # Refresh names/sector in case the catalog was updated.
                    changed = False
                    if existing_row.name_en != entry["name_en"]:
                        existing_row.name_en = entry["name_en"]
                        changed = True
                    if existing_row.name_ar != entry["name_ar"]:
                        existing_row.name_ar = entry["name_ar"]
                        changed = True
                    if existing_row.sector != entry["sector"]:
                        existing_row.sector = entry["sector"]
                        changed = True
                    if not existing_row.is_active:
                        existing_row.is_active = True
                        changed = True
                    if changed:
                        existing_row.last_loaded_at = datetime.utcnow()
                        touched += 1
            if touched:
                logger.info("Seeded %d EGX symbols into symbols table", touched)
            return touched

    def search_symbols(self, query: str | None = None, limit: int = 50) -> list[Symbol]:
        """Return active EGX symbols filtered by ticker or name (substring, case-insensitive)."""
        with session_scope() as s:
            return self._search_symbols_in_session(s, query, limit)

    def _search_symbols_in_session(self, s, query: str | None, limit: int) -> list[Symbol]:
        """Same as :meth:`search_symbols` but reuses an existing session.

        Useful for routes that want to convert the rows to Pydantic models
        before the session closes.
        """
        q = (query or "").strip().upper()
        stmt = select(Symbol).where(Symbol.is_active == True)  # noqa: E712
        if q:
            pattern = f"%{q}%"
            from sqlalchemy import or_

            stmt = stmt.where(
                or_(
                    Symbol.canonical.ilike(pattern),
                    Symbol.name_en.ilike(pattern),
                    Symbol.name_ar.ilike(pattern),
                )
            )
        stmt = stmt.order_by(Symbol.canonical).limit(limit)
        return list(s.execute(stmt).scalars().all())

    def get_symbol(self, canonical: str) -> Symbol | None:
        canon = get_canonical(canonical)
        with session_scope() as s:
            return s.execute(select(Symbol).where(Symbol.canonical == canon)).scalar_one_or_none()

    def all_active_canonicals(self) -> list[str]:
        with session_scope() as s:
            return [r for (r,) in s.execute(select(Symbol.canonical).where(Symbol.is_active == True)).all()]

    # ── Quote / refresh ────────────────────────────────────────────────

    def get_quote(self, canonical: str, *, use_cache: bool = True) -> Quote | None:
        canon = get_canonical(canonical)
        if use_cache:
            cached = self._quote_cache.get(canon)
            if cached is not None:
                return cached
        q = self._provider.get_quote(canon)
        if q is not None:
            ttl = _DEFAULT_TTL_SECONDS if self._is_market_open() else _OFF_HOURS_TTL_SECONDS
            self._quote_cache.set(canon, q, ttl=ttl)
            self._persist_quote(q)
        return q

    def get_quotes(self, canonicals: Iterable[str], *, use_cache: bool = True) -> dict[str, Quote]:
        return {c: q for c, q in ((c, self.get_quote(c, use_cache=use_cache)) for c in canonicals) if q is not None}

    def refresh(self, canonicals: Iterable[str] | None = None) -> RefreshResult:
        """Refresh one, several, or every active EGX symbol.

        ``canonicals=None`` means "every symbol the user holds as an Asset
        with a known EGX ticker", which keeps refresh cycles small.
        """
        started = datetime.utcnow()
        if canonicals is None:
            target_list = self._symbols_held_by_user()
        else:
            target_list = [get_canonical(c) for c in canonicals if (c or "").strip()]
        success: list[str] = []
        errors: dict[str, str] = {}
        for c in target_list:
            try:
                q = self._provider.get_quote(c)
                if q is None:
                    errors[c] = "no_data"
                else:
                    self._quote_cache.set(c, q, ttl=_OFF_HOURS_TTL_SECONDS)
                    self._persist_quote(q)
                    success.append(c)
            except Exception as e:  # pragma: no cover - defensive
                errors[c] = str(e)[:200]
        return RefreshResult(
            requested=target_list,
            success=success,
            errors=errors,
            started_at=started,
            finished_at=datetime.utcnow(),
        )

    def get_history(self, canonical: str, days: int = 180) -> list[PricePoint]:
        canon = get_canonical(canonical)
        # Prefer DB rows when present and recent.
        with session_scope() as s:
            rows = (
                s.execute(
                    select(PriceHistory)
                    .where(PriceHistory.symbol == canon)
                    .order_by(PriceHistory.at.desc())
                    .limit(max(days, 30))
                )
                .scalars()
                .all()
            )
        if rows and (datetime.utcnow() - rows[0].at).days < 2:
            return [
                PricePoint(
                    at=r.at,
                    open=r.open,
                    high=r.high,
                    low=r.low,
                    close=r.close,
                    volume=r.volume or 0.0,
                )
                for r in reversed(rows)
            ]
        points = self._provider.get_history(canon, days=days)
        if points:
            self._persist_history(canon, points)
        return points

    # ── Status ─────────────────────────────────────────────────────────

    def get_status(self) -> MarketStatus:
        now_utc = datetime.now(timezone.utc)
        is_open = self._is_market_open()
        next_open = self._next_open(now_utc)
        next_close = self._next_close(now_utc) if is_open else None
        last_refresh = self._latest_symbol_refresh()
        with session_scope() as s:
            n = s.execute(select(Symbol.canonical).where(Symbol.is_active == True)).all()
            symbols_count = len(n)
        return MarketStatus(
            is_market_open=is_open,
            session_label="Open" if is_open else "Closed",
            next_open_at=next_open,
            next_close_at=next_close,
            last_refresh_at=last_refresh,
            symbols_in_db=symbols_count,
            provider="yahoo",
            note=None,
        )

    # ── Private helpers ────────────────────────────────────────────────

    def _is_market_open(self, now: datetime | None = None) -> bool:
        now_utc = now or datetime.now(timezone.utc)
        cairo = now_utc.astimezone(_CAIRO_TZ)
        weekday = cairo.weekday()  # Mon=0 .. Sun=6; EGX is closed Fri (4) & Sat (5)
        if weekday in (4, 5):
            return False
        local_time = cairo.time()
        return _OPEN_TIME <= local_time <= _CLOSE_TIME

    def _next_open(self, now_utc: datetime) -> datetime:
        cairo = now_utc.astimezone(_CAIRO_TZ)
        for delta_days in range(0, 8):
            d = (cairo + timedelta(days=delta_days))
            if d.weekday() in (4, 5):
                continue
            candidate = d.replace(hour=_OPEN_TIME.hour, minute=_OPEN_TIME.minute, second=0, microsecond=0)
            if candidate > cairo:
                return candidate.astimezone(timezone.utc).replace(tzinfo=None)
        return cairo.replace(hour=_OPEN_TIME.hour, minute=_OPEN_TIME.minute).astimezone(timezone.utc).replace(tzinfo=None)

    def _next_close(self, now_utc: datetime) -> datetime:
        cairo = now_utc.astimezone(_CAIRO_TZ)
        candidate = cairo.replace(hour=_CLOSE_TIME.hour, minute=_CLOSE_TIME.minute, second=0, microsecond=0)
        return candidate.astimezone(timezone.utc).replace(tzinfo=None)

    def _latest_symbol_refresh(self) -> datetime | None:
        with session_scope() as s:
            return s.execute(select(Symbol.last_price_at).where(Symbol.last_price_at.is_not(None)).order_by(Symbol.last_price_at.desc()).limit(1)).scalar_one_or_none()

    def _symbols_held_by_user(self) -> list[str]:
        from ..models import Asset

        with session_scope() as s:
            rows = s.execute(
                select(Asset.symbol)
                .where(Asset.symbol.is_not(None))
                .distinct()
            ).all()
        return [get_canonical(r[0]) for r in rows if (r[0] or "").strip()]

    def _persist_quote(self, q: Quote) -> None:
        from ..models import Asset

        with session_scope() as s:
            row = s.execute(select(Symbol).where(Symbol.canonical == q.symbol)).scalar_one_or_none()
            now = datetime.utcnow()
            if row is not None:
                row.last_price = q.price
                row.last_price_at = now
            s.execute(
                sqlite_insert(PriceHistory.__table__).values(
                    symbol=q.symbol,
                    provider=q.provider,
                    at=now,
                    open=q.price,
                    high=q.day_high or q.price,
                    low=q.day_low or q.price,
                    close=q.price,
                    volume=float(q.volume or 0),
                ).prefix_with("OR IGNORE")
            )
            for a in s.execute(select(Asset).where(Asset.symbol.ilike(q.symbol))).scalars().all():
                a.last_fetched_at = now
                if (a.current_price or 0.0) <= 0.0:
                    a.current_price = q.price

    def _persist_history(self, canonical: str, points: list[PricePoint]) -> None:
        with session_scope() as s:
            for p in points:
                s.execute(
                    sqlite_insert(PriceHistory.__table__).values(
                        symbol=canonical,
                        provider="yahoo",
                        at=p.at,
                        open=p.open,
                        high=p.high,
                        low=p.low,
                        close=p.close,
                        volume=p.volume,
                    ).prefix_with("OR IGNORE")
                )


_service: MarketDataService | None = None


def get_service() -> MarketDataService:
    global _service
    if _service is None:
        _service = MarketDataService()
    return _service
