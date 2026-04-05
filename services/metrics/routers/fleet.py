"""Fleet management — vehicle registry + per-vehicle cost tracking."""

from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func as sqf
from sqlalchemy.orm import Session

from audit import audit, diff, snapshot, get_user_id
from database import get_db
from models import (
    Vehicle, MaintenanceRecord, RecurringExpense,
    DailyBlockLog, DailyExpense, BusinessExpense,
)
from role_guard import require_role

router = APIRouter(prefix="/fleet", tags=["fleet"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class VehicleCreate(BaseModel):
    year: int = Field(ge=1990, le=2035)
    make: str = Field(min_length=1, max_length=64)
    model: str = Field(min_length=1, max_length=64)
    trim: str | None = Field(default=None, max_length=64)
    vin: str | None = Field(default=None, max_length=17)
    license_plate: str | None = Field(default=None, max_length=16)
    color: str | None = Field(default=None, max_length=32)
    ownership_type: str = Field(default="rental", pattern="^(rental|owned|leased)$")
    epa_mpg_city: float | None = Field(default=None, ge=0)
    epa_mpg_highway: float | None = Field(default=None, ge=0)
    epa_mpg_combined: float | None = Field(default=None, ge=0)
    fuel_tank_gal: float | None = Field(default=None, ge=0)
    tire_size: str | None = Field(default=None, max_length=32)
    start_date: date
    notes: str | None = None

class VehicleUpdate(BaseModel):
    year: int | None = Field(default=None, ge=1990, le=2035)
    make: str | None = Field(default=None, max_length=64)
    model: str | None = Field(default=None, max_length=64)
    trim: str | None = None
    vin: str | None = None
    license_plate: str | None = None
    color: str | None = None
    status: str | None = Field(default=None, pattern="^(active|retired)$")
    ownership_type: str | None = Field(default=None, pattern="^(rental|owned|leased)$")
    epa_mpg_city: float | None = None
    epa_mpg_highway: float | None = None
    epa_mpg_combined: float | None = None
    fuel_tank_gal: float | None = None
    tire_size: str | None = None
    end_date: date | None = None
    notes: str | None = None

class VehicleResponse(BaseModel):
    id: UUID
    year: int
    make: str
    model: str
    trim: str | None
    display_name: str
    vin: str | None
    license_plate: str | None
    color: str | None
    status: str
    ownership_type: str
    epa_mpg_city: float | None
    epa_mpg_highway: float | None
    epa_mpg_combined: float | None
    fuel_tank_gal: float | None
    tire_size: str | None
    start_date: date
    end_date: date | None
    notes: str | None
    created_at: str

class VehicleSummary(BaseModel):
    vehicle_id: UUID
    display_name: str
    total_miles: float
    total_fuel_cost: float
    total_maintenance_cost: float
    total_rental_cost: float
    total_cost: float
    cost_per_mile: float
    actual_mpg: float | None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _vehicle_response(v: Vehicle) -> VehicleResponse:
    return VehicleResponse(
        id=v.id, year=v.year, make=v.make, model=v.model, trim=v.trim,
        display_name=v.display_name, vin=v.vin, license_plate=v.license_plate,
        color=v.color, status=v.status, ownership_type=v.ownership_type,
        epa_mpg_city=float(v.epa_mpg_city) if v.epa_mpg_city else None,
        epa_mpg_highway=float(v.epa_mpg_highway) if v.epa_mpg_highway else None,
        epa_mpg_combined=float(v.epa_mpg_combined) if v.epa_mpg_combined else None,
        fuel_tank_gal=float(v.fuel_tank_gal) if v.fuel_tank_gal else None,
        tire_size=v.tire_size, start_date=v.start_date, end_date=v.end_date,
        notes=v.notes, created_at=v.created_at.isoformat(),
    )

def _safe_div(num: float, den: float) -> float:
    return round(num / den, 2) if den > 0 else 0.0


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("/vehicles", response_model=list[VehicleResponse], dependencies=[require_role("ADMIN", "OPERATOR")])
def list_vehicles(db: Session = Depends(get_db), include_retired: bool = Query(default=False)):
    q = db.query(Vehicle).filter(Vehicle.deleted_at.is_(None))
    if not include_retired:
        q = q.filter(Vehicle.status == "active")
    return [_vehicle_response(v) for v in q.order_by(Vehicle.start_date.desc()).all()]

@router.post("/vehicles", response_model=VehicleResponse, status_code=201, dependencies=[require_role("ADMIN")])
def create_vehicle(body: VehicleCreate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    v = Vehicle(created_by=user_id, **body.model_dump())
    db.add(v)
    db.flush()
    audit(db, "vehicles", v.id, "CREATE", user_id, snapshot({
        "year": v.year, "make": v.make, "model": v.model, "vin": v.vin,
        "ownership_type": v.ownership_type, "start_date": str(v.start_date),
    }))
    db.commit()
    db.refresh(v)
    return _vehicle_response(v)

@router.put("/vehicles/{vehicle_id}", response_model=VehicleResponse, dependencies=[require_role("ADMIN")])
def update_vehicle(vehicle_id: UUID, body: VehicleUpdate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    v = db.get(Vehicle, vehicle_id)
    if v is None or v.deleted_at is not None:
        raise HTTPException(404, "Vehicle not found")
    old = {"status": v.status, "ownership_type": v.ownership_type, "vin": v.vin}
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(v, field, value)
    new = {"status": v.status, "ownership_type": v.ownership_type, "vin": v.vin}
    changes = diff(old, new)
    if changes:
        audit(db, "vehicles", v.id, "UPDATE", user_id, changes)
    db.commit()
    db.refresh(v)
    return _vehicle_response(v)

@router.delete("/vehicles/{vehicle_id}", status_code=204, dependencies=[require_role("ADMIN")])
def delete_vehicle(vehicle_id: UUID, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    v = db.get(Vehicle, vehicle_id)
    if v is None or v.deleted_at is not None:
        raise HTTPException(404, "Vehicle not found")
    v.deleted_at = datetime.now(timezone.utc)
    v.deleted_by = user_id
    v.status = "retired"
    audit(db, "vehicles", v.id, "DELETE", user_id, snapshot({
        "year": v.year, "make": v.make, "model": v.model, "vin": v.vin,
    }))
    db.commit()


# ── Per-vehicle summary ───────────────────────────────────────────────────────

@router.get("/vehicles/{vehicle_id}/summary", response_model=VehicleSummary, dependencies=[require_role("ADMIN", "OPERATOR")])
def vehicle_summary(vehicle_id: UUID, db: Session = Depends(get_db)):
    v = db.get(Vehicle, vehicle_id)
    if v is None or v.deleted_at is not None:
        raise HTTPException(404, "Vehicle not found")

    # Total miles from shift logs
    total_miles = float(
        db.query(sqf.coalesce(sqf.sum(DailyBlockLog.miles_driven), 0))
        .filter(DailyBlockLog.vehicle_id == vehicle_id, DailyBlockLog.deleted_at.is_(None))
        .scalar()
    )

    # Fuel cost from business expenses
    fuel_biz = float(
        db.query(sqf.coalesce(sqf.sum(BusinessExpense.amount), 0))
        .filter(BusinessExpense.vehicle_id == vehicle_id, BusinessExpense.deleted_at.is_(None),
                BusinessExpense.budget_category == "fuel")
        .scalar()
    )

    # Maintenance cost
    maint = float(
        db.query(sqf.coalesce(sqf.sum(MaintenanceRecord.cost), 0))
        .filter(MaintenanceRecord.vehicle_id == vehicle_id)
        .scalar()
    )

    # Recurring rental cost (projected total since start)
    from routers.expenses import FREQ_TO_MONTHLY
    recs = db.query(RecurringExpense).filter(
        RecurringExpense.vehicle_id == vehicle_id, RecurringExpense.deleted_at.is_(None)
    ).all()
    rental = 0.0
    for r in recs:
        months_active = max(1, ((date.today() - r.start_date).days / 30))
        mult = FREQ_TO_MONTHLY.get(r.frequency, 1.0)
        rental += float(r.amount) * mult * months_active
    rental = round(rental, 2)

    total_cost = fuel_biz + maint + rental

    # Actual MPG estimate: miles / (fuel_cost / ~$3.50 per gallon avg)
    est_gallons = fuel_biz / 3.50 if fuel_biz > 0 else 0
    actual_mpg = round(total_miles / est_gallons, 1) if est_gallons > 0 else None

    return VehicleSummary(
        vehicle_id=v.id, display_name=v.display_name,
        total_miles=round(total_miles, 1), total_fuel_cost=round(fuel_biz, 2),
        total_maintenance_cost=round(maint, 2), total_rental_cost=rental,
        total_cost=round(total_cost, 2), cost_per_mile=_safe_div(total_cost, total_miles),
        actual_mpg=actual_mpg,
    )
