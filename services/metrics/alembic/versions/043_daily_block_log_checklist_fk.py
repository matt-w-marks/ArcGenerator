"""Add checklist_id FK to daily_block_logs for ad-hoc checklist blocks.

Revision ID: 043
Revises: 042
Create Date: 2026-04-06
"""

revision = "043"
down_revision = "042"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    op.add_column("daily_block_logs", sa.Column("checklist_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_daily_block_logs_checklist_id", "daily_block_logs", "checklists",
        ["checklist_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_daily_block_logs_checklist_id", "daily_block_logs", ["checklist_id"])


def downgrade():
    op.drop_index("ix_daily_block_logs_checklist_id", "daily_block_logs")
    op.drop_constraint("fk_daily_block_logs_checklist_id", "daily_block_logs", type_="foreignkey")
    op.drop_column("daily_block_logs", "checklist_id")
