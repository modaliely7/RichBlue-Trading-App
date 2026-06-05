"""Lessons router."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..db import session_scope
from ..models import Lesson, LessonCategory, Trade
from ..schemas import LessonCreate, LessonRead, LessonUpdate
from ..utils import to_lesson_read


router = APIRouter()


@router.get("/lessons", response_model=list[LessonRead])
def list_lessons(
    account_id: int = 1,
    limit: int = 200,
    offset: int = 0,
    q: str | None = None,
    category: LessonCategory | None = None,
) -> list[LessonRead]:
    with session_scope() as s:
        stmt = (
            select(Lesson)
            .outerjoin(Trade, Lesson.trade_id == Trade.id)
            .where((Trade.account_id == account_id) | (Lesson.trade_id == None))
            .order_by(Lesson.updated_at.desc())
            .limit(limit)
            .offset(offset)
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
        return [to_lesson_read(x) for x in rows]


@router.post("/lessons", response_model=LessonRead)
def create_lesson(payload: LessonCreate) -> LessonRead:
    with session_scope() as s:
        if payload.trade_id is not None and not s.get(Trade, payload.trade_id):
            raise HTTPException(status_code=400, detail="trade_id not found")
        x = Lesson(**payload.model_dump())
        s.add(x)
        s.flush()
        s.refresh(x)
        return to_lesson_read(x)


@router.patch("/lessons/{lesson_id}", response_model=LessonRead)
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
        return to_lesson_read(x)


@router.delete("/lessons/{lesson_id}")
def delete_lesson(lesson_id: int) -> dict:
    with session_scope() as s:
        x = s.get(Lesson, lesson_id)
        if not x:
            raise HTTPException(status_code=404, detail="Lesson not found")
        s.delete(x)
        return {"deleted": True}
