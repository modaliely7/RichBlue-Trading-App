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
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

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
from .engine_quant import refresh_quant
from .engine_technicals import refresh_technicals
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
    Strategy,
    trade_strategy_table,
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
    PerformanceAnalyticsResponse,
    DividendRequest,
    StrategyRead,
    StrategyCreate,
    StrategyUpdate,
)
from .data_providers import fetch_price_and_fundamentals_yfinance, fetch_price_history_yfinance, fetch_fallback
import json

app = FastAPI(title="Trading Analytics API", version="0.1.0")

logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "*"
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

_API_DATA_BASE = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
app.mount("/static", StaticFiles(directory=str(_API_DATA_BASE)), name="static")


def _to_strategy_read(s: Strategy) -> StrategyRead:
    return StrategyRead(
        id=s.id,
        account_id=s.account_id,
        name=s.name,
        color=s.color,
        created_at=s.created_at,
    )


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
        strategies=[_to_strategy_read(s) for s in t.strategies],
    )


def tx_at_date(at: datetime | date) -> date:
    if hasattr(at, "date"):
        return at.date()
    return at

@app.get("/health")
def health() -> dict:
    return {"ok": True, "ts": datetime.utcnow().isoformat()}


# --- ACCOUNTS ---

@app.get("/analysis/technical/{symbol}")
def get_technical(symbol: str, period: str = "1y", interval: str = "1d"):
    with session_scope() as s:
        # We could cache technicals here, but for now we always refresh or fetch recent
        return refresh_technicals(s, symbol)

@app.get("/analysis/quant/{symbol}")
def get_quant(symbol: str, period: str = "6m", interval: str = "1d"):
    with session_scope() as s:
        return refresh_quant(s, symbol)

@app.get("/analysis/smart-money/{symbol}")
def get_smart_money(symbol: str, period: str = "6m", interval: str = "1d"):
    with session_scope() as s:
        return refresh_quant(s, symbol)

@app.get("/accounts", response_model=list[AccountRead])
def list_accounts():
    with session_scope() as s:
        # Ensure at least one account exists
        accs = s.execute(select(Account).where(Account.is_active == True)).scalars().all()
        if not accs:
            default = Account(name="Main", account_type=AccountType.real, is_active=True)
            s.add(default)
            s.commit()
            accs = [default]

        # Expunge all to avoid detached errors
        for a in accs:
            s.expunge(a)
        return accs


@app.post("/accounts", response_model=AccountRead)
def create_account(req: AccountCreate):
    with session_scope() as s:
        active_count = s.execute(select(func.count()).where(Account.is_active == True)).scalar_one()
        if active_count >= 3:
            raise HTTPException(status_code=400, detail="Maximum of 3 accounts allowed.")
        acc = Account(name=req.name, account_type=AccountType.real)
        s.add(acc)
        s.commit()
        s.refresh(acc)
        s.expunge(acc)
        return acc


@app.get("/accounts/{account_id}", response_model=AccountRead)
def get_account(account_id: int):
    with session_scope() as s:
        acc = s.get(Account, account_id)
        if not acc or not acc.is_active:
            raise HTTPException(status_code=404, detail="Account not found")
        s.expunge(acc)
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
        s.expunge(acc)
        return acc


@app.delete("/accounts/{account_id}")
def delete_account(account_id: int):
    with session_scope() as s:
        acc = s.get(Account, account_id)
        if not acc or not acc.is_active:
            raise HTTPException(status_code=404, detail="Account not found")
        # Protect the main account (the one with the lowest ID among active accounts)
        min_id = s.execute(select(func.min(Account.id)).where(Account.is_active == True)).scalar_one()
        if account_id == min_id:
            raise HTTPException(status_code=400, detail="Cannot delete the main account.")
        # Soft delete
        acc.is_active = False
        s.commit()
        return {"deleted": True}


# --- Strategy Management ---

