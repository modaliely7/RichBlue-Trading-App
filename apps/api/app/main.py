from __future__ import annotations

import csv
import io
import os
import uuid
from datetime import date, datetime, timedelta, UTC
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Response, UploadFile
import logging
import json
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete, func, select
import bisect

import numpy as np
import pandas as pd
print(f"DEBUG: pandas imported as pd: {pd}")
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

from .analytics import calc_duration_seconds, calc_pnl, calc_return_pct, calc_risk_reward
from .db import session_scope
from .portfolio_math import (
    ledger_balance_through,
    net_deposited_through,
    realized_pnl_cumulative_through,
    total_return_pct as portfolio_total_return_pct,
    unrealized_pnl_cumulative_through,
    portfolio_value_with_unrealized,
    open_stocks_market_value_for_day,
    trade_open_on_day,
)
from .models import (
    Account,
    AccountType,
    Asset,
    AssetClass,
    Base,
    StockRawData,
    PriceHistory,
    StockMetrics,
    SmartMoneySignal,
    CashTransaction,
    CashTxType,
    Lesson,
    LessonCategory,
    Market,
    PsychologyEntry,
    PsychologyState,
    Trade,
    TradeType,
)
from .schemas import (
    AccountRead,
    AccountCreate,
    AccountUpdate,
    AssetCreate,
    AssetRead,
    AssetUpdate,
    CashAdjustRequest,
    CashBalanceResponse,
    CashDepositRequest,
    CashTxRead,
    CashWithdrawRequest,
    HoldingRow,
    OverviewResponse,
    LessonCreate,
    LessonRead,
    LessonUpdate,
    PortfolioSummary,
    PsychologyCreate,
    PsychologyRead,
    PsychologySummaryRow,
    PsychologyUpdate,
    TradeCreate,
    TradeRead,
    TradeUpdate,
)
from .data_providers import fetch_price_and_fundamentals_yfinance, fetch_price_history_yfinance, fetch_fallback
import json

app = FastAPI(title="Trading Analytics API", version="0.1.0")

logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

_API_DATA_BASE = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
app.mount("/static", StaticFiles(directory=str(_API_DATA_BASE)), name="static")


def _to_trade_read(t: Trade) -> TradeRead:
    pnl = calc_pnl(t)
    return TradeRead(
        id=t.id,
        symbol=t.symbol,
        market=t.market,
        trade_type=t.trade_type,
        entry_price=t.entry_price,
        exit_price=t.exit_price,
        stop_loss=t.stop_loss,
        take_profit=t.take_profit,
        position_size=t.position_size,
        strategy_used=t.strategy_used,
        indicators_used=t.indicators_used,
        entry_date=t.entry_date,
        exit_date=t.exit_date,
        fees=t.fees,
        exit_fees=t.exit_fees,
        notes=t.notes,
        lessons_learned=t.lessons_learned,
        screenshot_path=t.screenshot_path,
        pnl=pnl,
        return_pct=calc_return_pct(t),
        risk_reward=calc_risk_reward(t),
        duration_seconds=calc_duration_seconds(t.entry_date, t.exit_date),
    )


def tx_at_date(at: datetime | date) -> date:
    if hasattr(at, "date"):
        return at.date()
    return at

@app.get("/health")
def health() -> dict:
    return {"ok": True, "ts": datetime.utcnow().isoformat()}


# --- ACCOUNTS ---

@app.get("/accounts", response_model=list[AccountRead])
def list_accounts():
    with session_scope() as s:
        # Ensure at least one account exists
        accs = s.execute(select(Account).where(Account.is_active == True)).scalars().all()
        if not accs:
            default = Account(name="Real Account", account_type=AccountType.real, is_active=True)
            s.add(default)
            s.flush()
            testing = Account(name="Testing Account", account_type=AccountType.testing, is_active=True)
            s.add(testing)
            s.commit()
            accs = [default, testing]
        return accs


@app.post("/accounts", response_model=AccountRead)
def create_account(req: AccountCreate):
    with session_scope() as s:
        acc = Account(name=req.name, account_type=req.account_type)
        s.add(acc)
        s.commit()
        s.refresh(acc)
        return acc


@app.get("/accounts/{account_id}", response_model=AccountRead)
def get_account(account_id: int):
    with session_scope() as s:
        acc = s.get(Account, account_id)
        if not acc or not acc.is_active:
            raise HTTPException(status_code=404, detail="Account not found")
        return acc


@app.put("/accounts/{account_id}", response_model=AccountRead)
def update_account(account_id: int, req: AccountUpdate):
    with session_scope() as s:
        acc = s.get(Account, account_id)
        if not acc or not acc.is_active:
            raise HTTPException(status_code=404, detail="Account not found")
        if req.name is not None:
            acc.name = req.name
        if req.account_type is not None:
            acc.account_type = req.account_type
        if req.is_active is not None:
            acc.is_active = req.is_active
        s.commit()
        s.refresh(acc)
        return acc


@app.delete("/accounts/{account_id}")
def delete_account(account_id: int):
    with session_scope() as s:
        acc = s.get(Account, account_id)
        if not acc or not acc.is_active:
            raise HTTPException(status_code=404, detail="Account not found")
        # Soft delete
        acc.is_active = False
        s.commit()
        return {"deleted": True}


@app.get("/performance/analytics")
def performance_analytics(start: str | None = None, end: str | None = None) -> dict:
    """
    Advanced performance breakdowns from closed trades (uses exit_date when available).
    """
    with session_scope() as s:
        trades = s.execute(select(Trade)).scalars().all()
        closed = [t for t in trades if t.exit_price is not None and calc_pnl(t) is not None]

        def trade_dt(t: Trade) -> datetime:
            return t.exit_date or t.entry_date

        def parse_iso(x: str | None) -> datetime | None:
            if not x:
                return None
            return datetime.fromisoformat(x.replace("Z", "+00:00"))

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

        def group(key_fn):
            buckets: dict[str, list[float]] = {}
            for t in closed:
                k = key_fn(t)
                buckets.setdefault(k, []).append(calc_pnl(t) or 0.0)
            rows = []
            for k, pnls in buckets.items():
                s2 = summarize_pnls(pnls)
                rows.append({"key": k, **s2})
            rows.sort(key=lambda r: (r["avg"], r["count"]), reverse=True)
            return rows

        # Aggregations
        by_month = group(lambda t: trade_dt(t).strftime("%Y-%m"))
        by_dow = group(lambda t: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][trade_dt(t).weekday()])
        by_hour = group(lambda t: f"{trade_dt(t).hour:02d}:00")
        by_strategy = group(lambda t: (t.strategy_used or "").strip() or "Unspecified")
        by_market = group(lambda t: t.market.value)
        by_type = group(lambda t: t.trade_type.value)

        best_strategy = next((r for r in by_strategy if r["count"] >= 3), None)
        worst_strategy = next((r for r in reversed(by_strategy) if r["count"] >= 3), None) if by_strategy else None

        best_day = next((r for r in by_dow if r["count"] >= 3), None)
        worst_day = next((r for r in reversed(by_dow) if r["count"] >= 3), None) if by_dow else None

        best_hour = next((r for r in by_hour if r["count"] >= 3), None)
        worst_hour = next((r for r in reversed(by_hour) if r["count"] >= 3), None) if by_hour else None

        overall = summarize_pnls([calc_pnl(t) or 0.0 for t in closed])

        return {
            "overall": overall,
            "best_strategy": best_strategy,
            "worst_strategy": worst_strategy,
            "best_day": best_day,
            "worst_day": worst_day,
            "best_hour": best_hour,
            "worst_hour": worst_hour,
            "by_month": by_month,
            "by_day_of_week": by_dow,
            "by_hour": by_hour,
            "by_strategy": by_strategy,
            "by_market": by_market,
            "by_trade_type": by_type,
            "closed_trades": len(closed),
        }


