"""add psychology entries

Revision ID: 9442a667a216
Revises: 97623334a4c1
Create Date: 2026-04-13 19:38:28.140343

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9442a667a216'
down_revision: Union[str, Sequence[str], None] = '97623334a4c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "psychology_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column(
            "state",
            sa.Enum("confident", "fear", "fomo", "calm", "overtrading", name="psychologystate"),
            nullable=False,
        ),
        sa.Column("intensity", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("trade_id", sa.Integer(), sa.ForeignKey("trades.id"), nullable=True),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_psychology_entries_state", "psychology_entries", ["state"])
    op.create_index("ix_psychology_entries_trade_id", "psychology_entries", ["trade_id"])
    op.create_index("ix_psychology_entries_at", "psychology_entries", ["at"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_psychology_entries_at", table_name="psychology_entries")
    op.drop_index("ix_psychology_entries_trade_id", table_name="psychology_entries")
    op.drop_index("ix_psychology_entries_state", table_name="psychology_entries")
    op.drop_table("psychology_entries")
