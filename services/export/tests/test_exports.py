"""
Tests for the export service CSV endpoints.

Each test mocks the DB session and verifies:
- 200 status with text/csv content-type
- Correct Content-Disposition filename
- CSV headers match expected fieldnames
- CSV data rows match the mocked ORM objects
- Missing x-user-id → 401
"""
import csv
import io

from tests.conftest import (
    FakeDrivingSession,
    FakeFinancialSnapshot,
    FakeJobActivity,
    FakeWeeklyRollup,
)


# ── Health ───────────────────────────────────────────────────────────────────

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "service": "export"}


# ── Auth guard ───────────────────────────────────────────────────────────────

def test_no_user_id_returns_401(client):
    """All export endpoints require x-user-id injected by the gateway."""
    for path in [
        "/export/driving-sessions.csv",
        "/export/job-activities.csv",
        "/export/financial-snapshots.csv",
        "/export/weekly-rollups.csv",
    ]:
        r = client.get(path)
        assert r.status_code == 401, f"{path} should return 401 without x-user-id"


# ── Driving sessions ─────────────────────────────────────────────────────────

def test_export_driving_sessions_empty(client, db_mock):
    db_mock.query.return_value.order_by.return_value.all.return_value = []
    r = client.get("/export/driving-sessions.csv", headers={"x-user-id": "user-1"})
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert 'filename="driving-sessions.csv"' in r.headers["content-disposition"]
    reader = csv.DictReader(io.StringIO(r.text))
    assert reader.fieldnames == [
        "id", "date", "hours_worked", "gross_earnings",
        "gas_cost", "trip_count", "zone", "created_at", "updated_at",
    ]
    assert list(reader) == []


def test_export_driving_sessions_with_data(client, db_mock):
    row = FakeDrivingSession()
    db_mock.query.return_value.order_by.return_value.all.return_value = [row]
    r = client.get("/export/driving-sessions.csv", headers={"x-user-id": "user-1"})
    assert r.status_code == 200
    records = list(csv.DictReader(io.StringIO(r.text)))
    assert len(records) == 1
    assert records[0]["date"] == str(row.date)
    assert records[0]["gross_earnings"] == str(row.gross_earnings)
    assert records[0]["trip_count"] == str(row.trip_count)
    assert records[0]["zone"] == row.zone


def test_export_driving_sessions_null_zone(client, db_mock):
    row = FakeDrivingSession(zone=None)
    db_mock.query.return_value.order_by.return_value.all.return_value = [row]
    r = client.get("/export/driving-sessions.csv", headers={"x-user-id": "user-1"})
    records = list(csv.DictReader(io.StringIO(r.text)))
    assert records[0]["zone"] == ""


# ── Job activities ────────────────────────────────────────────────────────────

def test_export_job_activities_empty(client, db_mock):
    db_mock.query.return_value.order_by.return_value.all.return_value = []
    r = client.get("/export/job-activities.csv", headers={"x-user-id": "user-1"})
    assert r.status_code == 200
    assert 'filename="job-activities.csv"' in r.headers["content-disposition"]
    reader = csv.DictReader(io.StringIO(r.text))
    assert reader.fieldnames == [
        "id", "date", "applications_submitted", "linkedin_connections",
        "recruiter_contacts", "created_at", "updated_at",
    ]


def test_export_job_activities_with_data(client, db_mock):
    row = FakeJobActivity()
    db_mock.query.return_value.order_by.return_value.all.return_value = [row]
    r = client.get("/export/job-activities.csv", headers={"x-user-id": "user-1"})
    assert r.status_code == 200
    records = list(csv.DictReader(io.StringIO(r.text)))
    assert len(records) == 1
    assert records[0]["applications_submitted"] == str(row.applications_submitted)
    assert records[0]["recruiter_contacts"] == str(row.recruiter_contacts)


# ── Financial snapshots ───────────────────────────────────────────────────────

def test_export_financial_snapshots_empty(client, db_mock):
    db_mock.query.return_value.order_by.return_value.all.return_value = []
    r = client.get("/export/financial-snapshots.csv", headers={"x-user-id": "user-1"})
    assert r.status_code == 200
    assert 'filename="financial-snapshots.csv"' in r.headers["content-disposition"]
    reader = csv.DictReader(io.StringIO(r.text))
    assert reader.fieldnames == [
        "id", "date", "bankroll", "weekly_expenses",
        "tax_accrual", "created_at", "updated_at",
    ]


def test_export_financial_snapshots_with_data(client, db_mock):
    row = FakeFinancialSnapshot()
    db_mock.query.return_value.order_by.return_value.all.return_value = [row]
    r = client.get("/export/financial-snapshots.csv", headers={"x-user-id": "user-1"})
    assert r.status_code == 200
    records = list(csv.DictReader(io.StringIO(r.text)))
    assert len(records) == 1
    assert records[0]["bankroll"] == str(row.bankroll)
    assert records[0]["weekly_expenses"] == str(row.weekly_expenses)
    assert records[0]["tax_accrual"] == str(row.tax_accrual)


# ── Weekly rollups ────────────────────────────────────────────────────────────

def test_export_weekly_rollups_empty(client, db_mock):
    db_mock.query.return_value.order_by.return_value.all.return_value = []
    r = client.get("/export/weekly-rollups.csv", headers={"x-user-id": "user-1"})
    assert r.status_code == 200
    assert 'filename="weekly-rollups.csv"' in r.headers["content-disposition"]
    reader = csv.DictReader(io.StringIO(r.text))
    assert reader.fieldnames == [
        "id", "week_start", "total_hours", "total_earnings", "total_gas",
        "total_trips", "total_applications", "total_linkedin",
        "total_recruiter_contacts", "created_at", "updated_at",
    ]


def test_export_weekly_rollups_with_data(client, db_mock):
    row = FakeWeeklyRollup()
    db_mock.query.return_value.order_by.return_value.all.return_value = [row]
    r = client.get("/export/weekly-rollups.csv", headers={"x-user-id": "user-1"})
    assert r.status_code == 200
    records = list(csv.DictReader(io.StringIO(r.text)))
    assert len(records) == 1
    assert records[0]["week_start"] == str(row.week_start)
    assert records[0]["total_earnings"] == str(row.total_earnings)
    assert records[0]["total_trips"] == str(row.total_trips)
    assert records[0]["total_recruiter_contacts"] == str(row.total_recruiter_contacts)


def test_export_weekly_rollups_multiple_rows(client, db_mock):
    rows = [FakeWeeklyRollup(), FakeWeeklyRollup()]
    db_mock.query.return_value.order_by.return_value.all.return_value = rows
    r = client.get("/export/weekly-rollups.csv", headers={"x-user-id": "user-1"})
    records = list(csv.DictReader(io.StringIO(r.text)))
    assert len(records) == 2
