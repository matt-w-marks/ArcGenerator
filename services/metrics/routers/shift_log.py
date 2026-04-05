"""Shift log router — daily ops logging via daily_block_logs.

All actual/logged data lives in daily_block_logs, keyed by (block_id, entry_date).
schedule_blocks remain pure templates (planned data only).

GET  /shift-log/today                          → today's schedule + blocks with daily log data
GET  /shift-log/{date}                         → specific date
PUT  /shift-log/blocks/{block_id}              → upsert daily log for a block on a date
POST /shift-log/blocks/{block_id}/expenses     → add expense (auto-creates daily log if needed)
DELETE /shift-log/expenses/{id}                → delete expense
POST /shift-log/blocks/{block_id}/platform-earnings  → upsert platform earning
DELETE /shift-log/platform-earnings/{id}       → delete platform earning
"""

from datetime import date, time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import (
    CalendarEntry, Schedule, ScheduleBlock, Platform,
    DailyBlockLog, DailyExpense, DailyPlatformEarning,
)

router = APIRouter(prefix="/shift-log", tags=["shift-log"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    daily_block_log_id: UUID
    category: str
    amount: float
    description: str | None = None

class ExpenseCreate(BaseModel):
    entry_date: date
    category: str = Field(pattern="^(gas|tolls|parking|car_wash|food|other)$")
    amount: float = Field(ge=0)
    description: str | None = Field(default=None, max_length=256)

class PlatformEarningResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    daily_block_log_id: UUID
    platform_id: UUID
    platform_name: str | None = None
    platform_color: str | None = None
    earnings: float
    trip_count: int | None = None

class PlatformEarningCreate(BaseModel):
    entry_date: date
    platform_id: UUID
    earnings: float = Field(ge=0)
    trip_count: int | None = Field(default=None, ge=0)

class BlockLogUpdate(BaseModel):
    entry_date: date
    actual_gross: float | None = Field(default=None, ge=0)
    trip_count: int | None = Field(default=None, ge=0)
    actual_start: str | None = None   # "HH:MM" or "HH:MM:SS"
    actual_end: str | None = None
    odometer_start: float | None = Field(default=None, ge=0)
    odometer_end: float | None = Field(default=None, ge=0)
    surge_active: bool | None = None
    log_notes: str | None = None

class DailyLogResponse(BaseModel):
    id: UUID
    block_id: UUID
    entry_date: date
    actual_gross: float | None = None
    trip_count: int | None = None
    actual_start: str | None = None
    actual_end: str | None = None
    odometer_start: float | None = None
    odometer_end: float | None = None
    miles_driven: float | None = None
    surge_active: bool = False
    active_hours: float | None = None
    log_notes: str | None = None
    expenses: list[ExpenseResponse] = []
    platform_earnings: list[PlatformEarningResponse] = []

class BlockLogResponse(BaseModel):
    """Combined template block + daily log data for a specific date."""
    id: UUID
    schedule_id: UUID
    hour_start: float
    hour_end: float
    block_type: str
    label: str
    notes: str | None
    zone_id: UUID | None
    zone_name: str | None
    sort_order: int
    gross_revenue: float
    platform_ids: list[UUID] = []
    platform_names: list[str] = []
    platform_colors: list[str] = []
    # Daily log (None if not yet logged)
    daily_log: DailyLogResponse | None = None

class DayLogResponse(BaseModel):
    date: str
    schedule_id: UUID
    schedule_name: str
    schedule_color: str
    schedule_description: str | None = None
    blocks: list[BlockLogResponse] = []


# ── Helpers ───────────────────────────────────────────────────────────────────

def _time_str(t: time | None) -> str | None:
    if t is None:
        return None
    return t.strftime("%H:%M")

def _parse_time(s: str | None) -> time | None:
    if not s:
        return None
    parts = s.split(":")
    return time(int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)

def _get_or_create_daily_log(db: Session, block_id: UUID, entry_date: date) -> DailyBlockLog:
    """Find or create a DailyBlockLog for the given block+date."""
    log = (
        db.query(DailyBlockLog)
        .filter(DailyBlockLog.block_id == block_id, DailyBlockLog.entry_date == entry_date)
        .first()
    )
    if log is None:
        log = DailyBlockLog(block_id=block_id, entry_date=entry_date)
        db.add(log)
        db.flush()
    return log

def _build_daily_log_response(log: DailyBlockLog, pmap: dict) -> DailyLogResponse:
    pe_list = []
    for pe in (log.platform_earnings or []):
        p = pmap.get(pe.platform_id)
        pe_list.append(PlatformEarningResponse(
            id=pe.id,
            daily_block_log_id=pe.daily_block_log_id,
            platform_id=pe.platform_id,
            platform_name=p.name if p else None,
            platform_color=p.color if p else None,
            earnings=float(pe.earnings),
            trip_count=pe.trip_count,
        ))

    return DailyLogResponse(
        id=log.id,
        block_id=log.block_id,
        entry_date=log.entry_date,
        actual_gross=float(log.actual_gross) if log.actual_gross is not None else None,
        trip_count=log.trip_count,
        actual_start=_time_str(log.actual_start),
        actual_end=_time_str(log.actual_end),
        odometer_start=float(log.odometer_start) if log.odometer_start is not None else None,
        odometer_end=float(log.odometer_end) if log.odometer_end is not None else None,
        miles_driven=float(log.miles_driven) if log.miles_driven is not None else None,
        surge_active=log.surge_active,
        active_hours=float(log.active_hours) if log.active_hours is not None else None,
        log_notes=log.log_notes,
        expenses=[ExpenseResponse.model_validate(e) for e in (log.expenses or [])],
        platform_earnings=pe_list,
    )

def _build_block_response(block: ScheduleBlock, pmap: dict, daily_log: DailyBlockLog | None) -> BlockLogResponse:
    ids = block.platform_ids or []
    plats = [pmap[pid] for pid in ids if pid in pmap]

    return BlockLogResponse(
        id=block.id,
        schedule_id=block.schedule_id,
        hour_start=float(block.hour_start),
        hour_end=float(block.hour_end),
        block_type=block.block_type,
        label=block.label,
        notes=block.notes,
        zone_id=block.zone_id,
        zone_name=block.zone_name,
        sort_order=block.sort_order,
        gross_revenue=float(block.gross_revenue),
        platform_ids=[p.id for p in plats],
        platform_names=[p.name for p in plats],
        platform_colors=[p.color or "#6b7280" for p in plats],
        daily_log=_build_daily_log_response(daily_log, pmap) if daily_log else None,
    )

def _load_day(db: Session, entry_date: date) -> DayLogResponse:
    entry = (
        db.query(CalendarEntry)
        .options(joinedload(CalendarEntry.schedule))
        .filter(CalendarEntry.entry_date == entry_date)
        .first()
    )
    if entry is None:
        raise HTTPException(status_code=404, detail="No schedule assigned to that date")

    sched = entry.schedule
    blocks = (
        db.query(ScheduleBlock)
        .options(joinedload(ScheduleBlock.zone_rel))
        .filter(ScheduleBlock.schedule_id == sched.id)
        .order_by(ScheduleBlock.hour_start)
        .all()
    )

    # Load daily logs for this date
    block_ids = [b.id for b in blocks]
    daily_logs = (
        db.query(DailyBlockLog)
        .options(
            joinedload(DailyBlockLog.expenses),
            joinedload(DailyBlockLog.platform_earnings),
        )
        .filter(DailyBlockLog.block_id.in_(block_ids), DailyBlockLog.entry_date == entry_date)
        .all()
    ) if block_ids else []
    log_map = {dl.block_id: dl for dl in daily_logs}

    # Build platform map
    all_pids = set()
    for b in blocks:
        all_pids.update(b.platform_ids or [])
    for dl in daily_logs:
        for pe in (dl.platform_earnings or []):
            all_pids.add(pe.platform_id)
    pmap = {}
    if all_pids:
        pmap = {p.id: p for p in db.query(Platform).filter(Platform.id.in_(all_pids)).all()}

    return DayLogResponse(
        date=str(entry_date),
        schedule_id=sched.id,
        schedule_name=sched.name,
        schedule_color=sched.color,
        schedule_description=sched.description,
        blocks=[_build_block_response(b, pmap, log_map.get(b.id)) for b in blocks],
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/today", response_model=DayLogResponse)
def get_today(db: Session = Depends(get_db)):
    return _load_day(db, date.today())

@router.get("/{entry_date}", response_model=DayLogResponse)
def get_day(entry_date: date, db: Session = Depends(get_db)):
    return _load_day(db, entry_date)

@router.put("/blocks/{block_id}", response_model=DailyLogResponse)
def update_block_log(block_id: UUID, body: BlockLogUpdate, db: Session = Depends(get_db)):
    block = db.get(ScheduleBlock, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")

    log = _get_or_create_daily_log(db, block_id, body.entry_date)

    data = body.model_dump(exclude={"entry_date"}, exclude_none=True)
    if "actual_start" in data:
        data["actual_start"] = _parse_time(data["actual_start"])
    if "actual_end" in data:
        data["actual_end"] = _parse_time(data["actual_end"])

    for field, value in data.items():
        setattr(log, field, value)

    # Auto-calc miles
    if log.odometer_start is not None and log.odometer_end is not None:
        log.miles_driven = float(log.odometer_end) - float(log.odometer_start)

    # Auto-calc active hours
    if log.actual_start is not None and log.actual_end is not None:
        start_mins = log.actual_start.hour * 60 + log.actual_start.minute
        end_mins = log.actual_end.hour * 60 + log.actual_end.minute
        if end_mins < start_mins:
            end_mins += 24 * 60  # overnight
        log.active_hours = round((end_mins - start_mins) / 60, 2)

    db.commit()

    # Reload with relationships
    log = (
        db.query(DailyBlockLog)
        .options(
            joinedload(DailyBlockLog.expenses),
            joinedload(DailyBlockLog.platform_earnings),
        )
        .filter(DailyBlockLog.id == log.id)
        .first()
    )
    all_pids = set()
    for pe in (log.platform_earnings or []):
        all_pids.add(pe.platform_id)
    pmap = {p.id: p for p in db.query(Platform).filter(Platform.id.in_(all_pids)).all()} if all_pids else {}
    return _build_daily_log_response(log, pmap)


# ── Expenses ──────────────────────────────────────────────────────────────────

@router.post("/blocks/{block_id}/expenses", response_model=ExpenseResponse, status_code=201)
def add_expense(block_id: UUID, body: ExpenseCreate, db: Session = Depends(get_db)):
    if not db.get(ScheduleBlock, block_id):
        raise HTTPException(status_code=404, detail="Block not found")
    log = _get_or_create_daily_log(db, block_id, body.entry_date)
    expense = DailyExpense(
        daily_block_log_id=log.id,
        category=body.category,
        amount=body.amount,
        description=body.description,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense

@router.delete("/expenses/{expense_id}", status_code=204)
def delete_expense(expense_id: UUID, db: Session = Depends(get_db)):
    exp = db.get(DailyExpense, expense_id)
    if exp is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete(exp)
    db.commit()


# ── Platform earnings ─────────────────────────────────────────────────────────

@router.post("/blocks/{block_id}/platform-earnings", response_model=PlatformEarningResponse, status_code=201)
def upsert_platform_earning(block_id: UUID, body: PlatformEarningCreate, db: Session = Depends(get_db)):
    block = db.get(ScheduleBlock, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    plat = db.get(Platform, body.platform_id)
    if plat is None:
        raise HTTPException(status_code=404, detail="Platform not found")

    log = _get_or_create_daily_log(db, block_id, body.entry_date)

    # Upsert
    existing = (
        db.query(DailyPlatformEarning)
        .filter(
            DailyPlatformEarning.daily_block_log_id == log.id,
            DailyPlatformEarning.platform_id == body.platform_id,
        )
        .first()
    )
    if existing:
        existing.earnings = body.earnings
        existing.trip_count = body.trip_count
        pe = existing
    else:
        pe = DailyPlatformEarning(
            daily_block_log_id=log.id,
            platform_id=body.platform_id,
            earnings=body.earnings,
            trip_count=body.trip_count,
        )
        db.add(pe)
    db.commit()
    db.refresh(pe)

    return PlatformEarningResponse(
        id=pe.id,
        daily_block_log_id=pe.daily_block_log_id,
        platform_id=pe.platform_id,
        platform_name=plat.name,
        platform_color=plat.color,
        earnings=float(pe.earnings),
        trip_count=pe.trip_count,
    )

@router.delete("/platform-earnings/{earning_id}", status_code=204)
def delete_platform_earning(earning_id: UUID, db: Session = Depends(get_db)):
    pe = db.get(DailyPlatformEarning, earning_id)
    if pe is None:
        raise HTTPException(status_code=404, detail="Platform earning not found")
    db.delete(pe)
    db.commit()
