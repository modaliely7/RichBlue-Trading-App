from __future__ import annotations

import enum
from datetime import datetime, UTC

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, Table, Column, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, validates


class Base(DeclarativeBase):
    pass


class Market(str, enum.Enum):
    stocks = "Stocks"
    funds = "Funds"
    crypto = "Crypto"
    forex = "Forex"



class AccountType(str, enum.Enum):
    real = "Real"
    testing = "Testing"


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    account_type: Mapped[AccountType] = mapped_column(Enum(AccountType), default=AccountType.real)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class Strategy(Base):
    __tablename__ = "strategies"
    __table_args__ = (UniqueConstraint("account_id", "name", name="uq_strategy_name"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(Integer, ForeignKey("accounts.id"), index=True, default=1)
    name: Mapped[str] = mapped_column(String(64), index=True)
    color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


trade_strategy_table = Table(
    "trade_strategy",
    Base.metadata,
    Column("trade_id", Integer, ForeignKey("trades.id", ondelete="CASCADE"), primary_key=True),
    Column("strategy_id", Integer, ForeignKey("strategies.id", ondelete="CASCADE"), primary_key=True),
)


class Trade(Base):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(Integer, ForeignKey("accounts.id"), index=True, default=1)

    symbol: Mapped[str] = mapped_column(String(32), index=True)
    market: Mapped[Market] = mapped_column(Enum(Market), default=Market.stocks, index=True)

    entry_price: Mapped[float] = mapped_column(Float)
    exit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    stop_loss: Mapped[float | None] = mapped_column(Float, nullable=True)
    take_profit: Mapped[float | None] = mapped_column(Float, nullable=True)
    position_size: Mapped[float] = mapped_column(Float, default=0.0)

    strategy_used: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    indicators_used: Mapped[str | None] = mapped_column(String(256), nullable=True)

    strategies: Mapped[list[Strategy]] = relationship(
        "Strategy",
        secondary=trade_strategy_table,
    )

    @validates("symbol")
    def validate_symbol(self, key, value):
        if value:
            return value.strip().upper()
        return value

    entry_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True)
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

    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True)
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
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True)


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


class LessonCategory(str, enum.Enum):
    mistake = "Mistake"
    lesson = "Lesson"
    psychology = "Psychological note"
    strategy = "Strategy insight"


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    title: Mapped[str] = mapped_column(String(140), index=True)
    category: Mapped[LessonCategory] = mapped_column(Enum(LessonCategory), index=True)
    tags: Mapped[str | None] = mapped_column(String(256), nullable=True)

    trade_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("trades.id"), nullable=True, index=True)

    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True)


class CashTxType(str, enum.Enum):
    deposit = "Deposit"
    withdraw = "Withdraw"
    trade_buy = "Trade Buy"
    trade_sell = "Trade Sell"
    fee = "Fee"
    dividend = "Dividend"
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

    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)




