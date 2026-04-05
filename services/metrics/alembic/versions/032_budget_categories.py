"""Create budget_categories master registry, migrate tax info from budgets, drop tax fields.

Revision ID: 032
Revises: 031
Create Date: 2026-04-05
"""

revision = "032"
down_revision = "031"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# Seed data — label and tax info for existing categories
SEEDS = {
    "fuel":                   ("Fuel",                  True,  "Deductible if not using standard mileage rate.", 1),
    "vehicle_maintenance":    ("Vehicle Maintenance",   True,  "Deductible if not using standard mileage rate.", 2),
    "vehicle_supplies":       ("Vehicle Supplies",      True,  "Deductible. Ordinary and necessary business expenses.", 3),
    "vehicle_rental":         ("Vehicle Rental",        True,  "Deductible. Business vehicle expense (Schedule C, Line 20a).", 4),
    "insurance":              ("Insurance",             True,  "Deductible. Prorated by business use percentage.", 5),
    "tolls_parking":          ("Tolls & Parking",       True,  "Always deductible, even with standard mileage.", 6),
    "food_meals":             ("Food & Meals",          False, "NOT deductible. Personal expenses per IRS rules.", 7),
    "technology":             ("Technology",            True,  "Deductible. Phone plan prorated by business use %.", 8),
    "licensing":              ("Licensing",             True,  "Deductible. Business licenses, permits (Schedule C, Line 22).", 9),
    "professional_services":  ("Professional Services", True,  "Deductible. Tax prep, legal, accounting (Schedule C, Line 17).", 10),
    "other":                  ("Other",                 False, "Depends on the expense.", 11),
}


def upgrade():
    # 1. Create budget_categories master table
    op.create_table(
        "budget_categories",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.func.gen_random_uuid()),
        sa.Column("name", sa.String(32), nullable=False, unique=True),
        sa.Column("label", sa.String(64), nullable=False),
        sa.Column("tax_deductible", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("tax_notes", sa.String(256), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 2. Seed from hardcoded data
    cat_table = sa.table(
        "budget_categories",
        sa.column("name", sa.String),
        sa.column("label", sa.String),
        sa.column("tax_deductible", sa.Boolean),
        sa.column("tax_notes", sa.String),
        sa.column("sort_order", sa.Integer),
    )
    op.bulk_insert(cat_table, [
        {"name": name, "label": label, "tax_deductible": tax, "tax_notes": notes, "sort_order": order}
        for name, (label, tax, notes, order) in SEEDS.items()
    ])

    # 3. Drop tax fields from budgets (now on budget_categories)
    op.drop_column("budgets", "tax_deductible")
    op.drop_column("budgets", "tax_notes")


def downgrade():
    op.add_column("budgets", sa.Column("tax_notes", sa.String(256), nullable=True))
    op.add_column("budgets", sa.Column("tax_deductible", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.drop_table("budget_categories")
