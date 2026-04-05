import uuid
from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, Text, Time, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class DailyBlockLog(Base):
    __tablename__ = "daily_block_logs"
    __table_args__ = (
        UniqueConstraint("block_id", "entry_date", name="uq_daily_block_log"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    block_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("schedule_blocks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    block: Mapped["ScheduleBlock"] = relationship("ScheduleBlock", lazy="select")  # type: ignore[name-defined]
    expenses: Mapped[list["DailyExpense"]] = relationship(  # type: ignore[name-defined]
        "DailyExpense", back_populates="daily_block_log",
        cascade="all, delete-orphan", order_by="DailyExpense.created_at",
    )
    platform_earnings: Mapped[list["DailyPlatformEarning"]] = relationship(  # type: ignore[name-defined]
        "DailyPlatformEarning", back_populates="daily_block_log",
        cascade="all, delete-orphan",
    )
