import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class ScheduleBlock(Base):
    __tablename__ = "schedule_blocks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    schedule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("schedules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    hour_start: Mapped[float] = mapped_column(Numeric(4, 1), nullable=False)   # 0–25.5 (supports overnight)
    hour_end: Mapped[float] = mapped_column(Numeric(4, 1), nullable=False)     # 0.5–26
    block_type: Mapped[str] = mapped_column(String(16), nullable=False)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("zones.id", ondelete="SET NULL"),
        nullable=True,
    )
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    gross_revenue: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=0)
    actual_gross: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    platform_ids: Mapped[list] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=False, server_default="{}"
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

    schedule: Mapped["Schedule"] = relationship(  # type: ignore[name-defined]
        "Schedule", back_populates="blocks"
    )
    zone_rel: Mapped["Zone"] = relationship(  # type: ignore[name-defined]
        "Zone", foreign_keys=[zone_id], lazy="select"
    )

    @property
    def zone_name(self) -> str | None:
        return self.zone_rel.name if self.zone_rel else None
