"""Replace single platform_id with platform_ids UUID array on schedule_blocks

Revision ID: 017
Revises: 016
Create Date: 2026-04-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "017"
down_revision: Union[str, None] = "016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new array column
    op.add_column(
        "schedule_blocks",
        sa.Column(
            "platform_ids",
            postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
            nullable=False,
            server_default="{}",
        ),
    )

    # Migrate existing single-platform data
    op.execute(sa.text(
        "UPDATE schedule_blocks SET platform_ids = ARRAY[platform_id]"
        " WHERE platform_id IS NOT NULL"
    ))

    # Drop old column (removes FK constraint + index automatically)
    op.drop_column("schedule_blocks", "platform_id")


def downgrade() -> None:
    op.add_column(
        "schedule_blocks",
        sa.Column(
            "platform_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("platforms.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Restore first element of array
    op.execute(sa.text(
        "UPDATE schedule_blocks"
        " SET platform_id = platform_ids[1]"
        " WHERE array_length(platform_ids, 1) >= 1"
    ))

    op.drop_column("schedule_blocks", "platform_ids")
