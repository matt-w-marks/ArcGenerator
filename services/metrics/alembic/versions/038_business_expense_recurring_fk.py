"""Add recurring_expense_id FK to business_expenses for tracking auto-generated charges.

Revision ID: 038
Revises: 037
Create Date: 2026-04-05
"""

revision = "038"
down_revision = "037"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    op.add_column("business_expenses", sa.Column("recurring_expense_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_business_expenses_recurring_expense_id", "business_expenses", "recurring_expenses",
        ["recurring_expense_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_business_expenses_recurring_expense_id", "business_expenses", ["recurring_expense_id"])
    op.create_unique_constraint("uq_business_expense_recurring_date", "business_expenses", ["recurring_expense_id", "date"])


def downgrade():
    op.drop_constraint("uq_business_expense_recurring_date", "business_expenses", type_="unique")
    op.drop_index("ix_business_expenses_recurring_expense_id", "business_expenses")
    op.drop_constraint("fk_business_expenses_recurring_expense_id", "business_expenses", type_="foreignkey")
    op.drop_column("business_expenses", "recurring_expense_id")
