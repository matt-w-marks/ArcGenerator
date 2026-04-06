"""Seed zone schedule hourly blocks

Revision ID: 008
Revises: 007
Create Date: 2026-04-01

Each row: (zone_name, day_type, hour_start, hour_end, heat, service_type)
hour_end wraps past midnight for friday_saturday late-night blocks (stored as-is; query layer handles modulo).

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (zone_name, day_type, hour_start, hour_end, heat, service_type)
SCHEDULES = [
    # ── Weekday ─────────────────────────────────────────────────────────────────
    ("PHX Sky Harbor — Primary Staging",       "weekday", 5,  8,  "high",    "rides"),
    ("Downtown Phoenix / Roosevelt Row",        "weekday", 7,  9,  "high",    "rides"),
    ("Arizona Biltmore / 24th St + Camelback", "weekday", 8,  10, "high",    "rides"),
    ("Midtown Phoenix / Central Ave",           "weekday", 9,  11, "med",     "rides"),
    ("Downtown Phoenix / Roosevelt Row",        "weekday", 10, 12, "low_med", "rides"),
    ("Phoenix Convention Center",               "weekday", 11, 13, "med",     "both"),
    ("Downtown Phoenix / Roosevelt Row",        "weekday", 11, 14, "med",     "both"),
    ("Midtown Phoenix / Central Ave",           "weekday", 11, 14, "med",     "both"),
    ("Arizona Biltmore / 24th St + Camelback", "weekday", 13, 16, "dead",    "rest"),
    ("Arizona Biltmore / 24th St + Camelback", "weekday", 16, 18, "med_high","rides"),
    ("Downtown Phoenix / Roosevelt Row",        "weekday", 16, 18, "med_high","rides"),
    ("Downtown Phoenix / Roosevelt Row",        "weekday", 17, 19, "peak",    "rides"),
    ("Old Town Scottsdale — bar district",     "weekday", 18, 20, "peak",    "rides"),
    ("Scottsdale Fashion Square / Hotel Row",  "weekday", 18, 20, "peak",    "rides"),
    ("Old Town Scottsdale — bar district",     "weekday", 19, 22, "med_high","both"),
    ("ASU / Mill Avenue — Tempe",              "weekday", 19, 22, "med_high","both"),
    ("Old Town Scottsdale — bar district",     "weekday", 21, 22, "low_med", "rides"),

    # ── Friday + Saturday ───────────────────────────────────────────────────────
    ("PHX Sky Harbor — Primary Staging",       "friday_saturday", 5,  9,  "high",    "rides"),
    ("Downtown Phoenix / Roosevelt Row",        "friday_saturday", 9,  14, "med",     "both"),
    ("Midtown Phoenix / Central Ave",           "friday_saturday", 9,  14, "med",     "both"),
    ("Arizona Biltmore / 24th St + Camelback", "friday_saturday", 9,  14, "med",     "both"),
    ("Old Town Scottsdale — bar district",     "friday_saturday", 14, 17, "dead",    "rest"),
    ("Downtown Phoenix / Roosevelt Row",        "friday_saturday", 17, 19, "peak",    "rides"),
    ("Old Town Scottsdale — bar district",     "friday_saturday", 19, 21, "high",    "both"),
    ("Scottsdale Fashion Square / Hotel Row",  "friday_saturday", 19, 21, "high",    "both"),
    ("Old Town Scottsdale — bar district",     "friday_saturday", 21, 2,  "surge",   "rides"),  # 21–2 AM
    ("Old Town Scottsdale — bar district",     "friday_saturday", 1,  2,  "peak",    "rides"),  # last call 1–2 AM

    # ── Sunday ──────────────────────────────────────────────────────────────────
    ("PHX Sky Harbor — Primary Staging",       "sunday", 5,  9,  "med_high","rides"),
    ("Old Town Scottsdale — bar district",     "sunday", 10, 12, "high",    "both"),
    ("ASU / Mill Avenue — Tempe",              "sunday", 10, 12, "high",    "both"),
    ("Old Town Scottsdale — bar district",     "sunday", 12, 14, "med",     "both"),
    ("Scottsdale Fashion Square / Hotel Row",  "sunday", 12, 14, "med",     "both"),
    ("Downtown Phoenix / Roosevelt Row",        "sunday", 16, 19, "med",     "rides"),
    ("ASU / Mill Avenue — Tempe",              "sunday", 16, 19, "med",     "rides"),
]


def upgrade() -> None:
    conn = op.get_bind()
    for zone_name, day_type, hour_start, hour_end, heat, service_type in SCHEDULES:
        conn.execute(
            sa.text("""
                INSERT INTO zone_schedules (id, zone_id, day_type, hour_start, hour_end, heat, service_type, created_at)
                SELECT gen_random_uuid(), z.id, :day_type, :hour_start, :hour_end, :heat, :service_type, NOW()
                FROM zones z
                WHERE z.name = :zone_name
                ON CONFLICT (zone_id, day_type, hour_start) DO NOTHING
            """),
            {
                "zone_name": zone_name,
                "day_type": day_type,
                "hour_start": hour_start,
                "hour_end": hour_end,
                "heat": heat,
                "service_type": service_type,
            },
        )


def downgrade() -> None:
    op.execute("DELETE FROM zone_schedules")
