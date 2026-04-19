from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Market(str, enum.Enum):
    stocks = "Stocks"
    funds = "Funds"
    crypto = "Crypto"
    forex = "Forex"


class TradeType(str, enum.Enum):
    long = "Long"
    short = "Short"


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    is_main: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class Trade(Base):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(Integer, ForeignKey("accounts.id"), index=True, default=1)

    symbol: Mapped[str] = mapped_column(String(32), index=True)
    market: Mapped[Market] = mapped_column(Enum(Market), default=Market.stocks, index=True)
    trade_type: Mapped[TradeType] = mapped_column(Enum(TradeType), default=TradeType.long, index=True)

    entry_price: Mapped[float] = mapped_column(Float)
    exit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    stop_loss: Mapped[float | None] = mapped_column(Float, nullable=True)
    take_profit: Mapped[float | None] = mapped_column(Float, nullable=True)
    position_size: Mapped[float] = mapped_column(Float, default=0.0)

    strategy_used: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    indicators_used: Mapped[str | None] = mapped_column(String(256), nullable=True)

    entry_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    exit_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    fees: Mapped[float] = mapped_column(Float, default=0.0)
    exit_fees: Mapped[float] = mapped_column(Float, default=0.0)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    lessons_learned: Mapped[str | None] = mapped_column(Text, nullable=True)

    screenshot_path: Mapped[str | None] = mapped_column(String(512), nullable=True)


class PsychologyState(str, enum.Enum):
    confident = "Confident"
    fear = "Fear"
    fomo = "FOMO"
    calm = "Calm"
    overtrading = "Overtrading"


class PsychologyEntry(Base):
    __tablename__ = "psychology_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(Integer, ForeignKey("accounts.id"), index=True, default=1)

    state: Mapped[PsychologyState] = mapped_column(Enum(PsychologyState), index=True)
    intensity: Mapped[int] = mapped_column(Integer, default=3)  # 1..5

    # optional link to a trade
    trade_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("trades.id"), nullable=True, index=True)

    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class AssetClass(str, enum.Enum):
    stocks = "Stocks"
    etfs = "ETFs / Funds"
    crypto = "Crypto"
    cash = "Cash"


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(Integer, ForeignKey("accounts.id"), index=True, default=1)

    symbol: Mapped[str] = mapped_column(String(32), index=True)
    asset_class: Mapped[AssetClass] = mapped_column(Enum(AssetClass), index=True)

    quantity: Mapped[float] = mapped_column(Float, default=0.0)
    avg_cost: Mapped[float] = mapped_column(Float, default=0.0)
    current_price: Mapped[float] = mapped_column(Float, default=0.0)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)


class StockRawData(Base):
    __tablename__ = "stock_raw_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    raw_payload: Mapped[str] = mapped_column(Text, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)


class PriceHistory(Base):
    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    open: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    volume: Mapped[float] = mapped_column(Float, default=0.0)


class StockMetrics(Base):
    __tablename__ = "stock_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)

    # Core fundamentals
    current_price: Mapped[float] = mapped_column(Float, default=0.0)
    eps: Mapped[float | None] = mapped_column(Float, nullable=True)
    revenue: Mapped[float | None] = mapped_column(Float, nullable=True)
    net_income: Mapped[float | None] = mapped_column(Float, nullable=True)
    ebitda: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_debt: Mapped[float | None] = mapped_column(Float, nullable=True)
    cash: Mapped[float | None] = mapped_column(Float, nullable=True)
    shares_outstanding: Mapped[float | None] = mapped_column(Float, nullable=True)
    shareholder_equity: Mapped[float | None] = mapped_column(Float, nullable=True)
    market_cap: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Calculated metrics
    pe_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    pb_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    peg_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    ev: Mapped[float | None] = mapped_column(Float, nullable=True)
    ev_ebitda: Mapped[float | None] = mapped_column(Float, nullable=True)

    roe: Mapped[float | None] = mapped_column(Float, nullable=True)
    net_profit_margin: Mapped[float | None] = mapped_column(Float, nullable=True)

    revenue_growth: Mapped[float | None] = mapped_column(Float, nullable=True)
    eps_growth: Mapped[float | None] = mapped_column(Float, nullable=True)

    debt_to_equity: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)

    free_cash_flow: Mapped[float | None] = mapped_column(Float, nullable=True)
    fcf_yield: Mapped[float | None] = mapped_column(Float, nullable=True)

    fair_value_pe: Mapped[float | None] = mapped_column(Float, nullable=True)
    fair_value_peg: Mapped[float | None] = mapped_column(Float, nullable=True)

    fundamental_score: Mapped[int | None] = mapped_column(Integer, nullable=True)


class SmartMoneySignal(Base):
    __tablename__ = "smart_money_signals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    payload: Mapped[str] = mapped_column(Text, nullable=False)


class TechnicalMetrics(Base):
    __tablename__ = "technical_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    signal: Mapped[str | None] = mapped_column(String(32), nullable=True)


class QuantitativeMetrics(Base):
    __tablename__ = "quantitative_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    signal: Mapped[str | None] = mapped_column(String(32), nullable=True)




class LessonCategory(str, enum.Enum):
    mistake = "Mistake"
    lesson = "Lesson"
    psychology = "Psychological note"
    strategy = "Strategy insight"


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(Integer, ForeignKey("accounts.id"), index=True, default=1)

    title: Mapped[str] = mapped_column(String(140), index=True)
    category: Mapped[LessonCategory] = mapped_column(Enum(LessonCategory), index=True)
    tags: Mapped[str | None] = mapped_column(String(256), nullable=True)

    trade_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("trades.id"), nullable=True, index=True)

    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)


class CashTxType(str, enum.Enum):
    deposit = "Deposit"
    withdraw = "Withdraw"
    trade_buy = "Trade Buy"
    trade_sell = "Trade Sell"
    fee = "Fee"
    adjustment = "Adjustment"


class CashTransaction(Base):
    __tablename__ = "cash_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(Integer, ForeignKey("accounts.id"), index=True, default=1)

    # +amount = inflow, -amount = outflow
    amount: Mapped[float] = mapped_column(Float)
    tx_type: Mapped[CashTxType] = mapped_column(Enum(CashTxType), index=True)

    trade_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("trades.id"), nullable=True, index=True)
    symbol: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)

    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class SymbolMapping(Base):
    __tablename__ = "symbol_mappings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    internal_symbol: Mapped[str] = mapped_column(String(32), index=True, unique=True)
    provider_symbol: Mapped[str] = mapped_column(String(64), index=True)
    market: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)

