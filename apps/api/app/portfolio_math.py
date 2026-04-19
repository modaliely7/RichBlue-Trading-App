"""Portfolio-level definitions for `/overview` (single source of truth).

Definitions:

- **Free Cash** (cash balance): ledger cash available to trade (sum of all cash transactions through
    the as-of date).
- **Market Value of Open Positions**: sum of market prices × open quantity for all trades open on the
    as-of date (uses available price mapping).
- **Portfolio Value (Equity)**: Free Cash + Market Value of Open Positions.
- **Net Deposited**: total deposits − total withdrawals.
- **Realized PnL**: sum of closed trades' PnL on or before the as-of date.
- **Unrealized PnL**: market value of open positions − their cost basis (on the as-of date).
- **Total PnL**: Realized PnL + Unrealized PnL.

Notes:
- The canonical presentation of portfolio value for the UI is Free Cash + Market Value. This keeps the
    cash account and market exposure explicit and prevents cases where Free Cash appears greater than
    the reported portfolio equity.

Utilities in this module compute cash, net-deposits, realized/unrealized PnL and market-valuations
for open trades on calendar dates. Historical market-valuations require a price mapping for the
as-of date; when prices are unavailable the position may be skipped.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Sequence

from .analytics import calc_pnl
from .models import CashTransaction, CashTxType, Trade


def unrealized_pnl_cumulative_through(trades: Sequence[Trade], as_of_day: date, price_by_symbol: dict) -> float:
    """Estimate unrealized PnL for open positions on ``as_of_day`` using ``price_by_symbol``.

    price_by_symbol should be a mapping of UPPERCASE symbol -> current price (float).
    If a symbol price is missing the position is skipped.
    """
    total = 0.0
    for t in trades:
        if not trade_open_on_day(t, as_of_day):
            continue
        sym = (t.symbol or "").strip().upper()
        if not sym:
            continue
        px = price_by_symbol.get(sym)
        if px is None:
            # no market price available for this symbol — skip
            continue
        qty = float(t.position_size or 0.0)
        entry_cost = float((t.entry_price or 0.0) * qty)
        mv = float(px * qty)
        upnl = mv - entry_cost
        total += float(upnl)
    return float(total)


def portfolio_value_with_unrealized(trades: Sequence[Trade], txs: Sequence[CashTransaction], as_of_day: date, price_by_symbol: dict) -> float:
    """Return portfolio value including unrealized PnL (liquidation view).

    This uses `net_deposited_through` + `realized_pnl_cumulative_through` + unrealized PnL (from prices).
    """
    net_dep = net_deposited_through(txs, as_of_day)
    realized = realized_pnl_cumulative_through(trades, as_of_day)
    unreal = unrealized_pnl_cumulative_through(trades, as_of_day, price_by_symbol)
    return float(net_dep + realized + unreal)


def realized_pnl_cumulative_through(trades: Sequence[Trade], as_of_day: date) -> float:
    """Sum of closed-trade PnL for exits on or before ``as_of_day`` (calendar date).
    Robust to missing exit_date by falling back to entry_date.
    """
    total = 0.0
    for t in trades:
        if t.exit_price is None:
            continue
        pnl = calc_pnl(t)
        if pnl is None:
            continue
        dt = t.exit_date or t.entry_date
        xd = dt.date() if hasattr(dt, "date") else dt
        if xd <= as_of_day:
            total += float(pnl)
    return float(total)


def tx_calendar_day(tx_at: datetime | date) -> date:
    if hasattr(tx_at, "date"):
        return tx_at.date()  # type: ignore[union-attr]
    return tx_at  # type: ignore[return-value]


def ledger_balance_through(txs: Sequence[CashTransaction], as_of_day: date) -> float:
    total = 0.0
    for tx in txs:
        if tx_calendar_day(tx.at) <= as_of_day:
            total += float(tx.amount or 0.0)
    return float(total)


def net_deposited_through(txs: Sequence[CashTransaction], as_of_day: date) -> float:
    total = 0.0
    for tx in txs:
        if tx.tx_type not in {CashTxType.deposit, CashTxType.withdraw}:
            continue
        if tx_calendar_day(tx.at) <= as_of_day:
            total += float(tx.amount or 0.0)
    return float(total)


def trade_open_on_day(t: Trade, as_of_day: date) -> bool:
    ed = t.entry_date.date() if hasattr(t.entry_date, "date") else t.entry_date
    if ed > as_of_day:
        return False
    if t.exit_price is None:
        return True
    if t.exit_date is None:
        return False
    xd = t.exit_date.date() if hasattr(t.exit_date, "date") else t.exit_date
    return xd > as_of_day


def open_stocks_cost_basis_for_day(trades: Sequence[Trade], as_of_day: date) -> float:
    total = 0.0
    for t in trades:
        if not trade_open_on_day(t, as_of_day):
            continue
        qty = float(t.position_size or 0.0)
        total += float((t.entry_price or 0.0) * qty)
    return float(total)


def open_stocks_market_value_for_day(trades: Sequence[Trade], as_of_day: date, price_by_symbol: dict) -> float:
    """Compute market value for open trades on ``as_of_day`` using ``price_by_symbol``.

    price_by_symbol should map UPPERCASE symbol -> price (float). If a symbol price is missing the
    position is skipped.
    """
    total = 0.0
    for t in trades:
        if not trade_open_on_day(t, as_of_day):
            continue
        sym = (t.symbol or "").strip().upper()
        if not sym:
            continue
        px = price_by_symbol.get(sym)
        if px is None:
            # no market price available for this symbol — skip
            continue
        qty = float(t.position_size or 0.0)
        mv = float(px * qty)
        total += mv
    return float(total)


def total_return(portfolio_value: float, net_deposited: float) -> float:
    return float(portfolio_value - net_deposited)


def total_return_pct(total_return_value: float, net_deposited: float) -> float | None:
    if abs(net_deposited) <= 1e-9:
        return None
    return float(total_return_value / net_deposited * 100.0)
