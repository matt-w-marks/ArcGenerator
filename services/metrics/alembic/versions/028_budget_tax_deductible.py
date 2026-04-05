"""Add tax_deductible flag and tax_notes to budgets table.

Revision ID: 028
Revises: 027
Create Date: 2026-04-05
"""

revision = "028"
down_revision = "027"

from alembic import op
import sqlalchemy as sa


# IRS Schedule C deductibility for rideshare drivers
TAX_INFO = {
    "fuel":                   (True,  "Deductible if not using standard mileage rate. Cannot claim both gas AND mileage deduction."),
    "vehicle_maintenance":    (True,  "Deductible if not using standard mileage rate. Repairs, oil changes, tires, brakes."),
    "vehicle_supplies":       (True,  "Deductible. Cleaning supplies, phone mounts, dash cams — ordinary and necessary business expenses."),
    "vehicle_rental":         (True,  "Deductible. Hertz rental is a business vehicle expense (Schedule C, Line 20a)."),
    "insurance":              (True,  "Deductible. Vehicle insurance prorated by business use percentage."),
    "tolls_parking":          (True,  "Deductible. Tolls and parking for business use are always deductible, even with standard mileage."),
    "food_meals":             (False, "NOT deductible. Driver meals during shifts are personal expenses per IRS rules."),
    "technology":             (True,  "Deductible. Phone plan prorated by business use %. Apps and subscriptions used for work."),
    "licensing":              (True,  "Deductible. Business licenses, permits, regulatory fees (Schedule C, Line 22)."),
    "professional_services":  (True,  "Deductible. Tax prep, legal, accounting fees (Schedule C, Line 17)."),
    "other":                  (False, "Depends on the expense. Must be ordinary and necessary for the business."),
}


def upgrade():
    op.add_column("budgets", sa.Column("tax_deductible", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("budgets", sa.Column("tax_notes", sa.String(256), nullable=True))

    # Update existing seeds with tax info
    budgets = sa.table(
        "budgets",
        sa.column("budget_category", sa.String),
        sa.column("tax_deductible", sa.Boolean),
        sa.column("tax_notes", sa.String),
    )
    for cat, (deductible, notes) in TAX_INFO.items():
        op.execute(
            budgets.update()
            .where(budgets.c.budget_category == cat)
            .values(tax_deductible=deductible, tax_notes=notes)
        )


def downgrade():
    op.drop_column("budgets", "tax_notes")
    op.drop_column("budgets", "tax_deductible")
