"""Add is_credit flag to business_expenses for refunds and deposits.

Revision ID: 036
Revises: 035
Create Date: 2026-04-05
"""

revision = "036"
down_revision = "035"

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column("business_expenses", sa.Column("is_credit", sa.Boolean(), nullable=False, server_default="false"))


def downgrade():
    op.drop_column("business_expenses", "is_credit")
