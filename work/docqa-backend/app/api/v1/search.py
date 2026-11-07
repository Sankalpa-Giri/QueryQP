import math
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.cache import get_cached_search, make_search_cache_key, set_cached_search
from app.db.session import get_db
from app.models.document import QuestionPaper
from app.models.enums import ExamType, PublicationStatus
from app.models.question import Question, Topic
from app.models.subject import Subject
from app.retrieval.hybrid_search import search_pyqs
from app.schemas.question import QuestionResponse
from app.schemas.search import (
    FiltersApplied,
    PaginationInfo,
    SearchRequest,
    SearchResponse,
    SearchSuggestionsResponse,
)

router = APIRouter(prefix="/search", tags=["search-student"])


@router.post("", response_model=SearchResponse)
def execute_student_search(payload: SearchRequest, db: Session = Depends(get_db)) -> SearchResponse:
    """Execute hybrid semantic + keyword search for student topic questions."""
    # 1. Normalize and validate subject_id
    effective_subject_id = payload.subject_id
    if effective_subject_id in (None, "", "all", "ALL"):
        effective_subject_id = None

    subject_name = None
    if effective_subject_id:
        subj = db.query(Subject).filter(Subject.id == effective_subject_id).first()
        if not subj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Subject with ID '{payload.subject_id}' not found.",
            )
        subject_name = subj.name

    # 2. Harmonize and validate academic year boundaries
    effective_min_year = payload.from_year if payload.from_year is not None else payload.min_year
    effective_max_year = payload.to_year if payload.to_year is not None else payload.max_year

    if effective_min_year is not None and effective_max_year is not None:
        if effective_min_year > effective_max_year:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid academic year range: from_year ({effective_min_year}) cannot be greater than to_year ({effective_max_year}).",
            )

    # 3. Validate exam_type
    effective_exam_type: str | None = None
    if payload.exam_type:
        cleaned_etype = payload.exam_type.strip().upper()
        if cleaned_etype == "ALL":
            effective_exam_type = None
        elif cleaned_etype in ("MIDSEM", "ENDSEM"):
            effective_exam_type = cleaned_etype
        else:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid exam_type '{payload.exam_type}'. Allowed values are ALL, MIDSEM, or ENDSEM.",
            )

    # 4. Check Redis / Memory Query Cache (Instant < 1ms response for repeated searches)
    cache_key = make_search_cache_key(
        query=payload.query,
        subject_id=effective_subject_id,
        min_year=effective_min_year,
        max_year=effective_max_year,
        exam_type=effective_exam_type,
        page=payload.page,
        page_size=payload.page_size,
    )
    cached_data = get_cached_search(cache_key)
    if cached_data:
        return SearchResponse.model_validate(cached_data)

    # 5. Execute hybrid retrieval
    ranked_items = search_pyqs(
        db=db,
        query_text=payload.query,
        subject_id=effective_subject_id,
        min_year=effective_min_year,
        max_year=effective_max_year,
        exam_type=effective_exam_type,
        limit=payload.page_size * payload.page,
    )

    total_results = len(ranked_items)
    total_pages = math.ceil(total_results / payload.page_size) if total_results > 0 else 0

    # Paginate results
    start_idx = (payload.page - 1) * payload.page_size
    page_items = ranked_items[start_idx : start_idx + payload.page_size]

    results: list[QuestionResponse] = []
    for item in page_items:
        q = db.query(Question).filter(Question.id == item.question_id).first()
        if q:
            resp = QuestionResponse.model_validate(q)
            resp.subject_name = item.subject_name
            resp.subject_code = item.subject_code
            resp.exam_year = item.exam_year
            resp.exam_type = item.exam_type
            resp.source_filename = item.source_filename
            resp.review_status = q.review_status.value
            resp.publication_status = q.publication_status.value
            resp.repeat_count = item.repeat_count
            resp.appearances = item.appearances
            resp.relevance_score = item.score
            results.append(resp)

    # 5. Build informative user feedback message
    if total_results > 0:
        scope_str = f" in {subject_name}" if subject_name else " across all subjects"
        message = f"Found {total_results} relevant question{'s' if total_results != 1 else ''} for '{payload.query}'{scope_str}."
    else:
        if effective_subject_id:
            has_published = (
                db.query(Question)
                .filter(
                    Question.subject_id == effective_subject_id,
                    Question.publication_status == PublicationStatus.PUBLISHED,
                )
                .first()
            )
            if not has_published:
                message = f"No examination questions are currently published for {subject_name}."
            else:
                paper_q = db.query(QuestionPaper).filter(
                    QuestionPaper.subject_id == effective_subject_id,
                    QuestionPaper.publication_status == PublicationStatus.PUBLISHED,
                )
                if effective_min_year:
                    paper_q = paper_q.filter(QuestionPaper.exam_year >= effective_min_year)
                if effective_max_year:
                    paper_q = paper_q.filter(QuestionPaper.exam_year <= effective_max_year)
                if effective_exam_type:
                    paper_q = paper_q.filter(QuestionPaper.exam_type == ExamType(effective_exam_type))

                if not paper_q.first():
                    message = f"No questions found for {subject_name} within the selected examination type or academic year range."
                else:
                    message = f"No questions matching '{payload.query}' were found in {subject_name}. Try related topic keywords."
        else:
            message = f"No questions matching '{payload.query}' were found across all subjects. Try broader keywords or adjust filters."

    filters_applied = FiltersApplied(
        subject_id=effective_subject_id,
        subject_name=subject_name,
        from_year=effective_min_year,
        to_year=effective_max_year,
        exam_type=effective_exam_type,
    )

    pagination = PaginationInfo(
        page=payload.page,
        page_size=payload.page_size,
        total_results=total_results,
        total_pages=total_pages,
        has_next=payload.page < total_pages,
        has_prev=payload.page > 1 and total_pages > 0,
    )

    response_obj = SearchResponse(
        query=payload.query,
        subject_id=effective_subject_id,
        subject_name=subject_name,
        total_results=total_results,
        page=payload.page,
        page_size=payload.page_size,
        results=results,
        filters_applied=filters_applied,
        pagination=pagination,
        message=message,
    )
    # Cache result for 5 minutes (300 seconds)
    set_cached_search(cache_key, response_obj.model_dump(mode="json"), ttl_seconds=300)
    return response_obj


