import re

from app.llm.citation_verifier import verify_and_assemble_citations
from app.llm.client import generate_grounded_answer
from app.query_processing import process_student_query
from app.retrieval import retrieve_top_chunks
from app.schemas.chat import ChatResponse, Citation


def answer_question(question: str, document_id: str | None, retrieval_limit: int) -> ChatResponse:
    # Step 1: Query processing (detects intent, normalizes text, extracts keywords/phrases)
    processed_query = process_student_query(question)

    # Step 2: LangGraph hybrid retrieval & Cross-Encoder reranking pipeline:
    # (Vector Search + Keyword FTS5) -> Candidate Chunks (RRF) -> Cross-Encoder -> Top Relevant Chunks
    chunks = retrieve_top_chunks(
        question=processed_query.semantic_query,
        document_id=document_id,
        limit=retrieval_limit,
    )
    _enrich_page_dimensions(chunks, document_id)
    if not chunks:
        return ChatResponse(
            answer="I could not find relevant information in the indexed documents.",
            citations=[],
            is_grounded=False,
        )

    # Step 3: Intent-aware structured prompt generation & LLM grounded execution
    raw_answer = generate_grounded_answer(
        question=processed_query.normalized_text,
        chunks=chunks,
        intent=processed_query.intent,
    )

    # Step 4: Provenance / Citation verification and UI citation assembly
    verification = verify_and_assemble_citations(
        raw_answer=raw_answer,
        retrieved_chunks=chunks,
    )

    return ChatResponse(
        answer=verification.formatted_answer,
        citations=verification.citations,
        is_grounded=verification.is_grounded,
    )


def _format_citations_for_reader(answer: str, chunks: list[dict]) -> tuple[str, set[str]]:
    """Replace model-facing chunk IDs with readable page labels.

    Models occasionally use full-width brackets despite being instructed to use
    square brackets, so both forms are accepted here.
    """
    cited_ids: set[str] = set()
    for chunk in chunks:
        chunk_id = chunk["chunk_id"]
        page_label = f"[Page {chunk['page_number']}]"
        # Accept `[ id ]` and `【id】`: models vary their punctuation and spacing.
        marker_pattern = re.compile(rf"[\[【]\s*{re.escape(chunk_id)}\s*[\]】]")
        if marker_pattern.search(answer):
            cited_ids.add(chunk_id)
            answer = marker_pattern.sub(page_label, answer)
    # The first UI renders plain text, so remove common Markdown emphasis markers.
    return answer.replace("**", "").replace("__", ""), cited_ids


def _enrich_page_dimensions(chunks: list[dict], document_id: str | None) -> None:
    """Ensure all chunks have accurate page_width and page_height from the source PDF."""
    if not chunks or not document_id:
        return

    # Check if any chunk lacks dimensions
    needs_enrichment = any(c.get("page_width") is None or c.get("page_height") is None for c in chunks)
    if not needs_enrichment:
        return

    import pymupdf
    from app.services.storage import uploaded_path

    path = uploaded_path(str(document_id))
    if not path.is_file():
        return

    try:
        with pymupdf.open(path) as pdf:
            page_dims = {
                page_num: (float(page.rect.width), float(page.rect.height))
                for page_num, page in enumerate(pdf, start=1)
            }
            for chunk in chunks:
                pno = chunk.get("page_number", 1)
                if pno in page_dims:
                    w, h = page_dims[pno]
                    if chunk.get("page_width") is None:
                        chunk["page_width"] = w
                    if chunk.get("page_height") is None:
                        chunk["page_height"] = h
    except Exception:
        pass

