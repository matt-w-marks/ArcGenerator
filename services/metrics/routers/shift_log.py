"""Daily log router — universal daily ops logging via daily_block_logs.

Supports both scheduled blocks (from calendar) and ad-hoc blocks.
All actual/logged data lives in daily_block_logs.
Soft delete: deleted_at populated instead of row removal.
All mutations audit-logged.
"""

from datetime import date, datetime, time, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session, joinedload

from audit import audit, diff, snapshot, get_user_id
from database import get_db
from role_guard import require_role
from models import (
    CalendarEntry, Schedule, ScheduleBlock, Platform,
    DailyBlockLog, BusinessExpense, DailyPlatformEarning,
    IncomeEntry, IncomeStream, Checklist, ChecklistItem, ChecklistLog,
)

router = APIRouter(prefix="/shift-log", tags=["shift-log"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ExpenseResponse(BaseModel):
    id: UUID
    daily_block_log_id: UUID | None
    budget_category: str
    amount: float
    vendor: str | None = None
    description: str | None = None

class ExpenseCreate(BaseModel):
    entry_date: date
    budget_category: str = Field(max_length=32)
    amount: float = Field(ge=0)
    vendor: str | None = Field(default=None, max_length=128)
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
    actual_start: str | None = None
    actual_end: str | None = None
    odometer_start: float | None = Field(default=None, ge=0)
    odometer_end: float | None = Field(default=None, ge=0)
    surge_active: bool | None = None
    log_notes: str | None = None
    vehicle_id: UUID | None = None

class BlockLogDeleteRequest(BaseModel):
    entry_date: date

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
    vehicle_id: UUID | None = None
    expenses: list[ExpenseResponse] = []
    platform_earnings: list[PlatformEarningResponse] = []

class ChecklistItemBrief(BaseModel):
    id: UUID
    label: str
    sort_order: int

class ChecklistLogBrief(BaseModel):
    id: UUID
    log_date: date
    checked_ids: list[UUID]
    notes: str | None = None

class BlockLogResponse(BaseModel):
    id: UUID
    schedule_id: UUID | None = None
    hour_start: float
    hour_end: float
    block_type: str
    label: str
    notes: str | None = None
    zone_id: UUID | None = None
    zone_name: str | None = None
    income_stream_id: UUID | None = None
    income_stream_name: str | None = None
    checklist_id: UUID | None = None
    checklist_name: str | None = None
    checklist_type: str | None = None
    checklist_allow_photos: bool = False
    checklist_items: list[ChecklistItemBrief] = []
    checklist_log_today: ChecklistLogBrief | None = None
    sort_order: int = 0
    gross_revenue: float = 0
    platform_ids: list[UUID] = []
    platform_names: list[str] = []
    platform_colors: list[str] = []
    source: str = "schedule"  # "schedule" or "adhoc"
    daily_log: DailyLogResponse | None = None

class AdHocBlockCreate(BaseModel):
    entry_date: date
    block_type: str = Field(max_length=16)
    label: str = Field(max_length=128)
    income_stream_id: UUID | None = None
    checklist_id: UUID | None = None
    hour_start: float = Field(ge=0, le=25.5)
    hour_end: float = Field(ge=0.5, le=26)

class DayLogResponse(BaseModel):
    date: str
    has_schedule: bool = False
    schedule_id: UUID | None = None
    schedule_name: str | None = None
    schedule_color: str | None = None
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

def _log_snapshot(log: DailyBlockLog) -> dict:
    """Capture current state of a log for audit diffing."""
    return {
        "actual_gross": float(log.actual_gross) if log.actual_gross is not None else None,
        "trip_count": log.trip_count,
        "actual_start": _time_str(log.actual_start),
        "actual_end": _time_str(log.actual_end),
        "odometer_start": float(log.odometer_start) if log.odometer_start is not None else None,
        "odometer_end": float(log.odometer_end) if log.odometer_end is not None else None,
        "miles_driven": float(log.miles_driven) if log.miles_driven is not None else None,
        "surge_active": log.surge_active,
        "active_hours": float(log.active_hours) if log.active_hours is not None else None,
        "log_notes": log.log_notes,
    }

def _get_or_create_daily_log(db: Session, block_id: UUID, entry_date: date) -> tuple[DailyBlockLog, bool]:
    """Find or create a DailyBlockLog. Returns (log, is_new)."""
    log = (
        db.query(DailyBlockLog)
        .filter(
            DailyBlockLog.block_id == block_id,
            DailyBlockLog.entry_date == entry_date,
            DailyBlockLog.deleted_at.is_(None),
        )
        .first()
    )
    if log is None:
        log = DailyBlockLog(block_id=block_id, entry_date=entry_date)
        db.add(log)
        db.flush()
        return log, True
    return log, False

def _build_daily_log_response(log: DailyBlockLog, pmap: dict, db: Session = None) -> DailyLogResponse:
    pe_list = []
    for pe in (log.platform_earnings or []):
        if pe.deleted_at is not None:
            continue
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

    # Query expenses linked to this block log from business_expenses
    from models import BusinessExpense as BE
    active_expenses = (
        db.query(BE)
        .filter(BE.daily_block_log_id == log.id, BE.deleted_at.is_(None))
        .all()
    )

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
        vehicle_id=log.vehicle_id,
        expenses=[ExpenseResponse(
            id=e.id, daily_block_log_id=e.daily_block_log_id,
            budget_category=e.budget_category, amount=float(e.amount),
            vendor=e.vendor, description=e.description,
        ) for e in active_expenses],
        platform_earnings=pe_list,
    )

def _load_checklist_data(db: Session, checklist_id: UUID, entry_date: date) -> dict:
    """Load checklist items + most recent log for the date."""
    cl = db.get(Checklist, checklist_id)
    if not cl:
        return {}
    items = db.query(ChecklistItem).filter(
        ChecklistItem.checklist_id == checklist_id, ChecklistItem.active.is_(True)
    ).order_by(ChecklistItem.sort_order).all()
    log = db.query(ChecklistLog).filter(
        ChecklistLog.checklist_id == checklist_id, ChecklistLog.log_date == entry_date
    ).order_by(ChecklistLog.completed_at.desc()).first()
    return {
        "name": cl.name,
        "type": cl.checklist_type,
        "allow_photos": cl.allow_photos,
        "items": [ChecklistItemBrief(id=i.id, label=i.label, sort_order=i.sort_order) for i in items],
        "log": ChecklistLogBrief(id=log.id, log_date=log.log_date, checked_ids=log.checked_ids or [], notes=log.notes) if log else None,
    }


def _build_block_response(block: ScheduleBlock, pmap: dict, daily_log: DailyBlockLog | None, db: Session = None, entry_date: date = None) -> BlockLogResponse:
    ids = block.platform_ids or []
    plats = [pmap[pid] for pid in ids if pid in pmap]

    cl_data = {}
    if block.checklist_id and db and entry_date:
        cl_data = _load_checklist_data(db, block.checklist_id, entry_date)

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
        income_stream_id=block.income_stream_id,
        checklist_id=block.checklist_id,
        checklist_name=cl_data.get("name"),
        checklist_type=cl_data.get("type"),
        checklist_allow_photos=cl_data.get("allow_photos", False),
        checklist_items=cl_data.get("items", []),
        checklist_log_today=cl_data.get("log"),
        sort_order=block.sort_order,
        gross_revenue=float(block.gross_revenue),
        platform_ids=[p.id for p in plats],
        platform_names=[p.name for p in plats],
        platform_colors=[p.color or "#6b7280" for p in plats],
        source="schedule",
        daily_log=_build_daily_log_response(daily_log, pmap, db) if daily_log else None,
    )

