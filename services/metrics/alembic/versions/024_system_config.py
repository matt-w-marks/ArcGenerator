"""Create system_config table for financial health and phase tracking.

Single-row config: phase (rental/owned/contracting), weekly vehicle cost,
monthly nut, bankroll remaining. Admin-editable.

Revision ID: 024
Revises: 023
Create Date: 2026-04-05
"""

revision = "024"
down_revision = "023"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    op.create_table(
        "system_config",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.func.gen_random_uuid()),
        sa.Column("phase", sa.String(16), nullable=False, server_default="PHASE_1"),
        sa.Column("weekly_vehicle_cost", sa.Numeric(8, 2), nullable=False, server_default="416.00"),
        sa.Column("monthly_nut", sa.Numeric(8, 2), nullable=False, server_default="3500.00"),
        sa.Column("bankroll_remaining", sa.Numeric(10, 2), nullable=False, server_default="11000.00"),
        sa.Column("se_tax_rate", sa.Numeric(5, 4), nullable=False, server_default="0.1530"),
        sa.Column("irs_mileage_rate", sa.Numeric(5, 4), nullable=False, server_default="0.7250"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Seed the single config row
    config_table = sa.table(
        "system_config",
        sa.column("phase", sa.String),
        sa.column("weekly_vehicle_cost", sa.Numeric),
        sa.column("monthly_nut", sa.Numeric),
        sa.column("bankroll_remaining", sa.Numeric),
        sa.column("se_tax_rate", sa.Numeric),
        sa.column("irs_mileage_rate", sa.Numeric),
    )
    op.bulk_insert(config_table, [{
        "phase": "PHASE_1",
        "weekly_vehicle_cost": 416.00,
        "monthly_nut": 3500.00,
        "bankroll_remaining": 11000.00,
        "se_tax_rate": 0.1530,
        "irs_mileage_rate": 0.7250,
    }])


def downgrade():
    op.drop_table("system_config")
