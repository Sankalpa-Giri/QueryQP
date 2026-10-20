import math
import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models.document import QuestionPaper
from app.models.enums import ExamType, PublicationStatus
from app.models.question import Question
from app.models.subject import Subject
from app.retrieval.embeddings import embed_query

RRF_K = 60


@dataclass
class SearchResultItem:
    question_id: str
    question_number: str
    question_text: str
    subject_id: str
    subject_name: str
    subject_code: str
    exam_year: int
    exam_type: str
    source_filename: str
    document_id: str
    page_number: int
    page_end: int
    marks: float | None
    topics: list[str]
    bbox: list[float] | None
    score: float
    rank: int


def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Compute dot product / cosine similarity between normalized vectors."""
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    return sum(a * b for a, b in zip(vec_a, vec_b))


def _extract_search_tokens(query: str) -> list[str]:
    """Extract informative alphanumeric query terms, filtering common stop words."""
    stop_words = {
        "a", "an", "the", "in", "on", "of", "for", "to", "and", "or", "is", "are",
        "was", "were", "what", "how", "why", "give", "me", "questions", "question",
        "previous", "year", "pyq", "exam", "paper", "about", "with", "solve", "explain",
    }
    raw_tokens = re.findall(r"[a-zA-Z0-9]{2,}", query.lower())
    return [t for t in raw_tokens if t not in stop_words] or raw_tokens


def search_pyqs(
    db: Session,
    query_text: str,
    subject_id: str | None = None,
    min_year: int | None = None,
    max_year: int | None = None,
    exam_type: str | None = None,
    limit: int = 20,
) -> list[SearchResultItem]:
    """Execute hybrid retrieval (Vector Similarity + Keyword Search) with RRF fusion."""
    cleaned_query = query_text.strip()
    if not cleaned_query:
        return []

    # 1. Build base query with strict filtering
    base_filters = [Question.publication_status == PublicationStatus.PUBLISHED]

    if subject_id:
        base_filters.append(Question.subject_id == subject_id)

    # Join QuestionPaper for year and exam_type filters
    query_builder = db.query(Question, QuestionPaper, Subject).join(
        QuestionPaper, Question.document_id == QuestionPaper.id
    ).join(
        Subject, Question.subject_id == Subject.id
    ).filter(*base_filters)

    if min_year is not None:
        query_builder = query_builder.filter(QuestionPaper.exam_year >= min_year)
    if max_year is not None:
        query_builder = query_builder.filter(QuestionPaper.exam_year <= max_year)
    if exam_type:
        try:
            enum_type = ExamType(exam_type.upper())
            query_builder = query_builder.filter(QuestionPaper.exam_type == enum_type)
        except ValueError:
            pass

    eligible_rows = query_builder.all()
    if not eligible_rows:
        return []

    # 2. Keyword Ranking (BM25 token match approximation)
    tokens = _extract_search_tokens(cleaned_query)
    keyword_scores: dict[str, float] = {}

    for q, p, s in eligible_rows:
        text_lower = (q.normalized_text or q.question_text).lower()
        score = 0.0
        # Exact phrase bonus (very strong signal)
        if cleaned_query.lower() in text_lower:
            score += 10.0
        # Token hits with term frequency
        token_hits = 0
        for token in tokens:
            count = text_lower.count(token)
            if count > 0:
                score += 1.5 + math.log(count)
                token_hits += 1
        # All tokens present bonus
        if len(tokens) > 1 and token_hits == len(tokens):
            score += 5.0
        # Topics match bonus
        for top in (q.topics or []):
            if any(t in top.lower() for t in tokens):
                score += 3.0

        if score > 0:
            keyword_scores[q.id] = score

    # Sort keyword candidates
    sorted_keyword_ids = sorted(keyword_scores.keys(), key=lambda qid: keyword_scores[qid], reverse=True)

    # 3. Vector Similarity Ranking
    vector_scores: dict[str, float] = {}
    try:
        query_vec = embed_query(cleaned_query)
        if query_vec:
            for q, p, s in eligible_rows:
                if q.embedding_json:
                    sim = _cosine_similarity(query_vec, q.embedding_json)
                    # Dynamic relevance threshold:
                    # Candidates with keyword hits are confirmed matches (threshold 0.30)
                    # Candidates with zero keyword hits require strong semantic alignment (threshold 0.70)
                    threshold = 0.30 if q.id in keyword_scores else 0.70
                    if sim >= threshold:
                        vector_scores[q.id] = sim

    except Exception:
        # If embedding generation encounters an issue, proceed with keyword results
        pass


    sorted_vector_ids = sorted(vector_scores.keys(), key=lambda qid: vector_scores[qid], reverse=True)

    # 4. Reciprocal Rank Fusion (RRF)
    # RRF_score(d) = sum(1 / (k + rank(d)))
    rrf_scores: dict[str, float] = {}

    for rank, qid in enumerate(sorted_keyword_ids, start=1):
        rrf_scores[qid] = rrf_scores.get(qid, 0.0) + (1.0 / (RRF_K + rank))

    for rank, qid in enumerate(sorted_vector_ids, start=1):
        rrf_scores[qid] = rrf_scores.get(qid, 0.0) + (1.0 / (RRF_K + rank))

    # If no relevant hits from keyword or vector similarity, return empty list
    if not rrf_scores:
        return []

    final_ids = sorted(rrf_scores.keys(), key=lambda qid: rrf_scores[qid], reverse=True)[:limit]


    # Map row lookup
    row_map = {q.id: (q, p, s) for q, p, s in eligible_rows}
    results: list[SearchResultItem] = []

    for rank, qid in enumerate(final_ids, start=1):
        if qid not in row_map:
            continue
        q, p, s = row_map[qid]
        results.append(
            SearchResultItem(
                question_id=q.id,
                question_number=q.question_number,
                question_text=q.question_text,
                subject_id=s.id,
                subject_name=s.name,
                subject_code=s.code,
                exam_year=p.exam_year,
                exam_type=p.exam_type.value if hasattr(p.exam_type, "value") else str(p.exam_type),
                source_filename=p.filename,
                document_id=p.id,
                page_number=q.page_number,
                page_end=q.page_end,
                marks=q.marks,
                topics=q.topics or [],
                bbox=q.bbox,
                score=round(rrf_scores.get(qid, 0.0), 4),
                rank=rank,
            )
        )

    return results
