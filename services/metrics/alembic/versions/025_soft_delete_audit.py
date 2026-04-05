"""Add soft delete columns to daily tables, create audit_logs table.

Revision ID: 025
Revises: 024
Create Date: 2026-04-05
"""

revision = "025"
down_revision = "024"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    # ── Soft delete on daily_block_logs ────────────────────────────────────────
    op.add_column("daily_block_logs", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("daily_block_logs", sa.Column("deleted_by", UUID(as_uuid=True), nullable=True))

    # ── Soft delete on daily_expenses ──────────────────────────────────────────
    op.add_column("daily_expenses", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("daily_expenses", sa.Column("deleted_by", UUID(as_uuid=True), nullable=True))

    # ── Soft delete on daily_platform_earnings ─────────────────────────────────
    op.add_column("daily_platform_earnings", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("daily_platform_earnings", sa.Column("deleted_by", UUID(as_uuid=True), nullable=True))

    # ── Audit log table ───────────────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.func.gen_random_uuid()),
        sa.Column("table_name", sa.String(64), nullable=False, index=True),
        sa.Column("record_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("action", sa.String(16), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("changes", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade():
    op.drop_table("audit_logs")
    op.drop_column("daily_platform_earnings", "deleted_by")
    op.drop_column("daily_platform_earnings", "deleted_at")
    op.drop_column("daily_expenses", "deleted_by")
    op.drop_column("daily_expenses", "deleted_at")
    op.drop_column("daily_block_logs", "deleted_by")
    op.drop_column("daily_block_logs", "deleted_at")
