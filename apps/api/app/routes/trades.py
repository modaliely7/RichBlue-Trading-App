"""Trade CRUD, import/export, screenshots, and dividends router.

This is the largest router — it owns:
- /trades GET/POST/PATCH/DELETE
- /trades/import/csv POST
- /trades/export/csv GET
- /trades/{trade_id}/screenshot POST/DELETE
- /trades/{trade_id}/dividend POST
"""
from __future__ import annotations

import csv
import io
import logging
import os
import uuid
from datetime import datetime, UTC
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from ..db import session_scope
from ..models import Asset, AssetClass, CashTransaction, CashTxType, Strategy, Trade
from ..schemas import DividendRequest, TradeCreate, TradeRead, TradeUpdate
from ..utils import (
    _add_cash_tx,
    _cash_balance,
    _parse_dt,
    _parse_float,
    _parse_market,
    to_trade_read,
)


logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# List / Create / Read / Update / Delete
# ---------------------------------------------------------------------------

@router.get("/trades", response_model=list[TradeRead])
def list_trades(account_id: int = 1, limit: int = 200, offset: int = 0) -> list[TradeRead]:
    with session_scope() as s:
        rows = s.execute(
            select(Trade)
            .where(Trade.account_id == account_id)
            .options(selectinload(Trade.strategies))
            .order_by(Trade.entry_date.desc())
            .limit(limit)
            .offset(offset)
        ).scalars().all()
        return [to_trade_read(t) for t in rows]


@router.post("/trades", response_model=TradeRead)
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

        return to_trade_read(t)


@router.patch("/trades/{trade_id}", response_model=TradeRead)
def update_trade(trade_id: int, payload: TradeUpdate) -> TradeRead:
    with session_scope() as s:
        t = s.get(Trade, trade_id)
        if not t:
            raise HTTPException(status_code=404, detail="Trade not found")

        data = payload.model_dump(exclude_unset=True)
        strategy_ids = data.pop("strategy_ids", None)
        if strategy_ids is not None:
            st_objs = s.execute(select(Strategy).where(Strategy.id.in_(strategy_ids))).scalars().all()
            t.strategies = st_objs

        cash_fields = {"entry_price", "position_size", "fees", "exit_price", "exit_fees", "entry_date", "exit_date"}
        cash_changed = bool(cash_fields & data.keys())

        for k, v in data.items():
            setattr(t, k, v)

        if cash_changed:
            s.execute(delete(CashTransaction).where(CashTransaction.trade_id == trade_id))
            s.flush()

        account_id = t.account_id

        if cash_changed:
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
        return to_trade_read(t)


@router.delete("/trades/{trade_id}")
def delete_trade(trade_id: int) -> dict:
    with session_scope() as s:
        t = s.get(Trade, trade_id)
        if not t:
            raise HTTPException(status_code=404, detail="Trade not found")
        s.execute(delete(CashTransaction).where(CashTransaction.trade_id == trade_id))
        s.delete(t)
        s.flush()
        return {"deleted": True}


# ---------------------------------------------------------------------------
# Import / Export
# ---------------------------------------------------------------------------