@app.get("/strategies", response_model=list[StrategyRead])
def list_strategies(account_id: int = 1):
    with session_scope() as s:
        rows = s.execute(select(Strategy).where(Strategy.account_id == account_id).order_by(Strategy.name.asc())).scalars().all()
        return [_to_strategy_read(r) for r in rows]


@app.post("/strategies", response_model=StrategyRead)
def create_strategy(payload: StrategyCreate, account_id: int = 1):
    with session_scope() as s:
        r = Strategy(**payload.model_dump(), account_id=account_id)
        s.add(r)
        s.flush()
        s.refresh(r)
        return _to_strategy_read(r)


@app.put("/strategies/{strategy_id}", response_model=StrategyRead)
def update_strategy(strategy_id: int, payload: StrategyUpdate):
    with session_scope() as s:
        r = s.get(Strategy, strategy_id)
        if not r:
            raise HTTPException(status_code=404, detail="Strategy not found")
        data = payload.model_dump(exclude_unset=True)
        for k, v in data.items():
            setattr(r, k, v)
        s.commit()
        s.refresh(r)
        return _to_strategy_read(r)


@app.delete("/strategies/{strategy_id}")
def delete_strategy(strategy_id: int):
    with session_scope() as s:
        r = s.get(Strategy, strategy_id)
        if not r:
            raise HTTPException(status_code=404, detail="Strategy not found")
        s.delete(r)
        return {"deleted": True}


