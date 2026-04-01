"""
Integration tests for CRUD routers.
The DB session is mocked — tests verify HTTP contract and route logic.
"""
from .conftest import (
    FakeDrivingSession,
    FakeFinancialSnapshot,
    FakeJobActivity,
    FakeWeeklyRollup,
    _UUID,
)

# ── /health ────────────────────────────────────────────────────────────────────


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "service": "metrics"}


# ── /driving-sessions ─────────────────────────────────────────────────────────


class TestDrivingSessions:
    def test_list_empty(self, client, db_mock):
        db_mock.query.return_value.order_by.return_value.all.return_value = []
        res = client.get("/driving-sessions/")
        assert res.status_code == 200
        assert res.json() == []

    def test_list_returns_sessions(self, client, db_mock):
        db_mock.query.return_value.order_by.return_value.all.return_value = [
            FakeDrivingSession()
        ]
        res = client.get("/driving-sessions/")
        assert res.status_code == 200
        assert len(res.json()) == 1
        assert res.json()[0]["trip_count"] == 12

    def test_create_valid(self, client, db_mock):
        fake = FakeDrivingSession()
        db_mock.refresh.side_effect = lambda obj: None
        db_mock.add.return_value = None
        db_mock.commit.return_value = None
        # After refresh, the object should have its fields — use fake directly
        db_mock.refresh.side_effect = lambda obj: obj.__dict__.update(fake.__dict__)

        res = client.post(
            "/driving-sessions/",
            json={
                "date": "2024-06-01",
                "hours_worked": "8.50",
                "gross_earnings": "120.00",
                "gas_cost": "15.00",
                "trip_count": 12,
            },
        )
        assert res.status_code == 201

    def test_create_invalid_hours(self, client, db_mock):
        res = client.post(
            "/driving-sessions/",
            json={"date": "2024-06-01", "hours_worked": "0", "gross_earnings": "100"},
        )
        assert res.status_code == 422

    def test_get_found(self, client, db_mock):
        db_mock.get.return_value = FakeDrivingSession()
        res = client.get(f"/driving-sessions/{_UUID}")
        assert res.status_code == 200
        assert res.json()["id"] == str(_UUID)

    def test_get_not_found(self, client, db_mock):
        db_mock.get.return_value = None
        res = client.get(f"/driving-sessions/{_UUID}")
        assert res.status_code == 404

    def test_update_found(self, client, db_mock):
        fake = FakeDrivingSession()
        db_mock.get.return_value = fake
        db_mock.refresh.side_effect = lambda obj: None
        res = client.put(
            f"/driving-sessions/{_UUID}",
            json={"trip_count": 15},
        )
        assert res.status_code == 200

    def test_update_not_found(self, client, db_mock):
        db_mock.get.return_value = None
        res = client.put(f"/driving-sessions/{_UUID}", json={"trip_count": 5})
        assert res.status_code == 404

    def test_delete_found(self, client, db_mock):
        db_mock.get.return_value = FakeDrivingSession()
        res = client.delete(f"/driving-sessions/{_UUID}")
        assert res.status_code == 204

    def test_delete_not_found(self, client, db_mock):
        db_mock.get.return_value = None
        res = client.delete(f"/driving-sessions/{_UUID}")
        assert res.status_code == 404


# ── /job-activities ────────────────────────────────────────────────────────────


class TestJobActivities:
    def test_list_empty(self, client, db_mock):
        db_mock.query.return_value.order_by.return_value.all.return_value = []
        res = client.get("/job-activities/")
        assert res.status_code == 200
        assert res.json() == []

    def test_list_returns_activities(self, client, db_mock):
        db_mock.query.return_value.order_by.return_value.all.return_value = [
            FakeJobActivity()
        ]
        res = client.get("/job-activities/")
        assert res.status_code == 200
        assert res.json()[0]["applications_submitted"] == 3

    def test_create_valid(self, client, db_mock):
        fake = FakeJobActivity()
        db_mock.refresh.side_effect = lambda obj: obj.__dict__.update(fake.__dict__)
        res = client.post(
            "/job-activities/",
            json={"date": "2024-06-01", "applications_submitted": 3},
        )
        assert res.status_code == 201

    def test_create_negative_fails(self, client, db_mock):
        res = client.post(
            "/job-activities/",
            json={"date": "2024-06-01", "applications_submitted": -1},
        )
        assert res.status_code == 422

    def test_get_found(self, client, db_mock):
        db_mock.get.return_value = FakeJobActivity()
        res = client.get(f"/job-activities/{_UUID}")
        assert res.status_code == 200

    def test_get_not_found(self, client, db_mock):
        db_mock.get.return_value = None
        res = client.get(f"/job-activities/{_UUID}")
        assert res.status_code == 404

    def test_update_found(self, client, db_mock):
        db_mock.get.return_value = FakeJobActivity()
        db_mock.refresh.side_effect = lambda obj: None
        res = client.put(f"/job-activities/{_UUID}", json={"recruiter_contacts": 2})
        assert res.status_code == 200

    def test_update_not_found(self, client, db_mock):
        db_mock.get.return_value = None
        res = client.put(f"/job-activities/{_UUID}", json={"recruiter_contacts": 2})
        assert res.status_code == 404

    def test_delete_found(self, client, db_mock):
        db_mock.get.return_value = FakeJobActivity()
        res = client.delete(f"/job-activities/{_UUID}")
        assert res.status_code == 204

    def test_delete_not_found(self, client, db_mock):
        db_mock.get.return_value = None
        res = client.delete(f"/job-activities/{_UUID}")
        assert res.status_code == 404


