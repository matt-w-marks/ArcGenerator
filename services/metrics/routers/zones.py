from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models.event_zone import EventZone, IMPACT_TYPES
from models.zone import Zone, ZONE_TYPES, SERVICE_TYPES
from role_guard import require_role

router = APIRouter(prefix="/zones", tags=["zones"])

# ── Schemas ───────────────────────────────────────────────────────────────────

class ZoneCreate(BaseModel):
    name:          str              = Field(min_length=1, max_length=64)
    zone_type:     str | None       = None
    address:       str | None       = None
    geo_lat:       Decimal | None   = Field(default=None, ge=Decimal("-90"),  le=Decimal("90"))
    geo_lng:       Decimal | None   = Field(default=None, ge=Decimal("-180"), le=Decimal("180"))
    service_types: list[str] | None = None


class ZoneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:            UUID
    name:          str
    zone_type:     str | None
    address:       str | None
    geo_lat:       Decimal | None
    geo_lng:       Decimal | None
    service_types: list[str] | None


class EventZoneCreate(BaseModel):
    zone_id:           UUID
    event_name:        str = Field(min_length=1, max_length=128)
    activation_window: str = Field(min_length=1)
    impact:            str
    week_of:           date


class EventZoneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:                UUID
    zone_id:           UUID
    event_name:        str
    activation_window: str
    impact:            str
    week_of:           date


# ── Zone endpoints ────────────────────────────────────────────────────────────

@router.get("", response_model=list[ZoneResponse], dependencies=[require_role('ADMIN', 'OPERATOR')])
def list_zones(db: Session = Depends(get_db)):
    return db.query(Zone).order_by(Zone.sort_order, Zone.name).all()


@router.post("", response_model=ZoneResponse, status_code=201, dependencies=[require_role('ADMIN')])
def create_zone(body: ZoneCreate, db: Session = Depends(get_db)):
    if body.zone_type and body.zone_type not in ZONE_TYPES:
        raise HTTPException(status_code=422, detail=f"zone_type must be one of {ZONE_TYPES}")
    if body.service_types:
        invalid = [s for s in body.service_types if s not in SERVICE_TYPES]
        if invalid:
            raise HTTPException(status_code=422, detail=f"Invalid service types: {invalid}")

    zone = Zone(
        name=body.name.strip(),
        zone_type=body.zone_type,
        address=body.address,
        geo_lat=body.geo_lat,
        geo_lng=body.geo_lng,
        service_types=body.service_types or [],
    )
    db.add(zone)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Zone already exists")
    db.refresh(zone)
    return zone


@router.delete("/{zone_id}", status_code=204, dependencies=[require_role('ADMIN')])
def delete_zone(zone_id: UUID, db: Session = Depends(get_db)):
    zone = db.get(Zone, zone_id)
    if zone is None:
        raise HTTPException(status_code=404, detail="Zone not found")
    db.delete(zone)
    db.commit()


# ── Event Zone endpoints ──────────────────────────────────────────────────────

@router.get("/events", response_model=list[EventZoneResponse], dependencies=[require_role('ADMIN', 'OPERATOR')])
def list_events(week_of: date | None = None, db: Session = Depends(get_db)):
    q = db.query(EventZone)
    if week_of:
        q = q.filter(EventZone.week_of == week_of)
    return q.order_by(EventZone.week_of, EventZone.event_name).all()


@router.post("/events", response_model=EventZoneResponse, status_code=201, dependencies=[require_role('ADMIN')])
def create_event(body: EventZoneCreate, db: Session = Depends(get_db)):
    if body.impact not in IMPACT_TYPES:
        raise HTTPException(status_code=422, detail=f"impact must be one of {IMPACT_TYPES}")
    if not db.get(Zone, body.zone_id):
        raise HTTPException(status_code=404, detail="Zone not found")

    ev = EventZone(**body.model_dump())
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@router.delete("/events/{event_id}", status_code=204, dependencies=[require_role('ADMIN')])
def delete_event(event_id: UUID, db: Session = Depends(get_db)):
    ev = db.get(EventZone, event_id)
    if ev is None:
        raise HTTPException(status_code=404, detail="Event not found")
    db.delete(ev)
    db.commit()
