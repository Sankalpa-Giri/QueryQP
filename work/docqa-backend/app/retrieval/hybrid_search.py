import math
import re
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from app.models.document import QuestionPaper
from app.models.enums import ExamType, PublicationStatus
from app.models.question import Question
from app.models.subject import Subject
from app.retrieval.embeddings import embed_query

RRF_K = 60
BM25_K1 = 1.5
BM25_B = 0.75


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
    repeat_count: int = 1
    appearances: list[str] = field(default_factory=list)


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
        "show", "from", "midsem", "endsem", "semester",
    }
    raw_tokens = re.findall(r"[a-zA-Z0-9]{2,}", query.lower())
    return [t for t in raw_tokens if t not in stop_words] or raw_tokens


def extract_nl_search_filters(query_text: str) -> dict[str, Any]:
    """Parse natural-language year, exam_type, and question_number hints from a student query."""
    lower = query_text.lower()
    inferred_year: int | None = None
    inferred_exam_type: str | None = None
    inferred_q_num: str | None = None

    year_match = re.search(r"\b(201[5-9]|202[0-9])\b", lower)
    if year_match:
        inferred_year = int(year_match.group(1))

    if re.search(r"\b(midsem|mid-sem|mid\s+sem)\b", lower):
        inferred_exam_type = "MIDSEM"
    elif re.search(r"\b(endsem|end-sem|end\s+sem)\b", lower):
        inferred_exam_type = "ENDSEM"

    q_match = re.search(r"\bq(?:uestion)?\.?\s*(\d{1,2}(?:\s*\([a-z0-9]+\))?)", lower)
    if q_match:
        raw_q = re.sub(r"\s+", "", q_match.group(1))
        inferred_q_num = f"Q{raw_q}".upper()

    return {
        "year": inferred_year,
        "exam_type": inferred_exam_type,
        "question_number": inferred_q_num,
    }


def compute_repeat_clusters(
    target_questions: list[tuple[Question, QuestionPaper, Subject]],
    all_subject_questions: list[tuple[Question, QuestionPaper, Subject]],
) -> dict[str, tuple[int, list[str]]]:
    """Identify historical repeat frequency across years for each returned question."""
    token_sets: dict[str, set[str]] = {}
    for q, p, _ in all_subject_questions:
        toks = set(_extract_search_tokens(q.normalized_text or q.question_text))
        token_sets[q.id] = toks

    repeat_map: dict[str, tuple[int, list[str]]] = {}
    for t_q, t_p, _ in target_questions:
        t_toks = token_sets.get(t_q.id) or set(_extract_search_tokens(t_q.question_text))
        appearances: list[str] = []
        seen_papers: set[str] = set()

        for cand_q, cand_p, _ in all_subject_questions:
            if cand_q.subject_id != t_q.subject_id:
                continue
            is_match = False
            if cand_q.id == t_q.id:
                is_match = True
            else:
                if t_q.embedding_json and cand_q.embedding_json:
                    sim = _cosine_similarity(t_q.embedding_json, cand_q.embedding_json)
                    if sim >= 0.78:
                        is_match = True
                if not is_match and t_toks:
                    c_toks = token_sets.get(cand_q.id, set())
                    if c_toks:
                        union_len = len(t_toks | c_toks)
                        if union_len > 0 and (len(t_toks & c_toks) / union_len) >= 0.50:
                            is_match = True

            if is_match:
                etype = cand_p.exam_type.value if hasattr(cand_p.exam_type, "value") else str(cand_p.exam_type)
                label = f"{cand_p.exam_year} {etype} ({cand_q.question_number})"
                paper_key = f"{cand_p.id}:{cand_q.question_number}"
                if paper_key not in seen_papers:
                    seen_papers.add(paper_key)
                    appearances.append(label)

        appearances.sort(reverse=True)
        repeat_map[t_q.id] = (max(1, len(appearances)), appearances)

    return repeat_map


