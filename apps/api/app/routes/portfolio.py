"""Portfolio summary and holdings router."""
from __future__ import annotations

from datetime import datetime, UTC

from fastapi import APIRouter, BackgroundTasks

from ..db import session_scope
from ..models import Asset, AssetClass
from ..schemas import HoldingRow, PortfolioSummary, RefreshResultRead
from ..utils import _compute_holdings
from sqlalchemy import select


router = APIRouter()


@router.get("/portfolio/summary", response_model=PortfolioSummary)
def portfolio_summary(account_id: int = 1) -> PortfolioSummary:
    with session_scope() as s:
        assets = s.execute(select(Asset).where(Asset.account_id == account_id)).scalars().all()
        total = 0.0
        alloc: dict[str, float] = {c.value: 0.0 for c in AssetClass}
        for a in assets:
            mv = float((a.quantity or 0.0) * (a.current_price or 0.0))
            total += mv
            alloc[a.asset_class.value] = alloc.get(a.asset_class.value, 0.0) + mv
        return PortfolioSummary(total_value=total, allocation=alloc)


@router.get("/portfolio/holdings", response_model=list[HoldingRow])
def portfolio_holdings(account_id: int = 1) -> list[HoldingRow]:
    """Positions by symbol from logged trades (open quantities/cost, closed realized PnL).

    Current prices come from the Assets table when present (Stocks, matched by symbol).
    """
    with session_scope() as s:
        return _compute_holdings(s, account_id)


def _run_portfolio_refresh() -> None:
    try:
        from ..market_data.service import get_service

        get_service().refresh(canons=None)
    except Exception:
        pass


@router.post("/portfolio/refresh-prices", response_model=RefreshResultRead)
def portfolio_refresh_prices(bg: BackgroundTasks, account_id: int = 1) -> RefreshResultRead:
    """Force a background refresh of every EGX symbol held in this account's open positions.

    The PortfolioPage wires this to its "Refresh prices" button.
    """
    bg.add_task(_run_portfolio_refresh)
    from ..market_data.service import get_service
    from ..egx_stocks import get_canonical

    with session_scope() as s:
        from ..models import Trade

        rows = s.execute(
            select(Trade.symbol).where(Trade.account_id == account_id).distinct()
        ).all()
    targets = [get_canonical(r[0]) for r in rows if (r[0] or "").strip()]
    return RefreshResultRead(
        requested=targets,
        success=[],
        errors={},
        started_at=datetime.now(UTC),
        ok_count=0,
        fail_count=0,
    )
