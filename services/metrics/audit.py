"""Audit logging helper and user identity dependency.

Usage in routers:
    from audit import audit, get_user_id

    @router.put("/something/{id}")
    def update_thing(id: UUID, body: ..., db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
        old = {...}
        # ... apply changes ...
        audit(db, "table_name", record.id, "UPDATE", user_id, {"field": {"old": old_val, "new": new_val}})
"""

from datetime import datetime
from uuid import UUID

from fastapi import Header
from sqlalchemy.orm import Session

from models import AuditLog


def get_user_id(x_user_id: str | None = Header(default=None)) -> UUID | None:
    """FastAPI dependency that reads x-user-id injected by the gateway."""
    if x_user_id:
        return UUID(x_user_id)
    return None


def audit(db: Session, table_name: str, record_id: UUID, action: str, user_id: UUID | None, changes: dict) -> None:
    """Write an audit log entry."""
    entry = AuditLog(
        table_name=table_name,
        record_id=record_id,
        action=action,
        user_id=user_id,
        changes=_serialize(changes),
    )
    db.add(entry)


def diff(old: dict, new: dict) -> dict:
    """Compare two dicts and return {field: {old: X, new: Y}} for changed fields."""
    changes = {}
    all_keys = set(old) | set(new)
    for key in all_keys:
        old_val = old.get(key)
        new_val = new.get(key)
        if old_val != new_val:
            changes[key] = {"old": _serialize_val(old_val), "new": _serialize_val(new_val)}
    return changes


def snapshot(record: dict) -> dict:
    """Serialize a full record for CREATE/DELETE audit entries."""
    return {k: _serialize_val(v) for k, v in record.items()}


def _serialize_val(val):
    """Make a value JSON-safe."""
    if val is None:
        return None
    if isinstance(val, (UUID,)):
        return str(val)
    if isinstance(val, (datetime,)):
        return val.isoformat()
    if hasattr(val, 'isoformat'):
        return val.isoformat()
    if isinstance(val, float):
        return round(val, 4)
    return val


def _serialize(d: dict) -> dict:
    """Deep-serialize a dict for JSON storage."""
    result = {}
    for k, v in d.items():
        if isinstance(v, dict):
            result[k] = _serialize(v)
        else:
            result[k] = _serialize_val(v)
    return result
