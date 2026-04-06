"""Income entries — log hours and income against any income stream."""

from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from audit import audit, diff, snapshot, get_user_id
from database import get_db
from models import IncomeEntry, IncomeStream
from role_guard import require_role

router = APIRouter(prefix="/income-entries", tags=["income-entries"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class IncomeEntryCreate(BaseModel):
    income_stream_id: UUID
    entry_date: date
    hours: float | None = None
    amount: float | None = None
    description: str | None = Field(default=None, max_length=256)
    notes: str | None = Field(default=None, max_length=512)


class IncomeEntryUpdate(BaseModel):
    entry_date: date | None = None
    hours: float | None = None
    amount: float | None = None
    description: str | None = Field(default=None, max_length=256)
    notes: str | None = Field(default=None, max_length=512)


class IncomeEntryResponse(BaseModel):
    id: UUID
    income_stream_id: UUID
    entry_date: date
    hours: float | None
    amount: float | None
    description: str | None
    notes: str | None
    created_at: str


def _response(e: IncomeEntry) -> dict:
    return IncomeEntryResponse(
        id=e.id, income_stream_id=e.income_stream_id,
        entry_date=e.entry_date,
        hours=float(e.hours) if e.hours is not None else None,
        amount=float(e.amount) if e.amount is not None else None,
        description=e.description, notes=e.notes,
        created_at=e.created_at.isoformat() if e.created_at else "",
    )


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[IncomeEntryResponse], dependencies=[require_role("ADMIN", "OPERATOR")])
def list_entries(
    stream_id: UUID | None = Query(default=None),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    limit: int = Query(default=200, le=1000),
    db: Session = Depends(get_db),
):
    q = db.query(IncomeEntry).filter(IncomeEntry.deleted_at.is_(None))
    if stream_id:
        q = q.filter(IncomeEntry.income_stream_id == stream_id)
    if from_date:
        q = q.filter(IncomeEntry.entry_date >= from_date)
    if to_date:
        q = q.filter(IncomeEntry.entry_date <= to_date)
    return [_response(e) for e in q.order_by(IncomeEntry.entry_date.desc()).limit(limit).all()]


@router.post("", response_model=IncomeEntryResponse, status_code=201, dependencies=[require_role("ADMIN", "OPERATOR")])
def create_entry(body: IncomeEntryCreate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    stream = db.query(IncomeStream).filter(
        IncomeStream.id == body.income_stream_id, IncomeStream.deleted_at.is_(None)
    ).first()
    if stream is None:
        raise HTTPException(404, "Income stream not found")
    e = IncomeEntry(**body.model_dump(), created_by=user_id)
    db.add(e)
    db.flush()
    audit(db, "income_entries", e.id, "CREATE", user_id, snapshot({
        "income_stream_id": str(e.income_stream_id), "entry_date": str(e.entry_date),
        "hours": float(e.hours) if e.hours else None, "amount": float(e.amount) if e.amount else None,
    }))
    db.commit()
    db.refresh(e)
    return _response(e)


@router.put("/{entry_id}", response_model=IncomeEntryResponse, dependencies=[require_role("ADMIN", "OPERATOR")])
def update_entry(entry_id: UUID, body: IncomeEntryUpdate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    e = db.query(IncomeEntry).filter(
        IncomeEntry.id == entry_id, IncomeEntry.deleted_at.is_(None)
    ).first()
    if e is None:
        raise HTTPException(404, "Income entry not found")
    old = {"entry_date": str(e.entry_date), "hours": float(e.hours) if e.hours else None, "amount": float(e.amount) if e.amount else None}
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(e, field, value)
    new = {"entry_date": str(e.entry_date), "hours": float(e.hours) if e.hours else None, "amount": float(e.amount) if e.amount else None}
    changes = diff(old, new)
    if changes:
        audit(db, "income_entries", e.id, "UPDATE", user_id, changes)
    db.commit()
    db.refresh(e)
    return _response(e)


@router.delete("/{entry_id}", status_code=204, dependencies=[require_role("ADMIN", "OPERATOR")])
def delete_entry(entry_id: UUID, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    e = db.query(IncomeEntry).filter(
        IncomeEntry.id == entry_id, IncomeEntry.deleted_at.is_(None)
    ).first()
    if e is None:
        raise HTTPException(404, "Income entry not found")
    e.deleted_at = datetime.now(timezone.utc)
    e.deleted_by = user_id
    audit(db, "income_entries", e.id, "DELETE", user_id, snapshot({
        "income_stream_id": str(e.income_stream_id), "entry_date": str(e.entry_date),
    }))
    db.commit()
