from datetime import datetime

from pydantic import BaseModel, ConfigDict


class BatchCreate(BaseModel):
    subject_id: str | None = None
    exam_year: int | None = None
    exam_type: str | None = None


class BatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    admin_id: str
    status: str
    total_files: int
    processed_count: int
    failed_count: int
    created_at: datetime
    updated_at: datetime


class DocumentSummary(BaseModel):
    id: str
    filename: str
    exam_year: int
    exam_type: str
    subject_id: str
    subject_name: str | None = None
    subject_code: str | None = None
    parser_status: str
    extraction_status: str
    indexing_status: str
    question_count: int = 0
    error_message: str | None = None


class BatchDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    admin_id: str
    status: str
    total_files: int
    processed_count: int
    failed_count: int
    created_at: datetime
    updated_at: datetime
    documents: list[DocumentSummary] = []
