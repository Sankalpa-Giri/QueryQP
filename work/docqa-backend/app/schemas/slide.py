from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class SlideBase(BaseModel):
    subject_id: str | None = None
    professor_name: str = Field(..., min_length=1, max_length=150)
    professor_title: str | None = Field(None, max_length=200)
    topic_name: str = Field(..., min_length=1, max_length=200)
    title: str = Field(..., min_length=1, max_length=250)
    description: str | None = None
    semester: str | None = None
    academic_year: str | None = None


class SlideCreate(SlideBase):
    subject_id: str


class SlideUpdate(BaseModel):
    subject_id: str | None = None
    professor_name: str | None = None
    professor_title: str | None = None
    topic_name: str | None = None
    title: str | None = None
    description: str | None = None
    semester: str | None = None
    academic_year: str | None = None


class SlideResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    subject_id: str
    subject_name: str | None = None
    subject_code: str | None = None
    professor_name: str
    professor_title: str | None = None
    topic_name: str
    title: str
    description: str | None = None
    filename: str
    file_type: str
    file_size_bytes: int
    semester: str | None = None
    academic_year: str | None = None
    download_count: int = 0
    file_url: str
    download_url: str
    created_at: datetime
    updated_at: datetime


class TopicSlidesGroup(BaseModel):
    topic_name: str
    slides: list[SlideResponse]


class ProfessorSlidesResponse(BaseModel):
    professor_name: str
    professor_title: str | None = None
    total_slides: int
    topics: list[TopicSlidesGroup]


class ProfessorsBySubjectResponse(BaseModel):
    subject_id: str | None = None
    professors: list[ProfessorSlidesResponse]


class AdminSlidesListResponse(BaseModel):
    items: list[SlideResponse]
    total: int
    page: int
    pages: int
