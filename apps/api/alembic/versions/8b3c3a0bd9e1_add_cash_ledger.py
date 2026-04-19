"""add cash ledger

Revision ID: 8b3c3a0bd9e1
Revises: 47efb2369cda
Create Date: 2026-04-13

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8b3c3a0bd9e1"
down_revision: Union[str, Sequence[str], None] = "47efb2369cda"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cash_transactions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column(
            "tx_type",
            sa.Enum(
                "deposit",
                "withdraw",
                "trade_buy",
                "trade_sell",
                "fee",
                "adjustment",
                name="cashtxtype",
            ),
            nullable=False,
        ),
        sa.Column("trade_id", sa.Integer(), sa.ForeignKey("trades.id"), nullable=True),
        sa.Column("symbol", sa.String(length=32), nullable=True),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
    )
    op.create_index("ix_cash_transactions_tx_type", "cash_transactions", ["tx_type"])
    op.create_index("ix_cash_transactions_trade_id", "cash_transactions", ["trade_id"])
    op.create_index("ix_cash_transactions_symbol", "cash_transactions", ["symbol"])
    op.create_index("ix_cash_transactions_at", "cash_transactions", ["at"])


def downgrade() -> None:
    op.drop_index("ix_cash_transactions_at", table_name="cash_transactions")
    op.drop_index("ix_cash_transactions_symbol", table_name="cash_transactions")
    op.drop_index("ix_cash_transactions_trade_id", table_name="cash_transactions")
    op.drop_index("ix_cash_transactions_tx_type", table_name="cash_transactions")
    op.drop_table("cash_transactions")

