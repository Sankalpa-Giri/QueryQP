from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1_000)
    document_id: str | None = None
    retrieval_limit: int = Field(default=5, ge=1, le=10)


class Citation(BaseModel):
    page_number: int
    bbox: list[float]
    page_width: float | None = None
    page_height: float | None = None


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    is_grounded: bool = True