@router.get("/suggestions", response_model=SearchSuggestionsResponse)
def get_search_suggestions(
    subject_id: str | None = None,
    limit: int = 10,
    db: Session = Depends(get_db),
) -> SearchSuggestionsResponse:
    """Retrieve suggested search query topics scoped by subject or cross-curriculum."""
    effective_id = subject_id
    if effective_id in (None, "", "all", "ALL"):
        effective_id = None

    if effective_id:
        subj = db.query(Subject).filter(Subject.id == effective_id).first()
        if not subj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Subject with ID '{subject_id}' not found.",
            )
        topics = (
            db.query(Topic.name)
            .filter(Topic.subject_id == subj.id)
            .order_by(Topic.name.asc())
            .limit(limit)
            .all()
        )
        suggestions = [t[0] for t in topics]
        return SearchSuggestionsResponse(
            subject_id=subj.id,
            subject_name=subj.name,
            suggestions=suggestions,
        )

    # Cross-subject curated suggestions
    cross_curriculum = [
        "Linked Lists",
        "Binary Search Trees",
        "CPU Scheduling",
        "Deadlocks",
        "Normalization",
        "SQL Joins",
        "AVL Trees",
        "Hashing",
        "Agile Scrum",
        "Transformers",
    ]
    return SearchSuggestionsResponse(
        subject_id=None,
        subject_name="All Subjects",
        suggestions=cross_curriculum[:limit],
    )



@router.get("/filters")
def get_search_filters(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Retrieve available subjects, exam years, and exam types for filtering."""
    subjects = (
        db.query(Subject.id, Subject.name, Subject.code, func.count(Question.id).label("question_count"))
        .outerjoin(
            Question,
            (Question.subject_id == Subject.id) & (Question.publication_status == PublicationStatus.PUBLISHED),
        )
        .filter(Subject.is_active.is_(True))
        .group_by(Subject.id, Subject.name, Subject.code)
        .order_by(Subject.name.asc())
        .all()
    )

    years = (
        db.query(QuestionPaper.exam_year)
        .filter(QuestionPaper.publication_status == PublicationStatus.PUBLISHED)
        .distinct()
        .order_by(QuestionPaper.exam_year.desc())
        .all()
    )

    total_q = (
        db.query(func.count(Question.id))
        .filter(Question.publication_status == PublicationStatus.PUBLISHED)
        .scalar()
        or 0
    )

    return {
        "subjects": [
            {"id": s.id, "name": s.name, "code": s.code, "question_count": s.question_count}
            for s in subjects
        ],
        "years": [y[0] for y in years if y[0]],
        "exam_types": ["MIDSEM", "ENDSEM"],
        "total_published_questions": total_q,
    }