@app.get("/performance/analytics", response_model=PerformanceAnalyticsResponse)
def performance_analytics(account_id: int = 1, start: str | None = None, end: str | None = None):
    """
    Advanced performance breakdowns from closed trades (uses exit_date when available).
    """
    with session_scope() as s:
        trades = s.execute(select(Trade).where(Trade.account_id == account_id)).scalars().all()
        closed = [t for t in trades if t.exit_price is not None and calc_pnl(t) is not None]

        def trade_dt(t: Trade) -> datetime:
            return t.exit_date or t.entry_date

        def parse_iso(x: str | None) -> datetime | None:
            if not x:
                return None
            try:
                return datetime.fromisoformat(x.replace("Z", "+00:00"))
            except:
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

        by_month = group(lambda t: trade_dt(t).strftime("%Y-%m"))
        by_month.sort(key=lambda r: r["key"]) # sort chronologically
        
        by_dow = group(lambda t: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][trade_dt(t).weekday()])
        by_hour = group(lambda t: f"{trade_dt(t).hour:02d}:00")
        by_strategy = group(lambda t: (t.strategy_used or "").strip() or "Unspecified")
        by_market = group(lambda t: t.market.value)
        by_type = group(lambda t: t.trade_type.value)

        best_hour = next((r for r in by_hour if r["count"] >= 3), None)
        worst_hour = next((r for r in reversed(by_hour) if r["count"] >= 3), None) if by_hour else None

        overall = summarize_pnls([calc_pnl(t) or 0.0 for t in closed])
        
        from .analytics import calc_advanced_metrics
        advanced = calc_advanced_metrics(closed)

        res = {
            "overall": overall,
            "closed_trades": len(closed),
            "by_month": by_month,
            "by_day_of_week": by_dow,
            "by_hour": by_hour,
            "by_strategy": by_strategy,
            "by_market": by_market,
            "by_trade_type": by_type,
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


@app.get("/reports/performance.pdf")
def performance_report_pdf(account_id: int = 1, start: str | None = None, end: str | None = None) -> Response:
    analytics = performance_analytics(account_id=account_id, start=start, end=end)
    adv = analytics.get("advanced", {})
    overall = analytics.get("overall", {}) or {}
    closed_trades = analytics.get("closed_trades", 0)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()
    
    # Custom Styles
    title_style = ParagraphStyle(
        'ReportTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.hexColor("#0ea5e9"),
        spaceAfter=12,
        alignment=1 # Center
    )
    section_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.hexColor("#1e293b"),
        spaceBefore=16,
        spaceAfter=8,
        borderPadding=5,
        borderWidth=0,
        backColor=colors.hexColor("#f1f5f9")
    )
    metric_label_style = ParagraphStyle('MetricLabel', parent=styles['Normal'], fontSize=10, textColor=colors.grey)
    metric_value_style = ParagraphStyle('MetricValue', parent=styles['Normal'], fontSize=12, fontWeight='Bold')

    elements = []
    
    # Header
    elements.append(Paragraph("Performance Report", title_style))
    period_str = f"{start or 'All Time'} to {end or 'Present'}"
    elements.append(Paragraph(f"Period: {period_str}", styles['Normal']))
    elements.append(Paragraph(f"Generated: {datetime.now(UTC).strftime('%Y-%m-%d %H:%M UTC')}", styles['Normal']))
    elements.append(Spacer(1, 20))

    # KPI Grid
    kpi_data = [
        [Paragraph("Closed Trades", metric_label_style), Paragraph("Win Rate", metric_label_style), Paragraph("Profit Factor", metric_label_style)],
        [Paragraph(str(closed_trades), metric_value_style), Paragraph(f"{adv.get('win_rate', 0.0):.1f}%", metric_value_style), Paragraph(f"{adv.get('profit_factor', 0.0):.2f}", metric_value_style)],
        [Paragraph("Total Net PnL", metric_label_style), Paragraph("Avg Win", metric_label_style), Paragraph("Avg Loss", metric_label_style)],
        [Paragraph(f"{overall.get('total', 0.0):.2f}", metric_value_style), Paragraph(f"{adv.get('avg_win_amount', 0.0):.2f}", metric_value_style), Paragraph(f"{adv.get('avg_loss_amount', 0.0):.2f}", metric_value_style)],
    ]
    kpi_table = Table(kpi_data, colWidths=[180, 180, 180])
    kpi_table.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ]))
    elements.append(kpi_table)
    elements.append(Spacer(1, 20))

    # Top Strategies / Markets
    elements.append(Paragraph("Performance Highlights", section_style))
    highlights = []
    for h_type in ["by_strategy", "by_market"]:
        data = analytics.get(h_type, [])
        valid = [d for d in data if d.get("count", 0) >= 3]
        if valid:
            valid.sort(key=lambda x: x.get("avg", 0), reverse=True)
            label = "Strategies" if h_type == "by_strategy" else "Markets"
            best = valid[0]
            highlights.append(Paragraph(f"<b>Best {label}:</b> {best.get('key')} ({best.get('count')} trades, Avg PnL: {best.get('avg'):.2f})", styles['Normal']))
    
    if highlights:
        for h in highlights:
            elements.append(h)
    else:
        elements.append(Paragraph("Not enough data for highlights yet (minimum 3 trades per category).", styles['Italic']))
    
    elements.append(Spacer(1, 20))

    # Recent Trades Table
    elements.append(Paragraph("Trade Log", section_style))
    with session_scope() as s:
        stmt = select(Trade).where(Trade.account_id == account_id).order_by(Trade.entry_date.desc()).limit(50)
        trades = s.execute(stmt).scalars().all()
        
        table_data = [["Symbol", "Type", "Entry", "Exit", "PnL", "Return %"]]
        for t in trades:
            pnl = calc_pnl(t)
            ret = calc_return_pct(t)
            pnl_str = f"{pnl:.2f}" if pnl is not None else "-"
            ret_str = f"{ret:.2f}%" if ret is not None else "-"
            
            row = [
                t.symbol,
                t.trade_type.value,
                t.entry_date.strftime("%Y-%m-%d"),
                t.exit_date.strftime("%Y-%m-%d") if t.exit_date else "-",
                pnl_str,
                ret_str
            ]
            table_data.append(row)
            
        t = Table(table_data, colWidths=[80, 60, 100, 100, 80, 100])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.hexColor("#f8fafc")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.hexColor("#64748b")),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.hexColor("#e2e8f0")),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        
        # Color PnL column
        for i, row_data in enumerate(table_data[1:], 1):
            try:
                pnl_val = float(row_data[4])
                if pnl_val > 0:
                    t.setStyle(TableStyle([('TEXTCOLOR', (4, i), (4, i), colors.hexColor("#10b981"))]))
                elif pnl_val < 0:
                    t.setStyle(TableStyle([('TEXTCOLOR', (4, i), (4, i), colors.hexColor("#f43f5e"))]))
            except:
                pass

        elements.append(t)

    # Build PDF
    doc.build(elements)
    buf.seek(0)
    
    filename = f"trading_report_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(buf.getvalue(), media_type="application/pdf", headers=headers)


