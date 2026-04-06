from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session, joinedload

from audit import get_user_id
from database import get_db
from role_guard import require_role
from models.checklist import Checklist
from models.checklist_item import ChecklistItem
from models.checklist_log import ChecklistLog
from models.checklist_log_photo import ChecklistLogPhoto
from models.maintenance_record import MaintenanceRecord

router = APIRouter(prefix="/maintenance", tags=["maintenance"])

SERVICE_TYPE_LABELS = {
    "oil_change":   "Oil Change",
    "tire_rotation":"Tire Rotation",
    "tires":        "Tire Replacement",
    "brakes":       "Brakes",
    "battery":      "Battery",
    "inspection":   "Inspection",
    "air_filter":   "Air Filter",
    "alignment":    "Alignment",
    "general":      "General Service",
    "other":        "Other",
}


# ── Schemas ───────────────────────────────────────────────────────────────────

class RecordCreate(BaseModel):
    service_date:   date
    shop_name:      str   = Field(default="Jim's Garage", max_length=128)
    service_type:   str   = Field(max_length=32)
    description:    str | None = Field(default=None, max_length=256)
    mileage:        int | None = Field(default=None, ge=0)
    cost:           float | None = Field(default=None, ge=0)
    next_due_miles: int | None = Field(default=None, ge=0)
    next_due_date:  date | None = None
    notes:          str | None = None


class RecordUpdate(BaseModel):
    service_date:   date | None = None
    shop_name:      str | None = Field(default=None, max_length=128)
    service_type:   str | None = Field(default=None, max_length=32)
    description:    str | None = Field(default=None, max_length=256)
    mileage:        int | None = Field(default=None, ge=0)
    cost:           float | None = Field(default=None, ge=0)
    next_due_miles: int | None = Field(default=None, ge=0)
    next_due_date:  date | None = None
    notes:          str | None = None


class RecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:             UUID
    service_date:   date
    shop_name:      str
    service_type:   str
    description:    str | None
    mileage:        int | None
    cost:           float | None
    next_due_miles: int | None
    next_due_date:  date | None
    notes:          str | None


class ChecklistItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:          UUID
    checklist_id: UUID
    label:       str
    sort_order:  int
    active:      bool


class ChecklistItemCreate(BaseModel):
    label:      str = Field(min_length=1, max_length=128)
    sort_order: int = 0


class ChecklistItemUpdate(BaseModel):
    label:      str | None = Field(default=None, max_length=128)
    sort_order: int | None = None
    active:     bool | None = None


class ChecklistCreate(BaseModel):
    name:           str = Field(min_length=1, max_length=64)
    description:    str | None = None
    checklist_type: str = Field(pattern="^(pre_day|post_day|pre_trip|post_trip)$")
    allow_photos:   bool = False


class ChecklistUpdate(BaseModel):
    name:           str | None = Field(default=None, max_length=64)
    description:    str | None = None
    checklist_type: str | None = None
    allow_photos:   bool | None = None


class ChecklistResponse(BaseModel):
    id:             UUID
    name:           str
    description:    str | None
    checklist_type: str
    allow_photos:   bool = False
    items:          list[ChecklistItemResponse] = []

    @classmethod
    def from_checklist(cls, c: Checklist) -> "ChecklistResponse":
        return cls(
            id=c.id,
            name=c.name,
            description=c.description,
            checklist_type=c.checklist_type,
            allow_photos=c.allow_photos,
            items=[
                ChecklistItemResponse.model_validate(i)
                for i in c.items
                if i.active
            ],
        )


class ChecklistLogCreate(BaseModel):
    checklist_id: UUID
    log_date:     date
    checked_ids:  list[UUID] = []
    notes:        str | None = None


class ChecklistLogResponse(BaseModel):
    id:           UUID
    checklist_id: UUID | None
    log_date:     date
    checked_ids:  list[UUID]
    notes:        str | None
    completed_at: str

    @classmethod
    def from_log(cls, log: ChecklistLog) -> "ChecklistLogResponse":
        return cls(
            id=log.id,
            checklist_id=log.checklist_id,
            log_date=log.log_date,
            checked_ids=log.checked_ids or [],
            notes=log.notes,
            completed_at=log.completed_at.isoformat(),
        )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_checklist(db: Session, checklist_id: UUID) -> Checklist:
    c = (
        db.query(Checklist)
        .options(joinedload(Checklist.items))
        .filter(Checklist.id == checklist_id)
        .first()
    )
    if c is None:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return c


# ── Maintenance records ───────────────────────────────────────────────────────

@router.get("/records", response_model=list[RecordResponse], dependencies=[require_role('ADMIN', 'OPERATOR')])
def list_records(db: Session = Depends(get_db)):
    return db.query(MaintenanceRecord).order_by(MaintenanceRecord.service_date.desc()).all()


