"""Overview (KPIs + daily series) and insights router."""
from __future__ import annotations

import bisect
from datetime import date, datetime, timedelta, UTC

from fastapi import APIRouter
from sqlalchemy import select

from ..analytics import calc_pnl
from ..db import session_scope
from ..models import (
    Asset,
    AssetClass,
    CashTransaction,
    CashTxType,
    Market,
    PriceHistory,
    PsychologyEntry,
    PsychologyState,
    Trade,
)
from ..portfolio_math import (
    ledger_balance_through,
    net_deposited_through,
    realized_pnl_cumulative_through,
    total_return_pct as portfolio_total_return_pct,
    trade_open_on_day,
    unrealized_pnl_cumulative_through,
)
from ..schemas import OverviewResponse
from ..utils import (
    _compute_holdings,
    _funds_cost_from_assets,
    to_trade_read,
    tx_at_date,
)


router = APIRouter()


@router.get("/overview", response_model=OverviewResponse)
def overview(account_id: int = 1, method: str = "realized") -> OverviewResponse:
    with session_scope() as s:
        trades = s.execute(
            select(Trade).where(Trade.account_id == account_id).order_by(Trade.entry_date.asc())
        ).scalars().all()
        holdings = _compute_holdings(s, account_id, trades=trades)
        txs = s.execute(
            select(CashTransaction)
            .where(CashTransaction.account_id == account_id)
            .order_by(CashTransaction.at.asc())
        ).scalars().all()
        end_day = datetime.now(UTC).date()

        assets_for_prices = s.execute(select(Asset).where(Asset.account_id == account_id)).scalars().all()
        price_by_symbol = {
            a.symbol.upper(): float(a.current_price or 0.0)
            for a in assets_for_prices
            if (a.symbol or "").strip()
        }
        asset_symbols = {a.symbol.upper() for a in assets_for_prices if a.asset_class == AssetClass.etfs}

        funds_assets = [a for a in assets_for_prices if a.asset_class == AssetClass.etfs]
        fund_allocation = {
            a.symbol.upper(): float((a.quantity or 0.0) * (a.avg_cost or 0.0)) for a in funds_assets
        }

        stocks_cost = 0.0
        funds_from_trades_cost = 0.0
        for t in trades:
            if not trade_open_on_day(t, end_day):
                continue
            qty = float(t.position_size or 0.0)
            cost = float((t.entry_price or 0.0) * qty) + float(t.fees or 0.0)

            if t.market == Market.funds:
                sym = (t.symbol or "").upper()
                if sym not in asset_symbols:
                    funds_from_trades_cost += cost
                    fund_allocation[sym] = fund_allocation.get(sym, 0.0) + cost
            else:
                stocks_cost += cost

        funds_cost = _funds_cost_from_assets(s, account_id) + funds_from_trades_cost
        assets_mv = float(stocks_cost + funds_cost)

        stocks_mv_current = float(sum(float(h.market_value or 0.0) for h in holdings))
        funds_mv_current = float(
            sum(float(a.current_price or 0.0) * float(a.quantity or 0.0) for a in funds_assets)
        )

        realized_total = realized_pnl_cumulative_through(trades, txs, end_day)
        unreal_total = unrealized_pnl_cumulative_through(trades, end_day, price_by_symbol)
        open_positions_count = int(
            sum(1 for h in holdings if (h.open_quantity or 0.0) != 0.0)
        )

        cash_now = ledger_balance_through(txs, end_day)
        net_deposited_now = net_deposited_through(txs, end_day)

        if method == "realized":
            portfolio_value_now = float(net_deposited_now + realized_total)
            total_return_value_now = float(realized_total)
        else:
            portfolio_value_now = float(cash_now + stocks_mv_current + funds_mv_current)
            total_return_value_now = float(realized_total + unreal_total)

        total_return_pct_now = portfolio_total_return_pct(total_return_value_now, net_deposited_now)

        # Daily price history cache for the chart series
        all_symbols = list(
            set((t.symbol or "").strip().upper() for t in trades if t.symbol)
        )
        price_history_cache: dict[str, list[tuple[str, float]]] = {}
        if all_symbols:
            hist_rows = s.execute(
                select(PriceHistory)
                .where(PriceHistory.symbol.in_(all_symbols))
                .order_by(PriceHistory.symbol.asc(), PriceHistory.at.asc())
            ).scalars().all()
            for r in hist_rows:
                sym = r.symbol.upper()
                ds = (r.at.date() if hasattr(r.at, "date") else r.at).strftime("%Y-%m-%d")
                price_history_cache.setdefault(sym, []).append((ds, float(r.close)))

        labels: list[str] = []
        portfolio_value_series: list[float] = []
        net_dep_series: list[float] = []
        total_return_series: list[float] = []
        equity_value_series: list[float] = []
        total_pnl_series: list[float] = []

        start_candidates: list[date] = []
        if txs:
            start_candidates.append(min((tx_at_date(tx.at)) for tx in txs))
        if trades:
            start_candidates.append(tx_at_date(trades[0].entry_date))

        if start_candidates:
            start_day = min(start_candidates)
            if start_day > end_day:
                start_day = end_day

            events_by_date: dict[date, list[tuple[str, object]]] = {}
            for tx in txs:
                d = tx_at_date(tx.at)
                events_by_date.setdefault(d, []).append(("tx", tx))
            for t in trades:
                ed = tx_at_date(t.entry_date)
                events_by_date.setdefault(ed, []).append(("entry", t))
                if t.exit_date:
                    xd = tx_at_date(t.exit_date)
                    events_by_date.setdefault(xd, []).append(("exit", t))

            def get_price_on_day(sym: str, d: date) -> float | None:
                sym = sym.upper()
                if sym not in price_history_cache:
                    return price_by_symbol.get(sym)
                prices = price_history_cache[sym]
                ds = d.strftime("%Y-%m-%d")
                idx = bisect.bisect_right(prices, (ds, float('inf'))) - 1
                if idx >= 0:
                    return prices[idx][1]
                return price_by_symbol.get(sym)

            running_cash = 0.0
            running_net_dep = 0.0
            running_realized_pnl = 0.0
            open_pos_tracker: dict[str, dict[str, float]] = {}

            cur = start_day
            while cur <= end_day:
                if cur in events_by_date:
                    for etype, ev in events_by_date[cur]:
                        if etype == "tx":
                            running_cash += float(ev.amount or 0.0)
                            if ev.tx_type in {CashTxType.deposit, CashTxType.withdraw}:
                                running_net_dep += float(ev.amount or 0.0)
                            if ev.tx_type in {CashTxType.dividend, CashTxType.adjustment}:
                                running_realized_pnl += float(ev.amount or 0.0)
                        elif etype == "entry":
                            sym = (ev.symbol or "").strip().upper()
                            qty = float(ev.position_size or 0.0)
                            cost = float((ev.entry_price or 0.0) * qty) + float(ev.fees or 0.0)
                            p = open_pos_tracker.setdefault(sym, {"qty": 0.0, "cost": 0.0})
                            p["qty"] += qty
                            p["cost"] += cost
                        elif etype == "exit":
                            sym = (ev.symbol or "").strip().upper()
                            qty = float(ev.position_size or 0.0)
                            pnl = calc_pnl(ev) or 0.0
                            running_realized_pnl += float(pnl)
                            if sym in open_pos_tracker:
                                p = open_pos_tracker[sym]
                                p["qty"] -= qty
                                entry_cost_exited = float((ev.entry_price or 0.0) * qty) + float(ev.fees or 0.0)
                                p["cost"] -= entry_cost_exited
                                if p["qty"] <= 1e-9:
                                    del open_pos_tracker[sym]

                if cur.weekday() < 5:
                    day_str = cur.strftime("%Y-%m-%d")
                    day_open_mv = 0.0
                    day_open_cost = 0.0
                    for sym, p in open_pos_tracker.items():
                        px = get_price_on_day(sym, cur)
                        if px is not None:
                            day_open_mv += float(px * p["qty"])
                        else:
                            day_open_mv += p["cost"]
                        day_open_cost += p["cost"]
                    day_unrealized = day_open_mv - day_open_cost

                    labels.append(day_str)
                    net_dep_series.append(running_net_dep)
                    total_return_series.append(running_realized_pnl)
                    portfolio_value_series.append(running_net_dep + running_realized_pnl)
                    equity_value_series.append(running_cash + day_open_mv + (funds_mv_current or 0.0))
                    total_pnl_series.append(running_realized_pnl + day_unrealized)

                cur += timedelta(days=1)
        else:
            labels = [datetime.now(UTC).strftime("%Y-%m-%d")]
            portfolio_value_series = [net_deposited_now + realized_total]
            net_dep_series = [net_deposited_now]
            total_return_series = [realized_total]
            equity_value_series = [portfolio_value_now]
            total_pnl_series = [total_return_value_now]

        # Earnings allocation
        earnings_stocks = 0.0
        earnings_funds = 0.0
        for t in trades:
            if t.exit_price is None:
                continue
            pnl_val = calc_pnl(t)
            if pnl_val is None:
                continue
            if t.market == Market.funds:
                earnings_funds += float(pnl_val)
            else:
                earnings_stocks += float(pnl_val)

        if method == "liquidation":
            for t in trades:
                if t.exit_price is not None:
                    continue
                sym = (t.symbol or "").strip().upper()
                px = price_by_symbol.get(sym)
                if px is None:
                    continue
                qty = float(t.position_size or 0.0)
                cost = float((t.entry_price or 0.0) * qty) + float(t.fees or 0.0)
                upnl = float(px * qty) - cost
                if t.market == Market.funds:
                    earnings_funds += upnl
                else:
                    earnings_stocks += upnl

        earnings_allocation: dict[str, float] = {}
        if abs(earnings_stocks) > 1e-9:
            earnings_allocation["Stocks"] = earnings_stocks
        if abs(earnings_funds) > 1e-9:
            earnings_allocation["Funds"] = earnings_funds

        div_total = sum(float(tx.amount or 0.0) for tx in txs if tx.tx_type == CashTxType.dividend)
        if abs(div_total) > 1e-9:
            earnings_allocation["Dividends"] = earnings_allocation.get("Dividends", 0.0) + div_total

        allocation_dict: dict[str, float] = {"Cash": cash_now, "Stocks": stocks_cost, "Funds": funds_cost}

        res = OverviewResponse(
            kpis={
                "as_of": datetime.now(UTC),
                "cash_balance": cash_now,
                "assets_market_value": assets_mv,
                "portfolio_value": portfolio_value_now,
                "net_deposited": net_deposited_now,
                "total_return_value": total_return_value_now,
                "total_return_pct": total_return_pct_now,
                "realized_pnl_total": realized_total,
                "open_positions": open_positions_count,
                "open_symbols": open_positions_count,
            },
            allocation=allocation_dict,
            fund_allocation=fund_allocation,
            earnings_allocation=earnings_allocation if earnings_allocation else None,
            holdings=holdings,
            trades=[to_trade_read(t) for t in trades],
            chart={
                "labels": labels,
                "portfolio_value": portfolio_value_series,
                "net_deposited": net_dep_series,
                "total_return_value": total_return_series,
                "portfolio_value_liquidation": equity_value_series,
                "total_pnl": total_pnl_series,
            },
        )

        return res


