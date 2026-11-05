# The purpose of this file is to provide a Cross-Encoder reranker module,
# fulfilling the "Reranker" stage in the architecture diagram.
#
# Unlike bi-encoders (which encode query and document independently), a Cross-Encoder
# feeds (query, chunk_text) together into transformer self-attention layers, computing
# a fine-grained relevance score that distinguishes true answers from lexical overlap.

from __future__ import annotations

import math
import os
from functools import lru_cache
from typing import Any

try:
    import torch
except ImportError:
    torch = None

try:
    from sentence_transformers import CrossEncoder
except ImportError:
    CrossEncoder = None

DEFAULT_RERANKER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"


@lru_cache(maxsize=1)
def get_reranker():
    """Instantiate and cache the CrossEncoder model singleton.

    Detects GPU (CUDA) if available; otherwise falls back gracefully to CPU.
    The model name can be overridden using the RERANKER_MODEL environment variable.
    """
    if CrossEncoder is None:
        raise RuntimeError("sentence-transformers is not installed.")
    model_name = os.getenv("RERANKER_MODEL", DEFAULT_RERANKER_MODEL)
    device = "cuda" if (torch is not None and torch.cuda.is_available()) else "cpu"
    return CrossEncoder(model_name, device=device)


def rerank_chunks(
    query: str,
    chunks: list[dict[str, Any]],
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """Score and reorder candidate chunks against the input query using the Cross-Encoder.

    Args:
        query: The user or student question.
        chunks: List of candidate chunk dictionaries containing 'text', 'chunk_id', etc.
        top_k: The number of highest-scoring chunks to return.

    Returns:
        A list of top_k chunk dictionaries sorted by descending relevance score,
        with 'score' updated to the normalized cross-encoder confidence and
        'raw_score' containing the uncalibrated model logit.
    """
    if not chunks or not query.strip():
        return chunks[:top_k]

    model = get_reranker()

    # Build input pairs for cross-attention evaluation: (query, candidate_document)
    pairs = [(query, chunk["text"]) for chunk in chunks]

    # Predict cross-encoder logits
    raw_scores = model.predict(pairs)

    reranked_chunks: list[dict[str, Any]] = []
    for chunk, logit in zip(chunks, raw_scores):
        updated_chunk = dict(chunk)
        float_logit = float(logit)

        # Normalize logit to a 0.0 - 1.0 confidence score via sigmoid
        # sigmoid(x) = 1 / (1 + exp(-x))
        confidence = 1.0 / (1.0 + math.exp(-float_logit))

        updated_chunk["raw_score"] = round(float_logit, 4)
        updated_chunk["score"] = round(confidence, 4)
        reranked_chunks.append(updated_chunk)

    # Sort descending by relevance score
    reranked_chunks.sort(key=lambda item: item["score"], reverse=True)

    return reranked_chunks[:top_k]
