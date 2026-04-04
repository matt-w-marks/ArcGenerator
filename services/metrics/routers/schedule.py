from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models.calendar_entry import CalendarEntry
from models.platform import Platform
from models.schedule import Schedule
from models.schedule_block import ScheduleBlock

router = APIRouter(prefix="/schedule", tags=["schedule"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ScheduleCreate(BaseModel):
    name:                  str = Field(min_length=1, max_length=64)
    description:           str | None = None
    color:                 str = Field(default="#6b7280", pattern="^#[0-9a-fA-F]{6}$")
    pre_day_checklist_id:  UUID | None = None
    post_day_checklist_id: UUID | None = None


class ScheduleUpdate(BaseModel):
    name:                  str | None = Field(default=None, max_length=64)
    description:           str | None = None
    color:                 str | None = Field(default=None, pattern="^#[0-9a-fA-F]{6}$")
    pre_day_checklist_id:  UUID | None = None
    post_day_checklist_id: UUID | None = None


class BlockCreate(BaseModel):
    hour_start:    float = Field(ge=0, le=25.5)
    hour_end:      float = Field(ge=0.5, le=26)
    block_type:    str   = Field(pattern="^(zone|event|job|rest|note|checklist)$")
    zone_id:       UUID | None = None
    label:         str   = Field(min_length=1, max_length=128)
    notes:         str | None = None
    sort_order:    int   = 0
    gross_revenue: float = Field(default=0, ge=0)
    actual_gross:  float | None = Field(default=None, ge=0)
    platform_ids:  list[UUID] = []


class BlockUpdate(BaseModel):
    hour_start:    float | None = Field(default=None, ge=0, le=25.5)
    hour_end:      float | None = Field(default=None, ge=0.5, le=26)
    block_type:    str | None = Field(default=None, pattern="^(zone|event|job|rest|note|checklist)$")
    zone_id:       UUID | None = None
    label:         str | None = Field(default=None, max_length=128)
    notes:         str | None = None
    sort_order:    int | None = None
    gross_revenue: float | None = Field(default=None, ge=0)
    actual_gross:  float | None = Field(default=None, ge=0)
    platform_ids:  list[UUID] | None = None


class BlockResponse(BaseModel):
    id:              UUID
    schedule_id:     UUID
    hour_start:      float
    hour_end:        float
    block_type:      str
    zone_id:         UUID | None
    zone_name:       str | None
    label:           str
    notes:           str | None
    sort_order:      int
    gross_revenue:   float
    actual_gross:    float | None
    platform_ids:    list[UUID] = []
    platform_names:  list[str] = []
    platform_colors: list[str] = []

    @classmethod
    def from_block(cls, block: "ScheduleBlock", pmap: dict) -> "BlockResponse":  # type: ignore[name-defined]
        ids = block.platform_ids or []
        plats = [pmap[pid] for pid in ids if pid in pmap]
        return cls(
            id=block.id,
            schedule_id=block.schedule_id,
            hour_start=float(block.hour_start),
            hour_end=float(block.hour_end),
            block_type=block.block_type,
            zone_id=block.zone_id,
            zone_name=block.zone_name,
            label=block.label,
            notes=block.notes,
            sort_order=block.sort_order,
            gross_revenue=float(block.gross_revenue),
            actual_gross=float(block.actual_gross) if block.actual_gross is not None else None,
            platform_ids=list(ids),
            platform_names=[p.name for p in plats],
            platform_colors=[p.color for p in plats if p.color],
        )


class ScheduleResponse(BaseModel):
    id:                    UUID
    name:                  str
    description:           str | None
    color:                 str = "#6b7280"
    pre_day_checklist_id:  UUID | None = None
    post_day_checklist_id: UUID | None = None
    blocks:                list[BlockResponse] = []


class CalendarEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:             UUID
    schedule_id:    UUID
    entry_date:     date
    schedule_name:  str | None = None
    schedule_color: str | None = None

    @classmethod
    def from_orm_with_name(cls, entry: CalendarEntry) -> "CalendarEntryResponse":
        return cls(
            id=entry.id,
            schedule_id=entry.schedule_id,
            entry_date=entry.entry_date,
            schedule_name=entry.schedule.name if entry.schedule else None,
            schedule_color=entry.schedule.color if entry.schedule else None,
        )


class AssignRequest(BaseModel):
    schedule_id: UUID


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pmap(db: Session, blocks: list[ScheduleBlock]) -> dict:
    """Return {platform_id: Platform} for all IDs referenced by the blocks."""
    ids = {pid for b in blocks for pid in (b.platform_ids or [])}
    if not ids:
        return {}
    return {p.id: p for p in db.query(Platform).filter(Platform.id.in_(ids)).all()}


def _load_schedule(db: Session, schedule_id: UUID) -> Schedule:
    s = (
        db.query(Schedule)
        .options(joinedload(Schedule.blocks).joinedload(ScheduleBlock.zone_rel))
        .filter(Schedule.id == schedule_id)
        .first()
    )
    if s is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return s


def _schedule_response(db: Session, s: Schedule) -> ScheduleResponse:
    pm = _pmap(db, s.blocks)
    return ScheduleResponse(
        id=s.id,
        name=s.name,
        description=s.description,
        color=s.color,
        pre_day_checklist_id=s.pre_day_checklist_id,
        post_day_checklist_id=s.post_day_checklist_id,
        blocks=[
            BlockResponse.from_block(b, pm)
            for b in sorted(s.blocks, key=lambda b: b.sort_order)
        ],
    )


def _load_block(db: Session, block_id: UUID) -> ScheduleBlock:
    b = (
        db.query(ScheduleBlock)
        .options(joinedload(ScheduleBlock.zone_rel))
        .filter(ScheduleBlock.id == block_id)
        .first()
    )
    if b is None:
        raise HTTPException(status_code=404, detail="Block not found")
    return b


def _block_response(db: Session, b: ScheduleBlock) -> BlockResponse:
    pm = _pmap(db, [b])
    return BlockResponse.from_block(b, pm)


# ── Schedules ─────────────────────────────────────────────────────────────────

@router.get("/schedules", response_model=list[ScheduleResponse])
def list_schedules(db: Session = Depends(get_db)):
    schedules = (
        db.query(Schedule)
        .options(joinedload(Schedule.blocks).joinedload(ScheduleBlock.zone_rel))
        .order_by(Schedule.name)
        .all()
    )
    return [_schedule_response(db, s) for s in schedules]


@router.post("/schedules", response_model=ScheduleResponse, status_code=201)
def create_schedule(body: ScheduleCreate, db: Session = Depends(get_db)):
    s = Schedule(**body.model_dump())
    db.add(s)
    db.commit()
    return _schedule_response(db, _load_schedule(db, s.id))


@router.get("/schedules/{schedule_id}", response_model=ScheduleResponse)
def get_schedule(schedule_id: UUID, db: Session = Depends(get_db)):
    return _schedule_response(db, _load_schedule(db, schedule_id))


@router.put("/schedules/{schedule_id}", response_model=ScheduleResponse)
def update_schedule(schedule_id: UUID, body: ScheduleUpdate, db: Session = Depends(get_db)):
    s = db.get(Schedule, schedule_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(s, field, value)
    db.commit()
    return _schedule_response(db, _load_schedule(db, schedule_id))


@router.delete("/schedules/{schedule_id}", status_code=204)
def delete_schedule(schedule_id: UUID, db: Session = Depends(get_db)):
    s = db.get(Schedule, schedule_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    db.delete(s)
    db.commit()


# ── Blocks within a schedule ──────────────────────────────────────────────────

@router.post("/schedules/{schedule_id}/blocks", response_model=BlockResponse, status_code=201)
def add_block(schedule_id: UUID, body: BlockCreate, db: Session = Depends(get_db)):
    if not db.get(Schedule, schedule_id):
        raise HTTPException(status_code=404, detail="Schedule not found")
    block = ScheduleBlock(schedule_id=schedule_id, **body.model_dump())
    db.add(block)
    db.commit()
    return _block_response(db, _load_block(db, block.id))


@router.put("/blocks/{block_id}", response_model=BlockResponse)
def update_block(block_id: UUID, body: BlockUpdate, db: Session = Depends(get_db)):
    block = db.get(ScheduleBlock, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    updates = body.model_dump(exclude_none=True)
    # platform_ids=[] is a valid update (clear all) but model_dump excludes None, not []
    if body.platform_ids is not None:
        updates["platform_ids"] = body.platform_ids
    for field, value in updates.items():
        setattr(block, field, value)
    db.commit()
    return _block_response(db, _load_block(db, block_id))


@router.delete("/blocks/{block_id}", status_code=204)
def delete_block(block_id: UUID, db: Session = Depends(get_db)):
    block = db.get(ScheduleBlock, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    db.delete(block)
    db.commit()


# ── Calendar entries ──────────────────────────────────────────────────────────

@router.get("/calendar", response_model=list[CalendarEntryResponse])
def list_calendar(month: str, db: Session = Depends(get_db)):
    """Return all entries for a given month. month format: YYYY-MM"""
    try:
        year, mon = map(int, month.split("-"))
    except ValueError:
        raise HTTPException(status_code=422, detail="month must be YYYY-MM")
    entries = (
        db.query(CalendarEntry)
        .options(joinedload(CalendarEntry.schedule))
        .filter(
            CalendarEntry.entry_date >= date(year, mon, 1),
            CalendarEntry.entry_date < (
                date(year, mon + 1, 1) if mon < 12 else date(year + 1, 1, 1)
            ),
        )
        .all()
    )
    return [CalendarEntryResponse.from_orm_with_name(e) for e in entries]


@router.get("/calendar/{entry_date}", response_model=CalendarEntryResponse)
def get_calendar_entry(entry_date: date, db: Session = Depends(get_db)):
    e = (
        db.query(CalendarEntry)
        .options(joinedload(CalendarEntry.schedule))
        .filter(CalendarEntry.entry_date == entry_date)
        .first()
    )
    if e is None:
        raise HTTPException(status_code=404, detail="No schedule assigned to that date")
    return CalendarEntryResponse.from_orm_with_name(e)


@router.put("/calendar/{entry_date}", response_model=CalendarEntryResponse)
def assign_calendar(entry_date: date, body: AssignRequest, db: Session = Depends(get_db)):
    """Assign (or reassign) a schedule to a calendar date."""
    if not db.get(Schedule, body.schedule_id):
        raise HTTPException(status_code=404, detail="Schedule not found")
    e = db.query(CalendarEntry).filter(CalendarEntry.entry_date == entry_date).first()
    if e:
        e.schedule_id = body.schedule_id
    else:
        e = CalendarEntry(schedule_id=body.schedule_id, entry_date=entry_date)
        db.add(e)
    db.commit()
    db.refresh(e)
    e = (
        db.query(CalendarEntry)
        .options(joinedload(CalendarEntry.schedule))
        .filter(CalendarEntry.entry_date == entry_date)
        .first()
    )
    return CalendarEntryResponse.from_orm_with_name(e)


@router.delete("/calendar/{entry_date}", status_code=204)
def unassign_calendar(entry_date: date, db: Session = Depends(get_db)):
    e = db.query(CalendarEntry).filter(CalendarEntry.entry_date == entry_date).first()
    if e is None:
        raise HTTPException(status_code=404, detail="No assignment on that date")
    db.delete(e)
    db.commit()
