"""Add maintenance_records, checklist_items, checklist_logs tables

Revision ID: 019
Revises: 018
Create Date: 2026-04-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "019"
down_revision: Union[str, None] = "018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── maintenance_records ───────────────────────────────────────────────────
    op.create_table(
        "maintenance_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("service_date", sa.Date, nullable=False),
        sa.Column("shop_name", sa.String(128), nullable=False, server_default="Jim's Garage"),
        sa.Column("service_type", sa.String(32), nullable=False),
        sa.Column("description", sa.String(256), nullable=True),
        sa.Column("mileage", sa.Integer, nullable=True),
        sa.Column("cost", sa.Numeric(8, 2), nullable=True),
        sa.Column("next_due_miles", sa.Integer, nullable=True),
        sa.Column("next_due_date", sa.Date, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )

    # ── checklist_items ───────────────────────────────────────────────────────
    op.create_table(
        "checklist_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("checklist_type", sa.String(16), nullable=False),
        sa.Column("label", sa.String(128), nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_checklist_items_type", "checklist_items", ["checklist_type"])

    # ── checklist_logs ────────────────────────────────────────────────────────
    op.create_table(
        "checklist_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("checklist_type", sa.String(16), nullable=False),
        sa.Column("log_date", sa.Date, nullable=False),
        sa.Column("checked_ids", postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
                  nullable=False, server_default="{}"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_checklist_logs_type", "checklist_logs", ["checklist_type"])
    op.create_index("ix_checklist_logs_date", "checklist_logs", ["log_date"])

    # ── Seed default checklist items ──────────────────────────────────────────
    op.execute(sa.text("""
        INSERT INTO checklist_items (id, checklist_type, label, sort_order) VALUES
        -- Pre-Day (before starting shift)
        (gen_random_uuid(), 'pre_day',  'Tire pressure checked (all 4)',            1),
        (gen_random_uuid(), 'pre_day',  'Oil level checked',                        2),
        (gen_random_uuid(), 'pre_day',  'Fuel at least half tank',                  3),
        (gen_random_uuid(), 'pre_day',  'Washer fluid topped off',                  4),
        (gen_random_uuid(), 'pre_day',  'Windshield clean inside and out',           5),
        (gen_random_uuid(), 'pre_day',  'Interior clean and presentable',            6),
        (gen_random_uuid(), 'pre_day',  'Phone mount secure and charging',           7),
        (gen_random_uuid(), 'pre_day',  'Both apps logged in and accepting trips',   8),
        (gen_random_uuid(), 'pre_day',  'Dash cam on and recording',                9),
        (gen_random_uuid(), 'pre_day',  'Water and snacks loaded',                  10),

        -- Post-Day (end of shift)
        (gen_random_uuid(), 'post_day', 'Final odometer reading logged',             1),
        (gen_random_uuid(), 'post_day', 'Fuel filled if below quarter tank',         2),
        (gen_random_uuid(), 'post_day', 'Trash removed from vehicle',               3),
        (gen_random_uuid(), 'post_day', 'Any mechanical issues noted',              4),
        (gen_random_uuid(), 'post_day', 'Both apps set to offline',                 5),
        (gen_random_uuid(), 'post_day', 'Vehicle locked and secured',               6),

        -- Pre-Trip (quick check before pickup)
        (gen_random_uuid(), 'pre_trip', 'Pickup location confirmed in app',          1),
        (gen_random_uuid(), 'pre_trip', 'Route looks correct',                      2),
        (gen_random_uuid(), 'pre_trip', 'Car clean for passenger',                  3),

        -- Post-Trip (after drop-off)
        (gen_random_uuid(), 'post_trip', 'Check rear seats for forgotten items',    1),
        (gen_random_uuid(), 'post_trip', 'Rate the rider',                          2),
        (gen_random_uuid(), 'post_trip', 'Note any passenger or route issues',      3)
    """))


def downgrade() -> None:
    op.drop_index("ix_checklist_logs_date", "checklist_logs")
    op.drop_index("ix_checklist_logs_type", "checklist_logs")
    op.drop_table("checklist_logs")
    op.drop_index("ix_checklist_items_type", "checklist_items")
    op.drop_table("checklist_items")
    op.drop_table("maintenance_records")
