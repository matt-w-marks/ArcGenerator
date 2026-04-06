"""Add income_stream_id FK to schedule_blocks for universal calendar.

Revision ID: 040
Revises: 039
Create Date: 2026-04-06
"""

revision = "040"
down_revision = "039"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    op.add_column("schedule_blocks", sa.Column("income_stream_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_schedule_blocks_income_stream_id", "schedule_blocks", "income_streams",
        ["income_stream_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_schedule_blocks_income_stream_id", "schedule_blocks", ["income_stream_id"])


def downgrade():
    op.drop_index("ix_schedule_blocks_income_stream_id", "schedule_blocks")
    op.drop_constraint("fk_schedule_blocks_income_stream_id", "schedule_blocks", type_="foreignkey")
    op.drop_column("schedule_blocks", "income_stream_id")
