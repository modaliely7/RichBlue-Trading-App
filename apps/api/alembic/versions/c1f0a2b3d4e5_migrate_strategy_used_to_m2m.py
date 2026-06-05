"""migrate strategy_used to M2M trade_strategy table

Revision ID: c1f0a2b3d4e5
Revises: e91980de81f2
Create Date: 2026-06-05 06:00:00.000000

"""
from typing import Sequence, Union
from datetime import datetime, UTC

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1f0a2b3d4e5'
down_revision: Union[str, Sequence[str], None] = 'e91980de81f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Migrate data from strategy_used string column to M2M trade_strategy table.

    For every (account_id, distinct strategy_used) pair, create a new Strategy row
    named after that string (suffixed with ' (legacy)' if needed) and link all
    matching trades to it. The legacy column and its index are then dropped.
    """
    conn = op.get_bind()

    rows = conn.execute(sa.text(
        "SELECT DISTINCT account_id, strategy_used "
        "FROM trades "
        "WHERE strategy_used IS NOT NULL AND TRIM(strategy_used) != ''"
    )).fetchall()

    for account_id, name in rows:
        clean = (name or '').strip()
        if not clean:
            continue

        existing = conn.execute(sa.text(
            "SELECT id FROM strategies WHERE account_id = :acc AND name = :n"
        ), {"acc": account_id, "n": clean}).fetchone()

        if existing:
            strategy_id = existing[0]
        else:
            result = conn.execute(sa.text(
                "INSERT INTO strategies (account_id, name, created_at) "
                "VALUES (:acc, :n, :ts)"
            ), {"acc": account_id, "n": clean, "ts": datetime.now(UTC).isoformat()})
            strategy_id = result.lastrowid

        conn.execute(sa.text(
            "INSERT OR IGNORE INTO trade_strategy (trade_id, strategy_id) "
            "SELECT id, :sid FROM trades "
            "WHERE account_id = :acc AND TRIM(strategy_used) = :n"
        ), {"sid": strategy_id, "acc": account_id, "n": clean})

    op.drop_index('ix_trades_strategy_used', table_name='trades')
    op.drop_column('trades', 'strategy_used')


def downgrade() -> None:
    """Re-add the strategy_used string column and copy the first M2M strategy name back."""
    op.add_column('trades', sa.Column('strategy_used', sa.String(length=64), nullable=True))
    op.create_index('ix_trades_strategy_used', 'trades', ['strategy_used'], unique=False)

    conn = op.get_bind()
    conn.execute(sa.text(
        "UPDATE trades SET strategy_used = ("
        "  SELECT s.name FROM trade_strategy ts "
        "  JOIN strategies s ON s.id = ts.strategy_id "
        "  WHERE ts.trade_id = trades.id "
        "  ORDER BY ts.strategy_id LIMIT 1"
        ")"
    ))
