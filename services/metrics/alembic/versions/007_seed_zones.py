"""Seed 13 PHX zone records

Revision ID: 007
Revises: 006
Create Date: 2026-04-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# All values are hardcoded constants — no user input, no injection risk.
_SQL = """
INSERT INTO zones (id, name, zone_type, address, geo_lat, geo_lng, service_types, created_at)
VALUES
  (gen_random_uuid(), 'PHX Sky Harbor — Primary Staging',       'Anchor', '2323 E Sky Harbor Cir N, Phoenix AZ',     33.4369, -112.0077, '["Rides"]',          NOW()),
  (gen_random_uuid(), 'PHX Sky Harbor — 44th St Sky Train',     'Anchor', '44th St Sky Train Station, Phoenix AZ',   33.4334, -111.9980, '["Rides"]',          NOW()),
  (gen_random_uuid(), 'Arizona Biltmore / 24th St + Camelback', 'Core',   '2400 E Missouri Ave, Phoenix AZ 85016',   33.5230, -112.0232, '["Rides","Food"]',   NOW()),
  (gen_random_uuid(), 'Downtown Phoenix / Roosevelt Row',        'Core',   '303 E Roosevelt St, Phoenix AZ 85004',    33.4587, -112.0702, '["Rides","Food"]',   NOW()),
  (gen_random_uuid(), 'Midtown Phoenix / Central Ave',           'Core',   'N Central Ave, Phoenix AZ 85012',         33.4931, -112.0737, '["Rides","Food"]',   NOW()),
  (gen_random_uuid(), 'Phoenix Convention Center',               'Steady', '100 N 3rd St, Phoenix AZ 85004',          33.4499, -112.0705, '["Rides","Food"]',   NOW()),
  (gen_random_uuid(), 'Footprint Center — Suns / concerts',     'Events', '201 E Jefferson St, Phoenix AZ 85004',    33.4457, -112.0712, '["Rides"]',          NOW()),
  (gen_random_uuid(), 'Chase Field — Diamondbacks',              'Events', '401 E Jefferson St, Phoenix AZ 85004',    33.4453, -112.0667, '["Rides"]',          NOW()),
  (gen_random_uuid(), 'Old Town Scottsdale — bar district',      'Surge',  '7330 E Main St, Scottsdale AZ 85251',     33.4932, -111.9239, '["Rides"]',          NOW()),
  (gen_random_uuid(), 'Scottsdale Fashion Square / Hotel Row',   'Steady', '7014 E Camelback Rd, Scottsdale AZ 85251',33.5027, -111.9293, '["Rides","Food"]',   NOW()),
  (gen_random_uuid(), 'ASU / Mill Avenue — Tempe',               'Core',   '1151 S Forest Ave, Tempe AZ 85281',       33.4230, -111.9278, '["Rides","Food"]',   NOW()),
  (gen_random_uuid(), 'Salt River Fields — Spring Training',     'Events', '7555 N Pima Rd, Scottsdale AZ 85258',     33.5450, -111.8862, '["Rides"]',          NOW()),
  (gen_random_uuid(), 'State Farm Stadium — Cardinals / events', 'Events', '1 Cardinals Dr, Glendale AZ 85305',       33.5276, -112.2626, '["Rides"]',          NOW())
ON CONFLICT (name) DO NOTHING;
"""

_ZONE_NAMES = [
    "PHX Sky Harbor — Primary Staging",
    "PHX Sky Harbor — 44th St Sky Train",
    "Arizona Biltmore / 24th St + Camelback",
    "Downtown Phoenix / Roosevelt Row",
    "Midtown Phoenix / Central Ave",
    "Phoenix Convention Center",
    "Footprint Center — Suns / concerts",
    "Chase Field — Diamondbacks",
    "Old Town Scottsdale — bar district",
    "Scottsdale Fashion Square / Hotel Row",
    "ASU / Mill Avenue — Tempe",
    "Salt River Fields — Spring Training",
    "State Farm Stadium — Cardinals / events",
]


def upgrade() -> None:
    op.execute(sa.text(_SQL))


def downgrade() -> None:
    conn = op.get_bind()
    for name in _ZONE_NAMES:
        conn.execute(
            sa.text("DELETE FROM zones WHERE name = :name"),
            {"name": name},
        )
