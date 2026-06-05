"""phase 6 market data: assets.last_fetched_at, symbols, eod_schedules, price_history unique

Revision ID: d2e1f3a4b5c6
Revises: c1f0a2b3d4e5
Create Date: 2026-06-05 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2e1f3a4b5c6'
down_revision: Union[str, Sequence[str], None] = 'c1f0a2b3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Phase 6 — Market Data + Reports (EGX-only).

    Adds the Symbol catalog, the EodSchedule config table, an
    ``Asset.last_fetched_at`` timestamp, and a unique constraint on
    ``price_history(symbol, at)`` so daily OHLCV rows can be upserted
    safely via ``OR IGNORE``. No data is seeded here — the catalog is
    populated by the lifespan ``ensure_symbols_seeded`` hook.
    """
    with op.batch_alter_table("assets", schema=None) as batch:
        batch.add_column(sa.Column("last_fetched_at", sa.DateTime(timezone=True), nullable=True))
        batch.create_index("ix_assets_last_fetched_at", ["last_fetched_at"], unique=False)

    op.create_table(
        "symbols",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("canonical", sa.String(length=32), nullable=False),
        sa.Column("name_en", sa.String(length=256), nullable=False),
        sa.Column("name_ar", sa.String(length=256), nullable=True),
        sa.Column("sector", sa.String(length=64), nullable=True),
        sa.Column("exchange", sa.String(length=16), nullable=False, server_default="EGX"),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="EGP"),
        sa.Column("country", sa.String(length=8), nullable=False, server_default="EG"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("last_loaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_price", sa.Float(), nullable=True),
        sa.Column("last_price_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("canonical", name="uq_symbols_canonical"),
    )
    op.create_index("ix_symbols_canonical", "symbols", ["canonical"], unique=False)
    op.create_index("ix_symbols_sector", "symbols", ["sector"], unique=False)
    op.create_index("ix_symbols_exchange", "symbols", ["exchange"], unique=False)
    op.create_index("ix_symbols_is_active", "symbols", ["is_active"], unique=False)
    op.create_index("ix_symbols_last_price_at", "symbols", ["last_price_at"], unique=False)

    op.create_table(
        "eod_schedules",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("market_code", sa.String(length=16), nullable=False),
        sa.Column("market_name", sa.String(length=64), nullable=False),
        sa.Column("eod_hour", sa.Integer(), nullable=False, server_default="14"),
        sa.Column("eod_minute", sa.Integer(), nullable=False, server_default="35"),
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="Africa/Cairo"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("market_code", name="uq_eod_schedules_market_code"),
    )
    op.create_index("ix_eod_schedules_market_code", "eod_schedules", ["market_code"], unique=False)

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "price_history" in inspector.get_table_names():
        existing_uq = {
            c["name"] for c in inspector.get_unique_constraints("price_history")
        }
        if "uq_price_history_symbol_at" not in existing_uq:
            # Dedup any (symbol, at) duplicates that pre-existed when the
            # table was effectively dead code. Keep the row with the lowest id.
            bind.execute(sa.text(
                "DELETE FROM price_history WHERE id IN ("
                "  SELECT p.id FROM price_history p "
                "  JOIN ("
                "    SELECT symbol, at, MIN(id) AS keep_id "
                "    FROM price_history GROUP BY symbol, at"
                "  ) k ON p.symbol = k.symbol AND p.at = k.at AND p.id <> k.keep_id"
                ")"
            ))
            with op.batch_alter_table("price_history", schema=None) as batch:
                batch.create_unique_constraint(
                    "uq_price_history_symbol_at", ["symbol", "at"]
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "price_history" in inspector.get_table_names():
        existing_uq = {
            c["name"] for c in inspector.get_unique_constraints("price_history")
        }
        if "uq_price_history_symbol_at" in existing_uq:
            with op.batch_alter_table("price_history", schema=None) as batch:
                batch.drop_constraint("uq_price_history_symbol_at", type_="unique")

    op.drop_index("ix_eod_schedules_market_code", table_name="eod_schedules")
    op.drop_table("eod_schedules")

    op.drop_index("ix_symbols_last_price_at", table_name="symbols")
    op.drop_index("ix_symbols_is_active", table_name="symbols")
    op.drop_index("ix_symbols_exchange", table_name="symbols")
    op.drop_index("ix_symbols_sector", table_name="symbols")
    op.drop_index("ix_symbols_canonical", table_name="symbols")
    op.drop_table("symbols")

    with op.batch_alter_table("assets", schema=None) as batch:
        batch.drop_index("ix_assets_last_fetched_at")
        batch.drop_column("last_fetched_at")
