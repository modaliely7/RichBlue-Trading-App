"""Shared helpers, schema converters, and parsers for the API routers.

This module is the home for:
- ORM -> Pydantic converters (``to_*_read``)
- Cash transaction helpers (``_add_cash_tx``, ``_cash_balance``)
- Holdings math (``_compute_holdings``, ``_funds_cost_from_assets``)
- CSV cell parsers (``_parse_market``, ``_parse_float``, ``_parse_dt``)
- Date helpers (``tx_at_date``)

Importing from this module keeps individual router files focused on their
endpoint definitions and avoids circular imports.
"""
from __future__ import annotations

from datetime import date, datetime, UTC
from typing import Sequence

from sqlalchemy import func, select

from .analytics import calc_duration_seconds, calc_pnl, calc_return_pct, calc_risk_reward
from .models import (
    Asset,
    AssetClass,
    CashTransaction,
    CashTxType,
    Lesson,
    PsychologyEntry,
    Strategy,
    Trade,
)
from .schemas import (
    AssetRead,
    CashTxRead,
    HoldingRow,
    LessonRead,
    PsychologyRead,
    StrategyRead,
    TradeRead,
)


# ---------------------------------------------------------------------------
# Schema converters
# ---------------------------------------------------------------------------

def to_strategy_read(s: Strategy) -> StrategyRead:
    return StrategyRead(
        id=s.id,
        account_id=s.account_id,
        name=s.name,
        color=s.color,
        created_at=s.created_at,
    )


def to_trade_read(t: Trade) -> TradeRead:
    pnl = calc_pnl(t)
    return TradeRead(
        id=t.id,
        symbol=t.symbol,
        market=t.market,
        entry_price=t.entry_price,
        exit_price=t.exit_price,
        stop_loss=t.stop_loss,
        take_profit=t.take_profit,
        position_size=t.position_size,
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
        strategies=[to_strategy_read(s) for s in {s.id: s for s in t.strategies}.values()],
    )


def to_psy_read(p: PsychologyEntry) -> PsychologyRead:
    return PsychologyRead(
        id=p.id,
        state=p.state,
        intensity=p.intensity,
        at=p.at,
        trade_id=p.trade_id,
        notes=p.notes,
    )


def to_lesson_read(x: Lesson) -> LessonRead:
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


def to_asset_read(a: Asset) -> AssetRead:
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


def to_cash_tx_read(r: CashTransaction) -> CashTxRead:
    return CashTxRead(
        id=r.id,
        amount=r.amount,
        tx_type=r.tx_type,
        trade_id=r.trade_id,
        symbol=r.symbol,
        at=r.at,
        note=r.note,
    )


# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------

def tx_at_date(at: datetime | date) -> date:
    if hasattr(at, "date"):
        return at.date()
    return at


# ---------------------------------------------------------------------------
# Cash transaction helpers
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Holdings math
# ---------------------------------------------------------------------------

def _compute_holdings(s, account_id: int = 1, trades: Sequence[Trade] | None = None) -> list[HoldingRow]:
    if trades is None:
        trades = s.execute(select(Trade).where(Trade.account_id == account_id)).scalars().all()
    assets = s.execute(select(Asset).where(Asset.account_id == account_id, Asset.asset_class == AssetClass.stocks)).scalars().all()
    price_by_symbol = {a.symbol.upper(): float(a.current_price or 0.0) for a in assets if (a.symbol or "").strip()}

    # Fallback: when an Asset row is missing, try the latest PriceHistory point.
    # This lets the holdings view stay live for EGX symbols even when the user
    # has no manually-edited Asset row.
    if trades:
        from .models import PriceHistory
        candidates = sorted({(t.symbol or "").strip().upper() for t in trades if (t.symbol or "").strip()})
        for sym in candidates:
            if sym in price_by_symbol and price_by_symbol[sym] > 0:
                continue
            row = s.execute(
                select(PriceHistory)
                .where(PriceHistory.symbol == sym)
                .order_by(PriceHistory.at.desc())
                .limit(1)
            ).scalar_one_or_none()
            if row is not None and (row.close or 0.0) > 0:
                price_by_symbol[sym] = float(row.close)

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


# ---------------------------------------------------------------------------
# CSV cell parsers
# ---------------------------------------------------------------------------

def _parse_market(v: str | None):
    from .models import Market
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
    return datetime.fromisoformat(s.replace("Z", "+00:00"))
