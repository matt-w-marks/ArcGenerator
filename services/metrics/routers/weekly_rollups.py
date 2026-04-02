from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from factory_log import log_event
from models.weekly_rollup import WeeklyRollup
from schemas.weekly_rollup import (
    WeeklyRollupCreate,
    WeeklyRollupResponse,
    WeeklyRollupUpdate,
)

router = APIRouter(prefix="/weekly-rollups", tags=["weekly-rollups"])


@router.get("", response_model=list[WeeklyRollupResponse])
def list_rollups(db: Session = Depends(get_db)):
    return db.query(WeeklyRollup).order_by(WeeklyRollup.week_start.desc()).all()


@router.post("", response_model=WeeklyRollupResponse, status_code=201)
def create_rollup(body: WeeklyRollupCreate, db: Session = Depends(get_db)):
    rollup = WeeklyRollup(**body.model_dump())
    db.add(rollup)
    db.commit()
    db.refresh(rollup)
    log_event("INFO", "weekly_rollup.created", {"id": str(rollup.id)})
    return rollup


@router.get("/{rollup_id}", response_model=WeeklyRollupResponse)
def get_rollup(rollup_id: UUID, db: Session = Depends(get_db)):
    rollup = db.get(WeeklyRollup, rollup_id)
    if rollup is None:
        raise HTTPException(status_code=404, detail="Weekly rollup not found")
    return rollup


@router.put("/{rollup_id}", response_model=WeeklyRollupResponse)
def update_rollup(
    rollup_id: UUID, body: WeeklyRollupUpdate, db: Session = Depends(get_db)
):
    rollup = db.get(WeeklyRollup, rollup_id)
    if rollup is None:
        raise HTTPException(status_code=404, detail="Weekly rollup not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(rollup, field, value)
    db.commit()
    db.refresh(rollup)
    log_event("INFO", "weekly_rollup.updated", {"id": str(rollup_id)})
    return rollup


@router.delete("/{rollup_id}", status_code=204)
def delete_rollup(rollup_id: UUID, db: Session = Depends(get_db)):
    rollup = db.get(WeeklyRollup, rollup_id)
    if rollup is None:
        raise HTTPException(status_code=404, detail="Weekly rollup not found")
    db.delete(rollup)
    db.commit()
    log_event("INFO", "weekly_rollup.deleted", {"id": str(rollup_id)})
