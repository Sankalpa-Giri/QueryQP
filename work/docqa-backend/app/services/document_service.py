from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import HTTPException, UploadFile, status

from app.ingestion.chunker import chunk_pages
from app.ingestion.normalizer import write_canonical_document
from app.ingestion.router import extract_document
from app.retrieval.keyword_store import index_keyword_chunks
from app.retrieval.vector_store import index_chunks
from app.schemas.document import DocumentResponse, ProcessingStatus
from app.services.storage import save_upload

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
documents: dict[UUID, DocumentResponse] = {}


def create_document(file: UploadFile) -> DocumentResponse:
    document_id = uuid4()
    uploaded_path = save_upload(document_id, file) #type: ignore
    file_size = uploaded_path.stat().st_size
    if file_size > MAX_UPLOAD_BYTES:
        uploaded_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="The maximum upload size is 25 MB.",
        )

    document = DocumentResponse(
        id=document_id,
        filename=file.filename or "upload.pdf",
        content_type="application/pdf",
        size_bytes=file_size,
        processing_status=ProcessingStatus.PROCESSING,
        created_at=datetime.now(UTC),
    )
    documents[document_id] = document

    try:
        pages = extract_document(uploaded_path)
        chunks = chunk_pages(document_id, pages)
        normalized_path = write_canonical_document(document_id, document.filename, pages, chunks)
        # Index in parallel stores: Qdrant for semantic search, SQLite FTS5 for keyword search
        document.indexed_chunk_count = index_chunks(chunks)
        index_keyword_chunks(chunks)
        document.processing_status = ProcessingStatus.READY
        document.page_count = len(pages)
        document.chunk_count = len(chunks)
        document.normalized_path = str(normalized_path)
    except Exception as error:
        document.processing_status = ProcessingStatus.FAILED
        document.error = str(error)
    return document


def get_document(document_id: UUID) -> DocumentResponse | None:
    return documents.get(document_id)
