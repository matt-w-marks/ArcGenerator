"""Create schedule_blocks, schedule_templates, template_blocks tables

Revision ID: 009
Revises: 008
Create Date: 2026-04-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── schedule_templates ────────────────────────────────────────────────────
    op.create_table(
        "schedule_templates",
        sa.Column("id",          postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name",        sa.String(64),  nullable=False, unique=True),
        sa.Column("description", sa.Text,        nullable=True),
        sa.Column("created_at",  sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at",  sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── template_blocks ───────────────────────────────────────────────────────
    op.create_table(
        "template_blocks",
        sa.Column("id",          postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("schedule_templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("hour_start",  sa.Integer,    nullable=False),
        sa.Column("hour_end",    sa.Integer,    nullable=False),
        sa.Column("block_type",  sa.String(16), nullable=False),
        sa.Column("zone_id",     postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("zones.id", ondelete="SET NULL"), nullable=True),
        sa.Column("label",       sa.String(128), nullable=False),
        sa.Column("notes",       sa.Text,        nullable=True),
        sa.Column("sort_order",  sa.Integer,    nullable=False, server_default="0"),
        sa.Column("created_at",  sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_template_blocks_template_id", "template_blocks", ["template_id"])

    # ── schedule_blocks ───────────────────────────────────────────────────────
    op.create_table(
        "schedule_blocks",
        sa.Column("id",         postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("block_date", sa.Date,        nullable=False),
        sa.Column("hour_start", sa.Integer,     nullable=False),
        sa.Column("hour_end",   sa.Integer,     nullable=False),
        sa.Column("block_type", sa.String(16),  nullable=False),
        sa.Column("zone_id",    postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("zones.id", ondelete="SET NULL"), nullable=True),
        sa.Column("label",      sa.String(128), nullable=False),
        sa.Column("notes",      sa.Text,        nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_schedule_blocks_block_date", "schedule_blocks", ["block_date"])
    op.create_index("ix_schedule_blocks_zone_id",    "schedule_blocks", ["zone_id"])


def downgrade() -> None:
    op.drop_table("schedule_blocks")
    op.drop_table("template_blocks")
    op.drop_table("schedule_templates")
