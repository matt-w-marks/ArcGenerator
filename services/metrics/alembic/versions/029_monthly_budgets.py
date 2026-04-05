"""Convert budgets from single-set to per-month allocations.

Adds month column (VARCHAR 7, format YYYY-MM), changes unique constraint
from budget_category to (budget_category, month). Existing rows get
current month assigned.

Revision ID: 029
Revises: 028
Create Date: 2026-04-05
"""

revision = "029"
down_revision = "028"

from datetime import date

from alembic import op
import sqlalchemy as sa


def upgrade():
    # Add month column, nullable first
    op.add_column("budgets", sa.Column("month", sa.String(7), nullable=True))

    # Set existing rows to current month
    current_month = date.today().strftime("%Y-%m")
    budgets = sa.table("budgets", sa.column("month", sa.String))
    op.execute(budgets.update().values(month=current_month))

    # Make non-nullable
    op.alter_column("budgets", "month", nullable=False)

    # Drop old unique constraint on budget_category, add new composite
    op.drop_constraint("budgets_budget_category_key", "budgets", type_="unique")
    op.create_unique_constraint("uq_budget_category_month", "budgets", ["budget_category", "month"])

    # Add index for fast month lookups
    op.create_index("ix_budgets_month", "budgets", ["month"])


def downgrade():
    op.drop_index("ix_budgets_month")
    op.drop_constraint("uq_budget_category_month", "budgets", type_="unique")
    op.create_unique_constraint("budgets_budget_category_key", "budgets", ["budget_category"])
    op.drop_column("budgets", "month")
