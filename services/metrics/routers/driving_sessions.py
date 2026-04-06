from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from database import get_db
from factory_log import log_event
from models.driving_session import DrivingSession
from schemas.driving_session import (
    DrivingSessionCreate,
    DrivingSessionResponse,
    DrivingSessionUpdate,
)

router = APIRouter(prefix="/driving-sessions", tags=["driving-sessions"])


@router.get("", response_model=list[DrivingSessionResponse])
def list_sessions(db: Session = Depends(get_db)):
    return (
        db.query(DrivingSession)
        .options(joinedload(DrivingSession.zone_rel))
        .order_by(DrivingSession.date.desc())
        .all()
    )


@router.post("", response_model=DrivingSessionResponse, status_code=201)
def create_session(body: DrivingSessionCreate, db: Session = Depends(get_db)):
    session = DrivingSession(**body.model_dump())
    db.add(session)
    db.commit()
    db.refresh(session)
    # reload with zone relationship for response
    db.expire(session)
    session = (
        db.query(DrivingSession)
        .options(joinedload(DrivingSession.zone_rel))
        .filter(DrivingSession.id == session.id)
        .one()
    )
    log_event("INFO", "driving_session.created", {"id": str(session.id)})
    return session


@router.get("/{session_id}", response_model=DrivingSessionResponse)
def get_session(session_id: UUID, db: Session = Depends(get_db)):
    session = (
        db.query(DrivingSession)
        .options(joinedload(DrivingSession.zone_rel))
        .filter(DrivingSession.id == session_id)
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Driving session not found")
    return session


@router.put("/{session_id}", response_model=DrivingSessionResponse)
def update_session(
    session_id: UUID, body: DrivingSessionUpdate, db: Session = Depends(get_db)
):
    session = db.get(DrivingSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Driving session not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(session, field, value)
    db.commit()
    db.expire(session)
    session = (
        db.query(DrivingSession)
        .options(joinedload(DrivingSession.zone_rel))
        .filter(DrivingSession.id == session_id)
        .one()
    )
    log_event("INFO", "driving_session.updated", {"id": str(session_id)})
    return session


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: UUID, db: Session = Depends(get_db)):
    session = db.get(DrivingSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Driving session not found")
    db.delete(session)
    db.commit()
    log_event("INFO", "driving_session.deleted", {"id": str(session_id)})