@app.get("/reports/performance.pdf")
def performance_report_pdf() -> StreamingResponse:
    analytics = performance_analytics()

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    w, h = letter

    def text(x: float, y: float, s: str, size: int = 10):
        c.setFont("Helvetica", size)
        c.drawString(x, y, s)

    def heading(y: float, s: str):
        c.setFont("Helvetica-Bold", 16)
        c.drawString(0.75 * inch, y, s)

    def subheading(y: float, s: str):
        c.setFont("Helvetica-Bold", 12)
        c.drawString(0.75 * inch, y, s)

    y = h - 0.9 * inch
    heading(y, "Trading Performance Report")
    y -= 0.3 * inch
    text(0.75 * inch, y, f"Generated: {datetime.now(UTC).strftime('%Y-%m-%d %H:%M UTC')}", 9)
    y -= 0.35 * inch

    overall = analytics.get("overall", {}) or {}
    closed_trades = analytics.get("closed_trades", 0)
    subheading(y, "Overall")
    y -= 0.22 * inch
    text(0.75 * inch, y, f"Closed trades used: {closed_trades}")
    y -= 0.18 * inch
    text(0.75 * inch, y, f"Total PnL: {overall.get('total', 0.0):.2f}")
    y -= 0.18 * inch
    text(0.75 * inch, y, f"Average PnL: {overall.get('avg', 0.0):.2f}")
    y -= 0.18 * inch
    text(0.75 * inch, y, f"Win rate: {overall.get('win_rate', 0.0):.2f}%")
    y -= 0.35 * inch

    subheading(y, "Highlights (min 3 trades per bucket)")
    y -= 0.22 * inch

    def highlight_line(label: str, row: dict | None):
        nonlocal y
        if not row:
            text(0.75 * inch, y, f"{label}: —")
            y -= 0.18 * inch
            return
        text(
            0.75 * inch,
            y,
            f"{label}: {row.get('key')} | trades {row.get('count')} | avg {row.get('avg', 0.0):.2f} | win {row.get('win_rate', 0.0):.2f}%",
        )
        y -= 0.18 * inch

    highlight_line("Best strategy", analytics.get("best_strategy"))
    highlight_line("Worst strategy", analytics.get("worst_strategy"))
    highlight_line("Best day", analytics.get("best_day"))
    highlight_line("Worst day", analytics.get("worst_day"))
    highlight_line("Best hour", analytics.get("best_hour"))
    highlight_line("Worst hour", analytics.get("worst_hour"))
    y -= 0.2 * inch

    subheading(y, "Top strategies by average PnL")
    y -= 0.22 * inch
    strategies = analytics.get("by_strategy") or []
    for r in strategies[:12]:
        text(0.75 * inch, y, f"- {r.get('key')}: avg {r.get('avg', 0.0):.2f} | trades {r.get('count')} | win {r.get('win_rate', 0.0):.2f}%")
        y -= 0.16 * inch
        if y < 1.0 * inch:
            c.showPage()
            y = h - 0.9 * inch
            subheading(y, "Top strategies (continued)")
            y -= 0.25 * inch

    c.showPage()
    c.save()
    buf.seek(0)
    headers = {"Content-Disposition": 'attachment; filename="performance_report.pdf"'}
    return StreamingResponse(buf, media_type="application/pdf", headers=headers)


@app.get("/trades", response_model=list[TradeRead])
def list_trades(account_id: int = 1, limit: int = 200, offset: int = 0) -> list[TradeRead]:
    with session_scope() as s:
        rows = s.execute(
            select(Trade)
            .where(Trade.account_id == account_id)
            .order_by(Trade.entry_date.desc())
            .limit(limit)
            .offset(offset)
        ).scalars().all()
        return [_to_trade_read(t) for t in rows]


def _cash_balance(s, account_id: int) -> float:
    total = s.execute(
        select(func.coalesce(func.sum(CashTransaction.amount), 0.0))
        .where(CashTransaction.account_id == account_id)
    ).scalar_one()
    return float(total or 0.0)


def _add_cash_tx(
    s,
    *,
    account_id: int = 1,
    amount: float,
    tx_type: CashTxType,
    at: datetime | None = None,
    note: str | None = None,
    trade: Trade | None = None,
) -> CashTransaction:
    x = CashTransaction(
        account_id=account_id,
        amount=float(amount),
        tx_type=tx_type,
        at=at or datetime.now(UTC),
        note=note,
        trade_id=(trade.id if trade else None),
        symbol=(trade.symbol if trade else None),
    )
    s.add(x)
    return x


def _compute_holdings(s, account_id: int = 1) -> list[HoldingRow]:
    trades = s.execute(select(Trade).where(Trade.account_id == account_id)).scalars().all()
    assets = s.execute(select(Asset).where(Asset.account_id == account_id, Asset.asset_class == AssetClass.stocks)).scalars().all()
    price_by_symbol = {a.symbol.upper(): float(a.current_price or 0.0) for a in assets if (a.symbol or "").strip()}

    by_symbol: dict[str, dict] = {}
    for t in trades:
        sym = (t.symbol or "").strip().upper()
        if not sym:
            continue
        bucket = by_symbol.setdefault(
            sym,
            {
                "open_qty": 0.0,
                "open_cost": 0.0,
                "realized": 0.0,
                "closed_trades": 0,
                "open_trades": 0,
            },
        )

        is_closed = t.exit_price is not None
        if is_closed:
            pnl = calc_pnl(t) or 0.0
            bucket["realized"] += float(pnl)
            bucket["closed_trades"] += 1
        else:
            qty = float(t.position_size or 0.0)
            cost = float((t.entry_price or 0.0) * qty)
            bucket["open_qty"] += qty
            bucket["open_cost"] += cost
            bucket["open_trades"] += 1

    rows: list[HoldingRow] = []
    for sym, b in by_symbol.items():
        open_qty = float(b["open_qty"])
        open_cost = float(b["open_cost"])
        avg_open = (open_cost / open_qty) if open_qty else None
        px = price_by_symbol.get(sym)
        if px is None:
            cur_px = None
            mv = None
            upnl = None
            upnl_pct = None
        else:
            cur_px = float(px)
            mv = float(open_qty * cur_px)
            upnl = float(mv - open_cost)
            upnl_pct = float(upnl / open_cost * 100.0) if open_cost else None

        rows.append(
            HoldingRow(
                symbol=sym,
                open_quantity=open_qty,
                avg_open_cost=avg_open,
                open_cost_basis=open_cost,
                realized_pnl=float(b["realized"]),
                closed_trades=int(b["closed_trades"]),
                open_trades=int(b["open_trades"]),
                current_price=cur_px,
                market_value=mv,
                unrealized_pnl=upnl,
                unrealized_pnl_pct=upnl_pct,
            )
        )

    rows.sort(key=lambda r: (r.market_value or 0.0, r.open_quantity, r.symbol), reverse=True)
    return rows


def _funds_cost_from_assets(s, account_id: int = 1) -> float:
    return float(
        sum(
            float(a.quantity or 0.0) * float(a.avg_cost or 0.0)
            for a in s.execute(select(Asset).where(Asset.account_id == account_id, Asset.asset_class == AssetClass.etfs)).scalars().all()
        )
    )


@app.get("/overview", response_model=OverviewResponse)
def overview(account_id: int = 1, method: str = "realized") -> OverviewResponse:
    with session_scope() as s:
        trades = s.execute(select(Trade).where(Trade.account_id == account_id).order_by(Trade.entry_date.desc())).scalars().all()
        holdings = _compute_holdings(s, account_id)
        txs = s.execute(select(CashTransaction).where(CashTransaction.account_id == account_id).order_by(CashTransaction.at.asc())).scalars().all()
        end_day = datetime.now(UTC).date()

        # Build a mapping of current prices for liquidation/unrealized calculations
        assets_for_prices = s.execute(select(Asset).where(Asset.account_id == account_id)).scalars().all()
        price_by_symbol = {a.symbol.upper(): float(a.current_price or 0.0) for a in assets_for_prices if (a.symbol or "").strip()}

        # Stocks cost basis (open cost) and funds cost (invested capital)
        stocks_cost = float(sum(float(h.open_cost_basis or 0.0) for h in holdings))
        funds_cost = _funds_cost_from_assets(s, account_id)
        assets_mv = float(stocks_cost + funds_cost)  # kept as "assets_market_value" for cost/basis

        # Current market values (snapshot) for portfolio/equity computation
        stocks_mv_current = float(sum(float(h.market_value or 0.0) for h in holdings))
        funds_assets = s.execute(select(Asset).where(Asset.account_id == account_id, Asset.asset_class == AssetClass.etfs)).scalars().all()
        funds_mv_current = float(sum(float(a.current_price or 0.0) * float(a.quantity or 0.0) for a in funds_assets))
        assets_mv_current = float(stocks_mv_current + funds_mv_current)

        realized_total = realized_pnl_cumulative_through(trades, end_day)
        unreal_total = unrealized_pnl_cumulative_through(trades, end_day, price_by_symbol)
        open_positions = int(sum(1 for h in holdings if (h.open_quantity or 0.0) != 0.0))
        open_symbols = int(sum(1 for h in holdings if (h.open_quantity or 0.0) != 0.0))

        cash_now = ledger_balance_through(txs, end_day)
        net_deposited_now = net_deposited_through(txs, end_day)
        
        if method == "realized":
            portfolio_value_now = float(net_deposited_now + realized_total)
            total_return_value_now = float(realized_total)
        else:
            # Liquidation method
            portfolio_value_now = float(cash_now + stocks_mv_current + funds_mv_current)
            total_return_value_now = float(realized_total + unreal_total)
            
        total_return_pct_now = portfolio_total_return_pct(total_return_value_now, net_deposited_now)

        # Build a price lookup cache: symbol -> list of (date_str, price) sorted by date_str
        all_symbols = list(set((t.symbol or "").strip().upper() for t in trades if t.symbol))
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
                # price_history_cache is already sorted by date due to order_by PriceHistory.at.asc()
                price_history_cache.setdefault(sym, []).append((ds, float(r.close)))

        # Daily series
        labels: list[str] = []
        portfolio_value_series: list[float] = [] # Realized: Net Dep + Realized P/L
        net_dep_series: list[float] = []
        total_return_series: list[float] = [] # Realized P/L
        equity_value_series: list[float] = [] # Liquidation: Cash + Market Value

        start_candidates: list[date] = []
        if txs:
            start_candidates.append(min((tx_at_date(tx.at)) for tx in txs))
        if trades:
            start_candidates.append(
                min((tx_at_date(t.entry_date)) for t in trades)
            )
        
        end_day = datetime.now(UTC).date()
        if start_candidates:
            start_day = min(start_candidates)
            if start_day > end_day:
                start_day = end_day
            cur = start_day
            
            # Helper to get price for a symbol on/before a day
            def get_price_on_day(sym: str, d: date) -> float | None:
                sym = sym.upper()
                if sym not in price_history_cache:
                    return price_by_symbol.get(sym)
                
                prices = price_history_cache[sym] # list of (ds, price)
                ds = d.strftime("%Y-%m-%d")
                
                # Use bisect to find the rightmost entry <= ds
                idx = bisect.bisect_right(prices, (ds, float('inf'))) - 1
                if idx >= 0:
                    return prices[idx][1]
                
                return price_by_symbol.get(sym)

            while cur <= end_day:
                # Skip weekends — markets are closed, no new data
                if cur.weekday() < 5:  # 0=Mon ... 4=Fri
                    day_str = cur.strftime("%Y-%m-%d")

                    # 1. Realized metrics
                    net_dep = net_deposited_through(txs, cur)
                    real_cum = realized_pnl_cumulative_through(trades, cur)
                    pv_realized = float(net_dep + real_cum)

                    # 2. Liquidation metrics (Equity)
                    cash_day = ledger_balance_through(txs, cur)

                    # Market value of open trades using historical price lookup
                    open_mv = 0.0
                    for t in trades:
                        if trade_open_on_day(t, cur):
                            sym = (t.symbol or "").strip().upper()
                            px = get_price_on_day(sym, cur)
                            if px is not None:
                                open_mv += float(px * (t.position_size or 0.0))

                    equity_day = float(cash_day + open_mv + funds_mv_current)

                    labels.append(day_str)
                    net_dep_series.append(net_dep)
                    total_return_series.append(real_cum)
                    portfolio_value_series.append(pv_realized)
                    equity_value_series.append(equity_day)

                cur += timedelta(days=1)
        else:
            labels = [datetime.now(UTC).strftime("%Y-%m-%d")]
            portfolio_value_series = [net_deposited_now + realized_total]
            net_dep_series = [net_deposited_now]
            total_return_series = [realized_total]
            equity_value_series = [portfolio_value_now]

        return OverviewResponse(
            kpis={
                "as_of": datetime.now(UTC),
                "cash_balance": cash_now,
                "assets_market_value": assets_mv,
                "portfolio_value": portfolio_value_now,
                "net_deposited": net_deposited_now,
                "total_return_value": total_return_value_now,
                "total_return_pct": total_return_pct_now,
                "realized_pnl_total": realized_total,
                "open_positions": open_positions,
                "open_symbols": open_symbols,
            },
            allocation={
                "Cash": cash_now,
                "Stocks": stocks_cost,
                "Funds": funds_cost,
            },
            holdings=holdings,
            trades=[_to_trade_read(t) for t in trades],
            chart={
                "labels": labels,
                "portfolio_value": portfolio_value_series,
                "net_deposited": net_dep_series,
                "total_return_value": total_return_series,
                "portfolio_value_liquidation": equity_value_series,
            },
        )


