"""Pydantic-style dataclasses and typed dicts for the market_data layer.

These are deliberately simple dataclasses (not full Pydantic models) so
the cache and service can construct them cheaply inside a single Python
process. The HTTP-facing Pydantic models live in ``app.schemas`` and
mirror these fields.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(slots=True)
class Quote:
    """A single real-time (or last-cached) quote for one EGX symbol."""

    symbol: str
    price: float
    currency: str = "EGP"
    provider: str = "yahoo"
    fetched_at: datetime = field(default_factory=lambda: datetime.utcnow())
    previous_close: float | None = None
    day_high: float | None = None
    day_low: float | None = None
    day_change: float | None = None
    day_change_pct: float | None = None
    year_high: float | None = None
    year_low: float | None = None
    volume: int | None = None
    market_state: str | None = None  # "REGULAR" | "CLOSED" | "PRE" | "POST"


@dataclass(slots=True)
class PricePoint:
    """A single OHLCV point in a price history series."""

    at: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


@dataclass(slots=True)
class RefreshResult:
    """Outcome of a batch refresh job."""

    requested: list[str]
    success: list[str]
    errors: dict[str, str]
    started_at: datetime
    finished_at: datetime | None = None

    @property
    def ok_count(self) -> int:
        return len(self.success)

    @property
    def fail_count(self) -> int:
        return len(self.errors)


@dataclass(slots=True)
class MarketStatus:
    """Snapshot of the EGX market state for the UI banner."""

    is_market_open: bool
    session_label: str  # "Open" | "Closed" | "Pre-market" | "Post-market"
    next_open_at: datetime | None
    next_close_at: datetime | None
    last_refresh_at: datetime | None
    symbols_in_db: int
    provider: str = "yahoo"
    note: str | None = None
