"""Add actual_gross to schedule_blocks

Revision ID: 014
Revises: 013
Create Date: 2026-04-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "schedule_blocks",
        sa.Column("actual_gross", sa.Numeric(8, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("schedule_blocks", "actual_gross")