@app.get("/cash/balance", response_model=CashBalanceResponse)
def cash_balance(account_id: int = 1) -> CashBalanceResponse:
    with session_scope() as s:
        return CashBalanceResponse(balance=_cash_balance(s, account_id))


@app.get("/cash/transactions", response_model=list[CashTxRead])
def cash_transactions(account_id: int = 1, limit: int = 300, offset: int = 0) -> list[CashTxRead]:
    with session_scope() as s:
        rows = (
            s.execute(select(CashTransaction).where(CashTransaction.account_id == account_id).order_by(CashTransaction.at.desc()).limit(limit).offset(offset))
            .scalars()
            .all()
        )
        return [
            CashTxRead(
                id=r.id,
                amount=r.amount,
                tx_type=r.tx_type,
                trade_id=r.trade_id,
                symbol=r.symbol,
                at=r.at,
                note=r.note,
            )
            for r in rows
        ]


@app.options("/cash/deposit")
def cash_deposit_options() -> Response:
    return Response(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
    )


@app.options("/cash/withdraw")
def cash_withdraw_options() -> Response:
    return Response(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
    )


@app.options("/cash/adjust")
def cash_adjust_options() -> Response:
    return Response(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
    )


@app.post("/cash/deposit")
def cash_deposit(payload: CashDepositRequest, account_id: int = 1) -> dict:
    """Accept a deposit and return the new balance plus created transaction id.

    This endpoint is intentionally tolerant and returns a helpful payload for the UI.
    """
    try:
        with session_scope() as s:
            # ensure numeric amount and positivity (Pydantic should already enforce this)
            try:
                amt = float(payload.amount)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid amount")
            if amt <= 0:
                raise HTTPException(status_code=400, detail="Amount must be greater than zero")

            logger.info("Attempting deposit for account %s: %s", account_id, payload)
            tx = _add_cash_tx(s, account_id=account_id, amount=amt, tx_type=CashTxType.deposit, at=payload.at, note=payload.note)
            s.flush()
            bal = _cash_balance(s, account_id)
            # include tx id to help the client confirm creation
            logger.info("Deposit successful: tx_id=%s amount=%s new_balance=%s", getattr(tx, 'id', None), amt, bal)
            return {"balance": bal, "tx_id": getattr(tx, 'id', None)}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error processing deposit: %s", e)
        raise HTTPException(status_code=500, detail=f"Deposit failed: {e}")


@app.post("/cash/withdraw", response_model=CashBalanceResponse)
def cash_withdraw(payload: CashWithdrawRequest, account_id: int = 1) -> CashBalanceResponse:
    with session_scope() as s:
        bal = _cash_balance(s, account_id)
        if payload.amount > bal + 1e-9:
            raise HTTPException(status_code=400, detail=f"Insufficient cash (Available: {bal:.2f}).")
        _add_cash_tx(s, account_id=account_id, amount=-payload.amount, tx_type=CashTxType.withdraw, at=payload.at, note=payload.note)
        s.flush()
        return CashBalanceResponse(balance=_cash_balance(s, account_id))


@app.post("/cash/adjust", response_model=CashBalanceResponse)
def cash_adjust(payload: CashAdjustRequest, account_id: int = 1) -> CashBalanceResponse:
    with session_scope() as s:
        _add_cash_tx(s, account_id=account_id, amount=payload.amount, tx_type=CashTxType.adjustment, at=payload.at, note=payload.note)
        s.flush()
        return CashBalanceResponse(balance=_cash_balance(s, account_id))

@app.delete("/cash/transactions/{tx_id}")
def delete_cash_transaction(tx_id: int) -> dict:
    with session_scope() as s:
        tx = s.get(CashTransaction, tx_id)
        if not tx:
            raise HTTPException(status_code=404, detail="Cash transaction not found")
        # Do not allow deleting trade-linked transactions directly
        if tx.tx_type in (CashTxType.trade_buy, CashTxType.trade_sell, CashTxType.fee):
            raise HTTPException(status_code=400, detail="Cannot delete trade-linked cash transaction directly. Please edit the trade instead.")
        s.delete(tx)
        return {"deleted": True}


@app.put("/cash/transactions/{tx_id}", response_model=CashTxRead)
def update_cash_transaction(tx_id: int, payload: CashAdjustRequest) -> CashTxRead:
    with session_scope() as s:
        tx = s.get(CashTransaction, tx_id)
        if not tx:
            raise HTTPException(status_code=404, detail="Cash transaction not found")
        if tx.tx_type in (CashTxType.trade_buy, CashTxType.trade_sell, CashTxType.fee):
            raise HTTPException(status_code=400, detail="Cannot edit trade-linked cash transaction directly. Please edit the trade instead.")
        
        tx.amount = payload.amount
        if payload.at is not None:
            tx.at = payload.at
        if payload.note is not None:
            tx.note = payload.note
            
        s.commit()
        s.refresh(tx)
        return CashTxRead(
            id=tx.id,
            amount=tx.amount,
            tx_type=tx.tx_type,
            trade_id=tx.trade_id,
            symbol=tx.symbol,
            at=tx.at,
            note=tx.note,
        )


@app.post("/trades", response_model=TradeRead)
def create_trade(payload: TradeCreate, account_id: int = 1) -> TradeRead:
    with session_scope() as s:
        data = payload.model_dump()
        required_cash = float((data.get("entry_price") or 0.0) * (data.get("position_size") or 0.0) + (data.get("fees") or 0.0))
        if required_cash > 0 and _cash_balance(s, account_id) < required_cash:
            raise HTTPException(status_code=400, detail=f"Insufficient cash. Required {required_cash:.2f}.")

        t = Trade(**data)
        t.account_id = account_id
        s.add(t)
        # Build a mapping of current prices for liquidation/unrealized calculations
        assets_for_prices = s.execute(select(Asset).where(Asset.account_id == account_id, Asset.asset_class == AssetClass.stocks)).scalars().all()
        price_by_symbol = {a.symbol.upper(): float(a.current_price or 0.0) for a in assets_for_prices if (a.symbol or "").strip()}
        s.flush()
        if t.position_size and t.entry_price:
            _add_cash_tx(
                s,
                account_id=account_id,
                amount=-(float(t.entry_price) * float(t.position_size)),
                tx_type=CashTxType.trade_buy,
                at=t.entry_date,
                note="Trade entry (buy)",
                trade=t,
            )
        if t.fees and float(t.fees) != 0.0:
            _add_cash_tx(
                s,
                account_id=account_id,
                amount=-float(t.fees),
                tx_type=CashTxType.fee,
                at=t.entry_date,
                note="Trade fees",
                trade=t,
            )
        if t.exit_price is not None:
            _add_cash_tx(
                s,
                account_id=account_id,
                amount=float(t.exit_price or 0.0) * float(t.position_size or 0.0),
                tx_type=CashTxType.trade_sell,
                at=t.exit_date or datetime.now(UTC),
                note="Trade exit (sell)",
                trade=t,
            )
        if t.exit_price is not None and float(t.exit_fees or 0.0) > 0.0:
            _add_cash_tx(
                s,
                account_id=account_id,
                amount=-float(t.exit_fees),
                tx_type=CashTxType.fee,
                at=t.exit_date or datetime.now(UTC),
                note="Trade exit (fees)",
                trade=t,
            )
        s.refresh(t)
        return _to_trade_read(t)


