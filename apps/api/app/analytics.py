from __future__ import annotations

from datetime import datetime

from .models import Trade, TradeType


def calc_pnl(trade: Trade) -> float | None:
    if trade.exit_price is None:
        return None
    direction = 1.0 if trade.trade_type == TradeType.long else -1.0
    gross = (trade.exit_price - trade.entry_price) * direction * trade.position_size
    entry_fees = float(trade.fees or 0.0)
    exit_fees = float(getattr(trade, "exit_fees", 0.0) or 0.0)
    return gross - entry_fees - exit_fees


def calc_return_pct(trade: Trade) -> float | None:
    """Return on capital deployed: PnL / (entry notional + entry fees)."""
    if trade.exit_price is None:
        return None
    pnl = calc_pnl(trade)
    if pnl is None:
        return None
    notional = abs(float(trade.entry_price or 0.0) * float(trade.position_size or 0.0)) + float(trade.fees or 0.0)
    if notional < 1e-12:
        return None
    return float(pnl / notional * 100.0)


def calc_risk_reward(trade: Trade) -> float | None:
    if trade.stop_loss is None or trade.take_profit is None:
        return None
    risk = abs(trade.entry_price - trade.stop_loss)
    reward = abs(trade.take_profit - trade.entry_price)
    if risk == 0:
        return None
    return reward / risk


def calc_duration_seconds(entry_date: datetime, exit_date: datetime | None) -> int | None:
    if exit_date is None:
        return None
    return max(0, int((exit_date - entry_date).total_seconds()))

