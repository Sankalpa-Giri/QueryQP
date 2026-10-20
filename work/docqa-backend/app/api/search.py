from fastapi import APIRouter

from app.retrieval import retrieve_candidate_chunks, retrieve_top_chunks
from app.schemas.search import (
    LegacySearchRequest as SearchRequest,
    LegacySearchResponse as SearchResponse,
    SearchResult,
)

router = APIRouter(prefix="/search", tags=["search"])



@router.post("", response_model=SearchResponse)
def search_documents(request: SearchRequest) -> SearchResponse:
    """Search document chunks using hybrid retrieval (vector + FTS5) and Cross-Encoder reranking."""
    if request.rerank:
        results = retrieve_top_chunks(
            question=request.question,
            document_id=request.document_id,
            limit=request.limit,
        )
    else:
        results = retrieve_candidate_chunks(
            question=request.question,
            document_id=request.document_id,
            limit=request.limit,
        )
    return SearchResponse(results=[SearchResult(**result) for result in results])