@app.patch("/trades/{trade_id}", response_model=TradeRead)
def update_trade(trade_id: int, payload: TradeUpdate) -> TradeRead:
    with session_scope() as s:
        t = s.get(Trade, trade_id)
        if not t:
            raise HTTPException(status_code=404, detail="Trade not found")
        before_entry_price = float(t.entry_price or 0.0)
        before_size = float(t.position_size or 0.0)
        before_fees = float(t.fees or 0.0)
        before_exit_fees = float(t.exit_fees or 0.0)
        before_exit_price = t.exit_price
        before_exit_date = t.exit_date
        data = payload.model_dump(exclude_unset=True)
        for k, v in data.items():
            setattr(t, k, v)

        # If entry/size/fees changed, adjust cash to keep ledger consistent.
        after_entry_price = float(t.entry_price or 0.0)
        after_size = float(t.position_size or 0.0)
        after_fees = float(t.fees or 0.0)
        after_exit_fees = float(t.exit_fees or 0.0)

        before_required = before_entry_price * before_size + before_fees
        after_required = after_entry_price * after_size + after_fees
        delta_required = after_required - before_required
        if delta_required > 0 and _cash_balance(s, t.account_id) < delta_required:
            raise HTTPException(status_code=400, detail=f"Insufficient cash to increase position. Need extra {delta_required:.2f}.")

        if abs(delta_required) > 1e-9:
            # Positive delta_required means more cash needed -> record additional outflow (negative amount)
            _add_cash_tx(
                s,
                account_id=t.account_id,
                amount=-float(delta_required),
                tx_type=CashTxType.adjustment,
                at=t.entry_date,
                note="Trade edited (entry/size/fees adjustment)",
                trade=t,
            )

        # Keep sell-side cash consistent when close state/size/exit changes.
        became_closed = before_exit_price is None and t.exit_price is not None
        became_open = before_exit_price is not None and t.exit_price is None
        if became_closed:
            _add_cash_tx(
                s,
                account_id=t.account_id,
                amount=float(t.exit_price or 0.0) * float(t.position_size or 0.0),
                tx_type=CashTxType.trade_sell,
                at=t.exit_date or datetime.now(UTC),
                note="Trade exit (sell)",
                trade=t,
            )
            if after_exit_fees > 0.0:
                _add_cash_tx(
                    s,
                    amount=-after_exit_fees,
                    tx_type=CashTxType.fee,
                    at=t.exit_date or datetime.now(UTC),
                    note="Trade exit (fees)",
                    trade=t,
                )
        if became_open:
            _add_cash_tx(
                s,
                amount=-(float(before_exit_price or 0.0) * float(before_size or 0.0)),
                tx_type=CashTxType.adjustment,
                at=before_exit_date or datetime.now(UTC),
                note="Trade re-opened (reverse sell cash)",
                trade=t,
            )
            if before_exit_fees > 0.0:
                _add_cash_tx(
                    s,
                    amount=before_exit_fees,
                    tx_type=CashTxType.adjustment,
                    at=before_exit_date or datetime.now(UTC),
                    note="Trade re-opened (reverse exit fees)",
                    trade=t,
                )
            t.exit_fees = 0.0
        elif (before_exit_price is not None and t.exit_price is not None) and (
            abs(float(before_exit_price) - float(t.exit_price or 0.0)) > 1e-9 or abs(before_size - after_size) > 1e-9
        ):
            old_sell = float(before_exit_price or 0.0) * float(before_size or 0.0)
            new_sell = float(t.exit_price or 0.0) * float(after_size or 0.0)
            delta_sell = new_sell - old_sell
            if abs(delta_sell) > 1e-9:
                _add_cash_tx(
                    s,
                    amount=delta_sell,
                    tx_type=CashTxType.adjustment,
                    at=t.exit_date or before_exit_date or datetime.utcnow(),
                    note="Trade edited (exit/size sell adjustment)",
                    trade=t,
                )

        if (not became_closed and not became_open) and before_exit_price is not None and t.exit_price is not None:
            d_exit_fee = after_exit_fees - before_exit_fees
            if abs(d_exit_fee) > 1e-9:
                _add_cash_tx(
                    s,
                    amount=-d_exit_fee,
                    tx_type=CashTxType.fee,
                    at=t.exit_date or before_exit_date or datetime.utcnow(),
                    note="Trade edited (exit fees adjustment)",
                    trade=t,
                )

        s.add(t)
        s.flush()
        s.refresh(t)
        return _to_trade_read(t)


@app.delete("/trades/{trade_id}")
def delete_trade(trade_id: int) -> dict:
    with session_scope() as s:
        t = s.get(Trade, trade_id)
        if not t:
            raise HTTPException(status_code=404, detail="Trade not found")
        # To maintain accurate cash balance, remove the cash transactions linked to this trade
        s.execute(delete(CashTransaction).where(CashTransaction.trade_id == trade_id))
        s.delete(t)
        return {"deleted": True}

def _parse_market(v: str | None) -> Market:
    if not v:
        return Market.stocks
    x = v.strip().lower()
    if x in ["stocks", "stock", "equities", "equity"]:
        return Market.stocks
    if x in ["funds", "fund", "etf", "etfs"]:
        return Market.funds
    if x in ["crypto", "cryptocurrency"]:
        return Market.crypto
    if x in ["forex", "fx"]:
        return Market.forex
    raise ValueError(f"Invalid market: {v}")


def _parse_trade_type(v: str | None) -> TradeType:
    if not v:
        return TradeType.long
    x = v.strip().lower()
    if x in ["long", "buy"]:
        return TradeType.long
    if x in ["short", "sell"]:
        return TradeType.short
    raise ValueError(f"Invalid trade_type: {v}")


def _parse_float(v: str | None) -> float | None:
    if v is None:
        return None
    s = v.strip()
    if s == "":
        return None
    return float(s)


