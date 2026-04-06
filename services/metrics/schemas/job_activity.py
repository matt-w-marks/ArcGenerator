import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class JobActivityCreate(BaseModel):
    company: str = Field(max_length=128)
    role: str = Field(max_length=128)  # maps to role_title column
    status: str = Field(default="applied", max_length=32)
    applied_date: datetime.date | None = None
    notes: str | None = Field(default=None, max_length=512)


class JobActivityUpdate(BaseModel):
    company: str | None = Field(default=None, max_length=128)
    role: str | None = Field(default=None, max_length=128)
    status: str | None = Field(default=None, max_length=32)
    applied_date: datetime.date | None = None
    notes: str | None = Field(default=None, max_length=512)


class JobActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company: str
    role: str  # aliased from role_title
    status: str
    applied_date: datetime.date | None
    notes: str | None
    created_at: datetime.datetime
