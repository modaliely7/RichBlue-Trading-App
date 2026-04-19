from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from .models import AssetClass, CashTxType, LessonCategory, Market, PsychologyState, TradeType


class TradeBase(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    market: Market = Market.stocks
    trade_type: TradeType = TradeType.long

    entry_price: float
    exit_price: float | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    position_size: float = 0.0

    strategy_used: str | None = Field(default=None, max_length=64)
    indicators_used: str | None = Field(default=None, max_length=256)

    entry_date: datetime
    exit_date: datetime | None = None

    fees: float = Field(0.0, description="Commissions/costs at entry (included in open cost basis and PnL).")
    exit_fees: float = Field(0.0, description="Commissions/costs at exit (PnL only; separate from entry fees).")
    notes: str | None = None
    lessons_learned: str | None = None


class TradeCreate(TradeBase):
    pass


class TradeUpdate(BaseModel):
    symbol: str | None = Field(default=None, min_length=1, max_length=32)
    market: Market | None = None
    trade_type: TradeType | None = None

    entry_price: float | None = None
    exit_price: float | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    position_size: float | None = None

    strategy_used: str | None = Field(default=None, max_length=64)
    indicators_used: str | None = Field(default=None, max_length=256)

    entry_date: datetime | None = None
    exit_date: datetime | None = None

    fees: float | None = None
    exit_fees: float | None = None
    notes: str | None = None
    lessons_learned: str | None = None


class TradeRead(TradeBase):
    id: int
    screenshot_path: str | None = None

    pnl: float | None = None
    return_pct: float | None = None
    risk_reward: float | None = None
    duration_seconds: int | None = None


class PsychologyBase(BaseModel):
    state: PsychologyState
    intensity: int = Field(default=3, ge=1, le=5)
    at: datetime
    trade_id: int | None = None
    notes: str | None = None


class PsychologyCreate(PsychologyBase):
    pass


class PsychologyUpdate(BaseModel):
    state: PsychologyState | None = None
    intensity: int | None = Field(default=None, ge=1, le=5)
    at: datetime | None = None
    trade_id: int | None = None
    notes: str | None = None


class PsychologyRead(PsychologyBase):
    id: int


class PsychologySummaryRow(BaseModel):
    state: PsychologyState
    count: int
    avg_pnl: float | None = None
    win_rate: float | None = None


class AssetBase(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    asset_class: AssetClass
    quantity: float = 0.0
    avg_cost: float = 0.0
    current_price: float = 0.0
    notes: str | None = None
    updated_at: datetime


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):
    symbol: str | None = Field(default=None, min_length=1, max_length=32)
    asset_class: AssetClass | None = None
    quantity: float | None = None
    avg_cost: float | None = None
    current_price: float | None = None
    notes: str | None = None
    updated_at: datetime | None = None


class AssetRead(AssetBase):
    id: int
    market_value: float
    cost_basis: float
    unrealized_pnl: float
    unrealized_pnl_pct: float | None = None


class PortfolioSummary(BaseModel):
    total_value: float
    allocation: dict[str, float]


class HoldingRow(BaseModel):
    symbol: str
    open_quantity: float
    avg_open_cost: float | None = None
    open_cost_basis: float
    realized_pnl: float
    closed_trades: int
    open_trades: int
    current_price: float | None = None
    market_value: float | None = None
    unrealized_pnl: float | None = None
    unrealized_pnl_pct: float | None = None


class OverviewKpis(BaseModel):
    as_of: datetime
    cash_balance: float
    assets_market_value: float = Field(..., description="Holdings at cost: open stocks (entry×size) + funds (qty×avg_cost).")
    portfolio_value: float = Field(
        ...,
        description="Portfolio value (Equity) = Free Cash + Market Value of Open Positions.",
    )
    net_deposited: float = Field(..., description="Deposits + withdrawals only (withdrawals negative).")
    total_return_value: float = Field(..., description="Total PnL = Realized PnL + Unrealized PnL (portfolio_value − net_deposited).")
    total_return_pct: float | None = None
    realized_pnl_total: float
    open_positions: int
    open_symbols: int


class OverviewChartSeries(BaseModel):
    labels: list[str]
    portfolio_value: list[float]
    net_deposited: list[float]
    total_return_value: list[float]
    portfolio_value_liquidation: list[float] | None = None


class OverviewResponse(BaseModel):
    kpis: OverviewKpis
    allocation: dict[str, float]
    holdings: list[HoldingRow]
    trades: list[TradeRead]
    chart: OverviewChartSeries


class LessonBase(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    category: LessonCategory
    tags: str | None = Field(default=None, max_length=256)
    trade_id: int | None = None
    content: str = Field(min_length=1)
    created_at: datetime
    updated_at: datetime


class LessonCreate(LessonBase):
    pass


class LessonUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=140)
    category: LessonCategory | None = None
    tags: str | None = Field(default=None, max_length=256)
    trade_id: int | None = None
    content: str | None = Field(default=None, min_length=1)
    updated_at: datetime | None = None


class LessonRead(LessonBase):
    id: int


class CashTxBase(BaseModel):
    amount: float
    tx_type: CashTxType
    trade_id: int | None = None
    symbol: str | None = None
    at: datetime
    note: str | None = None


class CashTxRead(CashTxBase):
    id: int


class CashDepositRequest(BaseModel):
    amount: float = Field(gt=0)
    at: datetime | None = None
    note: str | None = None


class CashWithdrawRequest(BaseModel):
    amount: float = Field(gt=0)
    at: datetime | None = None
    note: str | None = None


class CashAdjustRequest(BaseModel):
    amount: float
    at: datetime | None = None
    note: str | None = None


class CashBalanceResponse(BaseModel):
    balance: float