@router.post("/records", response_model=RecordResponse, status_code=201, dependencies=[require_role('ADMIN')])
def create_record(body: RecordCreate, db: Session = Depends(get_db)):
    rec = MaintenanceRecord(**body.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.put("/records/{record_id}", response_model=RecordResponse, dependencies=[require_role('ADMIN')])
def update_record(record_id: UUID, body: RecordUpdate, db: Session = Depends(get_db)):
    rec = db.get(MaintenanceRecord, record_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="Record not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(rec, field, value)
    db.commit()
    db.refresh(rec)
    return rec


@router.delete("/records/{record_id}", status_code=204, dependencies=[require_role('ADMIN')])
def delete_record(record_id: UUID, db: Session = Depends(get_db)):
    rec = db.get(MaintenanceRecord, record_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(rec)
    db.commit()


# ── Checklists ────────────────────────────────────────────────────────────────

@router.get("/checklists", response_model=list[ChecklistResponse], dependencies=[require_role('ADMIN', 'OPERATOR')])
def list_checklists(checklist_type: str | None = None, db: Session = Depends(get_db)):
    q = db.query(Checklist).options(joinedload(Checklist.items))
    if checklist_type:
        q = q.filter(Checklist.checklist_type == checklist_type)
    checklists = q.order_by(Checklist.checklist_type, Checklist.name).all()
    return [ChecklistResponse.from_checklist(c) for c in checklists]


@router.post("/checklists", response_model=ChecklistResponse, status_code=201, dependencies=[require_role('ADMIN')])
def create_checklist(body: ChecklistCreate, db: Session = Depends(get_db)):
    c = Checklist(**body.model_dump())
    db.add(c)
    db.commit()
    return ChecklistResponse.from_checklist(_load_checklist(db, c.id))


@router.put("/checklists/{checklist_id}", response_model=ChecklistResponse, dependencies=[require_role('ADMIN')])
def update_checklist(checklist_id: UUID, body: ChecklistUpdate, db: Session = Depends(get_db)):
    c = db.get(Checklist, checklist_id)
    if c is None:
        raise HTTPException(status_code=404, detail="Checklist not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(c, field, value)
    db.commit()
    return ChecklistResponse.from_checklist(_load_checklist(db, checklist_id))


@router.delete("/checklists/{checklist_id}", status_code=204, dependencies=[require_role('ADMIN')])
def delete_checklist(checklist_id: UUID, db: Session = Depends(get_db)):
    c = db.get(Checklist, checklist_id)
    if c is None:
        raise HTTPException(status_code=404, detail="Checklist not found")
    db.delete(c)
    db.commit()


# ── Checklist items ───────────────────────────────────────────────────────────

@router.post("/checklists/{checklist_id}/items", response_model=ChecklistItemResponse, status_code=201, dependencies=[require_role('ADMIN')])
def add_item(checklist_id: UUID, body: ChecklistItemCreate, db: Session = Depends(get_db)):
    if not db.get(Checklist, checklist_id):
        raise HTTPException(status_code=404, detail="Checklist not found")
    item = ChecklistItem(checklist_id=checklist_id, **body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/checklist-items/{item_id}", response_model=ChecklistItemResponse, dependencies=[require_role('ADMIN')])
def update_item(item_id: UUID, body: ChecklistItemUpdate, db: Session = Depends(get_db)):
    item = db.get(ChecklistItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/checklist-items/{item_id}", status_code=204, dependencies=[require_role('ADMIN')])
def delete_item(item_id: UUID, db: Session = Depends(get_db)):
    item = db.get(ChecklistItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()


# ── Checklist logs ────────────────────────────────────────────────────────────

class ChecklistLogHistoryRow(BaseModel):
    id: UUID
    checklist_id: UUID | None
    checklist_name: str | None
    checklist_type: str | None
    log_date: date
    completed_at: datetime
    checked_count: int
    notes: str | None
    photo_count: int


@router.get("/checklist-logs", response_model=list[ChecklistLogResponse], dependencies=[require_role('ADMIN', 'OPERATOR')])
def list_logs(
    checklist_id: UUID | None = None,
    log_date: date | None = None,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    q = db.query(ChecklistLog)
    if checklist_id:
        q = q.filter(ChecklistLog.checklist_id == checklist_id)
    if log_date:
        q = q.filter(ChecklistLog.log_date == log_date)
    logs = q.order_by(ChecklistLog.completed_at.desc()).limit(limit).all()
    return [ChecklistLogResponse.from_log(l) for l in logs]


@router.get("/checklist-logs/history", response_model=list[ChecklistLogHistoryRow], dependencies=[require_role('ADMIN', 'OPERATOR')])
def history_logs(
    checklist_id: UUID | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    has_photos: bool | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    """History view: list completed checklists with filters and photo counts."""
    from sqlalchemy import func as sqf
    q = db.query(
        ChecklistLog,
        Checklist.name,
        Checklist.checklist_type,
        sqf.count(ChecklistLogPhoto.id).label("photo_count"),
    ).outerjoin(Checklist, Checklist.id == ChecklistLog.checklist_id) \
     .outerjoin(ChecklistLogPhoto, ChecklistLogPhoto.checklist_log_id == ChecklistLog.id) \
     .group_by(ChecklistLog.id, Checklist.name, Checklist.checklist_type)
    if checklist_id:
        q = q.filter(ChecklistLog.checklist_id == checklist_id)
    if from_date:
        q = q.filter(ChecklistLog.log_date >= from_date)
    if to_date:
        q = q.filter(ChecklistLog.log_date <= to_date)
    if has_photos is True:
        q = q.having(sqf.count(ChecklistLogPhoto.id) > 0)
    elif has_photos is False:
        q = q.having(sqf.count(ChecklistLogPhoto.id) == 0)
    rows = q.order_by(ChecklistLog.log_date.desc(), ChecklistLog.completed_at.desc()).limit(limit).all()
    return [
        ChecklistLogHistoryRow(
            id=row[0].id, checklist_id=row[0].checklist_id,
            checklist_name=row[1], checklist_type=row[2],
            log_date=row[0].log_date, completed_at=row[0].completed_at,
            checked_count=len(row[0].checked_ids or []), notes=row[0].notes,
            photo_count=row[3],
        ) for row in rows
    ]


@router.post("/checklist-logs", response_model=ChecklistLogResponse, status_code=201, dependencies=[require_role('ADMIN', 'OPERATOR')])
def create_log(body: ChecklistLogCreate, db: Session = Depends(get_db)):
    log = ChecklistLog(**body.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)
    return ChecklistLogResponse.from_log(log)


@router.delete("/checklist-logs/{log_id}", status_code=204, dependencies=[require_role('ADMIN')])
def delete_log(log_id: UUID, db: Session = Depends(get_db)):
    log = db.get(ChecklistLog, log_id)
    if log is None:
        raise HTTPException(status_code=404, detail="Log not found")
    db.delete(log)
    db.commit()


# ── Checklist log photos ─────────────────────────────────────────────────────

ALLOWED_PHOTO_MIMES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"}
MAX_PHOTO_SIZE = 10 * 1024 * 1024  # 10 MB


class ChecklistLogPhotoBrief(BaseModel):
    id: UUID
    checklist_log_id: UUID
    photo_mime: str
    caption: str | None
    uploaded_at: datetime


@router.get("/checklist-logs/{log_id}/photos", response_model=list[ChecklistLogPhotoBrief], dependencies=[require_role('ADMIN', 'OPERATOR')])
def list_photos(log_id: UUID, db: Session = Depends(get_db)):
    photos = db.query(ChecklistLogPhoto).filter(ChecklistLogPhoto.checklist_log_id == log_id).order_by(ChecklistLogPhoto.uploaded_at).all()
    return [ChecklistLogPhotoBrief(
        id=p.id, checklist_log_id=p.checklist_log_id, photo_mime=p.photo_mime,
        caption=p.caption, uploaded_at=p.uploaded_at,
    ) for p in photos]


@router.post("/checklist-logs/{log_id}/photos", response_model=ChecklistLogPhotoBrief, status_code=201, dependencies=[require_role('ADMIN', 'OPERATOR')])
async def upload_photo(log_id: UUID, file: UploadFile = File(...), caption: str | None = None,
                       db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    log = db.get(ChecklistLog, log_id)
    if log is None:
        raise HTTPException(status_code=404, detail="Checklist log not found")
    if file.content_type not in ALLOWED_PHOTO_MIMES:
        raise HTTPException(status_code=400, detail=f"Mime type not allowed: {file.content_type}")
    data = await file.read()
    if len(data) > MAX_PHOTO_SIZE:
        raise HTTPException(status_code=413, detail="Photo exceeds 10 MB limit")
    photo = ChecklistLogPhoto(
        checklist_log_id=log_id, photo_data=data, photo_mime=file.content_type,
        caption=caption, uploaded_by=user_id,
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return ChecklistLogPhotoBrief(
        id=photo.id, checklist_log_id=photo.checklist_log_id, photo_mime=photo.photo_mime,
        caption=photo.caption, uploaded_at=photo.uploaded_at,
    )


@router.get("/checklist-log-photos/{photo_id}", dependencies=[require_role('ADMIN', 'OPERATOR')])
def get_photo(photo_id: UUID, db: Session = Depends(get_db)):
    photo = db.get(ChecklistLogPhoto, photo_id)
    if photo is None:
        raise HTTPException(status_code=404, detail="Photo not found")
    return Response(content=photo.photo_data, media_type=photo.photo_mime)


@router.delete("/checklist-log-photos/{photo_id}", status_code=204, dependencies=[require_role('ADMIN')])
def delete_photo(photo_id: UUID, db: Session = Depends(get_db)):
    photo = db.get(ChecklistLogPhoto, photo_id)
    if photo is None:
        raise HTTPException(status_code=404, detail="Photo not found")
    db.delete(photo)
    db.commit()
