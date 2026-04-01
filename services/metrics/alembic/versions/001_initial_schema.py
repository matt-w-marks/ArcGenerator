"""Initial schema: driving_sessions, job_activities, financial_snapshots, weekly_rollups

Revision ID: 001
Revises:
Create Date: 2026-03-31

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "driving_sessions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("hours_worked", sa.Numeric(6, 2), nullable=False),
        sa.Column("gross_earnings", sa.Numeric(10, 2), nullable=False),
        sa.Column("gas_cost", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column("trip_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("zone", sa.String(128), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_driving_sessions_date", "driving_sessions", ["date"])

    op.create_table(
        "job_activities",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column(
            "applications_submitted", sa.Integer, nullable=False, server_default="0"
        ),
        sa.Column(
            "linkedin_connections", sa.Integer, nullable=False, server_default="0"
        ),
        sa.Column(
            "recruiter_contacts", sa.Integer, nullable=False, server_default="0"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_job_activities_date", "job_activities", ["date"])

    op.create_table(
        "financial_snapshots",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("bankroll", sa.Numeric(12, 2), nullable=False),
        sa.Column("weekly_expenses", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "tax_accrual", sa.Numeric(10, 2), nullable=False, server_default="0"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("date", name="uq_financial_snapshots_date"),
    )
    op.create_index("ix_financial_snapshots_date", "financial_snapshots", ["date"])

    op.create_table(
        "weekly_rollups",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("week_start", sa.Date, nullable=False),
        sa.Column(
            "total_hours", sa.Numeric(8, 2), nullable=False, server_default="0"
        ),
        sa.Column(
            "total_earnings", sa.Numeric(10, 2), nullable=False, server_default="0"
        ),
        sa.Column("total_gas", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column("total_trips", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "total_applications", sa.Integer, nullable=False, server_default="0"
        ),
        sa.Column("total_linkedin", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "total_recruiter_contacts", sa.Integer, nullable=False, server_default="0"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("week_start", name="uq_weekly_rollups_week_start"),
    )
    op.create_index("ix_weekly_rollups_week_start", "weekly_rollups", ["week_start"])


def downgrade() -> None:
    op.drop_table("weekly_rollups")
    op.drop_table("financial_snapshots")
    op.drop_table("job_activities")
    op.drop_table("driving_sessions")
