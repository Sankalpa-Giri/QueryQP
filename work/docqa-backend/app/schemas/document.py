from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ProcessingStatus(str, Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class DocumentResponse(BaseModel):
    id: UUID
    filename: str
    content_type: str = "application/pdf"
    size_bytes: int = 0
    processing_status: ProcessingStatus = ProcessingStatus.READY
    created_at: datetime
    page_count: int = 0
    chunk_count: int = 0
    indexed_chunk_count: int = 0
    normalized_path: str | None = None
    error: str | None = None


class QuestionPaperResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    batch_id: str
    subject_id: str
    subject_name: str | None = None
    subject_code: str | None = None
    exam_year: int
    exam_type: str
    filename: str
    page_count: int = 0
    parser_status: str
    extraction_status: str
    indexing_status: str
    publication_status: str
    error_message: str | None = None
    parser_version: str | None = None
    question_count: int = 0
    created_at: datetime
    updated_at: datetime


class DocumentStatusResponse(BaseModel):
    document_id: str
    stage: str
    status: str
    progress: float
    error_message: str | None = None
    retry_count: int = 0
