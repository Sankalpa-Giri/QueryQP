from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class QuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    subject_id: str
    subject_name: str | None = None
    subject_code: str | None = None
    exam_year: int | None = None
    exam_type: str | None = None
    source_filename: str | None = None
    question_number: str
    question_text: str
    normalized_text: str
    page_number: int
    page_end: int
    marks: float | None = None
    topics: list[str] = Field(default_factory=list)
    bbox: list[float] | None = None
    review_status: str
    publication_status: str
    repeat_count: int = 1
    appearances: list[str] = Field(default_factory=list)
    relevance_score: float | None = None
    created_at: datetime
    updated_at: datetime


class QuestionUpdate(BaseModel):
    question_number: str | None = None
    question_text: str | None = None
    marks: float | None = None
    topics: list[str] | None = None
    review_status: str | None = None
    publication_status: str | None = None
    expected_updated_at: datetime | None = None
