"""Driving session v2: replace hours_worked/gas_cost with start_time/end_time/odometer fields

Revision ID: 002
Revises: 001
Create Date: 2026-04-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("driving_sessions", "hours_worked")
    op.drop_column("driving_sessions", "gas_cost")
    op.add_column("driving_sessions", sa.Column("start_time", sa.Time, nullable=True))
    op.add_column("driving_sessions", sa.Column("end_time",   sa.Time, nullable=True))
    op.add_column("driving_sessions", sa.Column("odometer_start", sa.Numeric(8, 1), nullable=True))
    op.add_column("driving_sessions", sa.Column("odometer_end",   sa.Numeric(8, 1), nullable=True))


def downgrade() -> None:
    op.drop_column("driving_sessions", "start_time")
    op.drop_column("driving_sessions", "end_time")
    op.drop_column("driving_sessions", "odometer_start")
    op.drop_column("driving_sessions", "odometer_end")
    op.add_column("driving_sessions", sa.Column("hours_worked", sa.Numeric(6, 2), nullable=False, server_default="0"))
    op.add_column("driving_sessions", sa.Column("gas_cost",     sa.Numeric(8, 2), nullable=False, server_default="0"))
