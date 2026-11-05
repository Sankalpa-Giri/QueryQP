# The purpose of this file is to orchestrate hybrid retrieval and reranking using LangGraph,
# fulfilling the left-hand path of the system architecture:
# User Question -> Query Processing -> [Vector Search + Keyword Search] -> Candidate Chunks -> Reranker -> Top Relevant Chunks.
#
# It queries both dense vector embeddings (Qdrant) and sparse keyword BM25 (FTS5)
# in parallel, fuses their rankings via Reciprocal Rank Fusion (RRF) to form Candidate Chunks,
# and then reranks them using a Cross-Encoder to produce high-precision Top Relevant Chunks.

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from app.query_processing import process_student_query
from app.query_processing.models import ProcessedQuery
from app.retrieval.keyword_store import search_keyword_chunks
from app.retrieval.reranker import rerank_chunks
from app.retrieval.vector_store import search_chunks

# Multiplier for retrieving candidate pool before fusion (e.g., fetch top 15 each to yield top 5)
CANDIDATE_POOL_MULTIPLIER = 3
# RRF smoothing constant (standard benchmark default from Cormack et al.)
RRF_K = 60


class RetrievalState(TypedDict):
    """Represents the state flowing through the hybrid retrieval and reranking graph."""
    question: str
    document_id: str | None
    limit: int
    processed_query: ProcessedQuery | None
    vector_results: list[dict[str, Any]]
    keyword_results: list[dict[str, Any]]
    candidate_chunks: list[dict[str, Any]]
    top_relevant_chunks: list[dict[str, Any]]


def process_query_node(state: RetrievalState) -> dict[str, Any]:
    """Node 1: Normalize query and extract search terms/phrases."""
    processed = process_student_query(state["question"])
    return {"processed_query": processed}


def vector_search_node(state: RetrievalState) -> dict[str, Any]:
    """Node 2a: Run semantic vector search against Qdrant."""
    processed = state.get("processed_query")
    if not processed:
        return {"vector_results": []}

    pool_size = max(state["limit"] * CANDIDATE_POOL_MULTIPLIER, 10)
    results = search_chunks(
        query=processed.semantic_query,
        limit=pool_size,
        document_id=state.get("document_id"),
    )
    return {"vector_results": results}


def keyword_search_node(state: RetrievalState) -> dict[str, Any]:
    """Node 2b: Run full-text keyword search against SQLite FTS5."""
    processed = state.get("processed_query")
    if not processed:
        return {"keyword_results": []}

    pool_size = max(state["limit"] * CANDIDATE_POOL_MULTIPLIER, 10)
    results = search_keyword_chunks(
        processed_query=processed,
        limit=pool_size,
        document_id=state.get("document_id"),
    )
    return {"keyword_results": results}


def candidate_fusion_node(state: RetrievalState) -> dict[str, Any]:
    """Node 3: Merge dense and sparse candidate chunks using Reciprocal Rank Fusion (RRF)."""
    vector_results = state.get("vector_results", [])
    keyword_results = state.get("keyword_results", [])
    # Form a larger candidate pool for the reranker to evaluate
    candidate_pool_limit = max(state.get("limit", 5) * CANDIDATE_POOL_MULTIPLIER, 10)

    fused_candidates = reciprocal_rank_fusion(
        retrieval_lists=[vector_results, keyword_results],
        weights=[1.0, 1.0],  # Equal weight for semantic and lexical signals
        k=RRF_K,
        limit=candidate_pool_limit,
    )
    return {"candidate_chunks": fused_candidates}


def reranker_node(state: RetrievalState) -> dict[str, Any]:
    """Node 4: Score candidate chunks against query using Cross-Encoder to produce Top Relevant Chunks."""
    candidates = state.get("candidate_chunks", [])
    if not candidates:
        return {"top_relevant_chunks": []}

    limit = state.get("limit", 5)
    top_chunks = rerank_chunks(
        query=state["question"],
        chunks=candidates,
        top_k=limit,
    )
    return {"top_relevant_chunks": top_chunks}


