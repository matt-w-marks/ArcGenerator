"""Add expected_date to budget_items for day-level tracking.

Revision ID: 034
Revises: 033
Create Date: 2026-04-05
"""

revision = "034"
down_revision = "033"

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column("budget_items", sa.Column("expected_date", sa.Date(), nullable=True))
    # Backfill: set to first of the month
    op.execute(sa.text("UPDATE budget_items SET expected_date = (month || '-01')::date WHERE expected_date IS NULL"))
    # Drop old constraint, add new one
    op.drop_constraint("uq_budget_item_month_name", "budget_items", type_="unique")
    op.create_unique_constraint("uq_budget_item_date_name", "budget_items", ["expected_date", "name"])
    op.create_index("ix_budget_items_expected_date", "budget_items", ["expected_date"])


def downgrade():
    op.drop_index("ix_budget_items_expected_date")
    op.drop_constraint("uq_budget_item_date_name", "budget_items", type_="unique")
    op.create_unique_constraint("uq_budget_item_month_name", "budget_items", ["month", "name"])
    op.drop_column("budget_items", "expected_date")
