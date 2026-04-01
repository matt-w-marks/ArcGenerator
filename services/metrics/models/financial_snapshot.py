import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Numeric, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class FinancialSnapshot(Base):
    __tablename__ = "financial_snapshots"
    __table_args__ = (UniqueConstraint("date", name="uq_financial_snapshots_date"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    bankroll: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    weekly_expenses: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    # runway_weeks is computed client-side (bankroll / weekly_expenses) — not stored
    tax_accrual: Mapped[float] = mapped_column(
        Numeric(10, 2), nullable=False, default=0
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
