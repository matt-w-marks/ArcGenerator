import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class JobActivity(Base):
    __tablename__ = "job_activities"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    company: Mapped[str] = mapped_column(String(128), nullable=False, server_default="")
    role_title: Mapped[str] = mapped_column(String(128), nullable=False, server_default="")
    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default="applied")
    applied_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
