"""Zone expansion: add fields to zones, add event_zones table

Revision ID: 004
Revises: 003
Create Date: 2026-04-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("zones", sa.Column("zone_type",     sa.String(32), nullable=True))
    op.add_column("zones", sa.Column("address",       sa.Text,       nullable=True))
    op.add_column("zones", sa.Column("geo_lat",       sa.Numeric(9, 6), nullable=True))
    op.add_column("zones", sa.Column("geo_lng",       sa.Numeric(9, 6), nullable=True))
    op.add_column("zones", sa.Column("service_types", postgresql.JSON, nullable=True))

    op.create_table(
        "event_zones",
        sa.Column("id",                postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("zone_id",           postgresql.UUID(as_uuid=True), sa.ForeignKey("zones.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_name",        sa.String(128), nullable=False),
        sa.Column("activation_window", sa.Text,        nullable=False),
        sa.Column("impact",            sa.String(32),  nullable=False),
        sa.Column("week_of",           sa.Date,        nullable=False),
        sa.Column("created_at",        sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_event_zones_zone_id",  "event_zones", ["zone_id"])
    op.create_index("ix_event_zones_week_of",  "event_zones", ["week_of"])


def downgrade() -> None:
    op.drop_table("event_zones")
    op.drop_column("zones", "service_types")
    op.drop_column("zones", "geo_lng")
    op.drop_column("zones", "geo_lat")
    op.drop_column("zones", "address")
    op.drop_column("zones", "zone_type")
