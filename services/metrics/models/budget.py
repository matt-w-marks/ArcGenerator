import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("budget_category", "month", name="uq_budget_category_month"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    budget_category: Mapped[str] = mapped_column(String(32), nullable=False)
    month: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # YYYY-MM
    monthly_amount: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False)
    tax_deductible: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    tax_notes: Mapped[str | None] = mapped_column(String(256), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(256), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
