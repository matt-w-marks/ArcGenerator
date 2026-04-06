"""Merge daily_expenses into business_expenses. Add daily_block_log_id FK to business_expenses, migrate data, drop daily_expenses.

Revision ID: 039
Revises: 038
Create Date: 2026-04-06
"""

revision = "039"
down_revision = "038"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# Category mapping: daily_expenses.category → business_expenses.budget_category
CAT_MAP = {
    "gas": "fuel",
    "tolls": "tolls_parking",
    "parking": "tolls_parking",
    "car_wash": "vehicle_supplies",
    "food": "food_meals",
    "other": "other",
}


def upgrade():
    # Add daily_block_log_id FK to business_expenses
    op.add_column("business_expenses", sa.Column("daily_block_log_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_business_expenses_daily_block_log_id", "business_expenses", "daily_block_logs",
        ["daily_block_log_id"], ["id"], ondelete="CASCADE",
    )
    op.create_index("ix_business_expenses_daily_block_log_id", "business_expenses", ["daily_block_log_id"])

    # Migrate existing daily_expenses into business_expenses
    for old_cat, new_cat in CAT_MAP.items():
        op.execute(sa.text(f"""
            INSERT INTO business_expenses (id, date, budget_category, amount, description, daily_block_log_id, deleted_at, deleted_by, created_at)
            SELECT de.id, dbl.entry_date, '{new_cat}', de.amount, de.description, de.daily_block_log_id, de.deleted_at, de.deleted_by, de.created_at
            FROM daily_expenses de
            JOIN daily_block_logs dbl ON dbl.id = de.daily_block_log_id
            WHERE de.category = '{old_cat}'
        """))

    # Drop daily_expenses table
    op.drop_table("daily_expenses")


def downgrade():
    # Recreate daily_expenses table
    op.create_table(
        "daily_expenses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("daily_block_log_id", UUID(as_uuid=True), sa.ForeignKey("daily_block_logs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("amount", sa.Numeric(8, 2), nullable=False),
        sa.Column("description", sa.String(256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_daily_expenses_daily_block_log_id", "daily_expenses", ["daily_block_log_id"])

    # Remove FK from business_expenses
    op.drop_index("ix_business_expenses_daily_block_log_id", "business_expenses")
    op.drop_constraint("fk_business_expenses_daily_block_log_id", "business_expenses", type_="foreignkey")
    op.drop_column("business_expenses", "daily_block_log_id")
