"""Seed Weekday / Friday+Saturday / Sunday schedules

Revision ID: 013
Revises: 012
Create Date: 2026-04-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ── Schedule definitions ───────────────────────────────────────────────────────

_SCHEDULES = """
INSERT INTO schedules (id, name, description)
VALUES
  (gen_random_uuid(), 'Weekday',
   'Standard Mon\u2013Thu revenue schedule. Airport \u2192 Core \u2192 Rest \u2192 Scottsdale night. 5 AM\u201310 PM.'),
  (gen_random_uuid(), 'Friday + Saturday',
   'Extended night schedule. Airport morning \u2192 core build \u2192 rest \u2192 Old Town surge to 2 AM.'),
  (gen_random_uuid(), 'Sunday',
   'Airport departures + brunch surge. Done by 7 PM. Tomorrow is Monday.')
ON CONFLICT (name) DO NOTHING;
"""

# ── Block seed (CTE to resolve schedule + zone UUIDs) ─────────────────────────
#
# hour_start / hour_end use 0.5-hour resolution.
# Hours 24-26 = midnight through 2 AM (overnight extension for Fri/Sat).
# Zones referenced by exact name from migration 007.

_BLOCKS = """
WITH
  sw  AS (SELECT id FROM schedules WHERE name = 'Weekday'),
  sfs AS (SELECT id FROM schedules WHERE name = 'Friday + Saturday'),
  ss  AS (SELECT id FROM schedules WHERE name = 'Sunday'),
  z1  AS (SELECT id FROM zones WHERE name = 'PHX Sky Harbor \u2014 Primary Staging'),
  z3  AS (SELECT id FROM zones WHERE name = 'Arizona Biltmore / 24th St + Camelback'),
  z4  AS (SELECT id FROM zones WHERE name = 'Downtown Phoenix / Roosevelt Row'),
  z5  AS (SELECT id FROM zones WHERE name = 'Midtown Phoenix / Central Ave'),
  z9  AS (SELECT id FROM zones WHERE name = 'Old Town Scottsdale \u2014 bar district')
INSERT INTO schedule_blocks
  (id, schedule_id, hour_start, hour_end, block_type, zone_id, label, notes, sort_order, gross_revenue)

