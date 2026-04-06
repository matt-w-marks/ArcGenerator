"""Add soft delete to budget_items.

Revision ID: 037
Revises: 036
Create Date: 2026-04-05
"""

revision = "037"
down_revision = "036"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    op.add_column("budget_items", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("budget_items", sa.Column("deleted_by", sa.UUID(), nullable=True))


def downgrade():
    op.drop_column("budget_items", "deleted_by")
    op.drop_column("budget_items", "deleted_at")
