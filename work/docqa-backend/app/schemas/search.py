from pydantic import BaseModel, Field

from app.schemas.question import QuestionResponse


class FiltersApplied(BaseModel):
    subject_id: str | None = None
    subject_name: str | None = None
    from_year: int | None = None
    to_year: int | None = None
    exam_type: str | None = None


class PaginationInfo(BaseModel):
    page: int
    page_size: int
    total_results: int
    total_pages: int
    has_next: bool
    has_prev: bool


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    subject_id: str | None = None
    min_year: int | None = Field(default=None, ge=1990, le=2050)
    max_year: int | None = Field(default=None, ge=1990, le=2050)
    from_year: int | None = Field(default=None, ge=1990, le=2050)
    to_year: int | None = Field(default=None, ge=1990, le=2050)
    exam_type: str | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class SearchResponse(BaseModel):
    query: str
    subject_id: str | None = None
    subject_name: str | None = None
    total_results: int
    page: int
    page_size: int
    results: list[QuestionResponse]
    filters_applied: FiltersApplied | None = None
    pagination: PaginationInfo | None = None
    message: str | None = None


class SearchSuggestionsResponse(BaseModel):
    subject_id: str | None = None
    subject_name: str | None = None
    suggestions: list[str] = []



# Legacy models for Phase 1 chunk search compatibility
class SearchResult(BaseModel):
    chunk_id: str | None = None
    document_id: str | None = None
    text: str = ""
    page_number: int = 1
    page_width: float | None = None
    page_height: float | None = None
    bbox: list[float] | None = None
    source_element_ids: list[str] = []
    score: float | None = None
    rerank_score: float | None = None
    rrf_score: float | None = None


class LegacySearchRequest(BaseModel):
    question: str
    document_id: str | None = None
    limit: int = 5
    rerank: bool = True


class LegacySearchResponse(BaseModel):
    results: list[SearchResult] = []

