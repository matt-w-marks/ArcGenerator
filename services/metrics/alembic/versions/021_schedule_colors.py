"""Add color column to schedules for calendar and dashboard display

Revision ID: 021
Revises: 020
Create Date: 2026-04-02
"""

revision = "021"
down_revision = "020"

from alembic import op
import sqlalchemy as sa


# Default palette for seeded schedules
_SEEDS = {
    "Typical Weekday":   "#38bdf8",  # sky blue
    "Friday + Saturday": "#a78bfa",  # violet
    "Sunday":            "#fb923c",  # orange
}


def upgrade():
    op.add_column("schedules", sa.Column("color", sa.String(7), nullable=True))

    conn = op.get_bind()
    for name, color in _SEEDS.items():
        conn.execute(
            sa.text("UPDATE schedules SET color = :color WHERE name = :name"),
            {"color": color, "name": name},
        )

    # Default any rows that didn't get a color
    conn.execute(sa.text("UPDATE schedules SET color = '#6b7280' WHERE color IS NULL"))
    op.alter_column("schedules", "color", nullable=False, server_default="'#6b7280'")


def downgrade():
    op.drop_column("schedules", "color")
