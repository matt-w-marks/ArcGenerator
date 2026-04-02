import datetime
from datetime import date, datetime as dt, time
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field


class DrivingSessionCreate(BaseModel):
    date: date
    gross_earnings: Decimal = Field(ge=Decimal("0"))
    trip_count: int = Field(ge=0, default=0)
    zone_id: UUID | None = None
    start_time: time | None = None
    end_time: time | None = None
    odometer_start: Decimal | None = Field(default=None, ge=Decimal("0"))
    odometer_end: Decimal | None = Field(default=None, ge=Decimal("0"))


class DrivingSessionUpdate(BaseModel):
    date: datetime.date | None = None
    gross_earnings: Decimal | None = Field(default=None, ge=Decimal("0"))
    trip_count: int | None = Field(default=None, ge=0)
    zone_id: UUID | None = None
    start_time: time | None = None
    end_time: time | None = None
    odometer_start: Decimal | None = Field(default=None, ge=Decimal("0"))
    odometer_end: Decimal | None = Field(default=None, ge=Decimal("0"))


class DrivingSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    date: datetime.date
    gross_earnings: Decimal
    trip_count: int
    zone_id: UUID | None
    zone_name: str | None  # populated from zone_rel.name via model property
    start_time: time | None
    end_time: time | None
    odometer_start: Decimal | None
    odometer_end: Decimal | None
    created_at: dt
    updated_at: dt

    @computed_field
    @property
    def duration_hours(self) -> float | None:
        if self.start_time and self.end_time:
            start = dt.combine(datetime.date.min, self.start_time)
            end   = dt.combine(datetime.date.min, self.end_time)
            delta = (end - start).total_seconds()
            return round(delta / 3600, 2) if delta > 0 else None
        return None

    @computed_field
    @property
    def miles_driven(self) -> float | None:
        if self.odometer_start is not None and self.odometer_end is not None:
            diff = float(self.odometer_end) - float(self.odometer_start)
            return round(diff, 1) if diff >= 0 else None
        return None
