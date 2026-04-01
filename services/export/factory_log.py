"""
Writes operational events to factory_logs.flg_entries.
Uses SQLAlchemy expression language — no raw SQL.
Failures are suppressed: logging must never break the service.
"""
import os

from sqlalchemy import Column, MetaData, String, Table, Text, insert
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB

_LOGGING_URL: str | None = os.environ.get("LOGGING_DATABASE_URL") or None
_log_engine = None

_metadata = MetaData()
_flg_entries = Table(
    "flg_entries",
    _metadata,
    Column("app_label", String(64), nullable=False),
    Column("level", String(16), nullable=False),
    Column("message", Text, nullable=False),
    Column("context", JSONB, nullable=True),
)


def _get_log_engine():
    global _log_engine
    if _log_engine is None and _LOGGING_URL:
        _log_engine = create_engine(_LOGGING_URL, pool_pre_ping=True)
    return _log_engine


def log_event(level: str, message: str, context: dict | None = None) -> None:
    engine = _get_log_engine()
    if engine is None:
        return
    try:
        with engine.connect() as conn:
            conn.execute(
                insert(_flg_entries).values(
                    app_label="export",
                    level=level.upper(),
                    message=message,
                    context=context,
                )
            )
            conn.commit()
    except Exception:
        pass