@router.get("/insights")
def insights(account_id: int = 1) -> dict:
    """Lightweight, deterministic "AI coach" insights based on your data.

    Returns: list of insight cards + supporting aggregates.
    """
    with session_scope() as s:
        trades = s.execute(select(Trade).where(Trade.account_id == account_id)).scalars().all()
        closed = [t for t in trades if t.exit_price is not None and calc_pnl(t) is not None]

        def pct(n: float) -> float:
            return round(n * 100.0, 2)

        insights_list: list[dict] = []

        if not closed:
            return {
                "insights": [
                    {
                        "title": "Add closed trades to unlock insights",
                        "severity": "info",
                        "detail": "Insights are computed from closed-trade PnL. Log exits to get strategy/time analytics.",
                    }
                ]
            }

        # Strategy performance
        by_strategy: dict[str, list[float]] = {}
        for t in closed:
            names = [s.name for s in (t.strategies or [])]
            key = ", ".join(names) if names else "Unspecified"
            by_strategy.setdefault(key, []).append(calc_pnl(t) or 0.0)
        strat_rows = []
        for k, pnls in by_strategy.items():
            count = len(pnls)
            wins = sum(1 for p in pnls if p > 0)
            strat_rows.append((k, count, sum(pnls) / count, wins / count))
        strat_rows.sort(key=lambda x: (x[2], x[1]), reverse=True)
        best = next((r for r in strat_rows if r[1] >= 3), None)
        worst = next((r for r in reversed(strat_rows) if r[1] >= 3), None)
        if best:
            insights_list.append(
                {
                    "title": f"Best strategy: {best[0]}",
                    "severity": "good",
                    "detail": f"{best[1]} trades • Avg PnL {best[2]:.2f} • Win rate {pct(best[3])}%.",
                }
            )
        if worst and worst[0] != (best[0] if best else None):
            insights_list.append(
                {
                    "title": f"Worst strategy: {worst[0]}",
                    "severity": "warning",
                    "detail": f"{worst[1]} trades • Avg PnL {worst[2]:.2f} • Win rate {pct(worst[3])}%. Consider refining filters or avoiding low-quality setups.",
                }
            )

        # Losses by hour
        losses_by_hour: dict[int, float] = {}
        for t in closed:
            dt = t.exit_date or t.entry_date
            hour = dt.hour
            pnl = calc_pnl(t) or 0.0
            losses_by_hour[hour] = losses_by_hour.get(hour, 0.0) + pnl
        worst_hour = min(losses_by_hour.items(), key=lambda x: x[1])
        if worst_hour[1] < 0:
            insights_list.append(
                {
                    "title": f"Most losses happen around hour {worst_hour[0]:02d}:00",
                    "severity": "warning",
                    "detail": f"Net PnL at that hour: {worst_hour[1]:.2f}. Try stricter rules or reduce size during that window.",
                }
            )

        # Market performance
        by_market: dict[str, list[float]] = {}
        for t in closed:
            by_market.setdefault(t.market.value, []).append(calc_pnl(t) or 0.0)
        market_rows = []
        for k, pnls in by_market.items():
            count = len(pnls)
            wins = sum(1 for p in pnls if p > 0)
            market_rows.append((k, count, sum(pnls) / count, wins / count))
        market_rows.sort(key=lambda x: (x[2], x[1]), reverse=True)
        best_m = next((r for r in market_rows if r[1] >= 3), None)
        if best_m:
            insights_list.append(
                {
                    "title": f"Best market for you: {best_m[0]}",
                    "severity": "info",
                    "detail": f"{best_m[1]} trades • Avg PnL {best_m[2]:.2f} • Win rate {pct(best_m[3])}%.",
                }
            )

        # Psychology
        entries = s.execute(
            select(PsychologyEntry).where(PsychologyEntry.account_id == account_id)
        ).scalars().all()
        if entries:
            trade_ids = {e.trade_id for e in entries if e.trade_id is not None}
            trades_by_id = {}
            if trade_ids:
                trows = s.execute(
                    select(Trade).where(Trade.id.in_(trade_ids), Trade.account_id == account_id)
                ).scalars().all()
                trades_by_id = {t.id: t for t in trows}
            best_state = None
            best_avg = None
            for st in PsychologyState:
                pnls = []
                for e in entries:
                    if e.state != st or e.trade_id is None:
                        continue
                    t = trades_by_id.get(e.trade_id)
                    if not t:
                        continue
                    pnl = calc_pnl(t)
                    if pnl is None:
                        continue
                    pnls.append(pnl)
                if len(pnls) >= 3:
                    avg = sum(pnls) / len(pnls)
                    if best_avg is None or avg > best_avg:
                        best_avg = avg
                        best_state = (st.value, len(pnls), avg)
            if best_state:
                insights_list.append(
                    {
                        "title": f"You trade best when you feel {best_state[0]}",
                        "severity": "good",
                        "detail": f"{best_state[1]} linked trades • Avg PnL {best_state[2]:.2f}. Consider journaling pre-trade to replicate this state.",
                    }
                )

        if not insights_list:
            insights_list.append(
                {
                    "title": "Not enough data for strong insights yet",
                    "severity": "info",
                    "detail": "Keep logging closed trades with strategy + times. Insights will become more specific as data grows.",
                }
            )

        return {"insights": insights_list, "closed_trades": len(closed)}
