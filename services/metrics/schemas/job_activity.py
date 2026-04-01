import datetime
from datetime import date, datetime as dt
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class JobActivityCreate(BaseModel):
    date: date
    applications_submitted: int = Field(ge=0, default=0)
    linkedin_connections: int = Field(ge=0, default=0)
    recruiter_contacts: int = Field(ge=0, default=0)


class JobActivityUpdate(BaseModel):
    # Use datetime.date (qualified) to avoid field-name-shadows-type on Python 3.14
    date: datetime.date | None = None
    applications_submitted: int | None = Field(default=None, ge=0)
    linkedin_connections: int | None = Field(default=None, ge=0)
    recruiter_contacts: int | None = Field(default=None, ge=0)


class JobActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    date: datetime.date
    applications_submitted: int
    linkedin_connections: int
    recruiter_contacts: int
    created_at: dt
    updated_at: dt
