"""Reporting endpoints — aggregate analytics for rideshare operations.

All queries use SQLAlchemy ORM only. No raw SQL. No text().
"""

from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func as sqf, case
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CalendarEntry, DailyBlockLog, DailyExpense, DailyPlatformEarning,
    JobActivity, MaintenanceRecord, Platform, Schedule, ScheduleBlock,
    SystemConfig, Zone,
)

router = APIRouter(prefix="/reports", tags=["reports"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class SummaryResponse(BaseModel):
    from_date: date
    to_date: date
    days_worked: int
    total_gross: float
    total_expenses: float
    total_net: float
    total_trips: int
    total_miles: float
    total_active_hours: float
    avg_per_hour: float
    avg_per_mile: float
    avg_per_trip: float
    planned_gross: float
    variance: float

class DayRow(BaseModel):
    date: date
    schedule_name: str | None
    schedule_color: str | None
    gross: float
    expenses: float
    net: float
    trips: int
    miles: float
    active_hours: float
    per_hour: float
    gas_pct_of_gross: float

class ZoneRow(BaseModel):
    zone_id: UUID | None
    zone_name: str | None
    zone_type: str | None
    total_gross: float
    total_hours: float
    per_hour: float
    block_count: int
    planned_gross: float
    variance: float

class PlatformRow(BaseModel):
    platform_id: UUID
    platform_name: str
    platform_color: str | None
    total_earnings: float
    total_trips: int
    avg_per_trip: float
    block_count: int

class ExpenseCatRow(BaseModel):
    category: str
    total: float
    count: int

class ExpensesResponse(BaseModel):
    from_date: date
    to_date: date
    total: float
    by_category: list[ExpenseCatRow]
    gas_pct_of_gross: float

class WeeklyResponse(BaseModel):
    week_start: date
    week_end: date
    trips_this_week: int
    trips_target: int
    gross: float
    expenses: float
    net: float
    miles: float
    active_hours: float

class FinancialHealthResponse(BaseModel):
    phase: str
    weekly_vehicle_cost: float
    monthly_nut: float
    bankroll_remaining: float
    runway_days: float
    se_tax_rate: float
    se_tax_accrued: float
    irs_mileage_rate: float
    total_miles_ytd: float
    total_hours_ytd: float
    avg_per_hour_ytd: float
    mileage_deduction_ytd: float
    breakeven_per_hour: float

class JobSearchResponse(BaseModel):
    total_applications: int
    total_recruiter_contacts: int
    total_linkedin: int
    this_week_applications: int
    this_week_recruiter: int
    this_week_linkedin: int

class TaxSummaryResponse(BaseModel):
    year: int
    total_gross: float
    total_miles: float
    irs_mileage_rate: float
    mileage_deduction: float
    se_tax_rate: float
    se_tax_liability: float
    total_expenses: float
    maintenance_total: float
    maintenance_cost_per_mile: float
    next_quarterly_due: date


# ── Helpers ───────────────────────────────────────────────────────────────────

def _monday_of_week(d: date) -> date:
    return d - timedelta(days=d.weekday())

def _safe_div(num: float, den: float) -> float:
    return round(num / den, 2) if den > 0 else 0.0


# ── 1. Summary ────────────────────────────────────────────────────────────────

def _summary(db: Session, from_date: date, to_date: date) -> SummaryResponse:
    logs = (
        db.query(DailyBlockLog)
        .filter(DailyBlockLog.entry_date >= from_date, DailyBlockLog.entry_date <= to_date)
        .all()
    )
    log_ids = [l.id for l in logs]
    expenses = (
        db.query(sqf.coalesce(sqf.sum(DailyExpense.amount), 0))
        .filter(DailyExpense.daily_block_log_id.in_(log_ids))
        .scalar()
    ) if log_ids else 0

    # Planned gross from template blocks for assigned days
    planned = (
        db.query(sqf.coalesce(sqf.sum(ScheduleBlock.gross_revenue), 0))
        .join(Schedule, Schedule.id == ScheduleBlock.schedule_id)
        .join(CalendarEntry, CalendarEntry.schedule_id == Schedule.id)
        .filter(CalendarEntry.entry_date >= from_date, CalendarEntry.entry_date <= to_date)
        .scalar()
    )

    total_gross = sum(float(l.actual_gross or 0) for l in logs)
    total_trips = sum(l.trip_count or 0 for l in logs)
    total_miles = sum(float(l.miles_driven or 0) for l in logs)
    total_hours = sum(float(l.active_hours or 0) for l in logs)
    total_exp = float(expenses)
    days_worked = len(set(l.entry_date for l in logs))

    return SummaryResponse(
        from_date=from_date, to_date=to_date,
        days_worked=days_worked,
        total_gross=round(total_gross, 2),
        total_expenses=round(total_exp, 2),
        total_net=round(total_gross - total_exp, 2),
        total_trips=total_trips,
        total_miles=round(total_miles, 1),
        total_active_hours=round(total_hours, 2),
        avg_per_hour=_safe_div(total_gross, total_hours),
        avg_per_mile=_safe_div(total_gross, total_miles),
        avg_per_trip=_safe_div(total_gross, total_trips),
        planned_gross=round(float(planned), 2),
        variance=round(total_gross - float(planned), 2),
    )


@router.get("/summary", response_model=SummaryResponse)
def report_summary(db: Session = Depends(get_db), from_date: date = Query(..., alias="from"), to_date: date = Query(..., alias="to")):
    return _summary(db, from_date, to_date)


# ── 2. By Day ─────────────────────────────────────────────────────────────────

def _by_day(db: Session, from_date: date, to_date: date) -> list[DayRow]:
    entries = (
        db.query(CalendarEntry)
        .filter(CalendarEntry.entry_date >= from_date, CalendarEntry.entry_date <= to_date)
        .all()
    )
    sched_map = {s.id: s for s in db.query(Schedule).all()}

    rows = []
    for entry in sorted(entries, key=lambda e: e.entry_date):
        sched = sched_map.get(entry.schedule_id)
        logs = (
            db.query(DailyBlockLog)
            .filter(DailyBlockLog.entry_date == entry.entry_date)
            .join(ScheduleBlock, ScheduleBlock.id == DailyBlockLog.block_id)
            .filter(ScheduleBlock.schedule_id == entry.schedule_id)
            .all()
        )
        if not logs:
            continue

        log_ids = [l.id for l in logs]
        exp_total = float(
            db.query(sqf.coalesce(sqf.sum(DailyExpense.amount), 0))
            .filter(DailyExpense.daily_block_log_id.in_(log_ids))
            .scalar()
        )
        gas_total = float(
            db.query(sqf.coalesce(sqf.sum(DailyExpense.amount), 0))
            .filter(DailyExpense.daily_block_log_id.in_(log_ids), DailyExpense.category == "gas")
            .scalar()
        )

        gross = sum(float(l.actual_gross or 0) for l in logs)
        trips = sum(l.trip_count or 0 for l in logs)
        miles = sum(float(l.miles_driven or 0) for l in logs)
        hours = sum(float(l.active_hours or 0) for l in logs)

        rows.append(DayRow(
            date=entry.entry_date,
            schedule_name=sched.name if sched else None,
            schedule_color=sched.color if sched else None,
            gross=round(gross, 2),
            expenses=round(exp_total, 2),
            net=round(gross - exp_total, 2),
            trips=trips,
            miles=round(miles, 1),
            active_hours=round(hours, 2),
            per_hour=_safe_div(gross, hours),
            gas_pct_of_gross=round(gas_total / gross * 100, 1) if gross > 0 else 0,
        ))
    return rows


@router.get("/by-day", response_model=list[DayRow])
def report_by_day(db: Session = Depends(get_db), from_date: date = Query(..., alias="from"), to_date: date = Query(..., alias="to")):
    return _by_day(db, from_date, to_date)


# ── 3. By Zone ─────────────────────────────────────────────────────────────────

def _by_zone(db: Session, from_date: date, to_date: date) -> list[ZoneRow]:
    results = (
        db.query(
            ScheduleBlock.zone_id,
            sqf.count(DailyBlockLog.id).label("block_count"),
            sqf.coalesce(sqf.sum(DailyBlockLog.actual_gross), 0).label("total_gross"),
            sqf.coalesce(sqf.sum(DailyBlockLog.active_hours), 0).label("total_hours"),
            sqf.coalesce(sqf.sum(ScheduleBlock.gross_revenue), 0).label("planned_gross"),
        )
        .join(DailyBlockLog, DailyBlockLog.block_id == ScheduleBlock.id)
        .filter(DailyBlockLog.entry_date >= from_date, DailyBlockLog.entry_date <= to_date)
        .filter(ScheduleBlock.zone_id.isnot(None))
        .group_by(ScheduleBlock.zone_id)
        .all()
    )

    zone_map = {z.id: z for z in db.query(Zone).all()}
    rows = []
    for r in results:
        z = zone_map.get(r.zone_id)
        gross = float(r.total_gross)
        hours = float(r.total_hours)
        planned = float(r.planned_gross)
        rows.append(ZoneRow(
            zone_id=r.zone_id,
            zone_name=z.name if z else None,
            zone_type=z.zone_type if z else None,
            total_gross=round(gross, 2),
            total_hours=round(hours, 2),
            per_hour=_safe_div(gross, hours),
            block_count=r.block_count,
            planned_gross=round(planned, 2),
            variance=round(gross - planned, 2),
        ))
    return sorted(rows, key=lambda r: r.per_hour, reverse=True)


@router.get("/by-zone", response_model=list[ZoneRow])
def report_by_zone(db: Session = Depends(get_db), from_date: date = Query(..., alias="from"), to_date: date = Query(..., alias="to")):
    return _by_zone(db, from_date, to_date)


# ── 4. By Platform ────────────────────────────────────────────────────────────

def _by_platform(db: Session, from_date: date, to_date: date) -> list[PlatformRow]:
    results = (
        db.query(
            DailyPlatformEarning.platform_id,
            sqf.count(DailyPlatformEarning.id).label("block_count"),
            sqf.coalesce(sqf.sum(DailyPlatformEarning.earnings), 0).label("total_earnings"),
            sqf.coalesce(sqf.sum(DailyPlatformEarning.trip_count), 0).label("total_trips"),
        )
        .join(DailyBlockLog, DailyBlockLog.id == DailyPlatformEarning.daily_block_log_id)
        .filter(DailyBlockLog.entry_date >= from_date, DailyBlockLog.entry_date <= to_date)
        .group_by(DailyPlatformEarning.platform_id)
        .all()
    )

    plat_map = {p.id: p for p in db.query(Platform).all()}
    rows = []
    for r in results:
        p = plat_map.get(r.platform_id)
        earnings = float(r.total_earnings)
        trips = int(r.total_trips)
        rows.append(PlatformRow(
            platform_id=r.platform_id,
            platform_name=p.name if p else "Unknown",
            platform_color=p.color if p else None,
            total_earnings=round(earnings, 2),
            total_trips=trips,
            avg_per_trip=_safe_div(earnings, trips),
            block_count=r.block_count,
        ))
    return sorted(rows, key=lambda r: r.total_earnings, reverse=True)


@router.get("/by-platform", response_model=list[PlatformRow])
def report_by_platform(db: Session = Depends(get_db), from_date: date = Query(..., alias="from"), to_date: date = Query(..., alias="to")):
    return _by_platform(db, from_date, to_date)


# ── 5. Expenses ────────────────────────────────────────────────────────────────

def _expenses(db: Session, from_date: date, to_date: date) -> ExpensesResponse:
    results = (
        db.query(
            DailyExpense.category,
            sqf.sum(DailyExpense.amount).label("total"),
            sqf.count(DailyExpense.id).label("count"),
        )
        .join(DailyBlockLog, DailyBlockLog.id == DailyExpense.daily_block_log_id)
        .filter(DailyBlockLog.entry_date >= from_date, DailyBlockLog.entry_date <= to_date)
        .group_by(DailyExpense.category)
        .all()
    )

    total = sum(float(r.total) for r in results)
    gross = float(
        db.query(sqf.coalesce(sqf.sum(DailyBlockLog.actual_gross), 0))
        .filter(DailyBlockLog.entry_date >= from_date, DailyBlockLog.entry_date <= to_date)
        .scalar()
    )
    gas = sum(float(r.total) for r in results if r.category == "gas")

    return ExpensesResponse(
        from_date=from_date, to_date=to_date,
        total=round(total, 2),
        by_category=[ExpenseCatRow(category=r.category, total=round(float(r.total), 2), count=r.count) for r in results],
        gas_pct_of_gross=round(gas / gross * 100, 1) if gross > 0 else 0,
    )


@router.get("/expenses", response_model=ExpensesResponse)
def report_expenses(db: Session = Depends(get_db), from_date: date = Query(..., alias="from"), to_date: date = Query(..., alias="to")):
    return _expenses(db, from_date, to_date)


# ── 6. Weekly ──────────────────────────────────────────────────────────────────

def _weekly(db: Session) -> WeeklyResponse:
    today = date.today()
    mon = _monday_of_week(today)
    sun = mon + timedelta(days=6)

    logs = (
        db.query(DailyBlockLog)
        .filter(DailyBlockLog.entry_date >= mon, DailyBlockLog.entry_date <= sun)
        .all()
    )
    log_ids = [l.id for l in logs]
    exp = float(
        db.query(sqf.coalesce(sqf.sum(DailyExpense.amount), 0))
        .filter(DailyExpense.daily_block_log_id.in_(log_ids))
        .scalar()
    ) if log_ids else 0

    gross = sum(float(l.actual_gross or 0) for l in logs)
    trips = sum(l.trip_count or 0 for l in logs)
    miles = sum(float(l.miles_driven or 0) for l in logs)
    hours = sum(float(l.active_hours or 0) for l in logs)

    return WeeklyResponse(
        week_start=mon, week_end=sun,
        trips_this_week=trips,
        trips_target=30,
        gross=round(gross, 2),
        expenses=round(exp, 2),
        net=round(gross - exp, 2),
        miles=round(miles, 1),
        active_hours=round(hours, 2),
    )


@router.get("/weekly", response_model=WeeklyResponse)
def report_weekly(db: Session = Depends(get_db)):
    return _weekly(db)


# ── 7. Financial Health ────────────────────────────────────────────────────────

def _financial_health(db: Session) -> FinancialHealthResponse:
    config = db.query(SystemConfig).first()
    today = date.today()
    year_start = date(today.year, 1, 1)

    # YTD totals from daily_block_logs
    ytd_gross = float(
        db.query(sqf.coalesce(sqf.sum(DailyBlockLog.actual_gross), 0))
        .filter(DailyBlockLog.entry_date >= year_start)
        .scalar()
    )
    ytd_miles = float(
        db.query(sqf.coalesce(sqf.sum(DailyBlockLog.miles_driven), 0))
        .filter(DailyBlockLog.entry_date >= year_start)
        .scalar()
    )
    ytd_hours = float(
        db.query(sqf.coalesce(sqf.sum(DailyBlockLog.active_hours), 0))
        .filter(DailyBlockLog.entry_date >= year_start)
        .scalar()
    )

    monthly_nut = float(config.monthly_nut)
    bankroll = float(config.bankroll_remaining)
    daily_burn = monthly_nut / 30
    runway = bankroll / daily_burn if daily_burn > 0 else 999

    se_rate = float(config.se_tax_rate)
    se_accrued = round(ytd_gross * se_rate, 2)

    irs_rate = float(config.irs_mileage_rate)
    mileage_ded = round(ytd_miles * irs_rate, 2)

    weekly_cost = float(config.weekly_vehicle_cost)
    # This week's gas
    mon = _monday_of_week(today)
    sun = mon + timedelta(days=6)
    weekly_gas = float(
        db.query(sqf.coalesce(sqf.sum(DailyExpense.amount), 0))
        .join(DailyBlockLog, DailyBlockLog.id == DailyExpense.daily_block_log_id)
        .filter(DailyBlockLog.entry_date >= mon, DailyBlockLog.entry_date <= sun)
        .filter(DailyExpense.category == "gas")
        .scalar()
    )
    weekly_hours = float(
        db.query(sqf.coalesce(sqf.sum(DailyBlockLog.active_hours), 0))
        .filter(DailyBlockLog.entry_date >= mon, DailyBlockLog.entry_date <= sun)
        .scalar()
    )
    # Breakeven $/hr = total weekly costs / hours worked. Use actual data if available.
    # If no hours logged yet, estimate with 40hr/week standard.
    breakeven = _safe_div(weekly_cost + weekly_gas, weekly_hours) if weekly_hours > 0 else _safe_div(weekly_cost, 40)

    return FinancialHealthResponse(
        phase=config.phase,
        weekly_vehicle_cost=round(weekly_cost, 2),
        monthly_nut=round(monthly_nut, 2),
        bankroll_remaining=round(bankroll, 2),
        runway_days=round(runway, 1),
        se_tax_rate=round(se_rate, 4),
        se_tax_accrued=se_accrued,
        irs_mileage_rate=round(irs_rate, 4),
        total_miles_ytd=round(ytd_miles, 1),
        total_hours_ytd=round(ytd_hours, 2),
        avg_per_hour_ytd=_safe_div(ytd_gross, ytd_hours),
        mileage_deduction_ytd=mileage_ded,
        breakeven_per_hour=round(breakeven, 2),
    )


@router.get("/financial-health", response_model=FinancialHealthResponse)
def report_financial_health(db: Session = Depends(get_db)):
    return _financial_health(db)


# ── 8. Job Search ──────────────────────────────────────────────────────────────

def _job_search(db: Session) -> JobSearchResponse:
    today = date.today()
    mon = _monday_of_week(today)
    sun = mon + timedelta(days=6)

    all_jobs = db.query(JobActivity).all()
    week_jobs = [j for j in all_jobs if mon <= j.date <= sun]

    return JobSearchResponse(
        total_applications=sum(j.applications_submitted for j in all_jobs),
        total_recruiter_contacts=sum(j.recruiter_contacts for j in all_jobs),
        total_linkedin=sum(j.linkedin_connections for j in all_jobs),
        this_week_applications=sum(j.applications_submitted for j in week_jobs),
        this_week_recruiter=sum(j.recruiter_contacts for j in week_jobs),
        this_week_linkedin=sum(j.linkedin_connections for j in week_jobs),
    )


@router.get("/job-search", response_model=JobSearchResponse)
def report_job_search(db: Session = Depends(get_db)):
    return _job_search(db)


# ── 9. Tax Summary ────────────────────────────────────────────────────────────

def _tax_summary(db: Session, year: int | None = None) -> TaxSummaryResponse:
    today = date.today()
    yr = year or today.year
    year_start = date(yr, 1, 1)
    year_end = date(yr, 12, 31)

    config = db.query(SystemConfig).first()

    ytd_gross = float(
        db.query(sqf.coalesce(sqf.sum(DailyBlockLog.actual_gross), 0))
        .filter(DailyBlockLog.entry_date >= year_start, DailyBlockLog.entry_date <= year_end)
        .scalar()
    )
    ytd_miles = float(
        db.query(sqf.coalesce(sqf.sum(DailyBlockLog.miles_driven), 0))
        .filter(DailyBlockLog.entry_date >= year_start, DailyBlockLog.entry_date <= year_end)
        .scalar()
    )
    ytd_expenses = float(
        db.query(sqf.coalesce(sqf.sum(DailyExpense.amount), 0))
        .join(DailyBlockLog, DailyBlockLog.id == DailyExpense.daily_block_log_id)
        .filter(DailyBlockLog.entry_date >= year_start, DailyBlockLog.entry_date <= year_end)
        .scalar()
    )
    maint_total = float(
        db.query(sqf.coalesce(sqf.sum(MaintenanceRecord.cost), 0))
        .filter(MaintenanceRecord.service_date >= year_start, MaintenanceRecord.service_date <= year_end)
        .scalar()
    )

    irs_rate = float(config.irs_mileage_rate)
    se_rate = float(config.se_tax_rate)

    # Next quarterly due date
    quarterly_dates = [date(yr, 4, 15), date(yr, 6, 15), date(yr, 9, 15), date(yr + 1, 1, 15)]
    next_due = next((d for d in quarterly_dates if d >= today), quarterly_dates[-1])

    return TaxSummaryResponse(
        year=yr,
        total_gross=round(ytd_gross, 2),
        total_miles=round(ytd_miles, 1),
        irs_mileage_rate=round(irs_rate, 4),
        mileage_deduction=round(ytd_miles * irs_rate, 2),
        se_tax_rate=round(se_rate, 4),
        se_tax_liability=round(ytd_gross * se_rate, 2),
        total_expenses=round(ytd_expenses, 2),
        maintenance_total=round(maint_total, 2),
        maintenance_cost_per_mile=_safe_div(maint_total, ytd_miles),
        next_quarterly_due=next_due,
    )


@router.get("/tax-summary", response_model=TaxSummaryResponse)
def report_tax_summary(db: Session = Depends(get_db), year: int = Query(default=None)):
    return _tax_summary(db, year)


# ── Batched dashboard — single call for the Reports page ──────────────────────

class DashboardBatchResponse(BaseModel):
    summary: SummaryResponse
    by_day: list[DayRow]
    by_zone: list[ZoneRow]
    by_platform: list[PlatformRow]
    expenses: ExpensesResponse
    weekly: WeeklyResponse
    financial_health: FinancialHealthResponse
    job_search: JobSearchResponse
    tax_summary: TaxSummaryResponse

@router.get("/dashboard", response_model=DashboardBatchResponse)
def report_dashboard(
    db: Session = Depends(get_db),
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
):
    """Single endpoint returning all report data. Reduces 9 API calls to 1."""
    return DashboardBatchResponse(
        summary=_summary(db, from_date, to_date),
        by_day=_by_day(db, from_date, to_date),
        by_zone=_by_zone(db, from_date, to_date),
        by_platform=_by_platform(db, from_date, to_date),
        expenses=_expenses(db, from_date, to_date),
        weekly=_weekly(db),
        financial_health=_financial_health(db),
        job_search=_job_search(db),
        tax_summary=_tax_summary(db),
    )


# ── Config endpoint ───────────────────────────────────────────────────────────

class ConfigResponse(BaseModel):
    phase: str
    weekly_vehicle_cost: float
    monthly_nut: float
    bankroll_remaining: float
    se_tax_rate: float
    irs_mileage_rate: float

class ConfigUpdate(BaseModel):
    phase: str | None = None
    weekly_vehicle_cost: float | None = None
    monthly_nut: float | None = None
    bankroll_remaining: float | None = None
    se_tax_rate: float | None = None
    irs_mileage_rate: float | None = None

@router.get("/config", response_model=ConfigResponse)
def get_config(db: Session = Depends(get_db)):
    c = db.query(SystemConfig).first()
    return ConfigResponse(
        phase=c.phase,
        weekly_vehicle_cost=round(float(c.weekly_vehicle_cost), 2),
        monthly_nut=round(float(c.monthly_nut), 2),
        bankroll_remaining=round(float(c.bankroll_remaining), 2),
        se_tax_rate=round(float(c.se_tax_rate), 4),
        irs_mileage_rate=round(float(c.irs_mileage_rate), 4),
    )

@router.put("/config", response_model=ConfigResponse)
def update_config(body: ConfigUpdate, db: Session = Depends(get_db)):
    c = db.query(SystemConfig).first()
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(c, field, value)
    db.commit()
    db.refresh(c)
    return ConfigResponse(
        phase=c.phase,
        weekly_vehicle_cost=round(float(c.weekly_vehicle_cost), 2),
        monthly_nut=round(float(c.monthly_nut), 2),
        bankroll_remaining=round(float(c.bankroll_remaining), 2),
        se_tax_rate=round(float(c.se_tax_rate), 4),
        irs_mileage_rate=round(float(c.irs_mileage_rate), 4),
    )
