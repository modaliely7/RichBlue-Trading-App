"""Performance analytics router (the breakdown by month/day/hour/strategy/market)."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter
from sqlalchemy import select

from ..analytics import calc_advanced_metrics, calc_pnl
from ..db import session_scope
from ..models import Trade
from ..schemas import PerformanceAnalyticsResponse


router = APIRouter()


@router.get("/performance/analytics", response_model=PerformanceAnalyticsResponse)
def performance_analytics(account_id: int = 1, start: str | None = None, end: str | None = None):
    """Advanced performance breakdowns from closed trades (uses exit_date when available)."""
    with session_scope() as s:
        trades = s.execute(select(Trade).where(Trade.account_id == account_id)).scalars().all()
        closed = [t for t in trades if t.exit_price is not None and calc_pnl(t) is not None]

        def trade_dt(t: Trade) -> datetime:
            return t.exit_date or t.entry_date

        def parse_iso(x: str | None) -> datetime | None:
            if not x:
                return None
            try:
                dt = datetime.fromisoformat(x.replace("Z", "+00:00"))
                return dt.replace(tzinfo=None)
            except Exception:
                return None

        start_dt = parse_iso(start)
        end_dt = parse_iso(end)
        if start_dt:
            closed = [t for t in closed if trade_dt(t) >= start_dt]
        if end_dt:
            closed = [t for t in closed if trade_dt(t) <= end_dt]

        def summarize_pnls(pnls: list[float]) -> dict:
            if not pnls:
                return {"count": 0, "total": 0.0, "avg": 0.0, "win_rate": 0.0}
            wins = sum(1 for p in pnls if p > 0)
            return {
                "count": len(pnls),
                "total": float(sum(pnls)),
                "avg": float(sum(pnls) / len(pnls)),
                "win_rate": float(wins / len(pnls) * 100.0),
            }

        def group(key_fn, multi=False):
            buckets: dict[str, list[float]] = {}
            for t in closed:
                keys = key_fn(t)
                if not multi:
                    keys = [keys]
                for k in keys:
                    buckets.setdefault(k, []).append(calc_pnl(t) or 0.0)
            rows = []
            for k, pnls in buckets.items():
                s2 = summarize_pnls(pnls)
                rows.append({"key": k, **s2})
            rows.sort(key=lambda r: (r["avg"], r["count"]), reverse=True)
            return rows

        by_month = group(lambda t: trade_dt(t).strftime("%Y-%m"))
        by_month.sort(key=lambda r: r["key"])

        by_dow = group(lambda t: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][trade_dt(t).weekday()])
        by_hour = group(lambda t: f"{trade_dt(t).hour:02d}:00")

        by_strategy = group(
            lambda t: [s.name for s in t.strategies] if t.strategies else ["Unspecified"],
            multi=True,
        )

        by_market = group(lambda t: t.market.value)

        best_hour = next((r for r in by_hour if r["count"] >= 3), None)
        worst_hour = next((r for r in reversed(by_hour) if r["count"] >= 3), None) if by_hour else None

        overall = summarize_pnls([calc_pnl(t) or 0.0 for t in closed])
        advanced = calc_advanced_metrics(closed)

        res = {
            "overall": overall,
            "closed_trades": len(closed),
            "by_month": by_month,
            "by_day_of_week": by_dow,
            "by_hour": by_hour,
            "by_strategy": by_strategy,
            "by_market": by_market,
            "advanced": advanced,
            "best_strategy": None,
            "worst_strategy": None,
            "best_day": None,
            "worst_day": None,
            "best_hour": best_hour,
            "worst_hour": worst_hour,
        }

        if by_strategy:
            res["best_strategy"] = by_strategy[0]
            res["worst_strategy"] = by_strategy[-1]
        if by_dow:
            res["best_day"] = sorted(by_dow, key=lambda r: r["total"], reverse=True)[0]
            res["worst_day"] = sorted(by_dow, key=lambda r: r["total"])[0]
        if by_hour:
            res["best_hour"] = sorted(by_hour, key=lambda r: r["total"], reverse=True)[0]
            res["worst_hour"] = sorted(by_hour, key=lambda r: r["total"])[0]

        return res
