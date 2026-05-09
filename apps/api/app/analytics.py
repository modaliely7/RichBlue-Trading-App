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


def calc_advanced_metrics(trades: list[Trade]) -> dict:
    closed = [t for t in trades if t.exit_price is not None]
    if not closed:
        return {}

    pnls = [calc_pnl(t) or 0.0 for t in closed]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]

    win_count = len(wins)
    loss_count = len(losses)
    total_count = len(closed)

    win_rate = (win_count / total_count) * 100 if total_count > 0 else 0
    avg_win = sum(wins) / win_count if win_count > 0 else 0
    max_win = max(wins) if wins else 0
    avg_loss = abs(sum(losses) / loss_count) if loss_count > 0 else 0
    max_loss = abs(min(losses)) if losses else 0

    gross_win = sum(wins)
    gross_loss = abs(sum(losses))
    profit_factor = gross_win / gross_loss if gross_loss > 0 else (Infinity if gross_win > 0 else 0)

    # Risk Reward
    rrs = [calc_risk_reward(t) for t in closed if calc_risk_reward(t) is not None]
    avg_rr = sum(rrs) / len(rrs) if rrs else 0
    max_rr = max(rrs) if rrs else 0

    return {
        "win_rate": win_rate,
        "avg_win_amount": avg_win,
        "max_win_amount": max_win,
        "avg_loss_amount": avg_loss,
        "max_loss_amount": max_loss,
        "avg_risk_reward": avg_rr,
        "max_risk_reward": max_rr,
        "profit_factor": profit_factor,
        "gross_win": gross_win,
        "gross_loss": gross_loss,
        "closed_count": total_count,
        "win_count": win_count,
        "loss_count": loss_count,
    }


Infinity = float('inf')

