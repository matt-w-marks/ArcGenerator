"""Create business_expenses and budgets tables, add receipt_path to daily_expenses and maintenance_records.

Revision ID: 026
Revises: 025
Create Date: 2026-04-05
"""

revision = "026"
down_revision = "025"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


BUDGET_SEEDS = [
    ("fuel", 400.00, "Gas fill-ups"),
    ("vehicle_maintenance", 200.00, "Shop visits, parts, labor"),
    ("vehicle_supplies", 75.00, "Wiper fluid, cleaning, air freshener, etc."),
    ("vehicle_rental", 1664.00, "Hertz weekly rental ($416 × 4)"),
    ("insurance", 0.00, "Vehicle or business insurance"),
    ("tolls_parking", 50.00, "Tolls and parking fees"),
    ("food_meals", 150.00, "Driver meals during shifts"),
    ("technology", 100.00, "Phone plan, apps, subscriptions"),
    ("licensing", 25.00, "Business license, permits (amortized monthly)"),
    ("professional_services", 50.00, "Tax prep, legal, accounting (amortized monthly)"),
    ("other", 50.00, "Miscellaneous"),
]


def upgrade():
    # ── business_expenses ─────────────────────────────────────────────────────
    op.create_table(
        "business_expenses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.func.gen_random_uuid()),
        sa.Column("date", sa.Date(), nullable=False, index=True),
        sa.Column("budget_category", sa.String(32), nullable=False, index=True),
        sa.Column("amount", sa.Numeric(8, 2), nullable=False),
        sa.Column("vendor", sa.String(128), nullable=True),
        sa.Column("description", sa.String(256), nullable=True),
        sa.Column("receipt_path", sa.String(512), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── budgets ───────────────────────────────────────────────────────────────
    op.create_table(
        "budgets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.func.gen_random_uuid()),
        sa.Column("budget_category", sa.String(32), nullable=False, unique=True),
        sa.Column("monthly_amount", sa.Numeric(8, 2), nullable=False),
        sa.Column("notes", sa.String(256), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Seed default budgets
    budgets_table = sa.table(
        "budgets",
        sa.column("budget_category", sa.String),
        sa.column("monthly_amount", sa.Numeric),
        sa.column("notes", sa.String),
    )
    op.bulk_insert(budgets_table, [
        {"budget_category": cat, "monthly_amount": amt, "notes": notes}
        for cat, amt, notes in BUDGET_SEEDS
    ])

    # ── Add receipt_path to existing tables ────────────────────────────────────
    op.add_column("daily_expenses", sa.Column("receipt_path", sa.String(512), nullable=True))
    op.add_column("maintenance_records", sa.Column("receipt_path", sa.String(512), nullable=True))


def downgrade():
    op.drop_column("maintenance_records", "receipt_path")
    op.drop_column("daily_expenses", "receipt_path")
    op.drop_table("budgets")
    op.drop_table("business_expenses")
