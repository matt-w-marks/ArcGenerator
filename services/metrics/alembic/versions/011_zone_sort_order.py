"""Add sort_order to zones, set anchor priorities

Revision ID: 011
Revises: 010
Create Date: 2026-04-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("zones", sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"))

    # Set explicit ordering for the two airport anchors
    op.execute(sa.text(
        "UPDATE zones SET sort_order = 1 WHERE name = 'PHX Sky Harbor — Primary Staging'"
    ))
    op.execute(sa.text(
        "UPDATE zones SET sort_order = 2 WHERE name = 'PHX Sky Harbor — 44th St Sky Train'"
    ))


def downgrade() -> None:
    op.drop_column("zones", "sort_order")
