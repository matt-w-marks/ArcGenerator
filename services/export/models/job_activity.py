import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class JobActivity(Base):
    __tablename__ = "job_activities"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    applications_submitted: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    linkedin_connections: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    recruiter_contacts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
