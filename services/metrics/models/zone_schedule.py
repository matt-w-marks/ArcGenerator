import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base

DAY_TYPES    = ("weekday", "friday_saturday", "sunday")
HEAT_LEVELS  = ("dead", "low_med", "med", "med_high", "high", "peak", "surge")
SERVICE_CATS = ("rides", "food", "both", "rest")


class ZoneSchedule(Base):
    __tablename__ = "zone_schedules"
    __table_args__ = (
        UniqueConstraint("zone_id", "day_type", "hour_start", name="uq_zone_schedules_slot"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    zone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("zones.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    day_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    hour_start: Mapped[int] = mapped_column(Integer, nullable=False)
    hour_end: Mapped[int] = mapped_column(Integer, nullable=False)
    heat: Mapped[str] = mapped_column(String(16), nullable=False)
    service_type: Mapped[str] = mapped_column(String(16), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