-- ── WEEKDAY ──────────────────────────────────────────────────────────────────
SELECT gen_random_uuid(), sw.id,  5,    6,    'zone', z1.id, 'Airport \u2014 Early Business',               'Early business travelers. Queue at primary staging. Tips run higher pre-dawn.',                                                  0,  20.00 FROM sw, z1 UNION ALL
SELECT gen_random_uuid(), sw.id,  6,    7,    'zone', z1.id, 'Airport \u2014 Peak Window',                  'Peak airport window. Drops to Scottsdale, Paradise Valley, Biltmore. Long rides = high fare.',                              1,  50.00 FROM sw, z1 UNION ALL
SELECT gen_random_uuid(), sw.id,  7,    8,    'zone', z1.id, 'Airport + Downtown Commute',                  'Commute surge building. Airport drops land near Downtown. Stay in that zone.',                                               2,  45.00 FROM sw, z1 UNION ALL
SELECT gen_random_uuid(), sw.id,  8,    9,    'zone', z4.id, 'Downtown + Biltmore Peak Commute',            'Peak morning commute. Office drops downtown and Biltmore corridor. High volume.',                                            3,  45.00 FROM sw, z4 UNION ALL
SELECT gen_random_uuid(), sw.id,  9,    10,   'zone', z3.id, 'Biltmore + Midtown Late Commute',             'Late commuters, hotel checkouts, medical appointments. Steady not surge.',                                                   4,  30.00 FROM sw, z3 UNION ALL
SELECT gen_random_uuid(), sw.id,  10,   11,   'zone', z5.id, 'Midtown Errand Run',                          'Errand runs, mid-morning appointments. Lower volume but no surge competition.',                                             5,  20.00 FROM sw, z5 UNION ALL
SELECT gen_random_uuid(), sw.id,  11,   12,   'zone', z4.id, 'Downtown + Convention Lunch Prep',            'Lunch wave starting. Turn on Eats. Office workers ordering. Convention pickups if event in town.',                           6,  30.00 FROM sw, z4 UNION ALL
SELECT gen_random_uuid(), sw.id,  12,   13,   'zone', z4.id, 'Peak Lunch Window',                           'Peak lunch. Eats orders high. Rides to restaurants. Best mid-day window.',                                                  7,  45.00 FROM sw, z4 UNION ALL
SELECT gen_random_uuid(), sw.id,  13,   14,   'zone', z5.id, 'Post-Lunch Taper \u2014 Biltmore Approach',  'Post-lunch taper. Eats still active. Position toward Biltmore ahead of rest block.',                                         8,  25.00 FROM sw, z5 UNION ALL
SELECT gen_random_uuid(), sw.id,  14,   16,   'rest', NULL::uuid, 'Rest \u2014 Biltmore Parked',           'Stay online. Decline all. Eat, hydrate, recharge. Commute surge starts in 90 minutes. Do not burn gas.',                    9,   0.00 FROM sw UNION ALL
SELECT gen_random_uuid(), sw.id,  16,   17,   'zone', z3.id, 'Commute Building \u2014 Biltmore Position',  'Commute building. Position at Biltmore at 4:00 exactly. Rides flowing east toward Scottsdale.',                             10,  35.00 FROM sw, z3 UNION ALL
SELECT gen_random_uuid(), sw.id,  17,   18,   'zone', z4.id, 'Peak Commute \u2014 Downtown\u2192Scottsdale','Biggest surge of weekday. Downtown pickups heading to Scottsdale. Long high-fare rides.',                                   11,  70.00 FROM sw, z4 UNION ALL
SELECT gen_random_uuid(), sw.id,  18,   19,   'zone', z9.id, 'Evening Scottsdale \u2014 Old Town',          'Evening commute peak plus early dinner crowd in Scottsdale. Stay in Scottsdale zone.',                                      12,  70.00 FROM sw, z9 UNION ALL
SELECT gen_random_uuid(), sw.id,  19,   20,   'zone', z9.id, 'Dinner Rush \u2014 Old Town + ASU',           'Dinner rush. Eats orders peak on weekdays. Rides from homes to restaurants. Split apps.',                                   13,  50.00 FROM sw, z9 UNION ALL
SELECT gen_random_uuid(), sw.id,  20,   21,   'zone', z9.id, 'Old Town Late Dinner',                        'Late dinner crowd. Bar scene starting on weekends. Eats delivery still active.',                                             14,  35.00 FROM sw, z9 UNION ALL
SELECT gen_random_uuid(), sw.id,  21,   22,   'zone', z9.id, 'Old Town \u2014 Last Productive Hour',        'Weekday taper begins. Use destination filter home. Last productive hour Mon\u2013Thu.',                                     15,  25.00 FROM sw, z9 UNION ALL

