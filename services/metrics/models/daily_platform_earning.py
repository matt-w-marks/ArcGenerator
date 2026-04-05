import uuid

from sqlalchemy import ForeignKey, Integer, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class DailyPlatformEarning(Base):
    __tablename__ = "daily_platform_earnings"
    __table_args__ = (
        UniqueConstraint("daily_block_log_id", "platform_id", name="uq_daily_platform_earning"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    daily_block_log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("daily_block_logs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    platform_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platforms.id", ondelete="CASCADE"),
        nullable=False,
    )
    earnings: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=0)
    trip_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    daily_block_log: Mapped["DailyBlockLog"] = relationship(  # type: ignore[name-defined]
        "DailyBlockLog", back_populates="platform_earnings"
    )
    platform: Mapped["Platform"] = relationship("Platform", lazy="select")  # type: ignore[name-defined]
