import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class TemplateBlock(Base):
    __tablename__ = "template_blocks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("schedule_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    hour_start: Mapped[int] = mapped_column(Integer, nullable=False)
    hour_end: Mapped[int] = mapped_column(Integer, nullable=False)
    block_type: Mapped[str] = mapped_column(String(16), nullable=False)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("zones.id", ondelete="SET NULL"),
        nullable=True,
    )
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    template: Mapped["ScheduleTemplate"] = relationship(  # type: ignore[name-defined]
        "ScheduleTemplate", back_populates="blocks"
    )
    zone_rel: Mapped["Zone"] = relationship("Zone", foreign_keys=[zone_id], lazy="select")  # type: ignore[name-defined]

    @property
    def zone_name(self) -> str | None:
        return self.zone_rel.name if self.zone_rel else None
