"""Create zone_schedules table

Revision ID: 006
Revises: 005
Create Date: 2026-04-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "zone_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "zone_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("zones.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("day_type",     sa.String(16), nullable=False),
        sa.Column("hour_start",   sa.Integer,    nullable=False),
        sa.Column("hour_end",     sa.Integer,    nullable=False),
        sa.Column("heat",         sa.String(16), nullable=False),
        sa.Column("service_type", sa.String(16), nullable=False),
        sa.Column("notes",        sa.Text,       nullable=True),
        sa.Column("created_at",   sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("zone_id", "day_type", "hour_start", name="uq_zone_schedules_slot"),
    )
    op.create_index("ix_zone_schedules_zone_id",  "zone_schedules", ["zone_id"])
    op.create_index("ix_zone_schedules_day_type", "zone_schedules", ["day_type"])


def downgrade() -> None:
    op.drop_table("zone_schedules")
