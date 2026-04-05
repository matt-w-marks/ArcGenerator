"""Audit log viewer endpoint."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import AuditLog

router = APIRouter(prefix="/audit-logs", tags=["audit"])


class AuditLogResponse(BaseModel):
    id: UUID
    table_name: str
    record_id: UUID
    action: str
    user_id: UUID | None
    changes: dict
    created_at: str


@router.get("", response_model=list[AuditLogResponse])
def list_audit_logs(
    db: Session = Depends(get_db),
    table: str | None = Query(default=None),
    record_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    q = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if table:
        q = q.filter(AuditLog.table_name == table)
    if record_id:
        q = q.filter(AuditLog.record_id == record_id)
    entries = q.offset(offset).limit(limit).all()
    return [
        AuditLogResponse(
            id=e.id,
            table_name=e.table_name,
            record_id=e.record_id,
            action=e.action,
            user_id=e.user_id,
            changes=e.changes,
            created_at=e.created_at.isoformat(),
        )
        for e in entries
    ]
