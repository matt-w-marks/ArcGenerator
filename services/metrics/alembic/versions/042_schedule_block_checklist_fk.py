"""Add checklist_id FK to schedule_blocks for linking calendar blocks to checklist templates.

Revision ID: 042
Revises: 041
Create Date: 2026-04-06
"""

revision = "042"
down_revision = "041"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    op.add_column("schedule_blocks", sa.Column("checklist_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_schedule_blocks_checklist_id", "schedule_blocks", "checklists",
        ["checklist_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_schedule_blocks_checklist_id", "schedule_blocks", ["checklist_id"])


def downgrade():
    op.drop_index("ix_schedule_blocks_checklist_id", "schedule_blocks")
    op.drop_constraint("fk_schedule_blocks_checklist_id", "schedule_blocks", type_="foreignkey")
    op.drop_column("schedule_blocks", "checklist_id")