def search_pyqs(
    db: Session,
    query_text: str,
    subject_id: str | None = None,
    min_year: int | None = None,
    max_year: int | None = None,
    exam_type: str | None = None,
    limit: int = 20,
) -> list[SearchResultItem]:
    """Execute hybrid retrieval (Okapi BM25 + BGE Vector Similarity) with RRF fusion and repeat clustering."""
    cleaned_query = query_text.strip()
    if not cleaned_query:
        return []

    nl_hints = extract_nl_search_filters(cleaned_query)

    # 1. Build base query with strict filtering
    base_filters = [Question.publication_status == PublicationStatus.PUBLISHED]

    if subject_id:
        base_filters.append(Question.subject_id == subject_id)

    query_builder = (
        db.query(Question, QuestionPaper, Subject)
        .join(QuestionPaper, Question.document_id == QuestionPaper.id)
        .join(Subject, Question.subject_id == Subject.id)
        .filter(*base_filters)
    )

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

    # 2. True Okapi BM25 Lexical Ranking + Domain Boosts
    tokens = _extract_search_tokens(cleaned_query)
    num_docs = len(eligible_rows)

    doc_tokens_map: dict[str, list[str]] = {}
    df_counts: dict[str, int] = {t: 0 for t in tokens}
    total_len = 0

    for q, p, s in eligible_rows:
        text_lower = (q.normalized_text or q.question_text).lower()
        d_toks = re.findall(r"[a-zA-Z0-9]{2,}", text_lower)
        doc_tokens_map[q.id] = d_toks
        total_len += max(1, len(d_toks))
        unique_d_toks = set(d_toks)
        for t in tokens:
            if t in unique_d_toks or t in text_lower:
                df_counts[t] = df_counts.get(t, 0) + 1

    avgdl = max(1.0, total_len / max(1, num_docs))
    keyword_scores: dict[str, float] = {}

    for q, p, s in eligible_rows:
        text_lower = (q.normalized_text or q.question_text).lower()
        d_toks = doc_tokens_map[q.id]
        doc_len = max(1, len(d_toks))
        score = 0.0

        # Exact phrase bonus
        if cleaned_query.lower() in text_lower:
            score += 10.0

        # Natural-language metadata alignment bonuses (soft boost so strict tests still work)
        if nl_hints["year"] and p.exam_year == nl_hints["year"]:
            score += 3.5
        if nl_hints["exam_type"]:
            p_etype = p.exam_type.value if hasattr(p.exam_type, "value") else str(p.exam_type)
            if p_etype.upper() == nl_hints["exam_type"]:
                score += 2.5
        if nl_hints["question_number"] and q.question_number.upper().startswith(nl_hints["question_number"]):
            score += 8.0

        token_hits = 0
        for token in tokens:
            tf = d_toks.count(token) or text_lower.count(token)
            if tf > 0:
                df = df_counts.get(token, 1)
                idf = math.log(1.0 + (num_docs - df + 0.5) / (df + 0.5))
                denom = tf + BM25_K1 * (1.0 - BM25_B + BM25_B * (doc_len / avgdl))
                bm25_term = idf * ((tf * (BM25_K1 + 1.0)) / max(0.001, denom))
                score += max(0.5, bm25_term) + 1.0
                token_hits += 1

        if len(tokens) > 1 and token_hits == len(tokens):
            score += 5.0

        for top in (q.topics or []):
            if any(t in top.lower() for t in tokens):
                score += 3.0

        if score > 0:
            keyword_scores[q.id] = score

    sorted_keyword_ids = sorted(keyword_scores.keys(), key=lambda qid: keyword_scores[qid], reverse=True)

    # 3. Vector Similarity Ranking
    vector_scores: dict[str, float] = {}
    try:
        query_vec = embed_query(cleaned_query)
        if query_vec:
            for q, p, s in eligible_rows:
                if q.embedding_json:
                    sim = _cosine_similarity(query_vec, q.embedding_json)
                    threshold = 0.30 if q.id in keyword_scores else 0.70
                    if sim >= threshold:
                        vector_scores[q.id] = sim
    except Exception:
        pass

    sorted_vector_ids = sorted(vector_scores.keys(), key=lambda qid: vector_scores[qid], reverse=True)

    # 4. Reciprocal Rank Fusion (RRF)
    rrf_scores: dict[str, float] = {}

    for rank, qid in enumerate(sorted_keyword_ids, start=1):
        rrf_scores[qid] = rrf_scores.get(qid, 0.0) + (1.0 / (RRF_K + rank))

    for rank, qid in enumerate(sorted_vector_ids, start=1):
        rrf_scores[qid] = rrf_scores.get(qid, 0.0) + (1.0 / (RRF_K + rank))

    if not rrf_scores:
        return []

    final_ids = sorted(rrf_scores.keys(), key=lambda qid: rrf_scores[qid], reverse=True)[:limit]

    row_map = {q.id: (q, p, s) for q, p, s in eligible_rows}
    selected_rows = [row_map[qid] for qid in final_ids if qid in row_map]
    repeat_map = compute_repeat_clusters(selected_rows, eligible_rows)

    results: list[SearchResultItem] = []
    for rank, qid in enumerate(final_ids, start=1):
        if qid not in row_map:
            continue
        q, p, s = row_map[qid]
        rep_cnt, rep_apps = repeat_map.get(qid, (1, []))
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
                repeat_count=rep_cnt,
                appearances=rep_apps,
            )
        )

    return results
