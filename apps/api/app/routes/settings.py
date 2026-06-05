"""Backup, clear, and restore router (settings endpoints)."""
from __future__ import annotations

import json
from datetime import datetime, UTC

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.encoders import jsonable_encoder
from sqlalchemy import delete, select

from ..db import session_scope
from ..models import (
    Asset,
    CashTransaction,
    Lesson,
    PsychologyEntry,
    Strategy,
    Trade,
    trade_strategy_table,
)
from ..utils import to_asset_read, to_cash_tx_read, to_lesson_read, to_psy_read, to_strategy_read, to_trade_read


router = APIRouter()


@router.get("/settings/backup.json")
def backup_dataset(account_id: int = 1) -> dict:
    with session_scope() as s:
        trades = s.execute(
            select(Trade).where(Trade.account_id == account_id).order_by(Trade.entry_date.asc())
        ).scalars().all()
        assets = s.execute(
            select(Asset).where(Asset.account_id == account_id).order_by(Asset.updated_at.asc())
        ).scalars().all()
        psychology = s.execute(
            select(PsychologyEntry).where(PsychologyEntry.account_id == account_id).order_by(PsychologyEntry.at.asc())
        ).scalars().all()
        lessons = s.execute(
            select(Lesson).join(Trade).where(Trade.account_id == account_id).order_by(Lesson.updated_at.asc())
        ).scalars().all()
        cash_txs = s.execute(
            select(CashTransaction).where(CashTransaction.account_id == account_id).order_by(CashTransaction.at.asc())
        ).scalars().all()
        strategies = s.execute(
            select(Strategy).where(Strategy.account_id == account_id)
        ).scalars().all()

        payload = {
            "generated_at": datetime.now(UTC).isoformat(),
            "strategies": [to_strategy_read(x).model_dump() for x in strategies],
            "trades": [to_trade_read(t).model_dump() for t in trades],
            "assets": [to_asset_read(a).model_dump() for a in assets],
            "psychology_entries": [to_psy_read(p).model_dump() for p in psychology],
            "lessons": [to_lesson_read(x).model_dump() for x in lessons],
            "cash_transactions": [to_cash_tx_read(r).model_dump() for r in cash_txs],
        }
        return jsonable_encoder(payload)


@router.post("/settings/clear")
def clear_dataset(account_id: int = 1) -> dict:
    with session_scope() as s:
        s.execute(delete(PsychologyEntry).where(PsychologyEntry.account_id == account_id))
        s.execute(delete(Lesson).where(Lesson.trade_id.in_(select(Trade.id).where(Trade.account_id == account_id))))
        s.execute(delete(CashTransaction).where(CashTransaction.account_id == account_id))
        s.execute(delete(Trade).where(Trade.account_id == account_id))
        s.execute(delete(Asset).where(Asset.account_id == account_id))
        s.execute(delete(Strategy).where(Strategy.account_id == account_id))
        s.execute(
            trade_strategy_table.delete().where(
                trade_strategy_table.c.trade_id.in_(select(Trade.id).where(Trade.account_id == account_id))
            )
        )
        return {"status": "cleared"}


@router.post("/settings/restore")
async def restore_dataset(file: UploadFile, account_id: int = 1):
    content = await file.read()
    data = json.loads(content)

    def parse_dt(s):
        if not s:
            return None
        if isinstance(s, datetime):
            return s
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            return None

    with session_scope() as s:
        s.execute(delete(PsychologyEntry).where(PsychologyEntry.account_id == account_id))
        s.execute(delete(Lesson).where(Lesson.trade_id.in_(select(Trade.id).where(Trade.account_id == account_id))))
        s.execute(delete(CashTransaction).where(CashTransaction.account_id == account_id))
        s.execute(delete(Trade).where(Trade.account_id == account_id))
        s.execute(delete(Asset).where(Asset.account_id == account_id))
        s.execute(delete(Strategy).where(Strategy.account_id == account_id))
        s.execute(
            trade_strategy_table.delete().where(
                trade_strategy_table.c.trade_id.in_(select(Trade.id).where(Trade.account_id == account_id))
            )
        )
        s.flush()

        old_to_new_trade_id = {}

        st_objs_by_old_id = {}
        for str_data in data.get("strategies", []):
            old_id = str_data.pop("id", None)
            str_data.pop("created_at", None)
            new_strat = Strategy(**str_data, account_id=account_id)
            s.add(new_strat)
            s.flush()
            if old_id:
                st_objs_by_old_id[old_id] = new_strat

        for t_data in data.get("trades", []):
            old_id = t_data.pop("id", None)
            strategies_data = t_data.pop("strategies", [])
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

        for a_data in data.get("assets", []):
            a_data.pop("id", None)
            for extra in ["market_value", "cost_basis", "unrealized_pnl", "unrealized_pnl_pct", "created_at", "updated_at"]:
                a_data.pop(extra, None)
            a_data["updated_at"] = parse_dt(a_data.get("updated_at")) or datetime.now(UTC)
            s.add(Asset(**a_data, account_id=account_id))

        for c_data in data.get("cash_transactions", []):
            c_data.pop("id", None)
            old_tid = c_data.pop("trade_id", None)
            if old_tid and old_tid in old_to_new_trade_id:
                c_data["trade_id"] = old_to_new_trade_id[old_tid]
            else:
                c_data["trade_id"] = None
            c_data["at"] = parse_dt(c_data.get("at")) or datetime.now(UTC)
            s.add(CashTransaction(**c_data, account_id=account_id))

        for p_data in data.get("psychology_entries", []):
            p_data.pop("id", None)
            old_tid = p_data.pop("trade_id", None)
            if old_tid and old_tid in old_to_new_trade_id:
                p_data["trade_id"] = old_to_new_trade_id[old_tid]
            else:
                p_data["trade_id"] = None
            p_data["at"] = parse_dt(p_data.get("at")) or datetime.now(UTC)
            s.add(PsychologyEntry(**p_data, account_id=account_id))

        for l_data in data.get("lessons", []):
            l_data.pop("id", None)
            l_data.pop("created_at", None)
            l_data.pop("updated_at", None)
            old_tid = l_data.pop("trade_id", None)
            if old_tid and old_tid in old_to_new_trade_id:
                l_data["trade_id"] = old_to_new_trade_id[old_tid]
                s.add(Lesson(**l_data))

        s.commit()
        return {"status": "restored", "trades": len(old_to_new_trade_id)}
