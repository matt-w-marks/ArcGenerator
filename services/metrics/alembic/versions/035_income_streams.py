"""Add income_streams, income_entries tables; fix job_activities; add income_stream_id FKs.

Revision ID: 035
Revises: 034
Create Date: 2026-04-05
"""

revision = "035"
down_revision = "034"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    # ── income_streams ──────────────────────────────────────────────────────
    op.create_table(
        "income_streams",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("stream_type", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        # Venture fields
        sa.Column("venture_type", sa.String(32), nullable=True),
        # Role fields
        sa.Column("company", sa.String(128), nullable=True),
        sa.Column("title", sa.String(128), nullable=True),
        sa.Column("role_type", sa.String(16), nullable=True),
        sa.Column("compensation_type", sa.String(16), nullable=True),
        sa.Column("compensation_rate", sa.Numeric(10, 2), nullable=True),
        sa.Column("pay_frequency", sa.String(16), nullable=True),
        # Engagement fields
        sa.Column("client", sa.String(128), nullable=True),
        sa.Column("engagement_type", sa.String(32), nullable=True),
        sa.Column("rate", sa.Numeric(10, 2), nullable=True),
        sa.Column("rate_unit", sa.String(16), nullable=True),
        # Common
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("description", sa.String(512), nullable=True),
        sa.Column("notes", sa.String(512), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_income_streams_stream_type", "income_streams", ["stream_type"])
    op.create_index("ix_income_streams_status", "income_streams", ["status"])

    # ── income_entries ──────────────────────────────────────────────────────
    op.create_table(
        "income_entries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("income_stream_id", UUID(as_uuid=True), sa.ForeignKey("income_streams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("hours", sa.Numeric(6, 2), nullable=True),
        sa.Column("amount", sa.Numeric(10, 2), nullable=True),
        sa.Column("description", sa.String(256), nullable=True),
        sa.Column("notes", sa.String(512), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_income_entries_income_stream_id", "income_entries", ["income_stream_id"])
    op.create_index("ix_income_entries_entry_date", "income_entries", ["entry_date"])

    # ── Add income_stream_id FK to existing tables ──────────────────────────
    for table in ("business_expenses", "recurring_expenses", "budget_items"):
        op.add_column(table, sa.Column("income_stream_id", UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            f"fk_{table}_income_stream_id", table, "income_streams",
            ["income_stream_id"], ["id"], ondelete="SET NULL",
        )
        op.create_index(f"ix_{table}_income_stream_id", table, ["income_stream_id"])

    # ── Fix job_activities: drop aggregate columns, add per-application columns ─
    op.drop_column("job_activities", "applications_submitted")
    op.drop_column("job_activities", "linkedin_connections")
    op.drop_column("job_activities", "recruiter_contacts")
    op.drop_column("job_activities", "updated_at")
    op.add_column("job_activities", sa.Column("company", sa.String(128), nullable=False, server_default=""))
    op.add_column("job_activities", sa.Column("role_title", sa.String(128), nullable=False, server_default=""))
    op.add_column("job_activities", sa.Column("status", sa.String(32), nullable=False, server_default="applied"))
    op.add_column("job_activities", sa.Column("applied_date", sa.Date(), nullable=True))
    op.add_column("job_activities", sa.Column("notes", sa.String(512), nullable=True))
    # Rename 'date' to keep it but it's now less relevant — keep for backward compat
    # The frontend uses applied_date, so backfill it from date
    op.execute(sa.text("UPDATE job_activities SET applied_date = date WHERE applied_date IS NULL"))

    # ── Seed rideshare venture ──────────────────────────────────────────────
    op.execute(sa.text(
        "INSERT INTO income_streams (id, name, stream_type, status, venture_type, start_date, created_at) "
        "VALUES (gen_random_uuid(), 'Rideshare', 'venture', 'active', 'rideshare', '2026-01-01', now())"
    ))


def downgrade():
    # Remove seed
    op.execute(sa.text("DELETE FROM income_streams WHERE name = 'Rideshare' AND stream_type = 'venture'"))

    # Revert job_activities
    op.drop_column("job_activities", "notes")
    op.drop_column("job_activities", "applied_date")
    op.drop_column("job_activities", "status")
    op.drop_column("job_activities", "role_title")
    op.drop_column("job_activities", "company")
    op.add_column("job_activities", sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.add_column("job_activities", sa.Column("recruiter_contacts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("job_activities", sa.Column("linkedin_connections", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("job_activities", sa.Column("applications_submitted", sa.Integer(), nullable=False, server_default="0"))

    # Remove income_stream_id FKs
    for table in ("budget_items", "recurring_expenses", "business_expenses"):
        op.drop_index(f"ix_{table}_income_stream_id", table)
        op.drop_constraint(f"fk_{table}_income_stream_id", table, type_="foreignkey")
        op.drop_column(table, "income_stream_id")

    # Drop new tables
    op.drop_table("income_entries")
    op.drop_table("income_streams")
