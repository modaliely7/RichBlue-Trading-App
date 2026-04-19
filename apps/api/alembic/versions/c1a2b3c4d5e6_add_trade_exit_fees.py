"""add trade exit_fees

Revision ID: c1a2b3c4d5e6
Revises: 8b3c3a0bd9e1
Create Date: 2026-04-13

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "8b3c3a0bd9e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("trades", sa.Column("exit_fees", sa.Float(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("trades", "exit_fees")
