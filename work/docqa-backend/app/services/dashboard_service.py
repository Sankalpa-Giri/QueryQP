from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.batch import QuestionPaperBatch
from app.models.document import QuestionPaper
from app.models.enums import BatchStatus, PublicationStatus, ReviewStatus, StageStatus
from app.models.question import Question
from app.schemas.dashboard import BatchSummary, DashboardStatsResponse


def get_dashboard_stats(db: Session) -> DashboardStatsResponse:
    """Aggregate statistics for admin dashboard."""
    total_papers = db.query(func.count(QuestionPaper.id)).scalar() or 0
    processed_papers = (
        db.query(func.count(QuestionPaper.id))
        .filter(QuestionPaper.extraction_status == StageStatus.COMPLETED)
        .scalar()
        or 0
    )
    processing_papers = (
        db.query(func.count(QuestionPaper.id))
        .filter(QuestionPaper.extraction_status == StageStatus.RUNNING)
        .scalar()
        or 0
    )
    failed_papers = (
        db.query(func.count(QuestionPaper.id))
        .filter(QuestionPaper.extraction_status == StageStatus.FAILED)
        .scalar()
        or 0
    )

    total_questions = db.query(func.count(Question.id)).scalar() or 0
    published_questions = (
        db.query(func.count(Question.id))
        .filter(Question.publication_status == PublicationStatus.PUBLISHED)
        .scalar()
        or 0
    )
    pending_questions = (
        db.query(func.count(Question.id))
        .filter(Question.review_status == ReviewStatus.PENDING)
        .scalar()
        or 0
    )

    recent_batches_db = (
        db.query(QuestionPaperBatch)
        .order_by(QuestionPaperBatch.created_at.desc())
        .limit(10)
        .all()
    )

    recent_batches = [
        BatchSummary(
            id=b.id,
            status=b.status.value if isinstance(b.status, BatchStatus) else str(b.status),
            total_files=b.total_files,
            processed_count=b.processed_count,
            failed_count=b.failed_count,
            created_at=b.created_at,
        )
        for b in recent_batches_db
    ]

    return DashboardStatsResponse(
        total_papers=total_papers,
        processed_papers=processed_papers,
        processing_papers=processing_papers,
        failed_papers=failed_papers,
        total_questions=total_questions,
        published_questions=published_questions,
        pending_questions=pending_questions,
        recent_batches=recent_batches,
    )
