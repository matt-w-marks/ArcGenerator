"""Create platforms table; add platform_id to schedule_blocks

Revision ID: 015
Revises: 014
Create Date: 2026-04-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "platforms",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(64), nullable=False, unique=True),
        sa.Column("category", sa.String(16), nullable=False),   # rides | food | other
        sa.Column("color", sa.String(7), nullable=True),        # hex e.g. #000000
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )

    # Seed platforms
    op.execute(sa.text("""
        INSERT INTO platforms (id, name, category, color, sort_order)
        VALUES
          (gen_random_uuid(), 'Uber',       'rides', '#000000', 1),
          (gen_random_uuid(), 'Lyft',       'rides', '#EA0B8C', 2),
          (gen_random_uuid(), 'Uber Eats',  'food',  '#06C167', 3),
          (gen_random_uuid(), 'Grubhub',    'food',  '#F63440', 4)
        ON CONFLICT (name) DO NOTHING;
    """))

    # Add platform_id FK to schedule_blocks
    op.add_column(
        "schedule_blocks",
        sa.Column("platform_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("platforms.id", ondelete="SET NULL"),
                  nullable=True, index=True),
    )


def downgrade() -> None:
    op.drop_column("schedule_blocks", "platform_id")
    op.drop_table("platforms")
