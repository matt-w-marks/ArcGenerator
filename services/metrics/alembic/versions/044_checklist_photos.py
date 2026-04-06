"""Add allow_photos flag to checklists, create checklist_log_photos table for evidence storage.

Revision ID: 044
Revises: 043
Create Date: 2026-04-06
"""

revision = "044"
down_revision = "043"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    # Flag templates that support photo evidence
    op.add_column("checklists", sa.Column("allow_photos", sa.Boolean(), nullable=False, server_default="false"))

    # Photos attached to specific checklist log entries (completions)
    op.create_table(
        "checklist_log_photos",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("checklist_log_id", UUID(as_uuid=True), sa.ForeignKey("checklist_logs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("photo_data", sa.LargeBinary(), nullable=False),
        sa.Column("photo_mime", sa.String(64), nullable=False),
        sa.Column("caption", sa.String(256), nullable=True),
        sa.Column("uploaded_by", UUID(as_uuid=True), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_checklist_log_photos_log_id", "checklist_log_photos", ["checklist_log_id"])


def downgrade():
    op.drop_index("ix_checklist_log_photos_log_id", "checklist_log_photos")
    op.drop_table("checklist_log_photos")
    op.drop_column("checklists", "allow_photos")
