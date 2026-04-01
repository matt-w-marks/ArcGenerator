import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class DrivingSession(Base):
    __tablename__ = "driving_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hours_worked: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    gross_earnings: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    gas_cost: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=0)
    trip_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    zone: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
