from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from factory_log import log_event
from models.job_activity import JobActivity
from schemas.job_activity import (
    JobActivityCreate,
    JobActivityResponse,
    JobActivityUpdate,
)

router = APIRouter(prefix="/job-activities", tags=["job-activities"])


@router.get("/", response_model=list[JobActivityResponse])
def list_activities(db: Session = Depends(get_db)):
    return db.query(JobActivity).order_by(JobActivity.date.desc()).all()


@router.post("/", response_model=JobActivityResponse, status_code=201)
def create_activity(body: JobActivityCreate, db: Session = Depends(get_db)):
    activity = JobActivity(**body.model_dump())
    db.add(activity)
    db.commit()
    db.refresh(activity)
    log_event("INFO", "job_activity.created", {"id": str(activity.id)})
    return activity


@router.get("/{activity_id}", response_model=JobActivityResponse)
def get_activity(activity_id: UUID, db: Session = Depends(get_db)):
    activity = db.get(JobActivity, activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Job activity not found")
    return activity


@router.put("/{activity_id}", response_model=JobActivityResponse)
def update_activity(
    activity_id: UUID, body: JobActivityUpdate, db: Session = Depends(get_db)
):
    activity = db.get(JobActivity, activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Job activity not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(activity, field, value)
    db.commit()
    db.refresh(activity)
    log_event("INFO", "job_activity.updated", {"id": str(activity_id)})
    return activity


@router.delete("/{activity_id}", status_code=204)
def delete_activity(activity_id: UUID, db: Session = Depends(get_db)):
    activity = db.get(JobActivity, activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Job activity not found")
    db.delete(activity)
    db.commit()
    log_event("INFO", "job_activity.deleted", {"id": str(activity_id)})
