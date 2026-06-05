"""Asset CRUD router."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..db import session_scope
from ..models import Asset
from ..schemas import AssetCreate, AssetRead, AssetUpdate
from ..utils import to_asset_read
from sqlalchemy import select


router = APIRouter()


@router.get("/assets", response_model=list[AssetRead])
def list_assets(account_id: int = 1, limit: int = 500, offset: int = 0):
    with session_scope() as s:
        rows = s.execute(
            select(Asset)
            .where(Asset.account_id == account_id)
            .order_by(Asset.updated_at.desc())
            .limit(limit)
            .offset(offset)
        ).scalars().all()
        return [to_asset_read(a) for a in rows]


@router.post("/assets", response_model=AssetRead)
def create_asset(payload: AssetCreate, account_id: int = 1):
    with session_scope() as s:
        a = Asset(**payload.model_dump())
        a.account_id = account_id
        s.add(a)
        s.flush()
        s.refresh(a)
        return to_asset_read(a)


@router.patch("/assets/{asset_id}", response_model=AssetRead)
def update_asset(asset_id: int, payload: AssetUpdate):
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
        return to_asset_read(a)


@router.delete("/assets/{asset_id}")
def delete_asset(asset_id: int):
    with session_scope() as s:
        a = s.get(Asset, asset_id)
        if not a:
            raise HTTPException(status_code=404, detail="Asset not found")
        s.delete(a)
        return {"deleted": True}
