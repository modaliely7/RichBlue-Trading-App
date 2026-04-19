"""add assets

Revision ID: ad798bbf680d
Revises: 9442a667a216
Create Date: 2026-04-13 19:47:04.083408

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ad798bbf680d'
down_revision: Union[str, Sequence[str], None] = '9442a667a216'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "assets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=False),
        sa.Column("asset_class", sa.Enum("stocks", "etfs", "crypto", "cash", name="assetclass"), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False, server_default="0"),
        sa.Column("avg_cost", sa.Float(), nullable=False, server_default="0"),
        sa.Column("current_price", sa.Float(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_assets_symbol", "assets", ["symbol"])
    op.create_index("ix_assets_asset_class", "assets", ["asset_class"])
    op.create_index("ix_assets_updated_at", "assets", ["updated_at"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_assets_updated_at", table_name="assets")
    op.drop_index("ix_assets_asset_class", table_name="assets")
    op.drop_index("ix_assets_symbol", table_name="assets")
    op.drop_table("assets")