@app.get("/reports/performance.xlsx")
def performance_report_excel(account_id: int = 1, start: str | None = None, end: str | None = None) -> Response:
    with session_scope() as s:
        trades = s.execute(select(Trade).where(Trade.account_id == account_id)).scalars().all()
        data = []
        for t in trades:
            data.append({
                "ID": t.id,
                "Symbol": t.symbol,
                "Market": t.market.value,
                "Type": t.trade_type.value,
                "Entry Price": t.entry_price,
                "Exit Price": t.exit_price,
                "Size": t.position_size,
                "PnL": calc_pnl(t),
                "Return %": calc_return_pct(t),
                "Entry Date": t.entry_date.strftime("%Y-%m-%d %H:%M"),
                "Exit Date": t.exit_date.strftime("%Y-%m-%d %H:%M") if t.exit_date else "",
                "Fees": (t.fees or 0) + (t.exit_fees or 0),
                "Strategy": t.strategy_used,
                "Notes": t.notes
            })
        
        df = pd.DataFrame(data)
        
        # Filter by date if provided
        if start:
            s_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
            df["Entry Date Dt"] = pd.to_datetime(df["Entry Date"])
            df = df[df["Entry Date Dt"] >= s_dt]
        if end:
            e_dt = datetime.fromisoformat(end.replace("Z", "+00:00"))
            df["Entry Date Dt"] = pd.to_datetime(df["Entry Date"])
            df = df[df["Entry Date Dt"] <= e_dt]
        
        if "Entry Date Dt" in df.columns:
            df = df.drop(columns=["Entry Date Dt"])

        if df.empty:
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                pd.DataFrame([{"Message": "No trades found for this period"}]).to_excel(writer, index=False)
            output.seek(0)
            return Response(output.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": 'attachment; filename="report_empty.xlsx"'})

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            df.to_excel(writer, index=False, sheet_name='Trades')
            
            # Auto-adjust column widths
            worksheet = writer.sheets['Trades']
            for i, col in enumerate(df.columns):
                column_len = max(df[col].astype(str).map(len).max(), len(col)) + 2
                worksheet.set_column(i, i, column_len)
        
        output.seek(0)
        filename = f"performance_report_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        return Response(output.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)


@app.post("/cash/dividend")
def record_dividend(payload: DividendRequest, account_id: int = 1):
    with session_scope() as s:
        # If trade_id is provided, verify it belongs to the account
        trade = None
        if payload.trade_id:
            trade = s.execute(select(Trade).where(Trade.id == payload.trade_id, Trade.account_id == account_id)).scalars().first()
            if not trade:
                raise HTTPException(status_code=404, detail="Trade not found")

        amount_val = payload.amount
        if payload.is_stock_dividend:
            if not trade:
                raise HTTPException(status_code=400, detail="Stock dividend requires a linked trade")
            # Increase position size
            trade.position_size += payload.amount
            # Cash impact is zero for stock dividends
            amount_val = 0.0
            note = payload.note or f"Stock Dividend ({payload.amount} shares) for {payload.symbol}"
        else:
            note = payload.note or f"Cash Dividend for {payload.symbol}"

        tx = CashTransaction(
            account_id=account_id,
            amount=amount_val,
            tx_type=CashTxType.dividend,
            symbol=payload.symbol.strip().upper(),
            trade_id=payload.trade_id,
            at=payload.at or datetime.now(UTC),
            note=note
        )
        s.add(tx)
        return {"status": "success", "new_size": trade.position_size if trade else None}


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
    trade_id: int | None = None,
    is_stock_dividend: bool = False,
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
            cost = float((t.entry_price or 0.0) * qty) + float(t.fees or 0.0)
            bucket["open_qty"] += qty
            bucket["open_cost"] += cost
            bucket["open_trades"] += 1
            # Add market type for easier filtering in overview
            bucket["market"] = t.market

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
        trades = s.execute(select(Trade).where(Trade.account_id == account_id).order_by(Trade.entry_date.asc())).scalars().all()
        holdings = _compute_holdings(s, account_id)
        txs = s.execute(select(CashTransaction).where(CashTransaction.account_id == account_id).order_by(CashTransaction.at.asc())).scalars().all()
        end_day = datetime.now(UTC).date()

        # Build a mapping of current prices for liquidation/unrealized calculations
        assets_for_prices = s.execute(select(Asset).where(Asset.account_id == account_id)).scalars().all()
        price_by_symbol = {a.symbol.upper(): float(a.current_price or 0.0) for a in assets_for_prices if (a.symbol or "").strip()}
        
        # Deduplication symbols: If a fund is in Assets, we skip it in the Trades loop for the pie chart.
        asset_symbols = {a.symbol.upper() for a in assets_for_prices if a.asset_class == AssetClass.etfs}

        # Build fund_allocation
        funds_assets = [a for a in assets_for_prices if a.asset_class == AssetClass.etfs]
        fund_allocation = {a.symbol.upper(): float((a.quantity or 0.0) * (a.avg_cost or 0.0)) for a in funds_assets}

        stocks_cost = 0.0
        funds_from_trades_cost = 0.0
        for t in trades:
            if not trade_open_on_day(t, end_day):
                continue
            qty = float(t.position_size or 0.0)
            cost = float((t.entry_price or 0.0) * qty) + float(t.fees or 0.0)
            
            if t.market == Market.funds:
                # Deduplicate: Only add if NOT already in the Assets table
                sym = (t.symbol or "").upper()
                if sym not in asset_symbols:
                    funds_from_trades_cost += cost
                    fund_allocation[sym] = fund_allocation.get(sym, 0.0) + cost
            else:
                # Regular stocks
                stocks_cost += cost

        funds_cost = _funds_cost_from_assets(s, account_id) + funds_from_trades_cost
        assets_mv = float(stocks_cost + funds_cost)  # cost basis

        # Current market values (snapshot) for portfolio/equity computation
        stocks_mv_current = float(sum(float(h.market_value or 0.0) for h in holdings))
        funds_mv_current = float(sum(float(a.current_price or 0.0) * float(a.quantity or 0.0) for a in funds_assets))
        
        realized_total = realized_pnl_cumulative_through(trades, txs, end_day)
        unreal_total = unrealized_pnl_cumulative_through(trades, end_day, price_by_symbol)
        open_positions_count = int(sum(1 for h in holdings if (h.open_quantity or 0.0) != 0.0))

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
                price_history_cache.setdefault(sym, []).append((ds, float(r.close)))

        # Optimized Daily series generation
        labels: list[str] = []
        portfolio_value_series: list[float] = [] # Realized: Net Dep + Realized P/L
        net_dep_series: list[float] = []
        total_return_series: list[float] = [] # Realized P/L
        equity_value_series: list[float] = [] # Liquidation: Cash + Market Value
        total_pnl_series: list[float] = [] # Realized + Unrealized

        start_candidates: list[date] = []
        if txs:
            start_candidates.append(min((tx_at_date(tx.at)) for tx in txs))
        if trades:
            # trades is already sorted by entry_date.asc()
            start_candidates.append(tx_at_date(trades[0].entry_date))
        
        if start_candidates:
            start_day = min(start_candidates)
            if start_day > end_day:
                start_day = end_day
            
            # Organize events by date for iterative processing
            events_by_date: dict[date, list[tuple[str, any]]] = {}
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
            open_pos_tracker: dict[str, dict[str, float]] = {} # sym -> {qty, cost}

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
                                # Note: This assumes whole position management or that exit matches entry qty
                                # We'll just subtract what was exited
                                p["qty"] -= qty
                                # Cost basis reduction: (entry_price * exited_qty) + entry_fees
                                entry_cost_exited = float((ev.entry_price or 0.0) * qty) + float(ev.fees or 0.0)
                                p["cost"] -= entry_cost_exited
                                if p["qty"] <= 1e-9:
                                    del open_pos_tracker[sym]

                if cur.weekday() < 5:
                    day_str = cur.strftime("%Y-%m-%d")
                    
                    # Calculate daily Market Value and Unrealized PnL
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

        # Compute earnings allocation: realized P/L split by asset class
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

        # If unrealized should be included (liquidation view), add them too
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
            
        # Add Dividends to Earnings Allocation
        div_total = sum(float(tx.amount or 0.0) for tx in txs if tx.tx_type == CashTxType.dividend)
        if abs(div_total) > 1e-9:
            earnings_allocation["Dividends"] = earnings_allocation.get("Dividends", 0.0) + div_total

        # Construct response
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
            trades=[_to_trade_read(t) for t in trades],
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



@app.get("/cash/balance", response_model=CashBalanceResponse)
def cash_balance(account_id: int = 1) -> CashBalanceResponse:
    with session_scope() as s:
        return CashBalanceResponse(balance=_cash_balance(s, account_id))


@app.post("/cash/dividend")
def add_dividend(req: DividendRequest, account_id: int = 1):
    with session_scope() as s:
        at = req.at or datetime.now(UTC)
        note = req.note or f"Dividend for {req.symbol}"
        tx = _add_cash_tx(
            s,
            account_id=account_id,
            amount=req.amount,
            tx_type=CashTxType.dividend,
            at=at,
            note=note
        )
        tx.symbol = req.symbol
        s.commit()
        return {"ok": True, "balance": _cash_balance(s, account_id)}
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
        is_closed = data.get("exit_price") is not None
        if not is_closed and required_cash > 0 and _cash_balance(s, account_id) < required_cash:
            raise HTTPException(status_code=400, detail=f"Insufficient cash. Required {required_cash:.2f}.")

        strategy_ids = data.pop("strategy_ids", None)
        t = Trade(**data)
        t.account_id = account_id
        if strategy_ids:
            st_objs = s.execute(select(Strategy).where(Strategy.id.in_(strategy_ids))).scalars().all()
            t.strategies = st_objs
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

        # Apply field updates
        data = payload.model_dump(exclude_unset=True)
        strategy_ids = data.pop("strategy_ids", None)
        if strategy_ids is not None:
            st_objs = s.execute(select(Strategy).where(Strategy.id.in_(strategy_ids))).scalars().all()
            t.strategies = st_objs

        for k, v in data.items():
            setattr(t, k, v)

        # Delete ALL cash transactions linked to this trade and recreate from scratch.
        # This is the cleanest approach — avoids any delta drift in the liquidation curve.
        s.execute(delete(CashTransaction).where(CashTransaction.trade_id == trade_id))
        s.flush()

        account_id = t.account_id

        # Entry buy + entry fees
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

        # Exit sell + exit fees (only if closed)
        if t.exit_price is not None:
            _add_cash_tx(
                s,
                account_id=account_id,
                amount=float(t.exit_price) * float(t.position_size or 0.0),
                tx_type=CashTxType.trade_sell,
                at=t.exit_date or datetime.now(UTC),
                note="Trade exit (sell)",
                trade=t,
            )
            if t.exit_fees and float(t.exit_fees) > 0.0:
                _add_cash_tx(
                    s,
                    account_id=account_id,
                    amount=-float(t.exit_fees),
                    tx_type=CashTxType.fee,
                    at=t.exit_date or datetime.now(UTC),
                    note="Trade exit (fees)",
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
        strategies = s.execute(select(Strategy).where(Strategy.account_id == account_id)).scalars().all()
        payload = {
            "generated_at": datetime.utcnow().isoformat(),
            "strategies": [_to_strategy_read(s).model_dump() for s in strategies],
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
        s.execute(delete(Strategy).where(Strategy.account_id == account_id))
        # Cascade should handle trade_strategy_table if trades are deleted, but let's be safe
        s.execute(trade_strategy_table.delete().where(trade_strategy_table.c.trade_id.in_(select(Trade.id).where(Trade.account_id == account_id))))
        return {"status": "cleared"}

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/settings/restore")
async def restore_dataset(file: UploadFile, account_id: int = 1):
    content = await file.read()
    data = json.loads(content)
    
    def parse_dt(s):
        if not s: return None
        if isinstance(s, datetime): return s
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except:
            return None

    with session_scope() as s:
        # Clear existing data for this account
        s.execute(delete(PsychologyEntry).where(PsychologyEntry.account_id == account_id))
        s.execute(delete(Lesson).where(Lesson.trade_id.in_(select(Trade.id).where(Trade.account_id == account_id))))
        s.execute(delete(CashTransaction).where(CashTransaction.account_id == account_id))
        s.execute(delete(Trade).where(Trade.account_id == account_id))
        s.execute(delete(Asset).where(Asset.account_id == account_id))
        s.execute(delete(Strategy).where(Strategy.account_id == account_id))
        s.execute(trade_strategy_table.delete().where(trade_strategy_table.c.trade_id.in_(select(Trade.id).where(Trade.account_id == account_id))))
        s.flush()

        old_to_new_trade_id = {}
        old_to_new_strategy_id = {}

        # Restore Strategies
        st_objs_by_old_id = {}
        for str_data in data.get("strategies", []):
            old_id = str_data.pop("id", None)
            # Remove read-only
            str_data.pop("created_at", None)
            new_strat = Strategy(**str_data, account_id=account_id)
            s.add(new_strat)
            s.flush()
            if old_id:
                st_objs_by_old_id[old_id] = new_strat

        # 1. Restore Trades
        for t_data in data.get("trades", []):
            old_id = t_data.pop("id", None)
            strategies_data = t_data.pop("strategies", [])
            # Remove computed fields that are not in the DB model
            for extra in ["pnl", "return_pct", "risk_reward", "duration_seconds", "created_at", "updated_at"]:
                t_data.pop(extra, None)
            
            t_data["entry_date"] = parse_dt(t_data.get("entry_date"))
            t_data["exit_date"] = parse_dt(t_data.get("exit_date"))
            
            t = Trade(**t_data, account_id=account_id)
            for st_info in strategies_data:
                old_st_id = st_info.get("id")
                if old_st_id in st_objs_by_old_id:
                    t.strategies.append(st_objs_by_old_id[old_st_id])
            s.add(t)
            s.flush()
            if old_id:
                old_to_new_trade_id[old_id] = t.id

        # 2. Restore Assets
        for a_data in data.get("assets", []):
            a_data.pop("id", None)
            for extra in ["market_value", "cost_basis", "unrealized_pnl", "unrealized_pnl_pct", "created_at", "updated_at"]:
                a_data.pop(extra, None)
            a_data["updated_at"] = parse_dt(a_data.get("updated_at")) or datetime.utcnow()
            s.add(Asset(**a_data, account_id=account_id))

        # 3. Restore Cash Transactions
        for c_data in data.get("cash_transactions", []):
            c_data.pop("id", None)
            old_tid = c_data.pop("trade_id", None)
            if old_tid and old_tid in old_to_new_trade_id:
                c_data["trade_id"] = old_to_new_trade_id[old_tid]
            else:
                c_data["trade_id"] = None
            c_data["at"] = parse_dt(c_data.get("at")) or datetime.utcnow()
            s.add(CashTransaction(**c_data, account_id=account_id))

        # 4. Restore Psychology
        for p_data in data.get("psychology_entries", []):
            p_data.pop("id", None)
            old_tid = p_data.pop("trade_id", None)
            if old_tid and old_tid in old_to_new_trade_id:
                p_data["trade_id"] = old_to_new_trade_id[old_tid]
            else:
                p_data["trade_id"] = None
            p_data["at"] = parse_dt(p_data.get("at")) or datetime.utcnow()
            s.add(PsychologyEntry(**p_data, account_id=account_id))

        # 5. Restore Lessons
        for l_data in data.get("lessons", []):
            l_data.pop("id", None)
            l_data.pop("created_at", None)
            l_data.pop("updated_at", None)
            old_tid = l_data.pop("trade_id", None)
            if old_tid and old_tid in old_to_new_trade_id:
                l_data["trade_id"] = old_to_new_trade_id[old_tid]
                s.add(Lesson(**l_data))
            # Note: Lessons without a valid trade_id are skipped to keep them account-specific via trades

        s.commit()
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
def list_psychology(account_id: int = 1, limit: int = 200, offset: int = 0) -> list[PsychologyRead]:
    with session_scope() as s:
        rows = (
            s.execute(
                select(PsychologyEntry)
                .where(PsychologyEntry.account_id == account_id)
                .order_by(PsychologyEntry.at.desc())
                .limit(limit).offset(offset)
            )
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
def psychology_summary(account_id: int = 1) -> list[PsychologySummaryRow]:
    with session_scope() as s:
        entries = s.execute(select(PsychologyEntry).where(PsychologyEntry.account_id == account_id)).scalars().all()
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


@app.on_event("startup")
def startup_event():
    # Ensure all tables exist (idempotent — safe to run every startup)
    from .db import engine as _engine
    Base.metadata.create_all(bind=_engine)


@app.get("/insights")
def insights(account_id: int = 1) -> dict:
    """
    Lightweight, deterministic "AI coach" insights based on your data.
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
        entries = s.execute(select(PsychologyEntry).where(PsychologyEntry.account_id == account_id)).scalars().all()
        if entries:
            trade_ids = {e.trade_id for e in entries if e.trade_id is not None}
            trades_by_id = {}
            if trade_ids:
                trows = s.execute(select(Trade).where(Trade.id.in_(trade_ids), Trade.account_id == account_id)).scalars().all()
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
def list_lessons(account_id: int = 1, limit: int = 200, offset: int = 0, q: str | None = None, category: LessonCategory | None = None) -> list[LessonRead]:
    with session_scope() as s:
        # Scope lessons by account via their linked trade's account_id
        stmt = (
            select(Lesson)
            .outerjoin(Trade, Lesson.trade_id == Trade.id)
            .where((Trade.account_id == account_id) | (Lesson.trade_id == None))
            .order_by(Lesson.updated_at.desc())
            .limit(limit).offset(offset)
        )
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
def list_assets(account_id: int = 1, limit: int = 500, offset: int = 0) -> list[AssetRead]:
    with session_scope() as s:
        rows = s.execute(
            select(Asset)
            .where(Asset.account_id == account_id)
            .order_by(Asset.updated_at.desc())
            .limit(limit).offset(offset)
        ).scalars().all()
        return [_to_asset_read(a) for a in rows]


@app.post("/assets", response_model=AssetRead)
def create_asset(payload: AssetCreate, account_id: int = 1) -> AssetRead:
    with session_scope() as s:
        a = Asset(**payload.model_dump())
        a.account_id = account_id
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
                    'company_name': m.company_name,
                    'quote_type': m.quote_type,
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
                    'company_name': m.company_name,
                    'quote_type': m.quote_type,
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
