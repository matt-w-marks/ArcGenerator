import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class IncomeStream(Base):
    __tablename__ = "income_streams"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    stream_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="active")

    # Venture fields
    venture_type: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Role fields
    company: Mapped[str | None] = mapped_column(String(128), nullable=True)
    title: Mapped[str | None] = mapped_column(String(128), nullable=True)
    role_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    compensation_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    compensation_rate: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    pay_frequency: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # Engagement fields
    client: Mapped[str | None] = mapped_column(String(128), nullable=True)
    engagement_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    rate: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    rate_unit: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # Common
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
