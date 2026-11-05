from functools import lru_cache
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from langchain_core.documents import Document

try:
    from langchain_qdrant import QdrantVectorStore
    from qdrant_client import QdrantClient, models
except ImportError:
    QdrantVectorStore = None
    QdrantClient = None
    models = None

from app.retrieval.embeddings import get_embeddings

COLLECTION_NAME = "document_chunks"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
QDRANT_DIRECTORY = PROJECT_ROOT / "data" / "qdrant"


@lru_cache(maxsize=1)
def _get_vector_store():
    """Initialize or reuse the local embedded QdrantVectorStore."""
    if QdrantVectorStore is None or QdrantClient is None:
        raise RuntimeError("Qdrant client or vectorstore is not installed.")
    QDRANT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    client = QdrantClient(path=str(QDRANT_DIRECTORY))

    return QdrantVectorStore(
        client=client,
        collection_name=COLLECTION_NAME,
        embedding=get_embeddings(),
    )


def index_chunks(chunks: list[dict]) -> int:
    """Embed and persist chunks with citation metadata using LangChain."""
    if not chunks:
        return 0

    vector_store = _get_vector_store()

    # Convert dictionary chunks to LangChain Document objects
    documents = [
        Document(
            page_content=chunk["text"],
            metadata={
                "chunk_id": chunk["chunk_id"],
                "document_id": chunk["document_id"],
                "page_number": chunk["page_number"],
                "page_width": chunk.get("page_width"),
                "page_height": chunk.get("page_height"),
                "bbox": chunk["bbox"],
                "source_element_ids": chunk["source_element_ids"],
            },
        )
        for chunk in chunks
    ]

    # Generate deterministic UUIDs preserving idempotent updates
    ids = [str(uuid5(NAMESPACE_URL, chunk["chunk_id"])) for chunk in chunks]

    # Embeds texts and upserts into Qdrant automatically
    vector_store.add_documents(documents=documents, ids=ids)
    return len(documents)


def search_chunks(query: str, limit: int = 5, document_id: str | None = None) -> list[dict]:
    """Find semantically similar chunks with metadata and similarity scores."""
    vector_store = _get_vector_store()

    # Optional metadata filter on document_id
    query_filter = None
    if document_id:
        query_filter = models.Filter(
            must=[models.FieldCondition(key="metadata.document_id", match=models.MatchValue(value=document_id))]
        )

    # similarity_search_with_score returns list[tuple[Document, float]]
    results = vector_store.similarity_search_with_score(
        query=query,
        k=limit,
        filter=query_filter,
    )

    # Reconstruct the exact return structure
    return [
        {
            "score": score,
            "text": doc.page_content,
            **doc.metadata,
        }
        for doc, score in results
    ]