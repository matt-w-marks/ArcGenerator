"""Replace budgets table with budget_items. Add budget_item_id to business_expenses.

Budget items are specific planned expenses per month, optionally linked to
a recurring expense. This replaces the old category-amount-per-month model
with a line-item-based budget that maps 1:1 to actual expenses.

Revision ID: 033
Revises: 032
Create Date: 2026-04-05
"""

revision = "033"
down_revision = "032"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    # 1. Create budget_items table
    op.create_table(
        "budget_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.func.gen_random_uuid()),
        sa.Column("month", sa.String(7), nullable=False, index=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("budget_category", sa.String(32), nullable=False),
        sa.Column("planned_amount", sa.Numeric(8, 2), nullable=False),
        sa.Column("frequency_note", sa.String(32), nullable=True),
        sa.Column("recurring_expense_id", UUID(as_uuid=True),
                  sa.ForeignKey("recurring_expenses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("vehicle_id", UUID(as_uuid=True),
                  sa.ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("notes", sa.String(256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("month", "name", name="uq_budget_item_month_name"),
    )

    # 2. Add budget_item_id to business_expenses
    op.add_column("business_expenses",
        sa.Column("budget_item_id", UUID(as_uuid=True),
                  sa.ForeignKey("budget_items.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_business_expenses_budget_item_id", "business_expenses", ["budget_item_id"])

    # 3. Migrate existing budgets rows to budget_items
    # Each old row: (budget_category, month, monthly_amount, notes) → budget_item
    conn = op.get_bind()
    old_budgets = conn.execute(sa.text("SELECT budget_category, month, monthly_amount, notes FROM budgets"))
    cats = conn.execute(sa.text("SELECT name, label FROM budget_categories"))
    label_map = {row[0]: row[1] for row in cats}

    items_table = sa.table(
        "budget_items",
        sa.column("month", sa.String),
        sa.column("name", sa.String),
        sa.column("budget_category", sa.String),
        sa.column("planned_amount", sa.Numeric),
        sa.column("notes", sa.String),
    )
    rows = []
    for cat, month, amount, notes in old_budgets:
        rows.append({
            "month": month,
            "name": label_map.get(cat, cat),
            "budget_category": cat,
            "planned_amount": amount,
            "notes": notes,
        })
    if rows:
        op.bulk_insert(items_table, rows)

    # 4. Drop old budgets table
    op.drop_table("budgets")


def downgrade():
    # Recreate budgets table
    op.create_table(
        "budgets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.func.gen_random_uuid()),
        sa.Column("budget_category", sa.String(32), nullable=False),
        sa.Column("month", sa.String(7), nullable=False, index=True),
        sa.Column("monthly_amount", sa.Numeric(8, 2), nullable=False),
        sa.Column("notes", sa.String(256), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("budget_category", "month", name="uq_budget_category_month"),
    )
    op.drop_index("ix_business_expenses_budget_item_id", "business_expenses")
    op.drop_column("business_expenses", "budget_item_id")
    op.drop_table("budget_items")
