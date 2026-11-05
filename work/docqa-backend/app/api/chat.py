from fastapi import APIRouter

from app.schemas.chat import ChatRequest, ChatResponse
from app.services.chat_service import answer_question

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    """Answer a question using retrieved chunks from an uploaded document."""
    return answer_question(
        question=request.question,
        document_id=request.document_id,
        retrieval_limit=request.retrieval_limit,
    )
