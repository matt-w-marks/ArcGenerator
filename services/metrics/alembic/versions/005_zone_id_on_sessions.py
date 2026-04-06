"""Replace driving_sessions.zone text with zone_id UUID FK

Revision ID: 005
Revises: 004
Create Date: 2026-04-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("driving_sessions", "zone")
    op.add_column(
        "driving_sessions",
        sa.Column("zone_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_driving_sessions_zone_id",
        "driving_sessions",
        "zones",
        ["zone_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_driving_sessions_zone_id", "driving_sessions", ["zone_id"])


def downgrade() -> None:
    op.drop_index("ix_driving_sessions_zone_id", table_name="driving_sessions")
    op.drop_constraint("fk_driving_sessions_zone_id", "driving_sessions", type_="foreignkey")
    op.drop_column("driving_sessions", "zone_id")
    op.add_column("driving_sessions", sa.Column("zone", sa.String(128), nullable=True))
