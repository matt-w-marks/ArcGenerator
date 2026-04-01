from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class WeeklyRollupCreate(BaseModel):
    week_start: date
    total_hours: Decimal = Field(ge=Decimal("0"), default=Decimal("0"))
    total_earnings: Decimal = Field(ge=Decimal("0"), default=Decimal("0"))
    total_gas: Decimal = Field(ge=Decimal("0"), default=Decimal("0"))
    total_trips: int = Field(ge=0, default=0)
    total_applications: int = Field(ge=0, default=0)
    total_linkedin: int = Field(ge=0, default=0)
    total_recruiter_contacts: int = Field(ge=0, default=0)

    @field_validator("week_start")
    @classmethod
    def must_be_sunday(cls, v: date) -> date:
        if v.isoweekday() != 7:
            raise ValueError("week_start must be a Sunday")
        return v


class WeeklyRollupUpdate(BaseModel):
    week_start: date | None = None
    total_hours: Decimal | None = Field(default=None, ge=Decimal("0"))
    total_earnings: Decimal | None = Field(default=None, ge=Decimal("0"))
    total_gas: Decimal | None = Field(default=None, ge=Decimal("0"))
    total_trips: int | None = Field(default=None, ge=0)
    total_applications: int | None = Field(default=None, ge=0)
    total_linkedin: int | None = Field(default=None, ge=0)
    total_recruiter_contacts: int | None = Field(default=None, ge=0)

    @field_validator("week_start")
    @classmethod
    def must_be_sunday(cls, v: date | None) -> date | None:
        if v is not None and v.isoweekday() != 7:
            raise ValueError("week_start must be a Sunday")
        return v


class WeeklyRollupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    week_start: date
    total_hours: Decimal
    total_earnings: Decimal
    total_gas: Decimal
    total_trips: int
    total_applications: int
    total_linkedin: int
    total_recruiter_contacts: int
    created_at: datetime
    updated_at: datetime
