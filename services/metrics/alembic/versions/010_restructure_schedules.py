"""Replace date-based schedule_blocks + templates with schedules / schedule_blocks / calendar_entries

Revision ID: 010
Revises: 009
Create Date: 2026-04-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. New `schedules` table (replaces schedule_templates) ────────────────
    op.create_table(
        "schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(64), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )

    # Migrate any existing schedule_templates rows
    op.execute(sa.text(
        "INSERT INTO schedules (id, name, description, created_at, updated_at) "
        "SELECT id, name, description, created_at, updated_at FROM schedule_templates"
    ))

    # ── 2. New `schedule_blocks` (schedule_id-based, replaces both old tables) ─
    op.create_table(
        "schedule_blocks_new",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("schedule_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("schedules.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("hour_start", sa.Integer(), nullable=False),
        sa.Column("hour_end", sa.Integer(), nullable=False),
        sa.Column("block_type", sa.String(16), nullable=False),
        sa.Column("zone_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("zones.id", ondelete="SET NULL"), nullable=True),
        sa.Column("label", sa.String(128), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )

    # Migrate template_blocks → new schedule_blocks
    op.execute(sa.text(
        "INSERT INTO schedule_blocks_new "
        "  (id, schedule_id, hour_start, hour_end, block_type, zone_id, label, notes, sort_order, created_at) "
        "SELECT id, template_id, hour_start, hour_end, block_type, zone_id, label, notes, sort_order, created_at "
        "FROM template_blocks"
    ))

    # ── 3. Drop old tables ────────────────────────────────────────────────────
    op.drop_table("template_blocks")
    op.drop_table("schedule_blocks")        # old date-based table
    op.drop_table("schedule_templates")

    # ── 4. Rename new table into place ────────────────────────────────────────
    op.rename_table("schedule_blocks_new", "schedule_blocks")

    # ── 5. `calendar_entries` — assigns a schedule to a calendar date ─────────
    op.create_table(
        "calendar_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("schedule_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("schedules.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("entry_date", sa.Date(), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_calendar_entries_entry_date", "calendar_entries", ["entry_date"])


def downgrade() -> None:
    op.drop_table("calendar_entries")
    op.drop_table("schedule_blocks")
    op.drop_table("schedules")
