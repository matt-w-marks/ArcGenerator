import datetime
from datetime import date, datetime as dt
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field


class FinancialSnapshotCreate(BaseModel):
    date: date
    bankroll: Decimal
    weekly_expenses: Decimal = Field(gt=Decimal("0"))
    tax_accrual: Decimal = Field(ge=Decimal("0"), default=Decimal("0"))


class FinancialSnapshotUpdate(BaseModel):
    # Use datetime.date (qualified) to avoid field-name-shadows-type on Python 3.14
    date: datetime.date | None = None
    bankroll: Decimal | None = None
    weekly_expenses: Decimal | None = Field(default=None, gt=Decimal("0"))
    tax_accrual: Decimal | None = Field(default=None, ge=Decimal("0"))


class FinancialSnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    date: datetime.date
    bankroll: Decimal
    weekly_expenses: Decimal
    tax_accrual: Decimal
    created_at: dt
    updated_at: dt

    @computed_field
    @property
    def runway_weeks(self) -> Decimal:
        return self.bankroll / self.weekly_expenses
