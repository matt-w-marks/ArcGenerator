import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, Numeric, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class WeeklyRollup(Base):
    __tablename__ = "weekly_rollups"
    __table_args__ = (
        UniqueConstraint("week_start", name="uq_weekly_rollups_week_start"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    week_start: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    total_hours: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=0)
    total_earnings: Mapped[float] = mapped_column(
        Numeric(10, 2), nullable=False, default=0
    )
    total_gas: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=0)
    total_trips: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_applications: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_linkedin: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_recruiter_contacts: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
