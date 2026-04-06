"""Job application pipeline — track individual job applications."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from audit import audit, snapshot, get_user_id
from database import get_db
from models.job_activity import JobActivity
from role_guard import require_role
from schemas.job_activity import (
    JobActivityCreate,
    JobActivityResponse,
    JobActivityUpdate,
)

router = APIRouter(prefix="/job-activities", tags=["job-activities"])


def _response(a: JobActivity) -> dict:
    return JobActivityResponse(
        id=a.id,
        company=a.company,
        role=a.role_title,
        status=a.status,
        applied_date=a.applied_date,
        notes=a.notes,
        created_at=a.created_at,
    )


@router.get("", response_model=list[JobActivityResponse], dependencies=[require_role("ADMIN", "OPERATOR")])
def list_activities(limit: int = Query(default=500, le=1000), db: Session = Depends(get_db)):
    return [
        _response(a) for a in
        db.query(JobActivity).order_by(JobActivity.applied_date.desc().nullslast(), JobActivity.created_at.desc()).limit(limit).all()
    ]


@router.post("", response_model=JobActivityResponse, status_code=201, dependencies=[require_role("ADMIN", "OPERATOR")])
def create_activity(body: JobActivityCreate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    activity = JobActivity(
        date=body.applied_date or __import__("datetime").date.today(),
        company=body.company,
        role_title=body.role,
        status=body.status,
        applied_date=body.applied_date,
        notes=body.notes,
    )
    db.add(activity)
    db.flush()
    audit(db, "job_activities", activity.id, "CREATE", user_id, snapshot({
        "company": activity.company, "role_title": activity.role_title, "status": activity.status,
    }))
    db.commit()
    db.refresh(activity)
    return _response(activity)


@router.get("/{activity_id}", response_model=JobActivityResponse, dependencies=[require_role("ADMIN", "OPERATOR")])
def get_activity(activity_id: UUID, db: Session = Depends(get_db)):
    activity = db.get(JobActivity, activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Job activity not found")
    return _response(activity)


@router.put("/{activity_id}", response_model=JobActivityResponse, dependencies=[require_role("ADMIN", "OPERATOR")])
def update_activity(
    activity_id: UUID, body: JobActivityUpdate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)
):
    activity = db.get(JobActivity, activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Job activity not found")
    updates = body.model_dump(exclude_none=True)
    if "role" in updates:
        updates["role_title"] = updates.pop("role")
    for field, value in updates.items():
        setattr(activity, field, value)
    db.commit()
    db.refresh(activity)
    return _response(activity)


@router.delete("/{activity_id}", status_code=204, dependencies=[require_role("ADMIN", "OPERATOR")])
def delete_activity(activity_id: UUID, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    activity = db.get(JobActivity, activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Job activity not found")
    audit(db, "job_activities", activity.id, "DELETE", user_id, snapshot({
        "company": activity.company, "role_title": activity.role_title,
    }))
    db.delete(activity)
    db.commit()
