"""Make daily_block_logs universal — nullable block_id, add block_type, label, income_stream_id, hour_start, hour_end.

Revision ID: 041
Revises: 040
Create Date: 2026-04-06
"""

revision = "041"
down_revision = "040"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    # Make block_id nullable for ad-hoc blocks
    op.alter_column("daily_block_logs", "block_id", nullable=True)
    # Drop the unique constraint that requires block_id
    op.drop_constraint("uq_daily_block_log", "daily_block_logs", type_="unique")
    # Re-create as a partial unique (block_id + entry_date only when block_id is not null)
    op.create_index("ix_daily_block_logs_block_entry", "daily_block_logs", ["block_id", "entry_date"], unique=True,
                    postgresql_where=sa.text("block_id IS NOT NULL"))

    # New fields for ad-hoc and universal blocks
    op.add_column("daily_block_logs", sa.Column("block_type", sa.String(16), nullable=True))
    op.add_column("daily_block_logs", sa.Column("label", sa.String(128), nullable=True))
    op.add_column("daily_block_logs", sa.Column("income_stream_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_daily_block_logs_income_stream", "daily_block_logs", "income_streams",
                          ["income_stream_id"], ["id"], ondelete="SET NULL")
    op.add_column("daily_block_logs", sa.Column("hour_start", sa.Numeric(4, 1), nullable=True))
    op.add_column("daily_block_logs", sa.Column("hour_end", sa.Numeric(4, 1), nullable=True))


def downgrade():
    op.drop_column("daily_block_logs", "hour_end")
    op.drop_column("daily_block_logs", "hour_start")
    op.drop_constraint("fk_daily_block_logs_income_stream", "daily_block_logs", type_="foreignkey")
    op.drop_column("daily_block_logs", "income_stream_id")
    op.drop_column("daily_block_logs", "label")
    op.drop_column("daily_block_logs", "block_type")
    op.drop_index("ix_daily_block_logs_block_entry", "daily_block_logs")
    op.create_unique_constraint("uq_daily_block_log", "daily_block_logs", ["block_id", "entry_date"])
    op.alter_column("daily_block_logs", "block_id", nullable=False)
