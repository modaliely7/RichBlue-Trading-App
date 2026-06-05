"""Health and account router."""
from __future__ import annotations

from datetime import datetime, UTC

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from ..db import session_scope
from ..models import Account, AccountType
from ..schemas import AccountCreate, AccountRead, AccountUpdate


router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"ok": True, "ts": datetime.now(UTC).isoformat()}


@router.get("/accounts", response_model=list[AccountRead])
def list_accounts():
    with session_scope() as s:
        accs = s.execute(select(Account).where(Account.is_active == True)).scalars().all()
        if not accs:
            default = Account(name="Main", account_type=AccountType.real, is_active=True)
            s.add(default)
            s.commit()
            accs = [default]

        for a in accs:
            s.expunge(a)
        return accs


@router.post("/accounts", response_model=AccountRead)
def create_account(req: AccountCreate):
    with session_scope() as s:
        active_count = s.execute(select(func.count()).where(Account.is_active == True)).scalar_one()
        if active_count >= 3:
            raise HTTPException(status_code=400, detail="Maximum of 3 accounts allowed.")
        acc = Account(name=req.name, account_type=req.account_type)
        s.add(acc)
        s.commit()
        s.refresh(acc)
        s.expunge(acc)
        return acc


@router.get("/accounts/{account_id}", response_model=AccountRead)
def get_account(account_id: int):
    with session_scope() as s:
        acc = s.get(Account, account_id)
        if not acc or not acc.is_active:
            raise HTTPException(status_code=404, detail="Account not found")
        s.expunge(acc)
        return acc


@router.put("/accounts/{account_id}", response_model=AccountRead)
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


@router.delete("/accounts/{account_id}")
def delete_account(account_id: int):
    with session_scope() as s:
        acc = s.get(Account, account_id)
        if not acc or not acc.is_active:
            raise HTTPException(status_code=404, detail="Account not found")
        min_id = s.execute(select(func.min(Account.id)).where(Account.is_active == True)).scalar_one()
        if account_id == min_id:
            raise HTTPException(status_code=400, detail="Cannot delete the main account.")
        acc.is_active = False
        s.commit()
        return {"deleted": True}
