import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base

ZONE_TYPES    = ("Anchor", "Core", "Steady", "Events", "Surge")
SERVICE_TYPES = ("Rides", "Food", "Rest")


class Zone(Base):
    __tablename__ = "zones"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    zone_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    geo_lat: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    geo_lng: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    service_types: Mapped[list | None] = mapped_column(JSON, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
