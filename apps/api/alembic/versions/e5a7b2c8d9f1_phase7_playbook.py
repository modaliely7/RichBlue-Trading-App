"""phase 7 playbook: playbook, playbook_setup + trade planning fields

Revision ID: e5a7b2c8d9f1
Revises: d2e1f3a4b5c6
Create Date: 2026-06-05 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5a7b2c8d9f1'
down_revision: Union[str, Sequence[str], None] = 'd2e1f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Phase 7 — Playbook (3-5 setups per playbook) + trade planning fields.

    Adds the ``playbooks`` and ``playbook_setups`` tables, and seven new
    columns on ``trades`` for the pre-trade plan, emotion, planned R,
    process/R-multiple grades (1-5), and the two playbook FKs.

    All new trade columns are nullable — existing trades keep their
    fields empty until the user fills them in.
    """
    op.create_table(
        "playbooks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False, server_default="1"),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("color", sa.String(length=16), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("account_id", "name", name="uq_playbook_name"),
    )
    op.create_index("ix_playbooks_account_id", "playbooks", ["account_id"])
    op.create_index("ix_playbooks_name", "playbooks", ["name"])

    op.create_table(
        "playbook_setups",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("playbook_id", sa.Integer(), sa.ForeignKey("playbooks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("entry_rules", sa.Text(), nullable=True),
        sa.Column("exit_rules", sa.Text(), nullable=True),
        sa.Column("image_path", sa.String(length=512), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("playbook_id", "name", name="uq_playbook_setup_name"),
    )
    op.create_index("ix_playbook_setups_playbook_id", "playbook_setups", ["playbook_id"])
    op.create_index("ix_playbook_setups_name", "playbook_setups", ["name"])

    with op.batch_alter_table("trades", schema=None) as batch:
        batch.add_column(sa.Column("pre_trade_plan", sa.Text(), nullable=True))
        batch.add_column(sa.Column("pre_trade_emotion", sa.String(length=32), nullable=True))
        batch.add_column(sa.Column("r_plan", sa.Float(), nullable=True))
        batch.add_column(sa.Column("process_grade", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("r_multiple_grade", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("playbook_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("playbook_setup_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_trades_playbook", "playbooks", ["playbook_id"], ["id"])
        batch.create_foreign_key("fk_trades_playbook_setup", "playbook_setups", ["playbook_setup_id"], ["id"])
        batch.create_index("ix_trades_playbook_id", ["playbook_id"], unique=False)
        batch.create_index("ix_trades_playbook_setup_id", ["playbook_setup_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("trades", schema=None) as batch:
        batch.drop_index("ix_trades_playbook_setup_id")
        batch.drop_index("ix_trades_playbook_id")
        batch.drop_constraint("fk_trades_playbook_setup", type_="foreignkey")
        batch.drop_constraint("fk_trades_playbook", type_="foreignkey")
        batch.drop_column("playbook_setup_id")
        batch.drop_column("playbook_id")
        batch.drop_column("r_multiple_grade")
        batch.drop_column("process_grade")
        batch.drop_column("r_plan")
        batch.drop_column("pre_trade_emotion")
        batch.drop_column("pre_trade_plan")

    op.drop_index("ix_playbook_setups_name", table_name="playbook_setups")
    op.drop_index("ix_playbook_setups_playbook_id", table_name="playbook_setups")
    op.drop_table("playbook_setups")

    op.drop_index("ix_playbooks_name", table_name="playbooks")
    op.drop_index("ix_playbooks_account_id", table_name="playbooks")
    op.drop_table("playbooks")
