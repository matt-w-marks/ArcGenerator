"""
Unit tests for Pydantic schemas.
Target: 100% coverage of schemas/*.py
"""
from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from schemas.driving_session import DrivingSessionCreate, DrivingSessionUpdate
from schemas.financial_snapshot import FinancialSnapshotCreate, FinancialSnapshotUpdate
from schemas.job_activity import JobActivityCreate, JobActivityUpdate
from schemas.weekly_rollup import WeeklyRollupCreate, WeeklyRollupUpdate

# ── DrivingSession ─────────────────────────────────────────────────────────────


class TestDrivingSessionCreate:
    def test_valid_minimal(self):
        s = DrivingSessionCreate(
            date=date(2024, 6, 1),
            hours_worked=Decimal("8"),
            gross_earnings=Decimal("100"),
        )
        assert s.hours_worked == Decimal("8")
        assert s.gas_cost == Decimal("0")
        assert s.trip_count == 0
        assert s.zone is None

    def test_valid_full(self):
        s = DrivingSessionCreate(
            date=date(2024, 6, 1),
            hours_worked=Decimal("6.5"),
            gross_earnings=Decimal("90.00"),
            gas_cost=Decimal("12.50"),
            trip_count=8,
            zone="Downtown",
        )
        assert s.zone == "Downtown"

    def test_hours_worked_zero_fails(self):
        with pytest.raises(ValidationError):
            DrivingSessionCreate(
                date=date(2024, 6, 1),
                hours_worked=Decimal("0"),
                gross_earnings=Decimal("100"),
            )

    def test_hours_worked_negative_fails(self):
        with pytest.raises(ValidationError):
            DrivingSessionCreate(
                date=date(2024, 6, 1),
                hours_worked=Decimal("-1"),
                gross_earnings=Decimal("100"),
            )

    def test_gross_earnings_negative_fails(self):
        with pytest.raises(ValidationError):
            DrivingSessionCreate(
                date=date(2024, 6, 1),
                hours_worked=Decimal("8"),
                gross_earnings=Decimal("-0.01"),
            )

    def test_gas_cost_negative_fails(self):
        with pytest.raises(ValidationError):
            DrivingSessionCreate(
                date=date(2024, 6, 1),
                hours_worked=Decimal("8"),
                gross_earnings=Decimal("100"),
                gas_cost=Decimal("-5"),
            )

    def test_trip_count_negative_fails(self):
        with pytest.raises(ValidationError):
            DrivingSessionCreate(
                date=date(2024, 6, 1),
                hours_worked=Decimal("8"),
                gross_earnings=Decimal("100"),
                trip_count=-1,
            )

    def test_zone_too_long_fails(self):
        with pytest.raises(ValidationError):
            DrivingSessionCreate(
                date=date(2024, 6, 1),
                hours_worked=Decimal("8"),
                gross_earnings=Decimal("100"),
                zone="x" * 129,
            )

    def test_gross_earnings_zero_allowed(self):
        s = DrivingSessionCreate(
            date=date(2024, 6, 1),
            hours_worked=Decimal("1"),
            gross_earnings=Decimal("0"),
        )
        assert s.gross_earnings == Decimal("0")


class TestDrivingSessionUpdate:
    def test_empty_update_valid(self):
        u = DrivingSessionUpdate()
        assert u.date is None
        assert u.hours_worked is None

    def test_hours_worked_zero_fails(self):
        with pytest.raises(ValidationError):
            DrivingSessionUpdate(hours_worked=Decimal("0"))

    def test_gross_earnings_negative_fails(self):
        with pytest.raises(ValidationError):
            DrivingSessionUpdate(gross_earnings=Decimal("-1"))

    def test_gas_cost_negative_fails(self):
        with pytest.raises(ValidationError):
            DrivingSessionUpdate(gas_cost=Decimal("-0.01"))

    def test_trip_count_negative_fails(self):
        with pytest.raises(ValidationError):
            DrivingSessionUpdate(trip_count=-1)

    def test_zone_too_long_fails(self):
        with pytest.raises(ValidationError):
            DrivingSessionUpdate(zone="z" * 129)


# ── JobActivity ────────────────────────────────────────────────────────────────


class TestJobActivityCreate:
    def test_valid_defaults(self):
        a = JobActivityCreate(date=date(2024, 6, 1))
        assert a.applications_submitted == 0
        assert a.linkedin_connections == 0
        assert a.recruiter_contacts == 0

    def test_valid_full(self):
        a = JobActivityCreate(
            date=date(2024, 6, 1),
            applications_submitted=5,
            linkedin_connections=10,
            recruiter_contacts=2,
        )
        assert a.applications_submitted == 5

    def test_applications_negative_fails(self):
        with pytest.raises(ValidationError):
            JobActivityCreate(date=date(2024, 6, 1), applications_submitted=-1)

    def test_linkedin_negative_fails(self):
        with pytest.raises(ValidationError):
            JobActivityCreate(date=date(2024, 6, 1), linkedin_connections=-1)

    def test_recruiter_negative_fails(self):
        with pytest.raises(ValidationError):
            JobActivityCreate(date=date(2024, 6, 1), recruiter_contacts=-1)


