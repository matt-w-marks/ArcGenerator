"""Switch receipt storage from file path to BYTEA in database.

Drop receipt_path columns, add receipt_data (BYTEA) and receipt_mime (VARCHAR)
to business_expenses, daily_expenses, and maintenance_records.

Revision ID: 027
Revises: 026
Create Date: 2026-04-05
"""

revision = "027"
down_revision = "026"

from alembic import op
import sqlalchemy as sa


def upgrade():
    for table in ("business_expenses", "daily_expenses", "maintenance_records"):
        op.drop_column(table, "receipt_path")
        op.add_column(table, sa.Column("receipt_data", sa.LargeBinary(), nullable=True))
        op.add_column(table, sa.Column("receipt_mime", sa.String(64), nullable=True))


def downgrade():
    for table in ("business_expenses", "daily_expenses", "maintenance_records"):
        op.drop_column(table, "receipt_mime")
        op.drop_column(table, "receipt_data")
        op.add_column(table, sa.Column("receipt_path", sa.String(512), nullable=True))
