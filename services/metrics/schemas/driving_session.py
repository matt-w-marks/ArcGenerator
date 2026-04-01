import datetime
from datetime import date, datetime as dt
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DrivingSessionCreate(BaseModel):
    date: date
    hours_worked: Decimal = Field(gt=Decimal("0"))
    gross_earnings: Decimal = Field(ge=Decimal("0"))
    gas_cost: Decimal = Field(ge=Decimal("0"), default=Decimal("0"))
    trip_count: int = Field(ge=0, default=0)
    zone: str | None = Field(default=None, max_length=128)


class DrivingSessionUpdate(BaseModel):
    # Use datetime.date (qualified) to avoid field-name-shadows-type on Python 3.14
    date: datetime.date | None = None
    hours_worked: Decimal | None = Field(default=None, gt=Decimal("0"))
    gross_earnings: Decimal | None = Field(default=None, ge=Decimal("0"))
    gas_cost: Decimal | None = Field(default=None, ge=Decimal("0"))
    trip_count: int | None = Field(default=None, ge=0)
    zone: str | None = Field(default=None, max_length=128)


class DrivingSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    date: datetime.date
    hours_worked: Decimal
    gross_earnings: Decimal
    gas_cost: Decimal
    trip_count: int
    zone: str | None
    created_at: dt
    updated_at: dt
