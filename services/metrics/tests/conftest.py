"""
Test configuration.
Env vars must be set before any app modules are imported so that
database.py (which reads DATABASE_URL at module level) doesn't raise.
"""
import os

# Must be set before importing app modules
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://fake:fake@localhost:5432/fake")
# Empty string → factory_log._LOGGING_URL resolves to None → log_event is a no-op
os.environ.setdefault("LOGGING_DATABASE_URL", "")

from dataclasses import dataclass, field  # noqa: E402
from datetime import date, datetime, timezone  # noqa: E402
from decimal import Decimal  # noqa: E402
from unittest.mock import MagicMock  # noqa: E402
from uuid import UUID, uuid4  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from database import get_db  # noqa: E402
from main import app  # noqa: E402

_NOW = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
_TODAY = date(2024, 6, 1)
_SUNDAY = date(2024, 6, 2)  # 2024-06-02 is a Sunday
_UUID = UUID("11111111-1111-1111-1111-111111111111")


# ── Fake ORM objects (dataclasses — Pydantic reads them via from_attributes) ──


@dataclass
class FakeDrivingSession:
    id: UUID = field(default_factory=lambda: _UUID)
    date: date = field(default_factory=lambda: _TODAY)
    hours_worked: Decimal = Decimal("8.50")
    gross_earnings: Decimal = Decimal("120.00")
    gas_cost: Decimal = Decimal("15.00")
    trip_count: int = 12
    zone: str | None = None
    created_at: datetime = field(default_factory=lambda: _NOW)
    updated_at: datetime = field(default_factory=lambda: _NOW)


@dataclass
class FakeJobActivity:
    id: UUID = field(default_factory=lambda: _UUID)
    date: date = field(default_factory=lambda: _TODAY)
    applications_submitted: int = 3
    linkedin_connections: int = 5
    recruiter_contacts: int = 1
    created_at: datetime = field(default_factory=lambda: _NOW)
    updated_at: datetime = field(default_factory=lambda: _NOW)


@dataclass
class FakeFinancialSnapshot:
    id: UUID = field(default_factory=lambda: _UUID)
    date: date = field(default_factory=lambda: _TODAY)
    bankroll: Decimal = Decimal("5000.00")
    weekly_expenses: Decimal = Decimal("500.00")
    tax_accrual: Decimal = Decimal("200.00")
    created_at: datetime = field(default_factory=lambda: _NOW)
    updated_at: datetime = field(default_factory=lambda: _NOW)


@dataclass
class FakeWeeklyRollup:
    id: UUID = field(default_factory=lambda: _UUID)
    week_start: date = field(default_factory=lambda: _SUNDAY)
    total_hours: Decimal = Decimal("40.00")
    total_earnings: Decimal = Decimal("800.00")
    total_gas: Decimal = Decimal("60.00")
    total_trips: int = 50
    total_applications: int = 10
    total_linkedin: int = 20
    total_recruiter_contacts: int = 3
    created_at: datetime = field(default_factory=lambda: _NOW)
    updated_at: datetime = field(default_factory=lambda: _NOW)


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def db_mock():
    return MagicMock()


@pytest.fixture
def client(db_mock):
    app.dependency_overrides[get_db] = lambda: db_mock
    yield TestClient(app)
    app.dependency_overrides.clear()
