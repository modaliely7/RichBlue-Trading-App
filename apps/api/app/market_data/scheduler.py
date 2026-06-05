"""APScheduler integration for periodic EGX refresh jobs.

The scheduler wraps APScheduler's ``BackgroundScheduler`` and exposes a
small surface area:

  * :meth:`start` / :meth:`shutdown` — wired into the FastAPI lifespan.
  * :meth:`reschedule` — re-reads the ``eod_schedules`` table and
    rebuilds the cron jobs, so editing the EOD time in the Settings tab
    takes effect immediately without restarting the API.

Only two job types run:

  * ``refresh_on_open`` — fires daily at 10:01 Africa/Cairo (one minute
    after the EGX opens at 10:00). Pulls the latest prices for every
    EGX symbol the user currently holds in ``assets``.
  * ``refresh_eod`` — fires at the user-configured EOD time (default
    14:35 Africa/Cairo). Same job body as ``refresh_on_open``; the
    point of the separate trigger is to ensure the user's portfolio
    snapshot is fresh right when the market closes.

Both jobs call :func:`run_refresh_async` which offloads the work to a
thread (yfinance is blocking) and logs success/error counts.
"""
from __future__ import annotations

import logging
from datetime import datetime, UTC

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from ..db import session_scope
from ..models import EodSchedule
from .service import get_service


logger = logging.getLogger(__name__)


def _run_refresh_async() -> None:
    """Background entry point used by every scheduled job."""
    try:
        svc = get_service()
        result = svc.refresh(canons=None)
        logger.info(
            "Scheduled refresh: %d ok, %d failed (started %s)",
            result.ok_count, result.fail_count, result.started_at,
        )
    except Exception as e:  # pragma: no cover - defensive
        logger.exception("Scheduled refresh crashed: %s", e)


class MarketDataScheduler:
    """Wraps APScheduler with EGX-aware triggers."""

    def __init__(self) -> None:
        self._sched = BackgroundScheduler(daemon=True, timezone="Africa/Cairo")
        self._started = False

    def start(self) -> None:
        if self._started:
            return
        self._sched.start()
        self._started = True
        self.reschedule()
        logger.info("MarketDataScheduler started")

    def shutdown(self, wait: bool = False) -> None:
        if not self._started:
            return
        try:
            self._sched.shutdown(wait=wait)
        except Exception as e:  # pragma: no cover - defensive
            logger.debug("Scheduler shutdown raised: %s", e)
        self._started = False
        logger.info("MarketDataScheduler stopped")

    def reschedule(self) -> None:
        """Rebuild cron jobs from the latest ``eod_schedules`` rows.

        Always-on jobs:

          * ``refresh_on_open`` — every day at 10:01 Africa/Cairo.

        Per-row jobs (one per active ``EodSchedule``):

          * ``refresh_eod`` — every day at HH:MM (Cairo).

        The function is safe to call from the lifespan on startup and
        from the ``PATCH /settings/market-data/schedule`` handler when
        the user edits the EOD time.
        """
        if not self._started:
            return
        existing = {job.id for job in self._sched.get_jobs()}
        wanted: set[str] = set()

        self._sched.add_job(
            _run_refresh_async,
            CronTrigger(hour=10, minute=1, timezone="Africa/Cairo"),
            id="refresh_on_open",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            misfire_grace_time=300,
        )
        wanted.add("refresh_on_open")

        with session_scope() as s:
            rows = s.execute(
                select(EodSchedule).where(EodSchedule.is_active == True)  # noqa: E712
            ).scalars().all()
            for r in rows:
                job_id = f"refresh_eod_{r.market_code.lower()}"
                trigger = CronTrigger(
                    hour=r.eod_hour, minute=r.eod_minute, timezone=r.timezone
                )
                self._sched.add_job(
                    _run_refresh_async,
                    trigger,
                    id=job_id,
                    replace_existing=True,
                    max_instances=1,
                    coalesce=True,
                    misfire_grace_time=300,
                )
                wanted.add(job_id)

        for stale in existing - wanted:
            try:
                self._sched.remove_job(stale)
            except Exception:  # pragma: no cover
                pass

        logger.info(
            "MarketDataScheduler reschedule: %d job(s) active at %s",
            len(wanted), datetime.now(UTC).isoformat(),
        )


_scheduler: MarketDataScheduler | None = None


def get_scheduler() -> MarketDataScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = MarketDataScheduler()
    return _scheduler
