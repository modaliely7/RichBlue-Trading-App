"""add lessons

Revision ID: 47efb2369cda
Revises: ad798bbf680d
Create Date: 2026-04-13 19:58:46.372968

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '47efb2369cda'
down_revision: Union[str, Sequence[str], None] = 'ad798bbf680d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "lessons",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=140), nullable=False),
        sa.Column(
            "category",
            sa.Enum("mistake", "lesson", "psychology", "strategy", name="lessoncategory"),
            nullable=False,
        ),
        sa.Column("tags", sa.String(length=256), nullable=True),
        sa.Column("trade_id", sa.Integer(), sa.ForeignKey("trades.id"), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_lessons_title", "lessons", ["title"])
    op.create_index("ix_lessons_category", "lessons", ["category"])
    op.create_index("ix_lessons_trade_id", "lessons", ["trade_id"])
    op.create_index("ix_lessons_created_at", "lessons", ["created_at"])
    op.create_index("ix_lessons_updated_at", "lessons", ["updated_at"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_lessons_updated_at", table_name="lessons")
    op.drop_index("ix_lessons_created_at", table_name="lessons")
    op.drop_index("ix_lessons_trade_id", table_name="lessons")
    op.drop_index("ix_lessons_category", table_name="lessons")
    op.drop_index("ix_lessons_title", table_name="lessons")
    op.drop_table("lessons")