class TestJobActivityUpdate:
    def test_empty_update_valid(self):
        u = JobActivityUpdate()
        assert u.applications_submitted is None

    def test_applications_negative_fails(self):
        with pytest.raises(ValidationError):
            JobActivityUpdate(applications_submitted=-1)

    def test_linkedin_negative_fails(self):
        with pytest.raises(ValidationError):
            JobActivityUpdate(linkedin_connections=-1)

    def test_recruiter_negative_fails(self):
        with pytest.raises(ValidationError):
            JobActivityUpdate(recruiter_contacts=-1)


# ── FinancialSnapshot ──────────────────────────────────────────────────────────


class TestFinancialSnapshotCreate:
    def test_valid(self):
        s = FinancialSnapshotCreate(
            date=date(2024, 6, 1),
            bankroll=Decimal("5000"),
            weekly_expenses=Decimal("500"),
        )
        assert s.tax_accrual == Decimal("0")

    def test_negative_bankroll_allowed(self):
        # bankroll can be negative (debt situation)
        s = FinancialSnapshotCreate(
            date=date(2024, 6, 1),
            bankroll=Decimal("-200"),
            weekly_expenses=Decimal("500"),
        )
        assert s.bankroll == Decimal("-200")

    def test_weekly_expenses_zero_fails(self):
        with pytest.raises(ValidationError):
            FinancialSnapshotCreate(
                date=date(2024, 6, 1),
                bankroll=Decimal("5000"),
                weekly_expenses=Decimal("0"),
            )

    def test_weekly_expenses_negative_fails(self):
        with pytest.raises(ValidationError):
            FinancialSnapshotCreate(
                date=date(2024, 6, 1),
                bankroll=Decimal("5000"),
                weekly_expenses=Decimal("-100"),
            )

    def test_tax_accrual_negative_fails(self):
        with pytest.raises(ValidationError):
            FinancialSnapshotCreate(
                date=date(2024, 6, 1),
                bankroll=Decimal("5000"),
                weekly_expenses=Decimal("500"),
                tax_accrual=Decimal("-1"),
            )


class TestFinancialSnapshotUpdate:
    def test_empty_update_valid(self):
        u = FinancialSnapshotUpdate()
        assert u.bankroll is None

    def test_weekly_expenses_zero_fails(self):
        with pytest.raises(ValidationError):
            FinancialSnapshotUpdate(weekly_expenses=Decimal("0"))

    def test_weekly_expenses_negative_fails(self):
        with pytest.raises(ValidationError):
            FinancialSnapshotUpdate(weekly_expenses=Decimal("-50"))

    def test_tax_accrual_negative_fails(self):
        with pytest.raises(ValidationError):
            FinancialSnapshotUpdate(tax_accrual=Decimal("-0.01"))


# ── WeeklyRollup ───────────────────────────────────────────────────────────────


class TestWeeklyRollupCreate:
    def test_valid_sunday(self):
        r = WeeklyRollupCreate(week_start=date(2024, 6, 2))  # Sunday
        assert r.week_start == date(2024, 6, 2)
        assert r.total_trips == 0

    def test_non_sunday_fails(self):
        with pytest.raises(ValidationError, match="Sunday"):
            WeeklyRollupCreate(week_start=date(2024, 6, 3))  # Monday

    def test_saturday_fails(self):
        with pytest.raises(ValidationError, match="Sunday"):
            WeeklyRollupCreate(week_start=date(2024, 6, 1))  # Saturday

    def test_total_hours_negative_fails(self):
        with pytest.raises(ValidationError):
            WeeklyRollupCreate(week_start=date(2024, 6, 2), total_hours=Decimal("-1"))

    def test_total_earnings_negative_fails(self):
        with pytest.raises(ValidationError):
            WeeklyRollupCreate(
                week_start=date(2024, 6, 2), total_earnings=Decimal("-0.01")
            )

    def test_total_gas_negative_fails(self):
        with pytest.raises(ValidationError):
            WeeklyRollupCreate(week_start=date(2024, 6, 2), total_gas=Decimal("-1"))

    def test_total_trips_negative_fails(self):
        with pytest.raises(ValidationError):
            WeeklyRollupCreate(week_start=date(2024, 6, 2), total_trips=-1)

    def test_total_applications_negative_fails(self):
        with pytest.raises(ValidationError):
            WeeklyRollupCreate(week_start=date(2024, 6, 2), total_applications=-1)

    def test_total_linkedin_negative_fails(self):
        with pytest.raises(ValidationError):
            WeeklyRollupCreate(week_start=date(2024, 6, 2), total_linkedin=-1)

    def test_total_recruiter_contacts_negative_fails(self):
        with pytest.raises(ValidationError):
            WeeklyRollupCreate(week_start=date(2024, 6, 2), total_recruiter_contacts=-1)


class TestWeeklyRollupUpdate:
    def test_empty_update_valid(self):
        u = WeeklyRollupUpdate()
        assert u.week_start is None

    def test_none_week_start_skips_validation(self):
        u = WeeklyRollupUpdate(week_start=None)
        assert u.week_start is None

    def test_sunday_update_valid(self):
        u = WeeklyRollupUpdate(week_start=date(2024, 6, 2))
        assert u.week_start == date(2024, 6, 2)

    def test_non_sunday_update_fails(self):
        with pytest.raises(ValidationError, match="Sunday"):
            WeeklyRollupUpdate(week_start=date(2024, 6, 3))  # Monday

    def test_total_trips_negative_fails(self):
        with pytest.raises(ValidationError):
            WeeklyRollupUpdate(total_trips=-1)
