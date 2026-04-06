"""Create vehicles table, add vehicle_id FK to maintenance_records, recurring_expenses, daily_block_logs, business_expenses.

Revision ID: 031
Revises: 030
Create Date: 2026-04-05
"""

revision = "031"
down_revision = "030"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    op.create_table(
        "vehicles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.func.gen_random_uuid()),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("make", sa.String(64), nullable=False),
        sa.Column("model", sa.String(64), nullable=False),
        sa.Column("trim", sa.String(64), nullable=True),
        sa.Column("vin", sa.String(17), nullable=True, unique=True),
        sa.Column("license_plate", sa.String(16), nullable=True),
        sa.Column("color", sa.String(32), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("ownership_type", sa.String(16), nullable=False, server_default="rental"),
        sa.Column("epa_mpg_city", sa.Numeric(4, 1), nullable=True),
        sa.Column("epa_mpg_highway", sa.Numeric(4, 1), nullable=True),
        sa.Column("epa_mpg_combined", sa.Numeric(4, 1), nullable=True),
        sa.Column("fuel_tank_gal", sa.Numeric(4, 1), nullable=True),
        sa.Column("tire_size", sa.String(32), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Add vehicle_id FK to existing tables
    for table in ("maintenance_records", "recurring_expenses", "daily_block_logs", "business_expenses"):
        op.add_column(table, sa.Column("vehicle_id", UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(f"fk_{table}_vehicle_id", table, "vehicles", ["vehicle_id"], ["id"], ondelete="SET NULL")
        op.create_index(f"ix_{table}_vehicle_id", table, ["vehicle_id"])


def downgrade():
    for table in ("business_expenses", "daily_block_logs", "recurring_expenses", "maintenance_records"):
        op.drop_index(f"ix_{table}_vehicle_id", table)
        op.drop_constraint(f"fk_{table}_vehicle_id", table, type_="foreignkey")
        op.drop_column(table, "vehicle_id")
    op.drop_table("vehicles")
