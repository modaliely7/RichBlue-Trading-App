"""Psychology entries router."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..analytics import calc_pnl
from ..db import session_scope
from ..models import PsychologyEntry, PsychologyState, Trade
from ..schemas import PsychologyCreate, PsychologyRead, PsychologySummaryRow, PsychologyUpdate
from ..utils import to_psy_read


router = APIRouter()


@router.get("/psychology", response_model=list[PsychologyRead])
def list_psychology(account_id: int = 1, limit: int = 200, offset: int = 0) -> list[PsychologyRead]:
    with session_scope() as s:
        rows = (
            s.execute(
                select(PsychologyEntry)
                .where(PsychologyEntry.account_id == account_id)
                .order_by(PsychologyEntry.at.desc())
                .limit(limit)
                .offset(offset)
            )
            .scalars()
            .all()
        )
        return [to_psy_read(p) for p in rows]


@router.post("/psychology", response_model=PsychologyRead)
def create_psychology(payload: PsychologyCreate) -> PsychologyRead:
    with session_scope() as s:
        if payload.trade_id is not None:
            if not s.get(Trade, payload.trade_id):
                raise HTTPException(status_code=400, detail="trade_id not found")
        p = PsychologyEntry(**payload.model_dump())
        s.add(p)
        s.flush()
        s.refresh(p)
        return to_psy_read(p)


@router.patch("/psychology/{entry_id}", response_model=PsychologyRead)
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
        return to_psy_read(p)


@router.delete("/psychology/{entry_id}")
def delete_psychology(entry_id: int) -> dict:
    with session_scope() as s:
        p = s.get(PsychologyEntry, entry_id)
        if not p:
            raise HTTPException(status_code=404, detail="Psychology entry not found")
        s.delete(p)
        return {"deleted": True}


@router.get("/psychology/summary", response_model=list[PsychologySummaryRow])
def psychology_summary(account_id: int = 1) -> list[PsychologySummaryRow]:
    with session_scope() as s:
        entries = s.execute(
            select(PsychologyEntry).where(PsychologyEntry.account_id == account_id)
        ).scalars().all()
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
