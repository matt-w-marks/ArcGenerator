"""Add shift log fields to schedule_blocks, create block_expenses and block_platform_earnings

Revision ID: 022
Revises: 021
Create Date: 2026-04-04
"""

revision = "022"
down_revision = "021"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    # ── Expand schedule_blocks with shift-log fields ──────────────────────────
    op.add_column("schedule_blocks", sa.Column("trip_count", sa.Integer(), nullable=True))
    op.add_column("schedule_blocks", sa.Column("actual_start", sa.Time(), nullable=True))
    op.add_column("schedule_blocks", sa.Column("actual_end", sa.Time(), nullable=True))
    op.add_column("schedule_blocks", sa.Column("odometer_start", sa.Numeric(8, 1), nullable=True))
    op.add_column("schedule_blocks", sa.Column("odometer_end", sa.Numeric(8, 1), nullable=True))
    op.add_column("schedule_blocks", sa.Column("miles_driven", sa.Numeric(6, 1), nullable=True))
    op.add_column("schedule_blocks", sa.Column("log_notes", sa.Text(), nullable=True))

    # ── Per-block expenses ────────────────────────────────────────────────────
    op.create_table(
        "block_expenses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("block_id", UUID(as_uuid=True), sa.ForeignKey("schedule_blocks.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("category", sa.String(32), nullable=False),  # gas, tolls, parking, car_wash, food, other
        sa.Column("amount", sa.Numeric(8, 2), nullable=False),
        sa.Column("description", sa.String(256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── Per-platform earnings breakdown per block ─────────────────────────────
    op.create_table(
        "block_platform_earnings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("block_id", UUID(as_uuid=True), sa.ForeignKey("schedule_blocks.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("platform_id", UUID(as_uuid=True), sa.ForeignKey("platforms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("earnings", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column("trip_count", sa.Integer(), nullable=True),
        sa.UniqueConstraint("block_id", "platform_id", name="uq_block_platform"),
    )


def downgrade():
    op.drop_table("block_platform_earnings")
    op.drop_table("block_expenses")
    op.drop_column("schedule_blocks", "log_notes")
    op.drop_column("schedule_blocks", "miles_driven")
    op.drop_column("schedule_blocks", "odometer_end")
    op.drop_column("schedule_blocks", "odometer_start")
    op.drop_column("schedule_blocks", "actual_end")
    op.drop_column("schedule_blocks", "actual_start")
    op.drop_column("schedule_blocks", "trip_count")
