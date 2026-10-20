from typing import Any
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.cache import invalidate_search_cache
from app.core.security import get_current_admin_user
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.document import QuestionPaper
from app.models.enums import ExamType, PublicationStatus, ReviewStatus
from app.models.question import Question, QuestionTopic, Topic
from app.models.subject import Subject
from app.retrieval.embeddings import embed_texts
from app.schemas.question import QuestionResponse, QuestionUpdate
from app.services.subject_service import assign_question_topics, classify_question_topics

admin_router = APIRouter(prefix="/admin/questions", tags=["admin-questions"])
public_router = APIRouter(prefix="/questions", tags=["questions-public"])


def _to_question_response(q: Question, doc: QuestionPaper, subj: Subject) -> QuestionResponse:
    resp = QuestionResponse.model_validate(q)
    resp.subject_name = subj.name
    resp.subject_code = subj.code
    resp.exam_year = doc.exam_year
    resp.exam_type = doc.exam_type.value if hasattr(doc.exam_type, "value") else str(doc.exam_type)
    resp.source_filename = doc.filename
    resp.review_status = q.review_status.value if hasattr(q.review_status, "value") else str(q.review_status)
    resp.publication_status = (
        q.publication_status.value if hasattr(q.publication_status, "value") else str(q.publication_status)
    )
    return resp


class BulkApproveRequest(BaseModel):
    question_ids: list[str]


class QuestionCreate(BaseModel):
    document_id: str
    question_number: str
    question_text: str
    marks: float | None = None
    page_number: int = 1
    topics: list[str] = []


class QuestionSplitPart(BaseModel):
    question_number: str
    question_text: str
    marks: float | None = None
    topics: list[str] = []
    page_number: int | None = None


class QuestionSplitRequest(BaseModel):
    parts: list[QuestionSplitPart]


