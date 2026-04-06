"""Create recurring_expenses table, drop weekly_vehicle_cost and monthly_nut from system_config.

Recurring expenses replace hardcoded config cost values. The user creates
recurring templates (e.g. Hertz $333/week) and the system auto-generates
BusinessExpense entries from them.

Revision ID: 030
Revises: 029
Create Date: 2026-04-05
"""

revision = "030"
down_revision = "029"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    # ── Create recurring_expenses ─────────────────────────────────────────────
    op.create_table(
        "recurring_expenses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.func.gen_random_uuid()),
        sa.Column("budget_category", sa.String(32), nullable=False, index=True),
        sa.Column("amount", sa.Numeric(8, 2), nullable=False),
        sa.Column("frequency", sa.String(16), nullable=False),  # weekly, biweekly, monthly, quarterly, annual
        sa.Column("vendor", sa.String(128), nullable=True),
        sa.Column("description", sa.String(256), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_generated", sa.Date(), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── Drop hardcoded cost fields from system_config ─────────────────────────
    op.drop_column("system_config", "weekly_vehicle_cost")
    op.drop_column("system_config", "monthly_nut")


def downgrade():
    op.add_column("system_config", sa.Column("monthly_nut", sa.Numeric(8, 2), nullable=False, server_default="3500.00"))
    op.add_column("system_config", sa.Column("weekly_vehicle_cost", sa.Numeric(8, 2), nullable=False, server_default="416.00"))
    op.drop_table("recurring_expenses")