@router.post("/trades/import/csv")
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
        for i, row in enumerate(reader, start=2):
            try:
                symbol = (row.get("symbol") or "").strip().upper()
                if not symbol:
                    raise ValueError("symbol is required")

                market = _parse_market(row.get("market"))
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
                    entry_price=entry_price,
                    exit_price=_parse_float(row.get("exit_price")),
                    stop_loss=_parse_float(row.get("stop_loss")),
                    take_profit=_parse_float(row.get("take_profit")),
                    position_size=_parse_float(row.get("position_size")) or 0.0,
                    indicators_used=(row.get("indicators_used") or "").strip() or None,
                    entry_date=entry_date,
                    exit_date=_parse_dt(row.get("exit_date")),
                    fees=_parse_float(row.get("fees")) or 0.0,
                    exit_fees=_parse_float(row.get("exit_fees")) or 0.0,
                    notes=(row.get("notes") or "").strip() or None,
                    lessons_learned=(row.get("lessons_learned") or "").strip() or None,
                )
                s.add(t)
                s.flush()

                position_size = float(t.position_size or 0.0)
                if position_size and entry_price:
                    _add_cash_tx(
                        s,
                        account_id=account_id,
                        amount=-(float(entry_price) * position_size),
                        tx_type=CashTxType.trade_buy,
                        at=entry_date,
                        note="Trade entry (buy) [CSV import]",
                        trade=t,
                    )
                if t.fees and float(t.fees) != 0.0:
                    _add_cash_tx(
                        s,
                        account_id=account_id,
                        amount=-float(t.fees),
                        tx_type=CashTxType.fee,
                        at=entry_date,
                        note="Trade fees [CSV import]",
                        trade=t,
                    )
                if t.exit_price is not None:
                    _add_cash_tx(
                        s,
                        account_id=account_id,
                        amount=float(t.exit_price) * position_size,
                        tx_type=CashTxType.trade_sell,
                        at=t.exit_date or datetime.now(UTC),
                        note="Trade exit (sell) [CSV import]",
                        trade=t,
                    )
                    if t.exit_fees and float(t.exit_fees) > 0.0:
                        _add_cash_tx(
                            s,
                            account_id=account_id,
                            amount=-float(t.exit_fees),
                            tx_type=CashTxType.fee,
                            at=t.exit_date or datetime.now(UTC),
                            note="Trade exit (fees) [CSV import]",
                            trade=t,
                        )

                inserted += 1
            except Exception as e:
                errors.append({"row": i, "error": str(e)})

    return {"inserted": inserted, "errors": errors, "total_errors": len(errors)}


@router.get("/trades/export/csv")
def export_trades_csv(account_id: int = 1) -> StreamingResponse:
    def iter_rows():
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(
            [
                "id", "symbol", "market", "entry_price", "exit_price",
                "stop_loss", "take_profit", "position_size", "indicators_used",
                "entry_date", "exit_date", "fees", "exit_fees",
                "notes", "lessons_learned", "screenshot_path",
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
                        t.id, t.symbol, t.market.value,
                        str(t.entry_price),
                        t.exit_price if t.exit_price is not None else "",
                        t.stop_loss if t.stop_loss is not None else "",
                        t.take_profit if t.take_profit is not None else "",
                        t.position_size,
                        t.indicators_used or "",
                        t.entry_date.isoformat(),
                        t.exit_date.isoformat() if t.exit_date else "",
                        t.fees, t.exit_fees,
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


# ---------------------------------------------------------------------------
# Screenshot upload/delete
# ---------------------------------------------------------------------------

@router.post("/trades/{trade_id}/screenshot", response_model=TradeRead)
async def upload_trade_screenshot(trade_id: int, file: UploadFile = File(...)) -> TradeRead:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in [".png", ".jpg", ".jpeg", ".webp"]:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    with session_scope() as s:
        t = s.get(Trade, trade_id)
        if not t:
            raise HTTPException(status_code=404, detail="Trade not found")

        base_dir = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
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
        return to_trade_read(t)


@router.delete("/trades/{trade_id}/screenshot", response_model=TradeRead)
def delete_trade_screenshot(trade_id: int) -> TradeRead:
    base_dir = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
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
        return to_trade_read(t)


# ---------------------------------------------------------------------------
# Dividends
# ---------------------------------------------------------------------------

@router.post("/trades/{trade_id}/dividend")
def add_trade_dividend(trade_id: int, payload: DividendRequest, account_id: int = 1):
    with session_scope() as s:
        trade = s.get(Trade, trade_id)
        if not trade:
            raise HTTPException(status_code=404, detail="Trade not found")

        at = payload.at or datetime.now(UTC)
        note = payload.note or f"Dividend for {trade.symbol}"

        if payload.is_stock_dividend:
            old_val = trade.position_size * trade.entry_price
            new_size = trade.position_size + payload.amount
            if new_size > 0:
                trade.entry_price = old_val / new_size
                trade.position_size = new_size

            tx = _add_cash_tx(
                s,
                account_id=account_id,
                amount=0,
                tx_type=CashTxType.dividend,
                at=at,
                note=f"[Stock Dividend] {payload.amount} shares added. {note}",
            )
            tx.trade_id = trade_id
            tx.symbol = trade.symbol
        else:
            tx = _add_cash_tx(
                s,
                account_id=account_id,
                amount=payload.amount,
                tx_type=CashTxType.dividend,
                at=at,
                note=note,
            )
            tx.trade_id = trade_id
            tx.symbol = trade.symbol

        s.commit()
        return {"ok": True, "balance": _cash_balance(s, account_id)}