# ── /financial-snapshots ───────────────────────────────────────────────────────


class TestFinancialSnapshots:
    def test_list_empty(self, client, db_mock):
        db_mock.query.return_value.order_by.return_value.all.return_value = []
        res = client.get("/financial-snapshots/")
        assert res.status_code == 200

    def test_list_includes_runway_weeks(self, client, db_mock):
        db_mock.query.return_value.order_by.return_value.all.return_value = [
            FakeFinancialSnapshot()
        ]
        res = client.get("/financial-snapshots/")
        assert res.status_code == 200
        # runway_weeks = 5000 / 500 = 10
        assert float(res.json()[0]["runway_weeks"]) == 10.0

    def test_create_valid(self, client, db_mock):
        fake = FakeFinancialSnapshot()
        db_mock.refresh.side_effect = lambda obj: obj.__dict__.update(fake.__dict__)
        res = client.post(
            "/financial-snapshots/",
            json={
                "date": "2024-06-01",
                "bankroll": "5000.00",
                "weekly_expenses": "500.00",
            },
        )
        assert res.status_code == 201

    def test_create_zero_expenses_fails(self, client, db_mock):
        res = client.post(
            "/financial-snapshots/",
            json={"date": "2024-06-01", "bankroll": "5000", "weekly_expenses": "0"},
        )
        assert res.status_code == 422

    def test_get_found(self, client, db_mock):
        db_mock.get.return_value = FakeFinancialSnapshot()
        res = client.get(f"/financial-snapshots/{_UUID}")
        assert res.status_code == 200
        assert "runway_weeks" in res.json()

    def test_get_not_found(self, client, db_mock):
        db_mock.get.return_value = None
        res = client.get(f"/financial-snapshots/{_UUID}")
        assert res.status_code == 404

    def test_update_found(self, client, db_mock):
        db_mock.get.return_value = FakeFinancialSnapshot()
        db_mock.refresh.side_effect = lambda obj: None
        res = client.put(
            f"/financial-snapshots/{_UUID}", json={"bankroll": "4500.00"}
        )
        assert res.status_code == 200

    def test_update_not_found(self, client, db_mock):
        db_mock.get.return_value = None
        res = client.put(
            f"/financial-snapshots/{_UUID}", json={"bankroll": "4500.00"}
        )
        assert res.status_code == 404

    def test_delete_found(self, client, db_mock):
        db_mock.get.return_value = FakeFinancialSnapshot()
        res = client.delete(f"/financial-snapshots/{_UUID}")
        assert res.status_code == 204

    def test_delete_not_found(self, client, db_mock):
        db_mock.get.return_value = None
        res = client.delete(f"/financial-snapshots/{_UUID}")
        assert res.status_code == 404


# ── /weekly-rollups ────────────────────────────────────────────────────────────


class TestWeeklyRollups:
    def test_list_empty(self, client, db_mock):
        db_mock.query.return_value.order_by.return_value.all.return_value = []
        res = client.get("/weekly-rollups/")
        assert res.status_code == 200

    def test_list_returns_rollups(self, client, db_mock):
        db_mock.query.return_value.order_by.return_value.all.return_value = [
            FakeWeeklyRollup()
        ]
        res = client.get("/weekly-rollups/")
        assert res.status_code == 200
        assert res.json()[0]["total_trips"] == 50

    def test_create_valid_sunday(self, client, db_mock):
        fake = FakeWeeklyRollup()
        db_mock.refresh.side_effect = lambda obj: obj.__dict__.update(fake.__dict__)
        res = client.post(
            "/weekly-rollups/",
            json={"week_start": "2024-06-02"},  # Sunday
        )
        assert res.status_code == 201

    def test_create_non_sunday_fails(self, client, db_mock):
        res = client.post(
            "/weekly-rollups/",
            json={"week_start": "2024-06-03"},  # Monday
        )
        assert res.status_code == 422

    def test_get_found(self, client, db_mock):
        db_mock.get.return_value = FakeWeeklyRollup()
        res = client.get(f"/weekly-rollups/{_UUID}")
        assert res.status_code == 200

    def test_get_not_found(self, client, db_mock):
        db_mock.get.return_value = None
        res = client.get(f"/weekly-rollups/{_UUID}")
        assert res.status_code == 404

    def test_update_found(self, client, db_mock):
        db_mock.get.return_value = FakeWeeklyRollup()
        db_mock.refresh.side_effect = lambda obj: None
        res = client.put(f"/weekly-rollups/{_UUID}", json={"total_trips": 60})
        assert res.status_code == 200

    def test_update_not_found(self, client, db_mock):
        db_mock.get.return_value = None
        res = client.put(f"/weekly-rollups/{_UUID}", json={"total_trips": 60})
        assert res.status_code == 404

    def test_delete_found(self, client, db_mock):
        db_mock.get.return_value = FakeWeeklyRollup()
        res = client.delete(f"/weekly-rollups/{_UUID}")
        assert res.status_code == 204

    def test_delete_not_found(self, client, db_mock):
        db_mock.get.return_value = None
        res = client.delete(f"/weekly-rollups/{_UUID}")
        assert res.status_code == 404
