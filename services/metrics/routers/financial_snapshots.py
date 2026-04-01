from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from factory_log import log_event
from models.financial_snapshot import FinancialSnapshot
from schemas.financial_snapshot import (
    FinancialSnapshotCreate,
    FinancialSnapshotResponse,
    FinancialSnapshotUpdate,
)

router = APIRouter(prefix="/financial-snapshots", tags=["financial-snapshots"])


@router.get("/", response_model=list[FinancialSnapshotResponse])
def list_snapshots(db: Session = Depends(get_db)):
    return db.query(FinancialSnapshot).order_by(FinancialSnapshot.date.desc()).all()


@router.post("/", response_model=FinancialSnapshotResponse, status_code=201)
def create_snapshot(body: FinancialSnapshotCreate, db: Session = Depends(get_db)):
    snapshot = FinancialSnapshot(**body.model_dump())
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    log_event("INFO", "financial_snapshot.created", {"id": str(snapshot.id)})
    return snapshot


@router.get("/{snapshot_id}", response_model=FinancialSnapshotResponse)
def get_snapshot(snapshot_id: UUID, db: Session = Depends(get_db)):
    snapshot = db.get(FinancialSnapshot, snapshot_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Financial snapshot not found")
    return snapshot


@router.put("/{snapshot_id}", response_model=FinancialSnapshotResponse)
def update_snapshot(
    snapshot_id: UUID, body: FinancialSnapshotUpdate, db: Session = Depends(get_db)
):
    snapshot = db.get(FinancialSnapshot, snapshot_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Financial snapshot not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(snapshot, field, value)
    db.commit()
    db.refresh(snapshot)
    log_event("INFO", "financial_snapshot.updated", {"id": str(snapshot_id)})
    return snapshot


@router.delete("/{snapshot_id}", status_code=204)
def delete_snapshot(snapshot_id: UUID, db: Session = Depends(get_db)):
    snapshot = db.get(FinancialSnapshot, snapshot_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Financial snapshot not found")
    db.delete(snapshot)
    db.commit()
    log_event("INFO", "financial_snapshot.deleted", {"id": str(snapshot_id)})
