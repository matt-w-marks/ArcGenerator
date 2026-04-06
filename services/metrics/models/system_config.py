import uuid
from datetime import datetime

from sqlalchemy import DateTime, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class SystemConfig(Base):
    __tablename__ = "system_config"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    phase: Mapped[str] = mapped_column(String(16), nullable=False, server_default="PHASE_1")
    bankroll_remaining: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, server_default="11000.00")
    se_tax_rate: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0.1530")
    irs_mileage_rate: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0.7250")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
