from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from database import get_db
from models.platform import Platform, CATEGORIES
from role_guard import require_role

router = APIRouter(prefix="/platforms", tags=["platforms"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class PlatformCreate(BaseModel):
    name:       str  = Field(min_length=1, max_length=64)
    category:   str  = Field(pattern="^(rides|food|other)$")
    color:      str | None = Field(default=None, pattern="^#[0-9A-Fa-f]{6}$")
    sort_order: int  = 0


class PlatformUpdate(BaseModel):
    name:       str | None = Field(default=None, max_length=64)
    category:   str | None = Field(default=None, pattern="^(rides|food|other)$")
    color:      str | None = Field(default=None, pattern="^#[0-9A-Fa-f]{6}$")
    active:     bool | None = None
    sort_order: int | None = None


class PlatformResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:         UUID
    name:       str
    category:   str
    color:      str | None
    active:     bool
    sort_order: int


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[PlatformResponse], dependencies=[require_role('ADMIN', 'OPERATOR', 'VIEWER')])
def list_platforms(include_inactive: bool = False, db: Session = Depends(get_db)):
    q = db.query(Platform)
    if not include_inactive:
        q = q.filter(Platform.active == True)  # noqa: E712
    return q.order_by(Platform.sort_order, Platform.name).all()


@router.post("", response_model=PlatformResponse, status_code=201, dependencies=[require_role('ADMIN')])
def create_platform(body: PlatformCreate, db: Session = Depends(get_db)):
    p = Platform(**body.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.put("/{platform_id}", response_model=PlatformResponse, dependencies=[require_role('ADMIN')])
def update_platform(platform_id: UUID, body: PlatformUpdate, db: Session = Depends(get_db)):
    p = db.get(Platform, platform_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Platform not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(p, field, value)
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{platform_id}", status_code=204, dependencies=[require_role('ADMIN')])
def delete_platform(platform_id: UUID, db: Session = Depends(get_db)):
    p = db.get(Platform, platform_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Platform not found")
    db.delete(p)
    db.commit()
