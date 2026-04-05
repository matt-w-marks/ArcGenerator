import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    make: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(64), nullable=False)
    trim: Mapped[str | None] = mapped_column(String(64), nullable=True)
    vin: Mapped[str | None] = mapped_column(String(17), nullable=True, unique=True)
    license_plate: Mapped[str | None] = mapped_column(String(16), nullable=True)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="active")
    ownership_type: Mapped[str] = mapped_column(String(16), nullable=False, server_default="rental")
    epa_mpg_city: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    epa_mpg_highway: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    epa_mpg_combined: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    fuel_tank_gal: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    tire_size: Mapped[str | None] = mapped_column(String(32), nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    @property
    def display_name(self) -> str:
        parts = [str(self.year), self.make, self.model]
        if self.trim:
            parts.append(self.trim)
        return " ".join(parts)