def _parse_dt(v: str | None) -> datetime | None:
    if v is None:
        return None
    s = v.strip()
    if s == "":
        return None
    # Accept ISO 8601
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _refresh_fundamentals(session, symbol: str) -> dict:
    try:
        from .fundamentals import refresh_fundamentals as _refresh
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error preparing fundamentals refresh: {e}")
    try:
        return _refresh(session, symbol)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _compute_technical_indicators(symbol: str, period: str = "1y", interval: str = "1d") -> dict:
    """Best-effort technical indicators from price history (SMA/EMA/MACD/RSI/ATR/Bollinger/OBV/VWAP).

    Returns a dict with `series` (list of daily points with indicators), `latest` (last row), and `summary`.
    """
    sym = (symbol or "").strip().upper()
    if not sym:
        raise HTTPException(status_code=400, detail="Invalid symbol")
    hist = fetch_price_history_yfinance(sym, period=period, interval=interval)
    if not hist:
        return {"symbol": sym, "series": [], "latest": {}, "summary": {}}

    df = pd.DataFrame(hist)
    if df.empty:
        return {"symbol": sym, "series": [], "latest": {}, "summary": {}}
    df.sort_values("at", inplace=True)
    df = df.reset_index(drop=True)

    # ensure numeric types
    for c in ["open", "high", "low", "close", "volume"]:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)

    # Moving averages
    df["sma20"] = df["close"].rolling(20, min_periods=1).mean()
    df["sma50"] = df["close"].rolling(50, min_periods=1).mean()
    df["sma200"] = df["close"].rolling(200, min_periods=1).mean()

    # EMAs and MACD
    df["ema12"] = df["close"].ewm(span=12, adjust=False).mean()
    df["ema26"] = df["close"].ewm(span=26, adjust=False).mean()
    df["macd"] = df["ema12"] - df["ema26"]
    df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()

    # RSI (14)
    delta = df["close"].diff()
    up = delta.clip(lower=0)
    down = -1 * delta.clip(upper=0)
    roll_up = up.rolling(14, min_periods=1).mean()
    roll_down = down.rolling(14, min_periods=1).mean()
    rs = roll_up / roll_down.replace(0, pd.NA)
    df["rsi14"] = 100.0 - (100.0 / (1.0 + rs))

    # ATR (14)
    prev_close = df["close"].shift(1)
    tr1 = df["high"] - df["low"]
    tr2 = (df["high"] - prev_close).abs()
    tr3 = (df["low"] - prev_close).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    df["atr14"] = tr.rolling(14, min_periods=1).mean()

    # Bollinger Bands
    df["bb_mid"] = df["close"].rolling(20, min_periods=1).mean()
    df["bb_std"] = df["close"].rolling(20, min_periods=1).std().fillna(0.0)
    df["bb_upper"] = df["bb_mid"] + 2 * df["bb_std"]
    df["bb_lower"] = df["bb_mid"] - 2 * df["bb_std"]

    # OBV
    df["obv"] = (np.sign(df["close"].diff()) * df["volume"]).fillna(0).cumsum()

    # VWAP (cumulative)
    vol_cum = df["volume"].cumsum().replace(0, pd.NA)
    df["vwap"] = (df["close"] * df["volume"]).cumsum() / vol_cum

    # Build serializable series
    series = []
    for _, r in df.iterrows():
        series.append(
            {
                "at": r["at"].isoformat() if hasattr(r["at"], "isoformat") else str(r["at"]),
                "open": float(r["open"]),
                "high": float(r["high"]),
                "low": float(r["low"]),
                "close": float(r["close"]),
                "volume": float(r["volume"]),
                "sma20": None if pd.isna(r.get("sma20")) else float(r.get("sma20")),
                "sma50": None if pd.isna(r.get("sma50")) else float(r.get("sma50")),
                "sma200": None if pd.isna(r.get("sma200")) else float(r.get("sma200")),
                "ema12": None if pd.isna(r.get("ema12")) else float(r.get("ema12")),
                "ema26": None if pd.isna(r.get("ema26")) else float(r.get("ema26")),
                "macd": None if pd.isna(r.get("macd")) else float(r.get("macd")),
                "macd_signal": None if pd.isna(r.get("macd_signal")) else float(r.get("macd_signal")),
                "rsi14": None if pd.isna(r.get("rsi14")) else float(r.get("rsi14")),
                "atr14": None if pd.isna(r.get("atr14")) else float(r.get("atr14")),
                "bb_upper": None if pd.isna(r.get("bb_upper")) else float(r.get("bb_upper")),
                "bb_lower": None if pd.isna(r.get("bb_lower")) else float(r.get("bb_lower")),
                "obv": None if pd.isna(r.get("obv")) else float(r.get("obv")),
                "vwap": None if pd.isna(r.get("vwap")) else float(r.get("vwap")),
            }
        )

    latest = series[-1] if series else {}
    summary: dict = {}
    try:
        last = df.iloc[-1]
        summary["sma_crossover"] = "bull" if last.get("sma20") > last.get("sma50") else (
            "bear" if last.get("sma20") < last.get("sma50") else "neutral"
        )
        summary["macd_bullish"] = None if pd.isna(last.get("macd")) or pd.isna(last.get("macd_signal")) else (
            bool(last.get("macd") > last.get("macd_signal"))
        )
        summary["rsi"] = None if pd.isna(last.get("rsi14")) else float(last.get("rsi14"))
        summary["atr"] = None if pd.isna(last.get("atr14")) else float(last.get("atr14"))
    except Exception:
        pass

    return {"symbol": sym, "series": series, "latest": latest, "summary": summary}


def _compute_smart_money(symbol: str, period: str = "1y", interval: str = "1d") -> dict:
    """Rudimentary "smart money" signals based on volume spikes, OBV slope and institutional holding hints.

    Returns counts of big-buy / big-sell events and an overall bias.
    """
    sym = (symbol or "").strip().upper()
    if not sym:
        raise HTTPException(status_code=400, detail="Invalid symbol")
    hist = fetch_price_history_yfinance(sym, period=period, interval=interval)
    if not hist:
        return {"symbol": sym, "big_buy_30": 0, "big_sell_30": 0, "net_big": 0, "obv_slope": None, "institutional_holding": None}

    df = pd.DataFrame(hist)
    df.sort_values("at", inplace=True)
    df = df.reset_index(drop=True)
    for c in ["open", "high", "low", "close", "volume"]:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)

    # Moving average of volume to detect spikes
    df["vol_ma20"] = df["volume"].rolling(20, min_periods=1).mean()
    df["big_vol"] = df["volume"] > (df["vol_ma20"] * 2.0)
    df["big_buy"] = df["big_vol"] & (df["close"] > df["close"].shift(1))
    df["big_sell"] = df["big_vol"] & (df["close"] < df["close"].shift(1))

    last_30 = df.tail(30)
    big_buy_30 = int(last_30["big_buy"].sum())
    big_sell_30 = int(last_30["big_sell"].sum())
    net_big = big_buy_30 - big_sell_30

    # OBV slope over last 30 days
    df["obv"] = (np.sign(df["close"].diff()) * df["volume"]).fillna(0).cumsum()
    obv_vals = df["obv"].dropna()
    obv_slope = None
    try:
        y = obv_vals.tail(30).values
        if len(y) >= 2:
            x = np.arange(len(y))
            obv_slope = float(np.polyfit(x, y, 1)[0])
    except Exception:
        obv_slope = None

    # try to fetch institutional holding hint from fundamentals
    inst_holding = None
    try:
        info_payload = fetch_price_and_fundamentals_yfinance(sym)
        inst_holding = (info_payload.get("raw") or {}).get("info", {}).get("heldPercentInstitutions")
    except Exception:
        inst_holding = None

    bias = "neutral"
    if net_big > 2 or (obv_slope is not None and obv_slope > 0):
        bias = "accumulation"
    elif net_big < -2 or (obv_slope is not None and obv_slope < 0):
        bias = "distribution"

    return {
        "symbol": sym,
        "big_buy_30": big_buy_30,
        "big_sell_30": big_sell_30,
        "net_big": net_big,
        "obv_slope": obv_slope,
        "institutional_holding": inst_holding,
        "bias": bias,
    }


    return _refresh_fundamentals(s, sym)