def reciprocal_rank_fusion(
    retrieval_lists: list[list[dict[str, Any]]],
    weights: list[float] | None = None,
    k: int = RRF_K,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Compute Reciprocal Rank Fusion scores across multiple ranked lists.

    Formula for each document d:
        RRF_score(d) = SUM_m [ weight_m / (k + rank_m(d)) ]

    Chunks retrieved by both semantic vector search and keyword search receive
    a high rank boost, capturing both semantic intent and exact terminology.
    """
    if weights is None:
        weights = [1.0] * len(retrieval_lists)

    scores: dict[str, float] = {}
    chunk_map: dict[str, dict[str, Any]] = {}

    for ranked_list, weight in zip(retrieval_lists, weights):
        for rank, chunk in enumerate(ranked_list, start=1):
            chunk_id = chunk["chunk_id"]
            if chunk_id not in chunk_map:
                chunk_map[chunk_id] = dict(chunk)

            # Accumulate the RRF contribution
            rrf_contribution = weight / (k + rank)
            scores[chunk_id] = scores.get(chunk_id, 0.0) + rrf_contribution

    # Sort chunks by fused RRF score descending
    sorted_chunk_ids = sorted(scores.keys(), key=lambda cid: scores[cid], reverse=True)

    results: list[dict[str, Any]] = []
    for cid in sorted_chunk_ids[:limit]:
        item = chunk_map[cid]
        # Attach the normalized fused score
        item["score"] = round(scores[cid], 5)
        results.append(item)

    return results


def _build_retrieval_graph() -> StateGraph:
    """Build and compile the LangGraph StateGraph representing hybrid retrieval and reranking."""
    builder = StateGraph(RetrievalState)

    # Register nodes
    builder.add_node("query_processing", process_query_node)
    builder.add_node("vector_search", vector_search_node)
    builder.add_node("keyword_search", keyword_search_node)
    builder.add_node("candidate_fusion", candidate_fusion_node)
    builder.add_node("reranker", reranker_node)

    # Define edges: Query Processing branches to Vector and Keyword search in parallel,
    # both converge into Candidate Fusion (RRF), then pass to Reranker.
    builder.add_edge(START, "query_processing")
    builder.add_edge("query_processing", "vector_search")
    builder.add_edge("query_processing", "keyword_search")
    builder.add_edge("vector_search", "candidate_fusion")
    builder.add_edge("keyword_search", "candidate_fusion")
    builder.add_edge("candidate_fusion", "reranker")
    builder.add_edge("reranker", END)

    return builder.compile()


# Compiled singleton instance for fast reuse across incoming HTTP requests
hybrid_retrieval_graph = _build_retrieval_graph()


def retrieve_top_chunks(
    question: str,
    document_id: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Convenient high-level entrypoint returning reranked Top Relevant Chunks.

    Executes the full compiled LangGraph workflow:
    1. Preprocesses the student question.
    2. Runs vector search and keyword search in parallel.
    3. Fuses both candidate streams via RRF into Candidate Chunks.
    4. Reranks Candidate Chunks using Cross-Encoder into Top Relevant Chunks.
    """
    initial_state: RetrievalState = {
        "question": question,
        "document_id": document_id,
        "limit": limit,
        "processed_query": None,
        "vector_results": [],
        "keyword_results": [],
        "candidate_chunks": [],
        "top_relevant_chunks": [],
    }

    final_state = hybrid_retrieval_graph.invoke(initial_state)
    return final_state["top_relevant_chunks"]


def retrieve_candidate_chunks(
    question: str,
    document_id: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Retrieve pre-reranking Candidate Chunks from the hybrid fusion stage.

    Useful for inspection, candidate diagnostics, or when reranking is bypassed.
    """
    initial_state: RetrievalState = {
        "question": question,
        "document_id": document_id,
        "limit": limit,
        "processed_query": None,
        "vector_results": [],
        "keyword_results": [],
        "candidate_chunks": [],
        "top_relevant_chunks": [],
    }

    final_state = hybrid_retrieval_graph.invoke(initial_state)
    return final_state["candidate_chunks"][:limit]
