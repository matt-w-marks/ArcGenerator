import uuid
from datetime import date, datetime, time

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, Time, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class DrivingSession(Base):
    __tablename__ = "driving_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    gross_earnings: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    trip_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("zones.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    odometer_start: Mapped[float | None] = mapped_column(Numeric(8, 1), nullable=True)
    odometer_end: Mapped[float | None] = mapped_column(Numeric(8, 1), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    zone_rel: Mapped["Zone"] = relationship("Zone", foreign_keys=[zone_id], lazy="select")  # type: ignore[name-defined]

    @property
    def zone_name(self) -> str | None:
        return self.zone_rel.name if self.zone_rel else None
