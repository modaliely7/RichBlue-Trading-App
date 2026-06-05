"""Playbook and PlaybookSetup CRUD router.

A Playbook groups 3-5 Setups (the actual entry/exit rules). Each
Trade can optionally link to a Playbook + a specific Setup so the
journal can show process compliance per setup.

The 3-5 cap is enforced as a soft warning for <3 (UI nudges the user
to add more) and a hard cap of 5 (server returns 400 on the 6th).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from ..db import session_scope
from ..models import Playbook, PlaybookSetup
from ..schemas import (
    PlaybookCreate,
    PlaybookRead,
    PlaybookSetupCreate,
    PlaybookSetupRead,
    PlaybookSetupUpdate,
    PlaybookUpdate,
)


router = APIRouter()


SETUP_SOFT_MIN = 3
SETUP_HARD_MAX = 5


def _to_playbook_read(p: Playbook) -> PlaybookRead:
    return PlaybookRead(
        id=p.id,
        account_id=p.account_id,
        name=p.name,
        description=p.description,
        color=p.color,
        is_active=p.is_active,
        created_at=p.created_at,
        updated_at=p.updated_at,
        setup_count=len(p.setups),
        setups=[PlaybookSetupRead(**{
            "id": s.id,
            "playbook_id": s.playbook_id,
            "name": s.name,
            "description": s.description,
            "entry_rules": s.entry_rules,
            "exit_rules": s.exit_rules,
            "image_path": s.image_path,
            "order_index": s.order_index,
            "created_at": s.created_at,
        }) for s in p.setups],
    )


@router.get("/playbooks", response_model=list[PlaybookRead])
def list_playbooks(account_id: int = 1, include_inactive: bool = False):
    with session_scope() as s:
        q = select(Playbook).options(selectinload(Playbook.setups)).where(Playbook.account_id == account_id)
        if not include_inactive:
            q = q.where(Playbook.is_active.is_(True))
        rows = s.execute(q.order_by(Playbook.name.asc())).scalars().all()
        return [_to_playbook_read(r) for r in rows]


@router.post("/playbooks", response_model=PlaybookRead)
def create_playbook(payload: PlaybookCreate, account_id: int = 1):
    with session_scope() as s:
        existing = s.execute(
            select(func.count(Playbook.id)).where(Playbook.account_id == account_id, Playbook.name == payload.name)
        ).scalar_one()
        if existing:
            raise HTTPException(status_code=409, detail=f"Playbook '{payload.name}' already exists")
        p = Playbook(**payload.model_dump(), account_id=account_id)
        s.add(p)
        s.flush()
        s.refresh(p)
        return _to_playbook_read(p)


@router.get("/playbooks/{playbook_id}", response_model=PlaybookRead)
def get_playbook(playbook_id: int):
    with session_scope() as s:
        p = s.execute(
            select(Playbook).options(selectinload(Playbook.setups)).where(Playbook.id == playbook_id)
        ).scalar_one_or_none()
        if not p:
            raise HTTPException(status_code=404, detail="Playbook not found")
        return _to_playbook_read(p)


@router.patch("/playbooks/{playbook_id}", response_model=PlaybookRead)
def update_playbook(playbook_id: int, payload: PlaybookUpdate):
    with session_scope() as s:
        p = s.execute(
            select(Playbook).options(selectinload(Playbook.setups)).where(Playbook.id == playbook_id)
        ).scalar_one_or_none()
        if not p:
            raise HTTPException(status_code=404, detail="Playbook not found")
        data = payload.model_dump(exclude_unset=True)
        if "name" in data and data["name"] != p.name:
            clash = s.execute(
                select(func.count(Playbook.id)).where(Playbook.account_id == p.account_id, Playbook.name == data["name"], Playbook.id != playbook_id)
            ).scalar_one()
            if clash:
                raise HTTPException(status_code=409, detail=f"Playbook '{data['name']}' already exists")
        from datetime import datetime, UTC
        for k, v in data.items():
            setattr(p, k, v)
        p.updated_at = datetime.now(UTC)
        s.flush()
        s.refresh(p)
        return _to_playbook_read(p)


@router.delete("/playbooks/{playbook_id}")
def delete_playbook(playbook_id: int):
    with session_scope() as s:
        p = s.get(Playbook, playbook_id)
        if not p:
            raise HTTPException(status_code=404, detail="Playbook not found")
        s.delete(p)
        return {"deleted": True}


@router.get("/playbooks/{playbook_id}/setups", response_model=list[PlaybookSetupRead])
def list_setups(playbook_id: int):
    with session_scope() as s:
        rows = s.execute(
            select(PlaybookSetup).where(PlaybookSetup.playbook_id == playbook_id).order_by(PlaybookSetup.order_index.asc(), PlaybookSetup.id.asc())
        ).scalars().all()
        return [PlaybookSetupRead(**{
            "id": r.id,
            "playbook_id": r.playbook_id,
            "name": r.name,
            "description": r.description,
            "entry_rules": r.entry_rules,
            "exit_rules": r.exit_rules,
            "image_path": r.image_path,
            "order_index": r.order_index,
            "created_at": r.created_at,
        }) for r in rows]


@router.post("/playbooks/{playbook_id}/setups", response_model=PlaybookSetupRead)
def create_setup(playbook_id: int, payload: PlaybookSetupCreate):
    with session_scope() as s:
        p = s.get(Playbook, playbook_id)
        if not p:
            raise HTTPException(status_code=404, detail="Playbook not found")
        count = s.execute(
            select(func.count(PlaybookSetup.id)).where(PlaybookSetup.playbook_id == playbook_id)
        ).scalar_one()
        if count >= SETUP_HARD_MAX:
            raise HTTPException(status_code=400, detail=f"Playbook already has the maximum of {SETUP_HARD_MAX} setups")
        clash = s.execute(
            select(func.count(PlaybookSetup.id)).where(PlaybookSetup.playbook_id == playbook_id, PlaybookSetup.name == payload.name)
        ).scalar_one()
        if clash:
            raise HTTPException(status_code=409, detail=f"Setup '{payload.name}' already exists in this playbook")
        setup = PlaybookSetup(**payload.model_dump(), playbook_id=playbook_id)
        s.add(setup)
        s.flush()
        s.refresh(setup)
        return PlaybookSetupRead(**{
            "id": setup.id,
            "playbook_id": setup.playbook_id,
            "name": setup.name,
            "description": setup.description,
            "entry_rules": setup.entry_rules,
            "exit_rules": setup.exit_rules,
            "image_path": setup.image_path,
            "order_index": setup.order_index,
            "created_at": setup.created_at,
        })


@router.patch("/playbooks/{playbook_id}/setups/{setup_id}", response_model=PlaybookSetupRead)
def update_setup(playbook_id: int, setup_id: int, payload: PlaybookSetupUpdate):
    with session_scope() as s:
        setup = s.execute(
            select(PlaybookSetup).where(PlaybookSetup.id == setup_id, PlaybookSetup.playbook_id == playbook_id)
        ).scalar_one_or_none()
        if not setup:
            raise HTTPException(status_code=404, detail="Setup not found")
        data = payload.model_dump(exclude_unset=True)
        for k, v in data.items():
            setattr(setup, k, v)
        s.flush()
        s.refresh(setup)
        return PlaybookSetupRead(**{
            "id": setup.id,
            "playbook_id": setup.playbook_id,
            "name": setup.name,
            "description": setup.description,
            "entry_rules": setup.entry_rules,
            "exit_rules": setup.exit_rules,
            "image_path": setup.image_path,
            "order_index": setup.order_index,
            "created_at": setup.created_at,
        })


@router.delete("/playbooks/{playbook_id}/setups/{setup_id}")
def delete_setup(playbook_id: int, setup_id: int):
    with session_scope() as s:
        setup = s.execute(
            select(PlaybookSetup).where(PlaybookSetup.id == setup_id, PlaybookSetup.playbook_id == playbook_id)
        ).scalar_one_or_none()
        if not setup:
            raise HTTPException(status_code=404, detail="Setup not found")
        s.delete(setup)
        return {"deleted": True}
