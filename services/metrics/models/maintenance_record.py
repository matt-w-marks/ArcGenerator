import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    service_date: Mapped[date] = mapped_column(Date, nullable=False)
    shop_name: Mapped[str] = mapped_column(String(128), nullable=False, default="Jim's Garage")
    service_type: Mapped[str] = mapped_column(String(32), nullable=False)  # oil_change | tires | brakes | ...
    description: Mapped[str | None] = mapped_column(String(256), nullable=True)
    mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    next_due_miles: Mapped[int | None] = mapped_column(Integer, nullable=True)
    next_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
