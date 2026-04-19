"""add stock raw data, price history, and stock metrics

Revision ID: b2c3d4e5f6a7
Revises: c1a2b3c4d5e6
Create Date: 2026-04-14

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "c1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stock_raw_data",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("symbol", sa.String(length=32), nullable=False, index=True),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("raw_payload", sa.Text(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "price_history",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("symbol", sa.String(length=32), nullable=False, index=True),
        sa.Column("provider", sa.String(length=64), nullable=True),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("open", sa.Float(), nullable=False),
        sa.Column("high", sa.Float(), nullable=False),
        sa.Column("low", sa.Float(), nullable=False),
        sa.Column("close", sa.Float(), nullable=False),
        sa.Column("volume", sa.Float(), nullable=True, server_default="0"),
    )

    op.create_table(
        "stock_metrics",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("symbol", sa.String(length=32), nullable=False, index=True),
        sa.Column("provider", sa.String(length=64), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),

        sa.Column("current_price", sa.Float(), nullable=False, server_default="0"),
        sa.Column("eps", sa.Float(), nullable=True),
        sa.Column("revenue", sa.Float(), nullable=True),
        sa.Column("net_income", sa.Float(), nullable=True),
        sa.Column("ebitda", sa.Float(), nullable=True),
        sa.Column("total_debt", sa.Float(), nullable=True),
        sa.Column("cash", sa.Float(), nullable=True),
        sa.Column("shares_outstanding", sa.Float(), nullable=True),
        sa.Column("shareholder_equity", sa.Float(), nullable=True),
        sa.Column("market_cap", sa.Float(), nullable=True),

        sa.Column("pe_ratio", sa.Float(), nullable=True),
        sa.Column("pb_ratio", sa.Float(), nullable=True),
        sa.Column("peg_ratio", sa.Float(), nullable=True),
        sa.Column("ev", sa.Float(), nullable=True),
        sa.Column("ev_ebitda", sa.Float(), nullable=True),

        sa.Column("roe", sa.Float(), nullable=True),
        sa.Column("net_profit_margin", sa.Float(), nullable=True),

        sa.Column("revenue_growth", sa.Float(), nullable=True),
        sa.Column("eps_growth", sa.Float(), nullable=True),

        sa.Column("debt_to_equity", sa.Float(), nullable=True),
        sa.Column("current_ratio", sa.Float(), nullable=True),

        sa.Column("free_cash_flow", sa.Float(), nullable=True),
        sa.Column("fcf_yield", sa.Float(), nullable=True),

        sa.Column("fair_value_pe", sa.Float(), nullable=True),
        sa.Column("fair_value_peg", sa.Float(), nullable=True),

        sa.Column("fundamental_score", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("stock_metrics")
    op.drop_table("price_history")
    op.drop_table("stock_raw_data")
