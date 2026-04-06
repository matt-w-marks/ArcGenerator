import uuid
from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, Time, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class DailyBlockLog(Base):
    __tablename__ = "daily_block_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Nullable for ad-hoc blocks not tied to a schedule
    block_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("schedule_blocks.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Ad-hoc block fields (used when block_id is null)
    block_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    income_stream_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("income_streams.id", ondelete="SET NULL"), nullable=True
    )
    checklist_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("checklists.id", ondelete="SET NULL"), nullable=True
    )
    hour_start: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    hour_end: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)

    # Actual logged data
    actual_gross: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    trip_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actual_start: Mapped[time | None] = mapped_column(Time, nullable=True)
    actual_end: Mapped[time | None] = mapped_column(Time, nullable=True)
    odometer_start: Mapped[float | None] = mapped_column(Numeric(8, 1), nullable=True)
    odometer_end: Mapped[float | None] = mapped_column(Numeric(8, 1), nullable=True)
    miles_driven: Mapped[float | None] = mapped_column(Numeric(6, 1), nullable=True)
    surge_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    active_hours: Mapped[float | None] = mapped_column(Numeric(4, 2), nullable=True)
    log_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    block: Mapped["ScheduleBlock"] = relationship("ScheduleBlock", lazy="select")  # type: ignore[name-defined]
    platform_earnings: Mapped[list["DailyPlatformEarning"]] = relationship(  # type: ignore[name-defined]
        "DailyPlatformEarning", back_populates="daily_block_log",
        cascade="all, delete-orphan",
    )
