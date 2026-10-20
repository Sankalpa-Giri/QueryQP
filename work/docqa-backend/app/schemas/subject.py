from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SubjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    code: str = Field(min_length=2, max_length=50)
    department: str | None = Field(default=None, max_length=100)
    semester: int | None = Field(default=None, ge=1, le=12)
    description: str | None = None


class SubjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    code: str | None = Field(default=None, min_length=2, max_length=50)
    department: str | None = None
    semester: int | None = Field(default=None, ge=1, le=12)
    description: str | None = None
    is_active: bool | None = None


class SubjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    code: str
    department: str | None = None
    semester: int | None = None
    description: str | None = None
    is_active: bool
    paper_count: int = 0
    question_count: int = 0
    created_at: datetime
    updated_at: datetime


class TopicResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    subject_id: str
    name: str
    parent_id: str | None = None
    question_count: int = 0

