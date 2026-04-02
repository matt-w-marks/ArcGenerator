"""Float hour_start/hour_end on schedule_blocks; add gross_revenue

Revision ID: 012
Revises: 011
Create Date: 2026-04-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Change hour columns to NUMERIC(4,1) so 0.5-hour increments work
    op.alter_column(
        "schedule_blocks", "hour_start",
        type_=sa.Numeric(4, 1),
        existing_type=sa.Integer(),
        postgresql_using="hour_start::numeric(4,1)",
    )
    op.alter_column(
        "schedule_blocks", "hour_end",
        type_=sa.Numeric(4, 1),
        existing_type=sa.Integer(),
        postgresql_using="hour_end::numeric(4,1)",
    )
    # Add estimated gross revenue for this time window
    op.add_column(
        "schedule_blocks",
        sa.Column("gross_revenue", sa.Numeric(8, 2), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("schedule_blocks", "gross_revenue")
    op.alter_column(
        "schedule_blocks", "hour_start",
        type_=sa.Integer(),
        existing_type=sa.Numeric(4, 1),
        postgresql_using="hour_start::integer",
    )
    op.alter_column(
        "schedule_blocks", "hour_end",
        type_=sa.Integer(),
        existing_type=sa.Numeric(4, 1),
        postgresql_using="hour_end::integer",
    )
