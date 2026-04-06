"""Refactor checklists into named entities; add FK refs on schedules

Revision ID: 020
Revises: 019
Create Date: 2026-04-01

Changes:
  - New `checklists` table (named entities with type)
  - `checklist_items.checklist_type` → `checklist_id FK→checklists`
  - `checklist_logs.checklist_type`  → `checklist_id FK→checklists`
  - `schedules` gains `pre_day_checklist_id` and `post_day_checklist_id`
  - Existing seeded items migrated into four default named checklists
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "020"
down_revision: Union[str, None] = "019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Create checklists table ────────────────────────────────────────────
    op.create_table(
        "checklists",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("checklist_type", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_checklists_type", "checklists", ["checklist_type"])

    # ── 2. Seed one named checklist per type from existing items ──────────────
    op.execute(sa.text("""
        INSERT INTO checklists (id, name, checklist_type) VALUES
        (gen_random_uuid(), 'Pre-Day Standard',  'pre_day'),
        (gen_random_uuid(), 'Post-Day Standard', 'post_day'),
        (gen_random_uuid(), 'Pre-Trip Standard', 'pre_trip'),
        (gen_random_uuid(), 'Post-Trip Standard','post_trip')
    """))

    # ── 3. Add checklist_id to checklist_items (nullable first for migration) ─
    op.add_column("checklist_items",
        sa.Column("checklist_id", postgresql.UUID(as_uuid=True), nullable=True))

    op.execute(sa.text("""
        UPDATE checklist_items ci
        SET checklist_id = c.id
        FROM checklists c
        WHERE c.checklist_type = ci.checklist_type
    """))

    op.alter_column("checklist_items", "checklist_id", nullable=False)
    op.create_foreign_key(
        "fk_checklist_items_checklist",
        "checklist_items", "checklists",
        ["checklist_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_checklist_items_checklist_id", "checklist_items", ["checklist_id"])
    op.drop_index("ix_checklist_items_type", "checklist_items")
    op.drop_column("checklist_items", "checklist_type")

    # ── 4. Add checklist_id to checklist_logs ─────────────────────────────────
    op.add_column("checklist_logs",
        sa.Column("checklist_id", postgresql.UUID(as_uuid=True), nullable=True))

    op.execute(sa.text("""
        UPDATE checklist_logs cl
        SET checklist_id = c.id
        FROM checklists c
        WHERE c.checklist_type = cl.checklist_type
    """))

    op.create_foreign_key(
        "fk_checklist_logs_checklist",
        "checklist_logs", "checklists",
        ["checklist_id"], ["id"],
        ondelete="SET NULL",
    )
    op.drop_index("ix_checklist_logs_type", "checklist_logs")
    op.drop_column("checklist_logs", "checklist_type")

    # ── 5. Add checklist FK columns to schedules ──────────────────────────────
    op.add_column("schedules",
        sa.Column("pre_day_checklist_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("schedules",
        sa.Column("post_day_checklist_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_schedules_pre_day_checklist",
        "schedules", "checklists",
        ["pre_day_checklist_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_schedules_post_day_checklist",
        "schedules", "checklists",
        ["post_day_checklist_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_schedules_post_day_checklist", "schedules", type_="foreignkey")
    op.drop_constraint("fk_schedules_pre_day_checklist",  "schedules", type_="foreignkey")
    op.drop_column("schedules", "post_day_checklist_id")
    op.drop_column("schedules", "pre_day_checklist_id")

    # Restore checklist_type on logs
    op.add_column("checklist_logs",
        sa.Column("checklist_type", sa.String(16), nullable=True))
    op.execute(sa.text("""
        UPDATE checklist_logs cl
        SET checklist_type = c.checklist_type
        FROM checklists c
        WHERE c.id = cl.checklist_id
    """))
    op.drop_constraint("fk_checklist_logs_checklist", "checklist_logs", type_="foreignkey")
    op.drop_column("checklist_logs", "checklist_id")
    op.create_index("ix_checklist_logs_type", "checklist_logs", ["checklist_type"])

    # Restore checklist_type on items
    op.add_column("checklist_items",
        sa.Column("checklist_type", sa.String(16), nullable=True))
    op.execute(sa.text("""
        UPDATE checklist_items ci
        SET checklist_type = c.checklist_type
        FROM checklists c
        WHERE c.id = ci.checklist_id
    """))
    op.drop_constraint("fk_checklist_items_checklist", "checklist_items", type_="foreignkey")
    op.drop_index("ix_checklist_items_checklist_id", "checklist_items")
    op.drop_column("checklist_items", "checklist_id")
    op.create_index("ix_checklist_items_type", "checklist_items", ["checklist_type"])

    op.drop_index("ix_checklists_type", "checklists")
    op.drop_table("checklists")
