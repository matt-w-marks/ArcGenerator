"""
Test configuration for the export service.

Sets env vars before any service module imports so that:
- database.py resolves DATABASE_URL without failing
- factory_log.py skips actual DB writes (LOGGING_DATABASE_URL is empty)
"""
import os
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://fake:fake@localhost/fake")
os.environ.setdefault("LOGGING_DATABASE_URL", "")

import pytest
from fastapi.testclient import TestClient

from database import get_db
from main import app


# ── Fake ORM row dataclasses ────────────────────────────────────────────────

_NOW = datetime(2025, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
_TODAY = date(2025, 1, 15)


@dataclass
class FakeDrivingSession:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    date: date = _TODAY
    hours_worked: Decimal = Decimal("6.5")
    gross_earnings: Decimal = Decimal("120.00")
    gas_cost: Decimal = Decimal("18.00")
    trip_count: int = 22
    zone: str | None = "Downtown"
    created_at: datetime = _NOW
    updated_at: datetime = _NOW


@dataclass
class FakeJobActivity:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    date: date = _TODAY
    applications_submitted: int = 5
    linkedin_connections: int = 3
    recruiter_contacts: int = 1
    created_at: datetime = _NOW
    updated_at: datetime = _NOW


@dataclass
class FakeFinancialSnapshot:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    date: date = _TODAY
    bankroll: Decimal = Decimal("5000.00")
    weekly_expenses: Decimal = Decimal("600.00")
    tax_accrual: Decimal = Decimal("200.00")
    created_at: datetime = _NOW
    updated_at: datetime = _NOW


@dataclass
class FakeWeeklyRollup:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    week_start: date = date(2025, 1, 12)  # Sunday
    total_hours: Decimal = Decimal("32.5")
    total_earnings: Decimal = Decimal("600.00")
    total_gas: Decimal = Decimal("90.00")
    total_trips: int = 110
    total_applications: int = 25
    total_linkedin: int = 15
    total_recruiter_contacts: int = 5
    created_at: datetime = _NOW
    updated_at: datetime = _NOW


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def db_mock():
    return MagicMock()


@pytest.fixture
def client(db_mock):
    app.dependency_overrides[get_db] = lambda: db_mock
    yield TestClient(app)
    app.dependency_overrides.clear()
