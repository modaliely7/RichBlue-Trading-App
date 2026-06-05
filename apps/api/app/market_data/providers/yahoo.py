"""Yahoo Finance provider for EGX-listed stocks.

EGX prices on Yahoo Finance are served with the ``.CA`` suffix (the suffix
normally denotes Canada but is reused for the Cairo listing in Yahoo's
internal symbol table). This was verified by direct yfinance calls
against COMI.CA returning real OHLCV data for CIB (Commercial
International Bank, the most-traded EGX stock).

The provider exposes two calls:

  * ``get_quote(canonical)`` — last price + day change + 52w range. Uses
    ``yf.Ticker.fast_info`` which is cheap and cached server-side by Yahoo.
  * ``get_history(canonical, days)`` — OHLCV history. Uses
    ``yf.Ticker.history(period=...)`` and returns a list of PricePoint.

All calls are blocking and may take 0.5-2s each. Callers should run them
in a thread (``asyncio.to_thread`` or ``run_in_threadpool``).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Iterable

from ..egx_stocks import get_canonical, get_yahoo_symbol
from ..models import PricePoint, Quote


logger = logging.getLogger(__name__)


class YahooProvider:
    """Thin wrapper around yfinance scoped to EGX tickers."""

    def __init__(self) -> None:
        self._yf = None

    def _import(self) -> None:
        if self._yf is None:
            import yfinance as yf
            self._yf = yf

    def get_quote(self, canonical: str) -> Quote | None:
        self._import()
        yf = self._yf
        if yf is None:
            return None
        canon = get_canonical(canonical)
        yahoo_sym = get_yahoo_symbol(canon)
        try:
            t = yf.Ticker(yahoo_sym)
            fi = t.fast_info
            price = fi.get("lastPrice") or fi.get("previousClose")
            if price is None or price <= 0:
                logger.debug("Yahoo %s: no price in fast_info", yahoo_sym)
                return None
            prev = fi.get("previousClose") or fi.get("regularMarketPreviousClose")
            change = None
            change_pct = None
            if prev and prev > 0 and price != prev:
                change = float(price) - float(prev)
                change_pct = change / float(prev) * 100.0
            return Quote(
                symbol=canon,
                price=float(price),
                currency=fi.get("currency") or "EGP",
                provider=f"yahoo:{yahoo_sym}",
                fetched_at=datetime.now(timezone.utc),
                previous_close=float(prev) if prev else None,
                day_high=fi.get("dayHigh"),
                day_low=fi.get("dayLow"),
                day_change=change,
                day_change_pct=change_pct,
                year_high=fi.get("yearHigh"),
                year_low=fi.get("yearLow"),
                volume=fi.get("lastVolume"),
                market_state=fi.get("quoteType"),
            )
        except Exception as e:
            logger.debug("Yahoo quote failed for %s: %s", yahoo_sym, e)
            return None

    def get_history(self, canonical: str, days: int = 180) -> list[PricePoint]:
        self._import()
        yf = self._yf
        if yf is None:
            return []
        canon = get_canonical(canonical)
        yahoo_sym = get_yahoo_symbol(canon)
        period = "1y" if days > 180 else "6mo" if days > 90 else "3mo" if days > 30 else "1mo"
        try:
            hist = yf.Ticker(yahoo_sym).history(period=period, auto_adjust=False)
            if hist is None or hist.empty:
                return []
            out: list[PricePoint] = []
            for idx, row in hist.iterrows():
                try:
                    at = idx.to_pydatetime()
                    if at.tzinfo is None:
                        at = at.replace(tzinfo=timezone.utc)
                    out.append(
                        PricePoint(
                            at=at.astimezone(timezone.utc).replace(tzinfo=None),
                            open=float(row.get("Open") or 0.0),
                            high=float(row.get("High") or 0.0),
                            low=float(row.get("Low") or 0.0),
                            close=float(row.get("Close") or 0.0),
                            volume=float(row.get("Volume") or 0.0),
                        )
                    )
                except Exception as e:
                    logger.debug("Yahoo history row skip %s: %s", canon, e)
            return out
        except Exception as e:
            logger.debug("Yahoo history failed for %s: %s", yahoo_sym, e)
            return []

    def get_history_raw(self, canonical: str, days: int = 180) -> list[PricePoint]:
        """Same as get_history but kept separate so we can swap implementations later."""
        return self.get_history(canonical, days)


def get_egx_quotes_yahoo(canonicals: Iterable[str]) -> dict[str, Quote]:
    """Bulk fetch helper. Sequential (yfinance is not thread-safe per-symbol)."""
    prov = YahooProvider()
    out: dict[str, Quote] = {}
    for c in canonicals:
        q = prov.get_quote(c)
        if q is not None:
            out[c] = q
    return out
