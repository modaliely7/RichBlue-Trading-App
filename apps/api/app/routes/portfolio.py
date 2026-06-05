"""Portfolio summary and holdings router."""
from __future__ import annotations

from fastapi import APIRouter

from ..db import session_scope
from ..models import Asset, AssetClass
from ..schemas import HoldingRow, PortfolioSummary
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
