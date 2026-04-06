"""Update platform brand colors to accurate values

Revision ID: 016
Revises: 015
Create Date: 2026-04-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "016"
down_revision: Union[str, None] = "015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLORS = {
    "Uber":      "#276EF1",   # Uber driver-app blue
    "Lyft":      "#FF00BF",   # Lyft signature hot pink
    "Uber Eats": "#06C167",   # Uber Eats green (correct)
    "Grubhub":   "#F26B1D",   # Grubhub orange (was red)
}


def upgrade() -> None:
    for name, color in _COLORS.items():
        op.execute(sa.text(
            "UPDATE platforms SET color = :color WHERE name = :name"
        ).bindparams(color=color, name=name))


def downgrade() -> None:
    _old = {
        "Uber":      "#000000",
        "Lyft":      "#EA0B8C",
        "Uber Eats": "#06C167",
        "Grubhub":   "#F63440",
    }
    for name, color in _old.items():
        op.execute(sa.text(
            "UPDATE platforms SET color = :color WHERE name = :name"
        ).bindparams(color=color, name=name))