@app.get("/technical/{symbol}")
def get_technical(symbol: str, period: str = "1y", interval: str = "1d") -> dict:
    """Compute and return technical indicators for a symbol."""
    try:
        data = _compute_technical_indicators(symbol, period=period, interval=interval)
        return jsonable_encoder(data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Technical indicators failed: {e}") from e


@app.get("/smart-money/{symbol}")
def get_smart_money(symbol: str, period: str = "1y", interval: str = "1d", persist: bool = True) -> dict:
    """Compute rudimentary smart-money signals for a symbol."""
    try:
        data = _compute_smart_money(symbol, period=period, interval=interval)
        if persist:
            try:
                with session_scope() as s:
                    sym = (symbol or "").strip().upper()
                    row = SmartMoneySignal(symbol=sym, provider="computed", computed_at=datetime.utcnow(), payload=json.dumps(data))
                    s.add(row)
                    s.flush()
            except Exception:
                pass
        return jsonable_encoder(data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Smart money computation failed: {e}") from e


@app.post("/trades/import/csv")
async def import_trades_csv(file: UploadFile = File(...), account_id: int = 1) -> dict:
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file")

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode CSV: {e}") from e

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no header row")

    required = ["symbol", "entry_price", "entry_date"]
    missing = [c for c in required if c not in reader.fieldnames]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required columns: {', '.join(missing)}")

    inserted = 0
    errors: list[dict] = []

    with session_scope() as s:
        for i, row in enumerate(reader, start=2):  # 1 header, data starts at 2
            try:
                symbol = (row.get("symbol") or "").strip().upper()
                if not symbol:
                    raise ValueError("symbol is required")

                market = _parse_market(row.get("market"))
                trade_type = _parse_trade_type(row.get("trade_type"))

                entry_price = _parse_float(row.get("entry_price"))
                if entry_price is None:
                    raise ValueError("entry_price is required")

                entry_date = _parse_dt(row.get("entry_date"))
                if entry_date is None:
                    raise ValueError("entry_date is required")

                t = Trade(
                    account_id=account_id,
                    symbol=symbol,
                    market=market,
                    trade_type=trade_type,
                    entry_price=entry_price,
                    exit_price=_parse_float(row.get("exit_price")),
                    stop_loss=_parse_float(row.get("stop_loss")),
                    take_profit=_parse_float(row.get("take_profit")),
                    position_size=_parse_float(row.get("position_size")) or 0.0,
                    strategy_used=(row.get("strategy_used") or "").strip() or None,
                    indicators_used=(row.get("indicators_used") or "").strip() or None,
                    entry_date=entry_date,
                    exit_date=_parse_dt(row.get("exit_date")),
                    fees=_parse_float(row.get("fees")) or 0.0,
                    exit_fees=_parse_float(row.get("exit_fees")) or 0.0,
                    notes=(row.get("notes") or "").strip() or None,
                    lessons_learned=(row.get("lessons_learned") or "").strip() or None,
                )
                s.add(t)
                inserted += 1
            except Exception as e:
                errors.append({"row": i, "error": str(e)})

    return {"inserted": inserted, "errors": errors, "total_errors": len(errors)}


@app.get("/trades/export/csv")
def export_trades_csv(account_id: int = 1) -> StreamingResponse:
    def iter_rows():
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(
            [
                "id",
                "symbol",
                "market",
                "trade_type",
                "entry_price",
                "exit_price",
                "stop_loss",
                "take_profit",
                "position_size",
                "strategy_used",
                "indicators_used",
                "entry_date",
                "exit_date",
                "fees",
                "exit_fees",
                "notes",
                "lessons_learned",
                "screenshot_path",
            ]
        )
        yield out.getvalue()
        out.seek(0)
        out.truncate(0)

        with session_scope() as s:
            rows = s.execute(
                select(Trade)
                .where(Trade.account_id == account_id)
                .order_by(Trade.entry_date.asc())
            ).scalars().all()
            for t in rows:
                writer.writerow(
                    [
                        t.id,
                        t.symbol,
                        t.market.value,
                        t.trade_type.value,
                        t.entry_price,
                        t.exit_price if t.exit_price is not None else "",
                        t.stop_loss if t.stop_loss is not None else "",
                        t.take_profit if t.take_profit is not None else "",
                        t.position_size,
                        t.strategy_used or "",
                        t.indicators_used or "",
                        t.entry_date.isoformat(),
                        t.exit_date.isoformat() if t.exit_date else "",
                        t.fees,
                        t.exit_fees,
                        (t.notes or "").replace("\n", " "),
                        (t.lessons_learned or "").replace("\n", " "),
                        t.screenshot_path or "",
                    ]
                )
                yield out.getvalue()
                out.seek(0)
                out.truncate(0)

    headers = {"Content-Disposition": 'attachment; filename="trades_export.csv"'}
    return StreamingResponse(iter_rows(), media_type="text/csv", headers=headers)


@app.get("/settings/backup.json")
def backup_dataset(account_id: int = 1) -> dict:
    with session_scope() as s:
        trades = s.execute(select(Trade).where(Trade.account_id == account_id).order_by(Trade.entry_date.asc())).scalars().all()
        assets = s.execute(select(Asset).where(Asset.account_id == account_id).order_by(Asset.updated_at.asc())).scalars().all()
        psychology = s.execute(select(PsychologyEntry).where(PsychologyEntry.account_id == account_id).order_by(PsychologyEntry.at.asc())).scalars().all()
        lessons = s.execute(select(Lesson).join(Trade).where(Trade.account_id == account_id).order_by(Lesson.updated_at.asc())).scalars().all()
        cash_txs = s.execute(select(CashTransaction).where(CashTransaction.account_id == account_id).order_by(CashTransaction.at.asc())).scalars().all()
        payload = {
            "generated_at": datetime.utcnow().isoformat(),
            "trades": [_to_trade_read(t).model_dump() for t in trades],
            "assets": [_to_asset_read(a).model_dump() for a in assets],
            "psychology_entries": [_to_psy_read(p).model_dump() for p in psychology],
            "lessons": [_to_lesson_read(x).model_dump() for x in lessons],
            "cash_transactions": [
                CashTxRead(
                    id=r.id,
                    amount=r.amount,
                    tx_type=r.tx_type,
                    trade_id=r.trade_id,
                    symbol=r.symbol,
                    at=r.at,
                    note=r.note,
                ).model_dump()
                for r in cash_txs
            ],
        }
        return jsonable_encoder(payload)


@app.post("/settings/clear")
def clear_dataset(account_id: int = 1) -> dict:
    with session_scope() as s:
        s.execute(delete(PsychologyEntry).where(PsychologyEntry.account_id == account_id))
        s.execute(delete(Lesson).where(Lesson.trade_id.in_(select(Trade.id).where(Trade.account_id == account_id))))
        s.execute(delete(CashTransaction).where(CashTransaction.account_id == account_id))
        s.execute(delete(Trade).where(Trade.account_id == account_id))
        s.execute(delete(Asset).where(Asset.account_id == account_id))
        return {"status": "cleared"}


@app.post("/settings/restore")
async def restore_dataset(file: UploadFile, account_id: int = 1):
    content = await file.read()
    data = json.loads(content)
    
    with session_scope() as s:
        # Clear existing
        s.execute(delete(PsychologyEntry).where(PsychologyEntry.account_id == account_id))
        s.execute(delete(Lesson).where(Lesson.trade_id.in_(select(Trade.id).where(Trade.account_id == account_id))))
        s.execute(delete(CashTransaction).where(CashTransaction.account_id == account_id))
        s.execute(delete(Trade).where(Trade.account_id == account_id))
        s.execute(delete(Asset).where(Asset.account_id == account_id))
        s.flush()

        old_to_new_trade_id = {}

        # 1. Restore Trades
        for t_data in data.get("trades", []):
            old_id = t_data.pop("id", None)
            t_data.pop("created_at", None)
            t_data.pop("updated_at", None)
            t = Trade(**t_data, account_id=account_id)
            s.add(t)
            s.flush()
            if old_id:
                old_to_new_trade_id[old_id] = t.id

        # 2. Restore Assets
        for a_data in data.get("assets", []):
            a_data.pop("id", None)
            a_data.pop("created_at", None)
            a_data.pop("updated_at", None)
            s.add(Asset(**a_data, account_id=account_id))

        # 3. Restore Cash Transactions
        for c_data in data.get("cash_transactions", []):
            c_data.pop("id", None)
            old_tid = c_data.get("trade_id")
            if old_tid and old_tid in old_to_new_trade_id:
                c_data["trade_id"] = old_to_new_trade_id[old_tid]
            s.add(CashTransaction(**c_data, account_id=account_id))

        # 4. Restore Psychology
        for p_data in data.get("psychology_entries", []):
            p_data.pop("id", None)
            old_tid = p_data.get("trade_id")
            if old_tid and old_tid in old_to_new_trade_id:
                p_data["trade_id"] = old_to_new_trade_id[old_tid]
            s.add(PsychologyEntry(**p_data, account_id=account_id))

        # 5. Restore Lessons
        for l_data in data.get("lessons", []):
            l_data.pop("id", None)
            l_data.pop("created_at", None)
            l_data.pop("updated_at", None)
            old_tid = l_data.get("trade_id")
            if old_tid and old_tid in old_to_new_trade_id:
                l_data["trade_id"] = old_to_new_trade_id[old_tid]
                s.add(Lesson(**l_data))

        return {"status": "restored", "trades": len(old_to_new_trade_id)}


@app.post("/trades/{trade_id}/screenshot", response_model=TradeRead)
async def upload_trade_screenshot(trade_id: int, file: UploadFile = File(...)) -> TradeRead:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in [".png", ".jpg", ".jpeg", ".webp"]:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    with session_scope() as s:
        t = s.get(Trade, trade_id)
        if not t:
            raise HTTPException(status_code=404, detail="Trade not found")

        base_dir = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
        media_dir = base_dir / "media" / "screenshots"
        media_dir.mkdir(parents=True, exist_ok=True)

        filename = f"{trade_id}_{uuid.uuid4().hex}{ext}"
        dst = media_dir / filename

        content = await file.read()
        dst.write_bytes(content)

        rel = str(dst.relative_to(base_dir)).replace("\\", "/")
        t.screenshot_path = rel
        s.add(t)
        s.flush()
        s.refresh(t)
        return _to_trade_read(t)


@app.delete("/trades/{trade_id}/screenshot", response_model=TradeRead)
def delete_trade_screenshot(trade_id: int) -> TradeRead:
    base_dir = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    with session_scope() as s:
        t = s.get(Trade, trade_id)
        if not t:
            raise HTTPException(status_code=404, detail="Trade not found")
        if t.screenshot_path:
            try:
                rel = (t.screenshot_path or "").replace("/", os.sep)
                fp = (base_dir / rel).resolve()
                if fp.is_file() and str(fp).startswith(str(base_dir.resolve())):
                    fp.unlink()
            except OSError:
                pass
        t.screenshot_path = None
        s.add(t)
        s.flush()
        s.refresh(t)
        return _to_trade_read(t)


def _to_psy_read(p: PsychologyEntry) -> PsychologyRead:
    return PsychologyRead(
        id=p.id,
        state=p.state,
        intensity=p.intensity,
        at=p.at,
        trade_id=p.trade_id,
        notes=p.notes,
    )


@app.get("/psychology", response_model=list[PsychologyRead])
def list_psychology(limit: int = 200, offset: int = 0) -> list[PsychologyRead]:
    with session_scope() as s:
        rows = (
            s.execute(select(PsychologyEntry).order_by(PsychologyEntry.at.desc()).limit(limit).offset(offset))
            .scalars()
            .all()
        )
        return [_to_psy_read(p) for p in rows]


@app.post("/psychology", response_model=PsychologyRead)
def create_psychology(payload: PsychologyCreate) -> PsychologyRead:
    with session_scope() as s:
        if payload.trade_id is not None:
            if not s.get(Trade, payload.trade_id):
                raise HTTPException(status_code=400, detail="trade_id not found")
        p = PsychologyEntry(**payload.model_dump())
        s.add(p)
        s.flush()
        s.refresh(p)
        return _to_psy_read(p)


@app.patch("/psychology/{entry_id}", response_model=PsychologyRead)
def update_psychology(entry_id: int, payload: PsychologyUpdate) -> PsychologyRead:
    with session_scope() as s:
        p = s.get(PsychologyEntry, entry_id)
        if not p:
            raise HTTPException(status_code=404, detail="Psychology entry not found")
        data = payload.model_dump(exclude_unset=True)
        if "trade_id" in data and data["trade_id"] is not None:
            if not s.get(Trade, data["trade_id"]):
                raise HTTPException(status_code=400, detail="trade_id not found")
        for k, v in data.items():
            setattr(p, k, v)
        s.add(p)
        s.flush()
        s.refresh(p)
        return _to_psy_read(p)


@app.delete("/psychology/{entry_id}")
def delete_psychology(entry_id: int) -> dict:
    with session_scope() as s:
        p = s.get(PsychologyEntry, entry_id)
        if not p:
            raise HTTPException(status_code=404, detail="Psychology entry not found")
        s.delete(p)
        return {"deleted": True}


@app.get("/psychology/summary", response_model=list[PsychologySummaryRow])
def psychology_summary() -> list[PsychologySummaryRow]:
    with session_scope() as s:
        entries = s.execute(select(PsychologyEntry)).scalars().all()
        if not entries:
            return []

        trade_ids = {e.trade_id for e in entries if e.trade_id is not None}
        trades_by_id = {}
        if trade_ids:
            trades = s.execute(select(Trade).where(Trade.id.in_(trade_ids))).scalars().all()
            trades_by_id = {t.id: t for t in trades}

        rows: list[PsychologySummaryRow] = []
        for state in PsychologyState:
            related = [e for e in entries if e.state == state]
            if not related:
                continue
            pnls: list[float] = []
            wins = 0
            counted = 0
            for e in related:
                if e.trade_id is None:
                    continue
                t = trades_by_id.get(e.trade_id)
                if not t:
                    continue
                pnl = calc_pnl(t)
                if pnl is None:
                    continue
                pnls.append(pnl)
                counted += 1
                if pnl > 0:
                    wins += 1
            avg_pnl = (sum(pnls) / len(pnls)) if pnls else None
            win_rate = (wins / counted * 100.0) if counted else None
            rows.append(PsychologySummaryRow(state=state, count=len(related), avg_pnl=avg_pnl, win_rate=win_rate))
        return rows


# Optional background scheduler to refresh fundamentals periodically (requires apscheduler)
try:
    from apscheduler.schedulers.background import BackgroundScheduler
except Exception:
    BackgroundScheduler = None


@app.on_event("startup")
def startup_event():
    # Ensure all tables exist (idempotent — safe to run every startup)
    from .db import engine as _engine
    Base.metadata.create_all(bind=_engine)

    if BackgroundScheduler is None:
        return
    try:
        scheduler = BackgroundScheduler()

        def refresh_all_job():
            with session_scope() as s:
                try:
                    syms = set()
                    syms.update([x for x in s.execute(select(StockMetrics.symbol)).scalars().all() if x])
                    syms.update([x for x in s.execute(select(Asset.symbol)).scalars().all() if x])
                    syms.update([x for x in s.execute(select(Trade.symbol)).scalars().all() if x])
                    for sym in syms:
                        try:
                            _refresh_fundamentals(s, sym)
                        except Exception:
                            pass
                except Exception:
                    pass

        scheduler.add_job(refresh_all_job, "interval", hours=24, id="fund_refresh_all", next_run_time=datetime.utcnow() + timedelta(seconds=30))
        scheduler.start()
        app.state.scheduler = scheduler
    except Exception:
        pass


@app.on_event("shutdown")
def stop_background_scheduler():
    sched = getattr(app.state, "scheduler", None)
    if sched:
        try:
            sched.shutdown(wait=False)
        except Exception:
            pass


@app.get("/insights")
def insights() -> dict:
    """
    Lightweight, deterministic "AI coach" insights based on your data.
    Returns: list of insight cards + supporting aggregates.
    """
    with session_scope() as s:
        trades = s.execute(select(Trade)).scalars().all()
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

        # Long vs Short
        def summarize(ts: list[Trade]) -> dict:
            pnls = [calc_pnl(t) or 0.0 for t in ts]
            count = len(pnls)
            wins = sum(1 for p in pnls if p > 0)
            return {
                "count": count,
                "total": sum(pnls),
                "avg": (sum(pnls) / count) if count else 0.0,
                "win_rate": (wins / count) if count else 0.0,
            }

        longs = [t for t in closed if t.trade_type == TradeType.long]
        shorts = [t for t in closed if t.trade_type == TradeType.short]
        s_long = summarize(longs)
        s_short = summarize(shorts)
        if s_long["count"] >= 5 or s_short["count"] >= 5:
            better = "Long" if s_long["avg"] >= s_short["avg"] else "Short"
            insights_list.append(
                {
                    "title": f"You perform better in {better} trades",
                    "severity": "info",
                    "detail": f"Avg PnL — Long: {s_long['avg']:.2f} ({pct(s_long['win_rate'])}%), Short: {s_short['avg']:.2f} ({pct(s_short['win_rate'])}%).",
                }
            )

        # Strategy performance
        by_strategy: dict[str, list[float]] = {}
        for t in closed:
            key = (t.strategy_used or "").strip() or "Unspecified"
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

        # Losses by hour (exit hour)
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

        # Psychology (top state by avg pnl)
        entries = s.execute(select(PsychologyEntry)).scalars().all()
        if entries:
            trade_ids = {e.trade_id for e in entries if e.trade_id is not None}
            trades_by_id = {}
            if trade_ids:
                trows = s.execute(select(Trade).where(Trade.id.in_(trade_ids))).scalars().all()
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


def _to_lesson_read(x: Lesson) -> LessonRead:
    return LessonRead(
        id=x.id,
        title=x.title,
        category=x.category,
        tags=x.tags,
        trade_id=x.trade_id,
        content=x.content,
        created_at=x.created_at,
        updated_at=x.updated_at,
    )


@app.get("/lessons", response_model=list[LessonRead])
def list_lessons(limit: int = 200, offset: int = 0, q: str | None = None, category: LessonCategory | None = None) -> list[LessonRead]:
    with session_scope() as s:
        stmt = select(Lesson).order_by(Lesson.updated_at.desc()).limit(limit).offset(offset)
        # lightweight filters in python for SQLite simplicity
        rows = s.execute(stmt).scalars().all()
        if category is not None:
            rows = [x for x in rows if x.category == category]
        if q:
            qq = q.strip().lower()
            rows = [
                x
                for x in rows
                if qq in (x.title or "").lower()
                or qq in (x.content or "").lower()
                or qq in ((x.tags or "").lower())
            ]
        return [_to_lesson_read(x) for x in rows]


@app.post("/lessons", response_model=LessonRead)
def create_lesson(payload: LessonCreate) -> LessonRead:
    with session_scope() as s:
        if payload.trade_id is not None and not s.get(Trade, payload.trade_id):
            raise HTTPException(status_code=400, detail="trade_id not found")
        x = Lesson(**payload.model_dump())
        s.add(x)
        s.flush()
        s.refresh(x)
        return _to_lesson_read(x)


@app.patch("/lessons/{lesson_id}", response_model=LessonRead)
def update_lesson(lesson_id: int, payload: LessonUpdate) -> LessonRead:
    with session_scope() as s:
        x = s.get(Lesson, lesson_id)
        if not x:
            raise HTTPException(status_code=404, detail="Lesson not found")
        data = payload.model_dump(exclude_unset=True)
        if "trade_id" in data and data["trade_id"] is not None and not s.get(Trade, data["trade_id"]):
            raise HTTPException(status_code=400, detail="trade_id not found")
        for k, v in data.items():
            setattr(x, k, v)
        s.add(x)
        s.flush()
        s.refresh(x)
        return _to_lesson_read(x)


@app.delete("/lessons/{lesson_id}")
def delete_lesson(lesson_id: int) -> dict:
    with session_scope() as s:
        x = s.get(Lesson, lesson_id)
        if not x:
            raise HTTPException(status_code=404, detail="Lesson not found")
        s.delete(x)
        return {"deleted": True}


def _read_ohlcv_csv(upload: UploadFile) -> pd.DataFrame:
    if not (upload.filename or "").lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file")
    raw = upload.file.read()
    try:
        text = raw.decode("utf-8-sig")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode CSV: {e}") from e
    df = pd.read_csv(io.StringIO(text))
    cols = {c.lower().strip(): c for c in df.columns}
    required = ["date", "open", "high", "low", "close", "volume"]
    missing = [c for c in required if c not in cols]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing columns: {', '.join(missing)}")
    df = df[[cols["date"], cols["open"], cols["high"], cols["low"], cols["close"], cols["volume"]]].copy()
    df.columns = ["date", "open", "high", "low", "close", "volume"]
    df["date"] = pd.to_datetime(df["date"], utc=True, errors="coerce")
    for c in ["open", "high", "low", "close", "volume"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=["date", "close"]).sort_values("date").reset_index(drop=True)
    return df


def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi


def _ema(s: pd.Series, span: int) -> pd.Series:
    return s.ewm(span=span, adjust=False).mean()


@app.post("/quant/indicators")
async def quant_indicators(
    file: UploadFile = File(...),
    rsi_period: int = 14,
    macd_fast: int = 12,
    macd_slow: int = 26,
    macd_signal: int = 9,
    sma_1: int = 20,
    sma_2: int = 50,
    bb_period: int = 20,
    bb_std: float = 2.0,
) -> dict:
    """
    Upload OHLCV CSV and compute indicators (pandas/numpy).
    Required columns: date, open, high, low, close, volume
    """
    df = _read_ohlcv_csv(file)
    if len(df) < 5:
        raise HTTPException(status_code=400, detail="Not enough rows to compute indicators")

    close = df["close"]
    vol = df["volume"].fillna(0.0)

    df["rsi"] = _rsi(close, rsi_period)

    ema_fast = _ema(close, macd_fast)
    ema_slow = _ema(close, macd_slow)
    df["macd"] = ema_fast - ema_slow
    df["macd_signal"] = _ema(df["macd"], macd_signal)
    df["macd_hist"] = df["macd"] - df["macd_signal"]

    df[f"sma_{sma_1}"] = close.rolling(sma_1).mean()
    df[f"sma_{sma_2}"] = close.rolling(sma_2).mean()

    ma = close.rolling(bb_period).mean()
    sd = close.rolling(bb_period).std(ddof=0)
    df["bb_mid"] = ma
    df["bb_upper"] = ma + bb_std * sd
    df["bb_lower"] = ma - bb_std * sd

    tp = (df["high"] + df["low"] + df["close"]) / 3.0
    cum_pv = (tp * vol).cumsum()
    cum_v = vol.cumsum().replace(0, np.nan)
    df["vwap"] = cum_pv / cum_v

    out = df.tail(500).copy()
    out["date"] = out["date"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "rows": out.to_dict(orient="records"),
        "meta": {
            "count": int(len(df)),
            "tail": int(len(out)),
            "columns": list(out.columns),
        },
    }


def _to_asset_read(a: Asset) -> AssetRead:
    mv = float((a.quantity or 0.0) * (a.current_price or 0.0))
    cb = float((a.quantity or 0.0) * (a.avg_cost or 0.0))
    pnl = mv - cb
    pnl_pct = (pnl / cb * 100.0) if cb != 0 else None
    return AssetRead(
        id=a.id,
        symbol=a.symbol,
        asset_class=a.asset_class,
        quantity=a.quantity,
        avg_cost=a.avg_cost,
        current_price=a.current_price,
        notes=a.notes,
        updated_at=a.updated_at,
        market_value=mv,
        cost_basis=cb,
        unrealized_pnl=pnl,
        unrealized_pnl_pct=pnl_pct,
    )


@app.get("/assets", response_model=list[AssetRead])
def list_assets(limit: int = 500, offset: int = 0) -> list[AssetRead]:
    with session_scope() as s:
        rows = s.execute(select(Asset).order_by(Asset.updated_at.desc()).limit(limit).offset(offset)).scalars().all()
        return [_to_asset_read(a) for a in rows]


@app.post("/assets", response_model=AssetRead)
def create_asset(payload: AssetCreate) -> AssetRead:
    with session_scope() as s:
        a = Asset(**payload.model_dump())
        s.add(a)
        s.flush()
        s.refresh(a)
        return _to_asset_read(a)


@app.patch("/assets/{asset_id}", response_model=AssetRead)
def update_asset(asset_id: int, payload: AssetUpdate) -> AssetRead:
    with session_scope() as s:
        a = s.get(Asset, asset_id)
        if not a:
            raise HTTPException(status_code=404, detail="Asset not found")
        data = payload.model_dump(exclude_unset=True)
        for k, v in data.items():
            setattr(a, k, v)
        s.add(a)
        s.flush()
        s.refresh(a)
        return _to_asset_read(a)


@app.delete("/assets/{asset_id}")
def delete_asset(asset_id: int) -> dict:
    with session_scope() as s:
        a = s.get(Asset, asset_id)
        if not a:
            raise HTTPException(status_code=404, detail="Asset not found")
        s.delete(a)
        return {"deleted": True}


@app.get("/portfolio/summary", response_model=PortfolioSummary)
def portfolio_summary() -> PortfolioSummary:
    with session_scope() as s:
        assets = s.execute(select(Asset)).scalars().all()
        total = 0.0
        alloc: dict[str, float] = {c.value: 0.0 for c in AssetClass}
        for a in assets:
            mv = float((a.quantity or 0.0) * (a.current_price or 0.0))
            total += mv
            alloc[a.asset_class.value] = alloc.get(a.asset_class.value, 0.0) + mv
        return PortfolioSummary(total_value=total, allocation=alloc)


@app.get("/portfolio/holdings", response_model=list[HoldingRow])
def portfolio_holdings() -> list[HoldingRow]:
    """
    Positions by symbol from logged trades (open quantities/cost, closed realized PnL).
    Current prices come from the Assets table when present (Stocks, matched by symbol).
    """
    with session_scope() as s:
        return _compute_holdings(s)


# --- New Analysis Endpoints ---


from .fundamentals import refresh_fundamentals
from .engine_technicals import refresh_technicals
from .engine_quant import refresh_quant
from .models import TechnicalMetrics, QuantitativeMetrics


@app.get('/analysis/fundamentals/{symbol}')
def get_fundamentals(symbol: str, refresh: bool = False):
    """Get fundamental analysis for a symbol. Cache-first; refresh on demand."""
    sym = symbol.strip().upper()
    with session_scope() as s:
        if not refresh:
            m = s.execute(
                select(StockMetrics).where(StockMetrics.symbol == sym)
                .order_by(StockMetrics.fetched_at.desc())
            ).scalars().first()
            if m:
                return {
                    'symbol': m.symbol,
                    'current_price': m.current_price,
                    'market_cap': m.market_cap,
                    'eps': m.eps,
                    'pe_ratio': m.pe_ratio,
                    'peg_ratio': m.peg_ratio,
                    'ev_ebitda': m.ev_ebitda,
                    'fair_value_pe': m.fair_value_pe,
                    'fair_value_peg': m.fair_value_peg,
                    'revenue_growth': m.revenue_growth,
                    'eps_growth': m.eps_growth,
                    'roe': m.roe,
                    'net_profit_margin': m.net_profit_margin,
                    'debt_to_equity': m.debt_to_equity,
                    'current_ratio': m.current_ratio,
                    'free_cash_flow': m.free_cash_flow,
                    'fcf_yield': m.fcf_yield,
                    'fundamental_score': m.fundamental_score,
                    'fetched_at': m.fetched_at,
                    'provider': m.provider,
                }

        # Fetch / Refresh from provider
        try:
            refresh_fundamentals(s, sym)
            m = s.execute(
                select(StockMetrics).where(StockMetrics.symbol == sym)
                .order_by(StockMetrics.fetched_at.desc())
            ).scalars().first()
            if m:
                return {
                    'symbol': m.symbol,
                    'current_price': m.current_price,
                    'market_cap': m.market_cap,
                    'eps': m.eps,
                    'pe_ratio': m.pe_ratio,
                    'peg_ratio': m.peg_ratio,
                    'ev_ebitda': m.ev_ebitda,
                    'fair_value_pe': m.fair_value_pe,
                    'fair_value_peg': m.fair_value_peg,
                    'revenue_growth': m.revenue_growth,
                    'eps_growth': m.eps_growth,
                    'roe': m.roe,
                    'net_profit_margin': m.net_profit_margin,
                    'debt_to_equity': m.debt_to_equity,
                    'current_ratio': m.current_ratio,
                    'free_cash_flow': m.free_cash_flow,
                    'fcf_yield': m.fcf_yield,
                    'fundamental_score': m.fundamental_score,
                    'fetched_at': m.fetched_at,
                    'provider': m.provider,
                }
            raise HTTPException(status_code=404, detail='No fundamentals data available')
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f'Failed to fetch fundamentals: {e}')


@app.get('/analysis/technical/{symbol}')
def get_technical(symbol: str, period: str = '1y', interval: str = '1d', refresh: bool = False):
    """Get technical indicators for a symbol. Cache-first; refresh on demand."""
    sym = symbol.strip().upper()
    with session_scope() as s:
        if not refresh:
            m = s.execute(
                select(TechnicalMetrics).where(TechnicalMetrics.symbol == sym)
                .order_by(TechnicalMetrics.fetched_at.desc())
            ).scalars().first()
            if m:
                payload = json.loads(m.payload) if isinstance(m.payload, str) else (m.payload or {})
                return {
                    'symbol': m.symbol,
                    'score': m.score,
                    'signal': m.signal,
                    'payload': payload,
                    'fetched_at': m.fetched_at,
                }

        try:
            result = refresh_technicals(s, sym)
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=f'Failed to fetch technical data: {e}')


@app.get('/analysis/smart-money/{symbol}')
def get_smart_money(symbol: str, period: str = '6m', interval: str = '1d', refresh: bool = False):
    """Get smart-money / quantitative flow indicators for a symbol."""
    sym = symbol.strip().upper()
    with session_scope() as s:
        if not refresh:
            m = s.execute(
                select(QuantitativeMetrics).where(QuantitativeMetrics.symbol == sym)
                .order_by(QuantitativeMetrics.fetched_at.desc())
            ).scalars().first()
            if m:
                payload = json.loads(m.payload) if isinstance(m.payload, str) else (m.payload or {})
                return {
                    'symbol': m.symbol,
                    'score': m.score,
                    'signal': m.signal,
                    'payload': payload,
                    'fetched_at': m.fetched_at,
                }

        try:
            result = refresh_quant(s, sym)
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=f'Failed to fetch smart-money data: {e}')


@app.get('/analysis/quant/{symbol}')
def get_quant_live(symbol: str, period: str = '6m', interval: str = '1d', refresh: bool = False):
    """Alias for smart-money — live quantitative analysis by ticker symbol."""
    return get_smart_money(symbol=symbol, period=period, interval=interval, refresh=refresh)