@admin_router.get("", response_model=list[QuestionResponse])
def list_questions_admin(
    subject_id: str | None = None,
    document_id: str | None = None,
    exam_year: int | None = None,
    exam_type: str | None = None,
    publication_status: str | None = None,
    review_status: str | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> list[QuestionResponse]:
    """Search and filter question bank records for admin inspection and review."""
    query = db.query(Question, QuestionPaper, Subject).join(
        QuestionPaper, Question.document_id == QuestionPaper.id
    ).join(
        Subject, Question.subject_id == Subject.id
    )

    if subject_id:
        query = query.filter(Question.subject_id == subject_id)
    if document_id:
        query = query.filter(Question.document_id == document_id)
    if exam_year:
        query = query.filter(QuestionPaper.exam_year == exam_year)

    if exam_type:
        try:
            query = query.filter(QuestionPaper.exam_type == ExamType(exam_type.upper()))
        except ValueError:
            pass
    if publication_status:
        try:
            query = query.filter(Question.publication_status == PublicationStatus(publication_status.upper()))
        except ValueError:
            pass
    if review_status:
        try:
            query = query.filter(Question.review_status == ReviewStatus(review_status.upper()))
        except ValueError:
            pass
    if search:
        query = query.filter(Question.question_text.ilike(f"%{search.strip()}%"))

    rows = query.order_by(Question.created_at.desc()).offset(skip).limit(limit).all()
    return [_to_question_response(q, doc, subj) for q, doc, subj in rows]


@admin_router.post("", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
def create_question_admin(
    payload: QuestionCreate,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> QuestionResponse:
    """Manually create a question or subquestion bit and add directly to Question Bank."""
    doc = db.query(QuestionPaper).filter(QuestionPaper.id == payload.document_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target question paper not found.")

    subj = db.query(Subject).filter(Subject.id == doc.subject_id).first()
    if not subj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated subject not found.")

    raw_topics = [t.strip() for t in payload.topics if t.strip()]
    auto_topics = classify_question_topics(subj.code, payload.question_text)
    combined_topics = list(dict.fromkeys(raw_topics + auto_topics))

    q = Question(
        id=str(uuid.uuid4()),
        document_id=doc.id,
        subject_id=doc.subject_id,
        question_number=payload.question_number.strip(),
        question_text=payload.question_text.strip(),
        normalized_text=payload.question_text.strip().lower(),
        page_number=payload.page_number,
        page_end=payload.page_number,
        marks=payload.marks,
        topics=combined_topics,
        review_status=ReviewStatus.APPROVED,
        publication_status=PublicationStatus.PUBLISHED,
    )

    try:
        emb = embed_texts([payload.question_text.strip()])
        if emb:
            q.embedding_json = emb[0]
    except Exception:
        pass

    db.add(q)
    db.flush()

    for t_name in combined_topics:
        topic_record = db.query(Topic).filter(
            Topic.subject_id == subj.id,
            func.lower(Topic.name) == t_name.lower(),
        ).first()
        if not topic_record:
            topic_record = Topic(
                id=str(uuid.uuid4()),
                subject_id=subj.id,
                name=t_name,
            )
            db.add(topic_record)
            db.flush()

        existing_assoc = db.query(QuestionTopic).filter(
            QuestionTopic.question_id == q.id,
            QuestionTopic.topic_id == topic_record.id,
        ).first()
        if not existing_assoc:
            qt = QuestionTopic(
                question_id=q.id,
                topic_id=topic_record.id,
            )
            db.add(qt)

    doc.question_count = db.query(Question).filter(Question.document_id == doc.id).count()

    audit = AuditLog(
        admin_id=admin["id"],
        entity_type="QUESTION",
        entity_id=q.id,
        action="CREATE_MANUAL_PUBLISH",
        changes_json={"question_number": q.question_number, "document_id": q.document_id, "topics": q.topics},
    )
    db.add(audit)
    db.commit()
    invalidate_search_cache()
    db.refresh(q)
    return _to_question_response(q, doc, subj)


@admin_router.post("/{question_id}/split", response_model=list[QuestionResponse])
def split_question_admin(
    question_id: str,
    payload: QuestionSplitRequest,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> list[QuestionResponse]:
    """Split a combined/mixed question into multiple individual subquestion bits."""
    if len(payload.parts) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Must provide at least 2 parts to split a question.")

    row = (
        db.query(Question, QuestionPaper, Subject)
        .join(QuestionPaper, Question.document_id == QuestionPaper.id)
        .join(Subject, Question.subject_id == Subject.id)
        .filter(Question.id == question_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")

    orig_q, doc, subj = row

    created_questions: list[Question] = []
    texts_to_embed: list[str] = []

    for part in payload.parts:
        p_num = part.page_number if part.page_number is not None else orig_q.page_number
        part_text = part.question_text.strip()
        new_q = Question(
            id=str(uuid.uuid4()),
            document_id=doc.id,
            subject_id=doc.subject_id,
            question_number=part.question_number.strip(),
            question_text=part_text,
            normalized_text=part_text.lower(),
            page_number=p_num,
            page_end=p_num,
            marks=part.marks,
            bbox=orig_q.bbox,
            topics=part.topics if part.topics else list(orig_q.topics or []),
            review_status=orig_q.review_status,
            publication_status=orig_q.publication_status,
        )
        texts_to_embed.append(part_text)
        db.add(new_q)
        created_questions.append(new_q)

    db.flush()

    try:
        embeddings = embed_texts(texts_to_embed)
        for q_obj, emb in zip(created_questions, embeddings):
            q_obj.embedding_json = emb
    except Exception:
        pass

    for q_obj in created_questions:
        assign_question_topics(db, q_obj, subj)

    # Record audit log
    audit = AuditLog(
        admin_id=admin["id"],
        entity_type="QUESTION",
        entity_id=orig_q.id,
        action="SPLIT",
        changes_json={
            "original_number": orig_q.question_number,
            "split_into": [p.question_number for p in payload.parts],
        },
    )
    db.add(audit)

    # Delete original mixed question
    db.delete(orig_q)
    db.commit()
    invalidate_search_cache()

    return [_to_question_response(q, doc, subj) for q in created_questions]


@admin_router.get("/{question_id}", response_model=QuestionResponse)
def get_question_admin(
    question_id: str,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> QuestionResponse:
    """Fetch specific question details."""
    row = (
        db.query(Question, QuestionPaper, Subject)
        .join(QuestionPaper, Question.document_id == QuestionPaper.id)
        .join(Subject, Question.subject_id == Subject.id)
        .filter(Question.id == question_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")
    q, doc, subj = row
    return _to_question_response(q, doc, subj)


@admin_router.patch("/{question_id}", response_model=QuestionResponse)
def update_question_admin(
    question_id: str,
    payload: QuestionUpdate,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> QuestionResponse:
    """Correct question text, marks, topic associations, or review status."""
    row = (
        db.query(Question, QuestionPaper, Subject)
        .join(QuestionPaper, Question.document_id == QuestionPaper.id)
        .join(Subject, Question.subject_id == Subject.id)
        .filter(Question.id == question_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")
    q, doc, subj = row

    # Optimistic concurrency check: prevent Admin A from silently overwriting Admin B's edits
    if payload.expected_updated_at is not None and q.updated_at is not None:
        q_time = q.updated_at.replace(tzinfo=None)
        exp_time = payload.expected_updated_at.replace(tzinfo=None)
        if (q_time - exp_time).total_seconds() > 1.0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This question was updated by another administrator. Please refresh the question before saving to avoid overwriting their changes.",
            )

    changes: dict[str, Any] = {}
    if payload.question_number is not None:
        changes["question_number"] = {"old": q.question_number, "new": payload.question_number}
        q.question_number = payload.question_number
    if payload.question_text is not None:
        changes["question_text"] = {"old": q.question_text, "new": payload.question_text}
        q.question_text = payload.question_text
        q.normalized_text = payload.question_text.lower().strip()
        # Refresh embedding if text changed
        try:
            emb = embed_texts([payload.question_text])
            if emb:
                q.embedding_json = emb[0]
        except Exception:
            pass
    if payload.marks is not None:
        changes["marks"] = {"old": q.marks, "new": payload.marks}
        q.marks = payload.marks
    if payload.topics is not None:
        clean_topics = [t.strip() for t in payload.topics if t and t.strip()]
        changes["topics"] = {"old": q.topics, "new": clean_topics}
        q.topics = clean_topics
        # Sync QuestionTopic associations and ensure Topic records exist
        db.query(QuestionTopic).filter(QuestionTopic.question_id == q.id).delete()
        for t_name in clean_topics:
            topic_record = db.query(Topic).filter(
                Topic.subject_id == q.subject_id,
                func.lower(Topic.name) == t_name.lower(),
            ).first()
            if not topic_record:
                topic_record = Topic(
                    id=str(uuid.uuid4()),
                    subject_id=q.subject_id,
                    name=t_name,
                )
                db.add(topic_record)
                db.flush()
            qt = QuestionTopic(
                question_id=q.id,
                topic_id=topic_record.id,
            )
            db.add(qt)
    if payload.review_status is not None:
        try:
            q.review_status = ReviewStatus(payload.review_status.upper())
            changes["review_status"] = q.review_status.value
        except ValueError:
            pass
    if payload.publication_status is not None:
        try:
            q.publication_status = PublicationStatus(payload.publication_status.upper())
            changes["publication_status"] = q.publication_status.value
        except ValueError:
            pass

    # Record audit log
    if changes:
        audit = AuditLog(
            admin_id=admin["id"],
            entity_type="QUESTION",
            entity_id=q.id,
            action="UPDATE",
            changes_json=changes,
        )
        db.add(audit)

    db.commit()
    invalidate_search_cache()
    db.refresh(q)
    return _to_question_response(q, doc, subj)


@admin_router.post("/{question_id}/approve", response_model=QuestionResponse)
def approve_question_admin(
    question_id: str,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> QuestionResponse:
    """Mark question review status as APPROVED and move to Question Bank (PUBLISHED)."""
    resp = update_question_admin(
        question_id,
        QuestionUpdate(review_status="APPROVED", publication_status="PUBLISHED"),
        db,
        admin,
    )
    # If all questions in the document are approved, mark document published
    q = db.query(Question).filter(Question.id == question_id).first()
    if q:
        doc = db.query(QuestionPaper).filter(QuestionPaper.id == q.document_id).first()
        if doc:
            unapproved = (
                db.query(Question)
                .filter(
                    Question.document_id == doc.id,
                    Question.review_status != ReviewStatus.APPROVED,
                )
                .count()
            )
            if unapproved == 0:
                doc.publication_status = PublicationStatus.PUBLISHED
                db.commit()
    return resp


@admin_router.post("/bulk-approve", response_model=dict[str, Any])
def bulk_approve_questions_admin(
    payload: BulkApproveRequest,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> dict[str, Any]:
    """Bulk approve multiple staged questions at once, moving them to Question Bank."""
    approved_count = 0
    doc_ids_to_check: set[str] = set()

    for q_id in payload.question_ids:
        q = db.query(Question).filter(Question.id == q_id).first()
        if q:
            q.review_status = ReviewStatus.APPROVED
            q.publication_status = PublicationStatus.PUBLISHED
            doc_ids_to_check.add(q.document_id)
            approved_count += 1

    for doc_id in doc_ids_to_check:
        doc = db.query(QuestionPaper).filter(QuestionPaper.id == doc_id).first()
        if doc:
            unapproved = (
                db.query(Question)
                .filter(
                    Question.document_id == doc.id,
                    Question.review_status != ReviewStatus.APPROVED,
                )
                .count()
            )
            if unapproved == 0:
                doc.publication_status = PublicationStatus.PUBLISHED

    db.commit()
    invalidate_search_cache()
    return {"status": "ok", "approved_count": approved_count}


@admin_router.post("/document/{document_id}/approve-all", response_model=dict[str, Any])
def approve_all_questions_in_document(
    document_id: str,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> dict[str, Any]:
    """Approve all staged questions for a specific document, moving them to Question Bank."""
    doc = db.query(QuestionPaper).filter(QuestionPaper.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    count = (
        db.query(Question)
        .filter(Question.document_id == document_id)
        .update(
            {
                Question.review_status: ReviewStatus.APPROVED,
                Question.publication_status: PublicationStatus.PUBLISHED,
            }
        )
    )
    doc.publication_status = PublicationStatus.PUBLISHED
    db.commit()
    invalidate_search_cache()
    return {"status": "ok", "document_id": document_id, "approved_count": count}



@admin_router.post("/{question_id}/publish", response_model=QuestionResponse)
def publish_question_admin(
    question_id: str,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> QuestionResponse:
    """Make question published and visible to students."""
    return update_question_admin(question_id, QuestionUpdate(publication_status="PUBLISHED"), db, admin)


@admin_router.post("/{question_id}/unpublish", response_model=QuestionResponse)
def unpublish_question_admin(
    question_id: str,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> QuestionResponse:
    """Unpublish question to hide from student search."""
    return update_question_admin(question_id, QuestionUpdate(publication_status="UNPUBLISHED"), db, admin)


@admin_router.delete("/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_question_admin(
    question_id: str,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> None:
    """Delete question record and log audit trail."""
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")

    audit = AuditLog(
        admin_id=admin["id"],
        entity_type="QUESTION",
        entity_id=q.id,
        action="DELETE",
        changes_json={"question_text": q.question_text, "question_number": q.question_number},
    )
    db.add(audit)
    db.delete(q)
    db.commit()
    invalidate_search_cache()


# ================= Student Public Question Endpoints =================


@public_router.get("", response_model=list[QuestionResponse])
def list_public_questions(
    subject_id: str | None = None,
    exam_year: int | None = None,
    exam_type: str | None = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
) -> list[QuestionResponse]:
    """Public student endpoint retrieving published question records with filters."""
    query = (
        db.query(Question, QuestionPaper, Subject)
        .join(QuestionPaper, Question.document_id == QuestionPaper.id)
        .join(Subject, Question.subject_id == Subject.id)
        .filter(Question.publication_status == PublicationStatus.PUBLISHED)
    )
    if subject_id:
        query = query.filter(Question.subject_id == subject_id)
    if exam_year:
        query = query.filter(QuestionPaper.exam_year == exam_year)
    if exam_type:
        query = query.filter(QuestionPaper.exam_type == exam_type.upper())

    rows = query.order_by(QuestionPaper.exam_year.desc(), Question.question_number).offset(skip).limit(limit).all()
    return [_to_question_response(q, doc, subj) for q, doc, subj in rows]


@public_router.get("/{question_id}", response_model=QuestionResponse)

def get_public_question(question_id: str, db: Session = Depends(get_db)) -> QuestionResponse:
    """Public student endpoint retrieving published question record."""
    row = (
        db.query(Question, QuestionPaper, Subject)
        .join(QuestionPaper, Question.document_id == QuestionPaper.id)
        .join(Subject, Question.subject_id == Subject.id)
        .filter(Question.id == question_id, Question.publication_status == PublicationStatus.PUBLISHED)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found or not published.")
    q, doc, subj = row
    return _to_question_response(q, doc, subj)


@public_router.get("/{question_id}/source")
def get_question_source_context(question_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Retrieve verified source document reference, page number, and bounding box."""
    row = (
        db.query(Question, QuestionPaper, Subject)
        .join(QuestionPaper, Question.document_id == QuestionPaper.id)
        .join(Subject, Question.subject_id == Subject.id)
        .filter(Question.id == question_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")
    q, doc, subj = row

    return {
        "question_id": q.id,
        "question_number": q.question_number,
        "document_id": doc.id,
        "filename": doc.filename,
        "page_number": q.page_number,
        "page_end": q.page_end,
        "total_pages": doc.page_count or 1,
        "bbox": q.bbox,
        "exam_year": doc.exam_year,
        "exam_type": doc.exam_type.value,
        "subject_name": subj.name,
        "file_url": f"/api/v1/documents/{doc.id}/file#page={q.page_number}",
        "image_url": f"/api/v1/documents/{doc.id}/pages/{q.page_number}/image",
    }
