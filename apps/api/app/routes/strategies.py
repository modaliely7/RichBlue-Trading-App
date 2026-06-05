"""Strategy CRUD router."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..db import session_scope
from ..models import Strategy
from ..schemas import StrategyCreate, StrategyRead, StrategyUpdate
from ..utils import to_strategy_read


router = APIRouter()


@router.get("/strategies", response_model=list[StrategyRead])
def list_strategies(account_id: int = 1):
    with session_scope() as s:
        rows = s.execute(
            select(Strategy).where(Strategy.account_id == account_id).order_by(Strategy.name.asc())
        ).scalars().all()
        return [to_strategy_read(r) for r in rows]


@router.post("/strategies", response_model=StrategyRead)
def create_strategy(payload: StrategyCreate, account_id: int = 1):
    with session_scope() as s:
        r = Strategy(**payload.model_dump(), account_id=account_id)
        s.add(r)
        s.flush()
        s.refresh(r)
        return to_strategy_read(r)


@router.put("/strategies/{strategy_id}", response_model=StrategyRead)
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
        return to_strategy_read(r)


@router.delete("/strategies/{strategy_id}")
def delete_strategy(strategy_id: int):
    with session_scope() as s:
        r = s.get(Strategy, strategy_id)
        if not r:
            raise HTTPException(status_code=404, detail="Strategy not found")
        s.delete(r)
        return {"deleted": True}