-- ── FRIDAY + SATURDAY ─────────────────────────────────────────────────────────
SELECT gen_random_uuid(), sfs.id, 5,    9,    'zone', z1.id, 'Airport \u2014 Business Travel Block',        'Friday mornings heavy with business travel. Same airport template as weekday. 4-hour block.',                                0, 160.00 FROM sfs, z1 UNION ALL
SELECT gen_random_uuid(), sfs.id, 9,    14,   'zone', z4.id, 'Core Triangle \u2014 Trip Builder',           'Build trip count toward 30 minimum. Both apps. Steady not spectacular. 5-hour grind.',                                     1, 120.00 FROM sfs, z4 UNION ALL
SELECT gen_random_uuid(), sfs.id, 14,   16.5, 'rest', NULL::uuid, 'Rest + Fill Tank \u2014 Critical',      'Critical rest before the big night. Fill gas tank NOW. Not at midnight. 2.5-hour mandatory.',                               2,   0.00 FROM sfs UNION ALL
SELECT gen_random_uuid(), sfs.id, 16.5, 19,   'zone', z4.id, 'Friday Surge \u2014 Downtown\u2192Scottsdale','Friday surge is bigger than weekday. People leaving work early headed to Scottsdale.',                                     3, 150.00 FROM sfs, z4 UNION ALL
SELECT gen_random_uuid(), sfs.id, 19,   21,   'zone', z9.id, 'Dinner + Pre-Bar Warm-Up',                   'Dinner + pre-game bar warm-up. Eats orders high. Rides between venues. Very active.',                                       4, 110.00 FROM sfs, z9 UNION ALL
SELECT gen_random_uuid(), sfs.id, 21,   22,   'zone', z9.id, 'Bar Scene Opening \u2014 Surge',              'Bar scene fully alive. Nightlife rides between venues. Turn off Eats \u2014 pure rides.',                                  5,  85.00 FROM sfs, z9 UNION ALL
SELECT gen_random_uuid(), sfs.id, 22,   23,   'zone', z9.id, 'Old Town Peak Surge',                         'Peak of the entire week. Highest surge multipliers. Short rides, fast turnover, tips flowing.',                            6, 100.00 FROM sfs, z9 UNION ALL
SELECT gen_random_uuid(), sfs.id, 23,   24,   'zone', z9.id, 'Bars at Full Peak',                           'Bars at peak. Rides home for early leavers. Stay deep in Old Town.',                                                       7, 100.00 FROM sfs, z9 UNION ALL
SELECT gen_random_uuid(), sfs.id, 24,   25,   'zone', z9.id, 'Last Call Approach',                          'Last call approaching. Surge stays high. Rides home to Tempe, Paradise Valley, Chandler.',                                 8,  90.00 FROM sfs, z9 UNION ALL
SELECT gen_random_uuid(), sfs.id, 25,   26,   'zone', z9.id, 'Last Call Surge \u2014 Bar Close Perimeter',  'Be at bar closing perimeter at 1:45 AM not 2:15. This window is brief but highest surge of the night.',                    9, 100.00 FROM sfs, z9 UNION ALL

-- ── SUNDAY ────────────────────────────────────────────────────────────────────
SELECT gen_random_uuid(), ss.id,  5,    9,    'zone', z1.id, 'Airport \u2014 Weekend Departures',           'Sunday departures. Weekend visitors heading home. Good tips. 4 solid hours.',                                               0, 120.00 FROM ss, z1 UNION ALL
SELECT gen_random_uuid(), ss.id,  10,   12,   'zone', z9.id, 'Brunch Surge \u2014 Old Town + ASU',          'Brunch surge. People don\u2019t drive after mimosas. One of the best Sunday windows.',                                     1,  90.00 FROM ss, z9 UNION ALL
SELECT gen_random_uuid(), ss.id,  12,   14,   'zone', z9.id, 'Late Brunch + Fashion Square',                'Late brunch + early afternoon Eats. Shopping mall pickups at Fashion Square.',                                              2,  60.00 FROM ss, z9 UNION ALL
SELECT gen_random_uuid(), ss.id,  14,   16,   'rest', NULL::uuid, 'Sunday Dead Zone \u2014 Rest',           'Sunday afternoon is dead metro-wide. Do not fight it. Rest.',                                                              3,   0.00 FROM ss UNION ALL
SELECT gen_random_uuid(), ss.id,  16,   19,   'zone', z4.id, 'Sunday Dinner Crowd',                         'Sunday dinner crowd. Easy moderate volume. Done by 7 PM. Tomorrow is Monday.',                                             4,  75.00 FROM ss, z4
;
"""


def upgrade() -> None:
    conn = op.get_bind()
    # Skip if already seeded
    count = conn.execute(sa.text("SELECT COUNT(*) FROM schedules")).scalar()
    if count > 0:
        return
    op.execute(sa.text(_SCHEDULES))
    op.execute(sa.text(_BLOCKS))


def downgrade() -> None:
    op.execute(sa.text(
        "DELETE FROM schedules WHERE name IN ('Weekday', 'Friday + Saturday', 'Sunday')"
    ))
