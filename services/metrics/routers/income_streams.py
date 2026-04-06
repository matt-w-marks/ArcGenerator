"""Income streams — unified registry for ventures, roles, and engagements."""

from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from audit import audit, diff, snapshot, get_user_id
from database import get_db
from models import IncomeStream
from role_guard import require_role

router = APIRouter(prefix="/income-streams", tags=["income-streams"])

STREAM_TYPES = ("venture", "role", "engagement")
STATUSES = ("active", "paused", "closed")
ROLE_TYPES = ("ft", "pt", "ic", "contract")
COMPENSATION_TYPES = ("salary", "hourly", "project", "commission")
PAY_FREQUENCIES = ("weekly", "biweekly", "semimonthly", "monthly")
VENTURE_TYPES = ("rideshare", "delivery", "freelance", "ecommerce", "other")
ENGAGEMENT_TYPES = ("consulting", "advisory", "expert_network")
RATE_UNITS = ("hourly", "daily", "session", "project")


# ── Schemas ──────────────────────────────────────────────────────────────────

class IncomeStreamCreate(BaseModel):
    name: str = Field(max_length=128)
    stream_type: str = Field(max_length=16)
    status: str = Field(default="active", max_length=16)
    # Venture
    venture_type: str | None = Field(default=None, max_length=32)
    # Role
    company: str | None = Field(default=None, max_length=128)
    title: str | None = Field(default=None, max_length=128)
    role_type: str | None = Field(default=None, max_length=16)
    compensation_type: str | None = Field(default=None, max_length=16)
    compensation_rate: float | None = None
    pay_frequency: str | None = Field(default=None, max_length=16)
    # Engagement
    client: str | None = Field(default=None, max_length=128)
    engagement_type: str | None = Field(default=None, max_length=32)
    rate: float | None = None
    rate_unit: str | None = Field(default=None, max_length=16)
    # Common
    start_date: date | None = None
    end_date: date | None = None
    description: str | None = Field(default=None, max_length=512)
    notes: str | None = Field(default=None, max_length=512)


class IncomeStreamUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    status: str | None = Field(default=None, max_length=16)
    venture_type: str | None = Field(default=None, max_length=32)
    company: str | None = Field(default=None, max_length=128)
    title: str | None = Field(default=None, max_length=128)
    role_type: str | None = Field(default=None, max_length=16)
    compensation_type: str | None = Field(default=None, max_length=16)
    compensation_rate: float | None = None
    pay_frequency: str | None = Field(default=None, max_length=16)
    client: str | None = Field(default=None, max_length=128)
    engagement_type: str | None = Field(default=None, max_length=32)
    rate: float | None = None
    rate_unit: str | None = Field(default=None, max_length=16)
    start_date: date | None = None
    end_date: date | None = None
    description: str | None = Field(default=None, max_length=512)
    notes: str | None = Field(default=None, max_length=512)


class IncomeStreamResponse(BaseModel):
    id: UUID
    name: str
    stream_type: str
    status: str
    venture_type: str | None
    company: str | None
    title: str | None
    role_type: str | None
    compensation_type: str | None
    compensation_rate: float | None
    pay_frequency: str | None
    client: str | None
    engagement_type: str | None
    rate: float | None
    rate_unit: str | None
    start_date: date | None
    end_date: date | None
    description: str | None
    notes: str | None
    created_at: str


def _response(s: IncomeStream) -> dict:
    return IncomeStreamResponse(
        id=s.id, name=s.name, stream_type=s.stream_type, status=s.status,
        venture_type=s.venture_type,
        company=s.company, title=s.title, role_type=s.role_type,
        compensation_type=s.compensation_type,
        compensation_rate=float(s.compensation_rate) if s.compensation_rate is not None else None,
        pay_frequency=s.pay_frequency,
        client=s.client, engagement_type=s.engagement_type,
        rate=float(s.rate) if s.rate is not None else None,
        rate_unit=s.rate_unit,
        start_date=s.start_date, end_date=s.end_date,
        description=s.description, notes=s.notes,
        created_at=s.created_at.isoformat() if s.created_at else "",
    )


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[IncomeStreamResponse], dependencies=[require_role("ADMIN", "OPERATOR")])
def list_streams(
    stream_type: str | None = Query(default=None, alias="type"),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    q = db.query(IncomeStream).filter(IncomeStream.deleted_at.is_(None))
    if stream_type:
        q = q.filter(IncomeStream.stream_type == stream_type)
    if status:
        q = q.filter(IncomeStream.status == status)
    return [_response(s) for s in q.order_by(IncomeStream.created_at.desc()).all()]


@router.post("", response_model=IncomeStreamResponse, status_code=201, dependencies=[require_role("ADMIN", "OPERATOR")])
def create_stream(body: IncomeStreamCreate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    if body.stream_type not in STREAM_TYPES:
        raise HTTPException(400, f"stream_type must be one of {STREAM_TYPES}")
    s = IncomeStream(**body.model_dump(), created_by=user_id)
    db.add(s)
    db.flush()
    audit(db, "income_streams", s.id, "CREATE", user_id, snapshot({
        "name": s.name, "stream_type": s.stream_type, "status": s.status,
    }))
    db.commit()
    db.refresh(s)
    return _response(s)


@router.get("/{stream_id}", response_model=IncomeStreamResponse, dependencies=[require_role("ADMIN", "OPERATOR")])
def get_stream(stream_id: UUID, db: Session = Depends(get_db)):
    s = db.query(IncomeStream).filter(
        IncomeStream.id == stream_id, IncomeStream.deleted_at.is_(None)
    ).first()
    if s is None:
        raise HTTPException(404, "Income stream not found")
    return _response(s)


@router.put("/{stream_id}", response_model=IncomeStreamResponse, dependencies=[require_role("ADMIN", "OPERATOR")])
def update_stream(stream_id: UUID, body: IncomeStreamUpdate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    s = db.query(IncomeStream).filter(
        IncomeStream.id == stream_id, IncomeStream.deleted_at.is_(None)
    ).first()
    if s is None:
        raise HTTPException(404, "Income stream not found")
    old = {"name": s.name, "status": s.status, "company": s.company, "title": s.title}
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(s, field, value)
    new = {"name": s.name, "status": s.status, "company": s.company, "title": s.title}
    changes = diff(old, new)
    if changes:
        audit(db, "income_streams", s.id, "UPDATE", user_id, changes)
    db.commit()
    db.refresh(s)
    return _response(s)


@router.delete("/{stream_id}", status_code=204, dependencies=[require_role("ADMIN", "OPERATOR")])
def delete_stream(stream_id: UUID, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    s = db.query(IncomeStream).filter(
        IncomeStream.id == stream_id, IncomeStream.deleted_at.is_(None)
    ).first()
    if s is None:
        raise HTTPException(404, "Income stream not found")
    s.deleted_at = datetime.now(timezone.utc)
    s.deleted_by = user_id
    audit(db, "income_streams", s.id, "DELETE", user_id, snapshot({"name": s.name, "stream_type": s.stream_type}))
    db.commit()