def _build_adhoc_response(log: DailyBlockLog, pmap: dict, db: Session) -> BlockLogResponse:
    """Build response for an ad-hoc block (no schedule_block)."""
    stream_name = None
    if log.income_stream_id:
        stream = db.get(IncomeStream, log.income_stream_id)
        if stream:
            stream_name = stream.name
    cl_data = {}
    if log.checklist_id:
        cl_data = _load_checklist_data(db, log.checklist_id, log.entry_date)
    return BlockLogResponse(
        id=log.id,
        hour_start=float(log.hour_start or 0),
        hour_end=float(log.hour_end or 0),
        block_type=log.block_type or "note",
        label=log.label or "Ad-hoc",
        income_stream_id=log.income_stream_id,
        income_stream_name=stream_name,
        checklist_id=log.checklist_id,
        checklist_name=cl_data.get("name"),
        checklist_type=cl_data.get("type"),
        checklist_allow_photos=cl_data.get("allow_photos", False),
        checklist_items=cl_data.get("items", []),
        checklist_log_today=cl_data.get("log"),
        source="adhoc",
        daily_log=_build_daily_log_response(log, pmap, db),
    )

def _load_day(db: Session, entry_date: date) -> DayLogResponse:
    entry = (
        db.query(CalendarEntry)
        .options(joinedload(CalendarEntry.schedule))
        .filter(CalendarEntry.entry_date == entry_date)
        .first()
    )

    sched = entry.schedule if entry else None
    block_responses = []

    # Load scheduled blocks if a schedule is assigned
    if sched:
        blocks = (
            db.query(ScheduleBlock)
            .options(joinedload(ScheduleBlock.zone_rel))
            .filter(ScheduleBlock.schedule_id == sched.id)
            .order_by(ScheduleBlock.hour_start)
            .all()
        )
        block_ids = [b.id for b in blocks]
        daily_logs = (
            db.query(DailyBlockLog)
            .options(joinedload(DailyBlockLog.platform_earnings))
            .filter(
                DailyBlockLog.block_id.in_(block_ids),
                DailyBlockLog.entry_date == entry_date,
                DailyBlockLog.deleted_at.is_(None),
            )
            .all()
        ) if block_ids else []
        log_map = {dl.block_id: dl for dl in daily_logs}

        all_pids = set()
        for b in blocks:
            all_pids.update(b.platform_ids or [])
        for dl in daily_logs:
            for pe in (dl.platform_earnings or []):
                if pe.deleted_at is None:
                    all_pids.add(pe.platform_id)
        pmap = {p.id: p for p in db.query(Platform).filter(Platform.id.in_(all_pids)).all()} if all_pids else {}

        block_responses = [_build_block_response(b, pmap, log_map.get(b.id), db, entry_date) for b in blocks]

    # Load ad-hoc blocks for this date (block_id is null)
    adhoc_logs = (
        db.query(DailyBlockLog)
        .options(joinedload(DailyBlockLog.platform_earnings))
        .filter(
            DailyBlockLog.block_id.is_(None),
            DailyBlockLog.entry_date == entry_date,
            DailyBlockLog.deleted_at.is_(None),
        )
        .order_by(DailyBlockLog.hour_start)
        .all()
    )
    if adhoc_logs:
        adhoc_pids = set()
        for dl in adhoc_logs:
            for pe in (dl.platform_earnings or []):
                if pe.deleted_at is None:
                    adhoc_pids.add(pe.platform_id)
        adhoc_pmap = {p.id: p for p in db.query(Platform).filter(Platform.id.in_(adhoc_pids)).all()} if adhoc_pids else {}
        block_responses.extend([_build_adhoc_response(dl, adhoc_pmap, db) for dl in adhoc_logs])

    return DayLogResponse(
        date=str(entry_date),
        has_schedule=sched is not None,
        schedule_id=sched.id if sched else None,
        schedule_name=sched.name if sched else None,
        schedule_color=sched.color if sched else None,
        schedule_description=sched.description if sched else None,
        blocks=block_responses,
    )

