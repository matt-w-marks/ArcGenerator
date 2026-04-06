"""Assign platforms to seeded schedule blocks based on activity type

Revision ID: 018
Revises: 017
Create Date: 2026-04-01

Logic:
  - Pure ride windows (airport, commute, bar surge, errand): Uber + Lyft
  - Food-active windows (lunch, dinner, any block whose notes say "Eats"): all four
  - Rest blocks: no platforms (left as {})
  - Fri/Sat bar scene 9 PM+: notes say "Turn off Eats — pure rides" → Uber + Lyft
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "018"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── Rides-only blocks ─────────────────────────────────────────────────────────
# Airport queues, commute surges, errand runs, bar surge (notes: "Turn off Eats")
_RIDES_LABELS = [
    # Weekday
    "Airport \u2014 Early Business",
    "Airport \u2014 Peak Window",
    "Airport + Downtown Commute",
    "Downtown + Biltmore Peak Commute",
    "Biltmore + Midtown Late Commute",
    "Midtown Errand Run",
    "Commute Building \u2014 Biltmore Position",
    "Peak Commute \u2014 Downtown\u2192Scottsdale",
    "Evening Scottsdale \u2014 Old Town",
    "Old Town \u2014 Last Productive Hour",
    # Friday + Saturday
    "Airport \u2014 Business Travel Block",
    "Core Triangle \u2014 Trip Builder",
    "Friday Surge \u2014 Downtown\u2192Scottsdale",
    "Bar Scene Opening \u2014 Surge",        # explicitly: "Turn off Eats — pure rides"
    "Old Town Peak Surge",
    "Bars at Full Peak",
    "Last Call Approach",
    "Last Call Surge \u2014 Bar Close Perimeter",
    # Sunday
    "Airport \u2014 Weekend Departures",
    "Brunch Surge \u2014 Old Town + ASU",   # pure rides — "people don't drive after mimosas"
]

# ── All-platform blocks ───────────────────────────────────────────────────────
# Notes say: "Turn on Eats", "Eats orders high/peak", "Eats still active",
# "Eats delivery still active", "Split apps", "early afternoon Eats"
_ALL_LABELS = [
    # Weekday
    "Downtown + Convention Lunch Prep",     # "Turn on Eats"
    "Peak Lunch Window",                    # "Eats orders high. Rides to restaurants."
    "Post-Lunch Taper \u2014 Biltmore Approach",  # "Eats still active"
    "Dinner Rush \u2014 Old Town + ASU",    # "Eats orders peak. Split apps."
    "Old Town Late Dinner",                 # "Eats delivery still active"
    # Friday + Saturday
    "Dinner + Pre-Bar Warm-Up",             # "Eats orders high. Rides between venues."
    # Sunday
    "Late Brunch + Fashion Square",         # "early afternoon Eats"
    "Sunday Dinner Crowd",                  # dinner — Eats active
]


def _placeholders(labels: list[str]) -> str:
    return ", ".join(f"'{l}'" for l in labels)


def upgrade() -> None:
    # Rides only: Uber + Lyft
    op.execute(sa.text(f"""
        UPDATE schedule_blocks
        SET platform_ids = ARRAY(
            SELECT id FROM platforms
            WHERE name IN ('Uber', 'Lyft')
            ORDER BY name
        )
        WHERE label IN ({_placeholders(_RIDES_LABELS)})
    """))

    # All four: Uber + Lyft + Uber Eats + Grubhub
    op.execute(sa.text(f"""
        UPDATE schedule_blocks
        SET platform_ids = ARRAY(
            SELECT id FROM platforms
            WHERE name IN ('Uber', 'Lyft', 'Uber Eats', 'Grubhub')
            ORDER BY name
        )
        WHERE label IN ({_placeholders(_ALL_LABELS)})
    """))


def downgrade() -> None:
    labels = _RIDES_LABELS + _ALL_LABELS
    op.execute(sa.text(f"""
        UPDATE schedule_blocks
        SET platform_ids = '{{}}'
        WHERE label IN ({_placeholders(labels)})
    """))
