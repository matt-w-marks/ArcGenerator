import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class BudgetItem(Base):
    __tablename__ = "budget_items"
    __table_args__ = (
        UniqueConstraint("month", "name", name="uq_budget_item_month_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    month: Mapped[str] = mapped_column(String(7), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    budget_category: Mapped[str] = mapped_column(String(32), nullable=False)
    planned_amount: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False)
    frequency_note: Mapped[str | None] = mapped_column(String(32), nullable=True)
    recurring_expense_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("recurring_expenses.id", ondelete="SET NULL"), nullable=True
    )
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