def _reload_log(db: Session, log_id: UUID) -> tuple[DailyBlockLog, dict]:
    """Reload a log with relationships and build platform map."""
    log = (
        db.query(DailyBlockLog)
        .options(joinedload(DailyBlockLog.expenses), joinedload(DailyBlockLog.platform_earnings))
        .filter(DailyBlockLog.id == log_id)
        .first()
    )
    all_pids = set()
    for pe in (log.platform_earnings or []):
        if pe.deleted_at is None:
            all_pids.add(pe.platform_id)
    pmap = {p.id: p for p in db.query(Platform).filter(Platform.id.in_(all_pids)).all()} if all_pids else {}
    return log, pmap


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/today", response_model=DayLogResponse, dependencies=[require_role('ADMIN', 'OPERATOR')])
def get_today(db: Session = Depends(get_db)):
    return _load_day(db, date.today())

@router.get("/{entry_date}", response_model=DayLogResponse, dependencies=[require_role('ADMIN', 'OPERATOR')])
def get_day(entry_date: date, db: Session = Depends(get_db)):
    return _load_day(db, entry_date)

@router.post("/blocks", response_model=BlockLogResponse, status_code=201, dependencies=[require_role('ADMIN', 'OPERATOR')])
def create_adhoc_block(body: AdHocBlockCreate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    """Create an ad-hoc block not tied to any schedule."""
    log = DailyBlockLog(
        entry_date=body.entry_date,
        block_type=body.block_type,
        label=body.label,
        income_stream_id=body.income_stream_id,
        checklist_id=body.checklist_id,
        hour_start=body.hour_start,
        hour_end=body.hour_end,
    )
    db.add(log)
    db.flush()
    audit(db, "daily_block_logs", log.id, "CREATE", user_id, snapshot({
        "block_type": body.block_type, "label": body.label, "entry_date": str(body.entry_date),
    }))
    db.commit()
    db.refresh(log)
    return _build_adhoc_response(log, {}, db)


def _upsert_income_entry(db: Session, log: DailyBlockLog, block_type: str, income_stream_id: UUID | None):
    """Auto-create/update income entry for role/engagement blocks."""
    if block_type not in ('role', 'engagement') or not income_stream_id:
        return
    existing = (
        db.query(IncomeEntry)
        .filter(IncomeEntry.income_stream_id == income_stream_id,
                IncomeEntry.entry_date == log.entry_date,
                IncomeEntry.deleted_at.is_(None))
        .first()
    )
    hours = float(log.active_hours) if log.active_hours else None
    amount = float(log.actual_gross) if log.actual_gross else None
    if existing:
        existing.hours = hours
        existing.amount = amount
    else:
        db.add(IncomeEntry(
            income_stream_id=income_stream_id, entry_date=log.entry_date,
            hours=hours, amount=amount,
        ))


@router.put("/blocks/{block_id}", response_model=DailyLogResponse, dependencies=[require_role('ADMIN', 'OPERATOR')])
def update_block_log(block_id: UUID, body: BlockLogUpdate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    # Try as schedule block first, then as ad-hoc log
    block = db.get(ScheduleBlock, block_id)
    adhoc_log = None
    if block is None:
        adhoc_log = db.get(DailyBlockLog, block_id)
        if adhoc_log is None or adhoc_log.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Block not found")

    if block:
        log, is_new = _get_or_create_daily_log(db, block_id, body.entry_date)
    else:
        log = adhoc_log
        is_new = False

    old_state = _log_snapshot(log) if not is_new else {}

    data = body.model_dump(exclude={"entry_date"}, exclude_none=True)
    if "actual_start" in data:
        data["actual_start"] = _parse_time(data["actual_start"])
    if "actual_end" in data:
        data["actual_end"] = _parse_time(data["actual_end"])

    for field, value in data.items():
        setattr(log, field, value)

    if log.odometer_start is not None and log.odometer_end is not None:
        log.miles_driven = float(log.odometer_end) - float(log.odometer_start)

    if log.actual_start is not None and log.actual_end is not None:
        start_mins = log.actual_start.hour * 60 + log.actual_start.minute
        end_mins = log.actual_end.hour * 60 + log.actual_end.minute
        if end_mins < start_mins:
            end_mins += 24 * 60
        log.active_hours = round((end_mins - start_mins) / 60, 2)

    db.flush()

    if is_new:
        audit(db, "daily_block_logs", log.id, "CREATE", user_id, snapshot(_log_snapshot(log)))
    else:
        changes = diff(old_state, _log_snapshot(log))
        if changes:
            audit(db, "daily_block_logs", log.id, "UPDATE", user_id, changes)

    # Auto-create income entry for role/engagement blocks
    bt = (block.block_type if block else log.block_type) or ""
    stream_id = (block.income_stream_id if block else log.income_stream_id)
    _upsert_income_entry(db, log, bt, stream_id)

    db.commit()

    log, pmap = _reload_log(db, log.id)
    return _build_daily_log_response(log, pmap, db)


@router.delete("/blocks/{block_id}", status_code=204, dependencies=[require_role('ADMIN', 'OPERATOR')])
def soft_delete_block_log(block_id: UUID, body: BlockLogDeleteRequest, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    """Soft delete a daily block log for a specific date."""
    log = (
        db.query(DailyBlockLog)
        .filter(
            DailyBlockLog.block_id == block_id,
            DailyBlockLog.entry_date == body.entry_date,
            DailyBlockLog.deleted_at.is_(None),
        )
        .first()
    )
    if log is None:
        raise HTTPException(status_code=404, detail="No active log found for that block+date")
    now = datetime.now(timezone.utc)
    log.deleted_at = now
    log.deleted_by = user_id
    audit(db, "daily_block_logs", log.id, "DELETE", user_id, snapshot(_log_snapshot(log)))
    db.commit()


# ── Expenses ──────────────────────────────────────────────────────────────────

@router.post("/blocks/{block_id}/expenses", response_model=ExpenseResponse, status_code=201, dependencies=[require_role('ADMIN', 'OPERATOR')])
def add_expense(block_id: UUID, body: ExpenseCreate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    if not db.get(ScheduleBlock, block_id):
        raise HTTPException(status_code=404, detail="Block not found")
    log, _ = _get_or_create_daily_log(db, block_id, body.entry_date)
    expense = BusinessExpense(
        date=body.entry_date,
        daily_block_log_id=log.id,
        budget_category=body.budget_category,
        amount=body.amount,
        vendor=body.vendor,
        description=body.description,
        created_by=user_id,
    )
    db.add(expense)
    db.flush()
    audit(db, "business_expenses", expense.id, "CREATE", user_id, {
        "budget_category": body.budget_category, "amount": float(body.amount), "description": body.description,
    })
    db.commit()
    db.refresh(expense)
    return ExpenseResponse(
        id=expense.id, daily_block_log_id=expense.daily_block_log_id,
        budget_category=expense.budget_category, amount=float(expense.amount),
        vendor=expense.vendor, description=expense.description,
    )

@router.delete("/expenses/{expense_id}", status_code=204, dependencies=[require_role('ADMIN', 'OPERATOR')])
def delete_expense(expense_id: UUID, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    exp = db.get(BusinessExpense, expense_id)
    if exp is None or exp.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Expense not found")
    now = datetime.now(timezone.utc)
    exp.deleted_at = now
    exp.deleted_by = user_id
    audit(db, "business_expenses", exp.id, "DELETE", user_id, {
        "budget_category": exp.budget_category, "amount": float(exp.amount), "description": exp.description,
    })
    db.commit()


# ── Platform earnings ─────────────────────────────────────────────────────────

@router.post("/blocks/{block_id}/platform-earnings", response_model=PlatformEarningResponse, status_code=201, dependencies=[require_role('ADMIN', 'OPERATOR')])
def upsert_platform_earning(block_id: UUID, body: PlatformEarningCreate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    block = db.get(ScheduleBlock, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    plat = db.get(Platform, body.platform_id)
    if plat is None:
        raise HTTPException(status_code=404, detail="Platform not found")

    log, _ = _get_or_create_daily_log(db, block_id, body.entry_date)

    existing = (
        db.query(DailyPlatformEarning)
        .filter(
            DailyPlatformEarning.daily_block_log_id == log.id,
            DailyPlatformEarning.platform_id == body.platform_id,
            DailyPlatformEarning.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        old = {"earnings": float(existing.earnings), "trip_count": existing.trip_count}
        existing.earnings = body.earnings
        existing.trip_count = body.trip_count
        pe = existing
        changes = diff(old, {"earnings": float(body.earnings), "trip_count": body.trip_count})
        if changes:
            audit(db, "daily_platform_earnings", pe.id, "UPDATE", user_id, changes)
    else:
        pe = DailyPlatformEarning(
            daily_block_log_id=log.id,
            platform_id=body.platform_id,
            earnings=body.earnings,
            trip_count=body.trip_count,
        )
        db.add(pe)
        db.flush()
        audit(db, "daily_platform_earnings", pe.id, "CREATE", user_id, {
            "platform_id": str(body.platform_id), "earnings": float(body.earnings), "trip_count": body.trip_count,
        })
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

@router.delete("/platform-earnings/{earning_id}", status_code=204, dependencies=[require_role('ADMIN', 'OPERATOR')])
def delete_platform_earning(earning_id: UUID, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    pe = db.get(DailyPlatformEarning, earning_id)
    if pe is None or pe.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Platform earning not found")
    now = datetime.now(timezone.utc)
    pe.deleted_at = now
    pe.deleted_by = user_id
    audit(db, "daily_platform_earnings", pe.id, "DELETE", user_id, {
        "platform_id": str(pe.platform_id), "earnings": float(pe.earnings), "trip_count": pe.trip_count,
    })
    db.commit()
