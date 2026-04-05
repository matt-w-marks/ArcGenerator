"""Create daily_block_logs, daily_expenses, daily_platform_earnings.
Drop block_expenses, block_platform_earnings (verified empty).
Remove shift-log fields from schedule_blocks (pure template).

Resolution of REPORTING_HANDOFF_v2 decision tree:
- block_expenses: 0 rows, safe to drop
- block_platform_earnings: 0 rows, safe to drop
- Child tables recreated with FK to daily_block_logs instead of schedule_blocks
- Shift-log fields (actual_gross, trip_count, actual_start, actual_end,
  odometer_start, odometer_end, miles_driven, log_notes) moved from
  schedule_blocks to daily_block_logs. schedule_blocks is now pure template.

Revision ID: 023
Revises: 022
Create Date: 2026-04-05
"""

revision = "023"
down_revision = "022"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    # ── 1. Create daily_block_logs ────────────────────────────────────────────
    op.create_table(
        "daily_block_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.func.gen_random_uuid()),
        sa.Column("block_id", UUID(as_uuid=True), sa.ForeignKey("schedule_blocks.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("actual_gross", sa.Numeric(8, 2), nullable=True),
        sa.Column("trip_count", sa.Integer(), nullable=True),
        sa.Column("actual_start", sa.Time(), nullable=True),
        sa.Column("actual_end", sa.Time(), nullable=True),
        sa.Column("odometer_start", sa.Numeric(8, 1), nullable=True),
        sa.Column("odometer_end", sa.Numeric(8, 1), nullable=True),
        sa.Column("miles_driven", sa.Numeric(6, 1), nullable=True),
        sa.Column("surge_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("active_hours", sa.Numeric(4, 2), nullable=True),
        sa.Column("log_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("block_id", "entry_date", name="uq_daily_block_log"),
    )

    # ── 2. Drop old child tables (verified empty) ─────────────────────────────
    op.drop_table("block_platform_earnings")
    op.drop_table("block_expenses")

    # ── 3. Create new child tables referencing daily_block_logs ────────────────
    op.create_table(
        "daily_expenses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.func.gen_random_uuid()),
        sa.Column("daily_block_log_id", UUID(as_uuid=True), sa.ForeignKey("daily_block_logs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("amount", sa.Numeric(8, 2), nullable=False),
        sa.Column("description", sa.String(256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "daily_platform_earnings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.func.gen_random_uuid()),
        sa.Column("daily_block_log_id", UUID(as_uuid=True), sa.ForeignKey("daily_block_logs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("platform_id", UUID(as_uuid=True), sa.ForeignKey("platforms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("earnings", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column("trip_count", sa.Integer(), nullable=True),
        sa.UniqueConstraint("daily_block_log_id", "platform_id", name="uq_daily_platform_earning"),
    )

    # ── 4. Strip shift-log fields from schedule_blocks (pure template) ────────
    op.drop_column("schedule_blocks", "actual_gross")
    op.drop_column("schedule_blocks", "trip_count")
    op.drop_column("schedule_blocks", "actual_start")
    op.drop_column("schedule_blocks", "actual_end")
    op.drop_column("schedule_blocks", "odometer_start")
    op.drop_column("schedule_blocks", "odometer_end")
    op.drop_column("schedule_blocks", "miles_driven")
    op.drop_column("schedule_blocks", "log_notes")


def downgrade():
    # Restore shift-log fields on schedule_blocks
    op.add_column("schedule_blocks", sa.Column("log_notes", sa.Text(), nullable=True))
    op.add_column("schedule_blocks", sa.Column("miles_driven", sa.Numeric(6, 1), nullable=True))
    op.add_column("schedule_blocks", sa.Column("odometer_end", sa.Numeric(8, 1), nullable=True))
    op.add_column("schedule_blocks", sa.Column("odometer_start", sa.Numeric(8, 1), nullable=True))
    op.add_column("schedule_blocks", sa.Column("actual_end", sa.Time(), nullable=True))
    op.add_column("schedule_blocks", sa.Column("actual_start", sa.Time(), nullable=True))
    op.add_column("schedule_blocks", sa.Column("trip_count", sa.Integer(), nullable=True))
    op.add_column("schedule_blocks", sa.Column("actual_gross", sa.Numeric(8, 2), nullable=True))

    # Recreate old child tables
    op.create_table(
        "block_expenses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.func.gen_random_uuid()),
        sa.Column("block_id", UUID(as_uuid=True), sa.ForeignKey("schedule_blocks.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("amount", sa.Numeric(8, 2), nullable=False),
        sa.Column("description", sa.String(256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "block_platform_earnings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.func.gen_random_uuid()),
        sa.Column("block_id", UUID(as_uuid=True), sa.ForeignKey("schedule_blocks.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("platform_id", UUID(as_uuid=True), sa.ForeignKey("platforms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("earnings", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column("trip_count", sa.Integer(), nullable=True),
        sa.UniqueConstraint("block_id", "platform_id", name="uq_block_platform"),
    )

    # Drop new tables
    op.drop_table("daily_platform_earnings")
    op.drop_table("daily_expenses")
    op.drop_table("daily_block_logs")
