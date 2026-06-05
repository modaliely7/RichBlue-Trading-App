from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..db import session_scope
from ..insights import (
    closed_trades,
    compute_emotion_breakdown,
    compute_plan_accuracy,
    compute_playbook_breakdown,
    compute_process_grade_breakdown,
    compute_setup_breakdown,
    generate_insights,
    serialize_emotion_stat,
    serialize_insight,
    serialize_plan_accuracy,
    serialize_playbook_stat,
    serialize_process_grade_stat,
    serialize_setup_stat,
)
from ..models import Trade
from ..utils import to_trade_read

router = APIRouter()


@router.get("/insights")
def get_insights(account_id: int = 1) -> dict:
    with session_scope() as s:
        rows = s.execute(
            select(Trade)
            .where(Trade.account_id == account_id)
            .options(
                selectinload(Trade.strategies),
                selectinload(Trade.playbook),
                selectinload(Trade.playbook_setup),
            )
            .order_by(Trade.entry_date.asc())
        ).scalars().all()
        trade_dicts = [to_trade_read(t).model_dump() for t in rows]

    closed = closed_trades(trade_dicts)
    total_trade_count = len(trade_dicts)

    emotion_stats = compute_emotion_breakdown(closed)
    playbook_stats = compute_playbook_breakdown(closed)
    setup_stats = compute_setup_breakdown(closed)
    plan_accuracy = compute_plan_accuracy(closed)
    process_stats = compute_process_grade_breakdown(closed)

    insights = generate_insights(
        closed=closed,
        emotion_stats=emotion_stats,
        playbook_stats=playbook_stats,
        plan_accuracy=plan_accuracy,
        process_stats=process_stats,
        total_trade_count=total_trade_count,
    )

    return {
        "summary": {
            "trade_count": total_trade_count,
            "closed_count": len(closed),
        },
        "emotions": [serialize_emotion_stat(x) for x in emotion_stats],
        "playbooks": [serialize_playbook_stat(x) for x in playbook_stats],
        "setups": [serialize_setup_stat(x) for x in setup_stats],
        "plan_accuracy": serialize_plan_accuracy(plan_accuracy),
        "process_grades": [serialize_process_grade_stat(x) for x in process_stats],
        "insights": [serialize_insight(x) for x in insights],
    }
