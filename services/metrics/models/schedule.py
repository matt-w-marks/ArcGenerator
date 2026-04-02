import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    pre_day_checklist_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("checklists.id", ondelete="SET NULL"),
        nullable=True,
    )
    post_day_checklist_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("checklists.id", ondelete="SET NULL"),
        nullable=True,
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

    blocks: Mapped[list["ScheduleBlock"]] = relationship(  # type: ignore[name-defined]
        "ScheduleBlock",
        back_populates="schedule",
        cascade="all, delete-orphan",
        order_by="ScheduleBlock.hour_start",
    )
    calendar_entries: Mapped[list["CalendarEntry"]] = relationship(  # type: ignore[name-defined]
        "CalendarEntry",
        back_populates="schedule",
        cascade="all, delete-orphan",
    )
