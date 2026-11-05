from functools import lru_cache
import torch
from langchain_huggingface import HuggingFaceEmbeddings
MODEL_NAME = "BAAI/bge-small-en-v1.5"


@lru_cache(maxsize=1)
def get_embeddings() -> HuggingFaceEmbeddings:
    """Instantiate the LangChain HuggingFaceEmbeddings wrapper once."""
    device = "cuda" if torch.cuda.is_available() else "cpu"
    return HuggingFaceEmbeddings(
        model_name=MODEL_NAME,
        model_kwargs={"device": device},          # or "cuda" if GPU is available
        encode_kwargs={"normalize_embeddings": True},  # unit L2 norm
    )


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of documents or chunks."""
    if not texts:
        return []
    return get_embeddings().embed_documents(texts)


def embed_query(query: str) -> list[float]:
    """Embed a single search query string."""
    if not query:
        return []
    return get_embeddings().embed_query(query)