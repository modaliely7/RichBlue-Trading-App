from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Iterable


def _is_closed(t: dict[str, Any]) -> bool:
    return t.get("exit_price") is not None


def closed_trades(trades: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return [t for t in trades if _is_closed(t)]


def _safe(values: list[float | None]) -> list[float]:
    return [float(v) for v in values if v is not None]


def _avg(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _win_rate(pnls: list[float]) -> float | None:
    if not pnls:
        return None
    wins = sum(1 for p in pnls if p > 0)
    return (wins / len(pnls)) * 100


@dataclass
class EmotionStat:
    emotion: str
    trade_count: int
    win_rate: float | None
    avg_r_multiple: float | None
    total_pnl: float


def compute_emotion_breakdown(closed: list[dict[str, Any]]) -> list[EmotionStat]:
    by_emotion: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for t in closed:
        emotion = t.get("pre_trade_emotion")
        if emotion:
            by_emotion[emotion].append(t)

    stats: list[EmotionStat] = []
    for emotion, trades in by_emotion.items():
        pnls = [float(t.get("pnl") or 0.0) for t in trades]
        r_values = _safe([t.get("r_multiple_actual") for t in trades])
        stats.append(EmotionStat(
            emotion=emotion,
            trade_count=len(trades),
            win_rate=_win_rate(pnls),
            avg_r_multiple=_avg(r_values),
            total_pnl=sum(pnls),
        ))
    stats.sort(key=lambda s: s.trade_count, reverse=True)
    return stats


@dataclass
class PlaybookStat:
    playbook_id: int | None
    playbook_name: str
    trade_count: int
    win_rate: float | None
    avg_r_multiple: float | None
    avg_process_grade: float | None
    setup_names: list[str] = field(default_factory=list)


def compute_playbook_breakdown(closed: list[dict[str, Any]]) -> list[PlaybookStat]:
    by_id: dict[int | None, list[dict[str, Any]]] = defaultdict(list)
    for t in closed:
        by_id[t.get("playbook_id")].append(t)

    stats: list[PlaybookStat] = []
    for pb_id, trades in by_id.items():
        pnls = [float(t.get("pnl") or 0.0) for t in trades]
        r_values = _safe([t.get("r_multiple_actual") for t in trades])
        grades = [float(t["process_grade"]) for t in trades if t.get("process_grade") is not None]
        seen_setup_names: list[str] = []
        for t in trades:
            name = t.get("playbook_setup_name")
            if name and name not in seen_setup_names:
                seen_setup_names.append(name)
        stats.append(PlaybookStat(
            playbook_id=pb_id,
            playbook_name=trades[0].get("playbook_name") if pb_id is not None else "Untagged",
            trade_count=len(trades),
            win_rate=_win_rate(pnls),
            avg_r_multiple=_avg(r_values),
            avg_process_grade=_avg(grades),
            setup_names=seen_setup_names,
        ))
    stats.sort(key=lambda s: s.trade_count, reverse=True)
    return stats


@dataclass
class SetupStat:
    playbook_id: int | None
    playbook_name: str | None
    setup_id: int | None
    setup_name: str
    trade_count: int
    win_rate: float | None
    avg_r_multiple: float | None


def compute_setup_breakdown(closed: list[dict[str, Any]]) -> list[SetupStat]:
    by_key: dict[tuple[int | None, int | None], list[dict[str, Any]]] = defaultdict(list)
    for t in closed:
        if t.get("playbook_setup_id") is not None:
            by_key[(t.get("playbook_id"), t.get("playbook_setup_id"))].append(t)

    stats: list[SetupStat] = []
    for (pb_id, setup_id), trades in by_key.items():
        pnls = [float(t.get("pnl") or 0.0) for t in trades]
        r_values = _safe([t.get("r_multiple_actual") for t in trades])
        stats.append(SetupStat(
            playbook_id=pb_id,
            playbook_name=trades[0].get("playbook_name"),
            setup_id=setup_id,
            setup_name=trades[0].get("playbook_setup_name") or "(unnamed)",
            trade_count=len(trades),
            win_rate=_win_rate(pnls),
            avg_r_multiple=_avg(r_values),
        ))
    stats.sort(key=lambda s: s.trade_count, reverse=True)
    return stats


@dataclass
class PlanAccuracy:
    trade_count: int
    avg_plan: float | None
    avg_actual: float | None
    drift: float | None
    pct_meeting_plan: float | None


def compute_plan_accuracy(closed: list[dict[str, Any]]) -> PlanAccuracy | None:
    paired = [t for t in closed if t.get("r_plan") is not None and t.get("r_multiple_actual") is not None]
    if not paired:
        return None
    plans = [float(t["r_plan"]) for t in paired]
    actuals = [float(t["r_multiple_actual"]) for t in paired]
    meeting = sum(1 for t in paired if float(t["r_multiple_actual"]) >= float(t["r_plan"]))
    return PlanAccuracy(
        trade_count=len(paired),
        avg_plan=_avg(plans),
        avg_actual=_avg(actuals),
        drift=(_avg(actuals) or 0) - (_avg(plans) or 0) if _avg(actuals) is not None and _avg(plans) is not None else None,
        pct_meeting_plan=(meeting / len(paired)) * 100 if paired else None,
    )


@dataclass
class ProcessGradeStat:
    grade: int
    trade_count: int
    avg_r_multiple: float | None
    win_rate: float | None


def compute_process_grade_breakdown(closed: list[dict[str, Any]]) -> list[ProcessGradeStat]:
    by_grade: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for t in closed:
        g = t.get("process_grade")
        if g is not None:
            by_grade[int(g)].append(t)
    stats: list[ProcessGradeStat] = []
    for grade in sorted(by_grade.keys()):
        trades = by_grade[grade]
        pnls = [float(t.get("pnl") or 0.0) for t in trades]
        r_values = _safe([t.get("r_multiple_actual") for t in trades])
        stats.append(ProcessGradeStat(
            grade=grade,
            trade_count=len(trades),
            avg_r_multiple=_avg(r_values),
            win_rate=_win_rate(pnls),
        ))
    return stats


@dataclass
class Insight:
    severity: str
    category: str
    title: str
    body: str
    metric: float | None = None
    sample_size: int | None = None


MIN_SAMPLE = 3
STRONG_SAMPLE = 5


def _emotion_severity(avg_r: float | None, count: int) -> str:
    if avg_r is None or count < MIN_SAMPLE:
        return "info"
    if avg_r <= -1.0:
        return "warning"
    if avg_r >= 1.0:
        return "good"
    return "info"


def generate_insights(
    closed: list[dict[str, Any]],
    emotion_stats: list[EmotionStat],
    playbook_stats: list[PlaybookStat],
    plan_accuracy: PlanAccuracy | None,
    process_stats: list[ProcessGradeStat],
    total_trade_count: int,
) -> list[Insight]:
    insights: list[Insight] = []

    for s in emotion_stats:
        if s.trade_count < MIN_SAMPLE or s.avg_r_multiple is None:
            continue
        sev = _emotion_severity(s.avg_r_multiple, s.trade_count)
        if sev == "warning":
            insights.append(Insight(
                severity="warning",
                category="Emotion",
                title=f"Avoid trading when feeling {s.emotion}",
                body=f"{s.trade_count} trades with this emotion averaged {s.avg_r_multiple:+.2f}R. Consider stepping away.",
                metric=s.avg_r_multiple,
                sample_size=s.trade_count,
            ))
        elif sev == "good":
            insights.append(Insight(
                severity="good",
                category="Emotion",
                title=f"Your best trades come when feeling {s.emotion}",
                body=f"{s.trade_count} trades averaged {s.avg_r_multiple:+.2f}R ({s.win_rate:.0f}% win rate).",
                metric=s.avg_r_multiple,
                sample_size=s.trade_count,
            ))

    for s in playbook_stats:
        if s.playbook_id is None:
            continue
        if s.trade_count >= STRONG_SAMPLE and s.win_rate is not None and s.avg_r_multiple is not None:
            if s.avg_r_multiple >= 0.5:
                insights.append(Insight(
                    severity="good",
                    category="Playbook",
                    title=f"Strong edge in {s.playbook_name}",
                    body=f"{s.trade_count} trades, {s.win_rate:.0f}% win rate, avg {s.avg_r_multiple:+.2f}R.",
                    metric=s.avg_r_multiple,
                    sample_size=s.trade_count,
                ))
            elif s.avg_r_multiple <= -0.5:
                insights.append(Insight(
                    severity="warning",
                    category="Playbook",
                    title=f"Weak edge in {s.playbook_name}",
                    body=f"{s.trade_count} trades, {s.win_rate:.0f}% win rate, avg {s.avg_r_multiple:+.2f}R. Review or pause this playbook.",
                    metric=s.avg_r_multiple,
                    sample_size=s.trade_count,
                ))
        if s.trade_count > 0 and s.trade_count < STRONG_SAMPLE and (s.win_rate is not None and (s.win_rate >= 80 or s.win_rate <= 20)):
            insights.append(Insight(
                severity="info",
                category="Playbook",
                title=f"{s.playbook_name}: small sample",
                body=f"Only {s.trade_count} trades ({s.win_rate:.0f}% win rate). Treat result with caution.",
                metric=s.win_rate,
                sample_size=s.trade_count,
            ))

    if plan_accuracy is not None and plan_accuracy.trade_count >= STRONG_SAMPLE and plan_accuracy.drift is not None:
        if abs(plan_accuracy.drift) >= 0.5:
            direction = "exceeded" if plan_accuracy.drift > 0 else "fell short of"
            insights.append(Insight(
                severity="good" if plan_accuracy.drift > 0 else "info",
                category="Plan accuracy",
                title=f"Actual R {direction} your plan",
                body=f"Across {plan_accuracy.trade_count} trades, planned avg {plan_accuracy.avg_plan:+.2f}R vs actual {plan_accuracy.avg_actual:+.2f}R (drift {plan_accuracy.drift:+.2f}R).",
                metric=plan_accuracy.drift,
                sample_size=plan_accuracy.trade_count,
            ))
        if plan_accuracy.pct_meeting_plan is not None:
            insights.append(Insight(
                severity="info",
                category="Plan accuracy",
                title=f"Hit planned R on {plan_accuracy.pct_meeting_plan:.0f}% of trades",
                body=f"{plan_accuracy.trade_count} trades had a planned R. {plan_accuracy.pct_meeting_plan:.0f}% met or beat it.",
                metric=plan_accuracy.pct_meeting_plan,
                sample_size=plan_accuracy.trade_count,
            ))

    if len(process_stats) >= 2:
        high = process_stats[-1]
        low = process_stats[0]
        if (
            high.trade_count >= MIN_SAMPLE
            and low.trade_count >= MIN_SAMPLE
            and high.avg_r_multiple is not None
            and low.avg_r_multiple is not None
            and (high.avg_r_multiple - low.avg_r_multiple) >= 1.0
        ):
            insights.append(Insight(
                severity="good",
                category="Process",
                title="Process grade predicts R-multiple",
                body=f"Grade 5 trades average {high.avg_r_multiple:+.2f}R vs grade {low.grade} trades at {low.avg_r_multiple:+.2f}R.",
                metric=high.avg_r_multiple - low.avg_r_multiple,
                sample_size=high.trade_count + low.trade_count,
            ))

    if total_trade_count > 0:
        untagged = next((s for s in playbook_stats if s.playbook_id is None), None)
        untagged_count = untagged.trade_count if untagged else 0
        untagged_pct = (untagged_count / total_trade_count) * 100
        if untagged_pct > 30 and untagged_count >= 5:
            insights.append(Insight(
                severity="info",
                category="Tagging",
                title=f"{untagged_pct:.0f}% of your trades are untagged",
                body=f"{untagged_count} of {total_trade_count} closed trades have no playbook. Tag them to surface patterns.",
                metric=untagged_pct,
                sample_size=untagged_count,
            ))

    severity_order = {"warning": 0, "good": 1, "info": 2}
    insights.sort(key=lambda i: (severity_order.get(i.severity, 3), -abs(i.metric or 0)))
    return insights[:10]


def serialize_emotion_stat(s: EmotionStat) -> dict[str, Any]:
    return {
        "emotion": s.emotion,
        "trade_count": s.trade_count,
        "win_rate": s.win_rate,
        "avg_r_multiple": s.avg_r_multiple,
        "total_pnl": s.total_pnl,
    }


def serialize_playbook_stat(s: PlaybookStat) -> dict[str, Any]:
    return {
        "playbook_id": s.playbook_id,
        "playbook_name": s.playbook_name,
        "trade_count": s.trade_count,
        "win_rate": s.win_rate,
        "avg_r_multiple": s.avg_r_multiple,
        "avg_process_grade": s.avg_process_grade,
        "setup_names": s.setup_names,
    }


def serialize_setup_stat(s: SetupStat) -> dict[str, Any]:
    return {
        "playbook_id": s.playbook_id,
        "playbook_name": s.playbook_name,
        "setup_id": s.setup_id,
        "setup_name": s.setup_name,
        "trade_count": s.trade_count,
        "win_rate": s.win_rate,
        "avg_r_multiple": s.avg_r_multiple,
    }


def serialize_plan_accuracy(p: PlanAccuracy | None) -> dict[str, Any] | None:
    if p is None:
        return None
    return {
        "trade_count": p.trade_count,
        "avg_plan": p.avg_plan,
        "avg_actual": p.avg_actual,
        "drift": p.drift,
        "pct_meeting_plan": p.pct_meeting_plan,
    }


def serialize_process_grade_stat(s: ProcessGradeStat) -> dict[str, Any]:
    return {
        "grade": s.grade,
        "trade_count": s.trade_count,
        "avg_r_multiple": s.avg_r_multiple,
        "win_rate": s.win_rate,
    }


def serialize_insight(i: Insight) -> dict[str, Any]:
    return {
        "severity": i.severity,
        "category": i.category,
        "title": i.title,
        "body": i.body,
        "metric": i.metric,
        "sample_size": i.sample_size,
    }
