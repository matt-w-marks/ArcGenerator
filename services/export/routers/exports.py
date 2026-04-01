"""
CSV export endpoints for all four domain entities.

Authentication: the API gateway verifies JWTs and injects x-user-id / x-user-role
headers before forwarding requests here.  We treat absence of x-user-id as
unauthenticated — the gateway should never forward without it.
"""
import csv
import io
from typing import Callable

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from factory_log import log_event
from models import DrivingSession, FinancialSnapshot, JobActivity, WeeklyRollup

router = APIRouter(prefix="/export", tags=["export"])


def _require_user(x_user_id: str | None = Header(default=None)) -> str:
    """Dependency: reject requests that carry no injected user identity."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return x_user_id


def _csv_response(filename: str, rows: list[dict], fieldnames: list[str]) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Driving sessions ────────────────────────────────────────────────────────

_DS_FIELDS = [
    "id", "date", "hours_worked", "gross_earnings",
    "gas_cost", "trip_count", "zone", "created_at", "updated_at",
]


@router.get("/driving-sessions.csv")
def export_driving_sessions(
    user_id: str = Depends(_require_user),
    db: Session = Depends(get_db),
):
    rows = db.query(DrivingSession).order_by(DrivingSession.date).all()
    data = [
        {
            "id": str(r.id),
            "date": str(r.date),
            "hours_worked": str(r.hours_worked),
            "gross_earnings": str(r.gross_earnings),
            "gas_cost": str(r.gas_cost),
            "trip_count": r.trip_count,
            "zone": r.zone or "",
            "created_at": r.created_at.isoformat(),
            "updated_at": r.updated_at.isoformat(),
        }
        for r in rows
    ]
    log_event("INFO", "exported driving-sessions", {"user_id": user_id, "row_count": len(data)})
    return _csv_response("driving-sessions.csv", data, _DS_FIELDS)


# ── Job activities ───────────────────────────────────────────────────────────

_JA_FIELDS = [
    "id", "date", "applications_submitted", "linkedin_connections",
    "recruiter_contacts", "created_at", "updated_at",
]


@router.get("/job-activities.csv")
def export_job_activities(
    user_id: str = Depends(_require_user),
    db: Session = Depends(get_db),
):
    rows = db.query(JobActivity).order_by(JobActivity.date).all()
    data = [
        {
            "id": str(r.id),
            "date": str(r.date),
            "applications_submitted": r.applications_submitted,
            "linkedin_connections": r.linkedin_connections,
            "recruiter_contacts": r.recruiter_contacts,
            "created_at": r.created_at.isoformat(),
            "updated_at": r.updated_at.isoformat(),
        }
        for r in rows
    ]
    log_event("INFO", "exported job-activities", {"user_id": user_id, "row_count": len(data)})
    return _csv_response("job-activities.csv", data, _JA_FIELDS)


# ── Financial snapshots ──────────────────────────────────────────────────────

_FS_FIELDS = [
    "id", "date", "bankroll", "weekly_expenses",
    "tax_accrual", "created_at", "updated_at",
]


@router.get("/financial-snapshots.csv")
def export_financial_snapshots(
    user_id: str = Depends(_require_user),
    db: Session = Depends(get_db),
):
    rows = db.query(FinancialSnapshot).order_by(FinancialSnapshot.date).all()
    data = [
        {
            "id": str(r.id),
            "date": str(r.date),
            "bankroll": str(r.bankroll),
            "weekly_expenses": str(r.weekly_expenses),
            "tax_accrual": str(r.tax_accrual),
            "created_at": r.created_at.isoformat(),
            "updated_at": r.updated_at.isoformat(),
        }
        for r in rows
    ]
    log_event("INFO", "exported financial-snapshots", {"user_id": user_id, "row_count": len(data)})
    return _csv_response("financial-snapshots.csv", data, _FS_FIELDS)


# ── Weekly rollups ───────────────────────────────────────────────────────────

_WR_FIELDS = [
    "id", "week_start", "total_hours", "total_earnings", "total_gas",
    "total_trips", "total_applications", "total_linkedin",
    "total_recruiter_contacts", "created_at", "updated_at",
]


@router.get("/weekly-rollups.csv")
def export_weekly_rollups(
    user_id: str = Depends(_require_user),
    db: Session = Depends(get_db),
):
    rows = db.query(WeeklyRollup).order_by(WeeklyRollup.week_start).all()
    data = [
        {
            "id": str(r.id),
            "week_start": str(r.week_start),
            "total_hours": str(r.total_hours),
            "total_earnings": str(r.total_earnings),
            "total_gas": str(r.total_gas),
            "total_trips": r.total_trips,
            "total_applications": r.total_applications,
            "total_linkedin": r.total_linkedin,
            "total_recruiter_contacts": r.total_recruiter_contacts,
            "created_at": r.created_at.isoformat(),
            "updated_at": r.updated_at.isoformat(),
        }
        for r in rows
    ]
    log_event("INFO", "exported weekly-rollups", {"user_id": user_id, "row_count": len(data)})
    return _csv_response("weekly-rollups.csv", data, _WR_FIELDS)
