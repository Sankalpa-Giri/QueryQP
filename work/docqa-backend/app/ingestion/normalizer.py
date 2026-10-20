import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from app.services.storage import normalized_destination


def write_canonical_document(
    document_id: UUID, filename: str, pages: list[dict], chunks: list[dict]
) -> Path:
    """Persist the stable internal format consumed by chunking and citations."""
    document = {
        "document_id": str(document_id),
        "filename": filename,
        "created_at": datetime.now(UTC).isoformat(),
        "pages": pages,
        "chunks": chunks,
    }
    destination = normalized_destination(document_id)
    destination.write_text(json.dumps(document, indent=2), encoding="utf-8")
    return destination
