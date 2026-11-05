from datetime import datetime

from pydantic import BaseModel


class BatchSummary(BaseModel):
    id: str
    status: str
    total_files: int
    processed_count: int
    failed_count: int
    created_at: datetime


class DashboardStatsResponse(BaseModel):
    total_papers: int
    processed_papers: int
    processing_papers: int
    failed_papers: int
    total_questions: int
    published_questions: int
    pending_questions: int
    recent_batches: list[BatchSummary]
