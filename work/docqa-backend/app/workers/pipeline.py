import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.ingestion.providers import get_document_parser
from app.ingestion.question_segmenter import segment_questions_from_parsed
from app.services.ai_extractor import extract_questions_with_ai
from app.models.batch import QuestionPaperBatch
from app.models.document import QuestionPaper
from app.models.enums import BatchStatus, ProcessingStage, PublicationStatus, ReviewStatus, StageStatus
from app.models.job import ProcessingJob
from app.models.question import Question, QuestionTopic
from app.retrieval.embeddings import embed_texts

from app.services.storage_service import storage_service
from app.services.subject_service import assign_question_topics

logger = logging.getLogger(__name__)


def run_document_pipeline_sync(document_id: str, parser_type: str | None = None) -> bool:
    """Synchronous execution of the document parsing, question segmentation, and indexing pipeline."""
    db = SessionLocal()
    try:
        return _execute_document_pipeline(document_id, db, parser_type)
    finally:
        db.close()


def _execute_document_pipeline(document_id: str, db: Session, parser_type: str | None = None) -> bool:
    doc = db.query(QuestionPaper).filter(QuestionPaper.id == document_id).first()
    if not doc:
        logger.error("Document %s not found for processing", document_id)
        return False

    # Initialize or fetch processing job
    job = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.document_id == document_id)
        .order_by(ProcessingJob.created_at.desc())
        .first()
    )
    if not job:
        job = ProcessingJob(
            batch_id=doc.batch_id,
            document_id=doc.id,
            stage=ProcessingStage.PARSE,
            status=StageStatus.RUNNING,
            progress=0.1,
        )
        db.add(job)
        db.commit()

    try:
        # ================= STAGE 1: PARSE =================
        logger.info("Starting STAGE 1 (PARSE) for document %s (%s)", doc.id, doc.filename)
        job.stage = ProcessingStage.PARSE
        job.status = StageStatus.RUNNING
        job.progress = 0.2
        doc.parser_status = StageStatus.RUNNING
        db.commit()

        file_path = storage_service.get_document_path(doc.storage_key)
        parser = get_document_parser(parser_type)
        parsed_result = parser.parse(file_path)

        # Store intermediate Markdown representation
        md_key = storage_service.save_markdown(doc.id, parsed_result.markdown)
        doc.markdown_key = md_key
        doc.page_count = parsed_result.page_count
        doc.parser_status = StageStatus.COMPLETED
        doc.parser_version = f"{parsed_result.parser_name}:{parsed_result.parser_version}"
        job.progress = 0.5
        db.commit()

        logger.info(
            "Parsed document %s: pages=%d, markdown_chars=%d",
            doc.id,
            parsed_result.page_count,
            len(parsed_result.markdown),
        )

        # ================= STAGE 2: SEGMENT QUESTIONS =================
        logger.info("Starting STAGE 2 (SEGMENT) for document %s", doc.id)
        job.stage = ProcessingStage.SEGMENT
        job.status = StageStatus.RUNNING
        doc.extraction_status = StageStatus.RUNNING
        db.commit()

        # Method 1: Try Vision/Multimodal AI extraction first with automatic LaTeX formatting & topics
        subj_name = doc.subject.name if getattr(doc, "subject", None) else None
        extracted_questions = extract_questions_with_ai(
            markdown=parsed_result.markdown,
            subject_name=subj_name,
            page_count=parsed_result.page_count,
        )

        # Fallback to rule-based segmentation if AI is not available or returned no questions
        if not extracted_questions:
            logger.info("AI extraction unavailable or empty; falling back to rule-based segmenter for document %s", doc.id)
            extracted_questions = segment_questions_from_parsed(parsed_result)

        logger.info("Segmenter extracted %d questions for document %s", len(extracted_questions), doc.id)

        # Fail-safe: Ensure document always has at least one staged question for review
        if not extracted_questions:
            logger.warning(
                "No questions segmented for document %s (%s); creating fallback question for review in Staging Area",
                doc.id,
                doc.filename,
            )
            fallback_text = (parsed_result.markdown or "").strip()
            if not fallback_text:
                fallback_text = f"Question Paper: {doc.filename}\n\nAutomatic segmentation could not identify individual questions. Please review this document in the Staging Area to transcribe or split questions."
            extracted_questions = [
                ExtractedQuestion(
                    question_number="Q1",
                    question_text=fallback_text,
                    normalized_text=fallback_text[:200],
                    page_number=1,
                    page_end=max(1, parsed_result.page_count),
                    marks=10.0,
                    bbox=[50.0, 50.0, 545.0, 792.0],
                )
            ]

        # Idempotent cleanup: Remove existing questions and associations if reprocessing
        existing_q_ids = [q[0] for q in db.query(Question.id).filter(Question.document_id == doc.id).all()]
        if existing_q_ids:
            db.query(QuestionTopic).filter(QuestionTopic.question_id.in_(existing_q_ids)).delete(synchronize_session=False)
            db.query(Question).filter(Question.document_id == doc.id).delete()

        created_questions: list[Question] = []
        for eq in extracted_questions:
            q_row = Question(
                id=str(uuid.uuid4()),
                document_id=doc.id,
                subject_id=doc.subject_id,
                question_number=eq.question_number,
                question_text=eq.question_text,
                normalized_text=eq.normalized_text,
                page_number=eq.page_number,
                page_end=eq.page_end,
                marks=eq.marks,
                bbox=eq.bbox,
                topics=list(eq.topics) if getattr(eq, "topics", None) else [],
                review_status=ReviewStatus.PENDING,
                publication_status=PublicationStatus.DRAFT,
            )
            db.add(q_row)
            created_questions.append(q_row)

        db.flush()

        # Classify and link questions to subject topic taxonomy
        for q_row in created_questions:
            try:
                assign_question_topics(db, q_row)
            except Exception as e:
                logger.warning("Topic assignment failed for question %s: %s", q_row.id, e)

        doc.extraction_status = StageStatus.COMPLETED
        job.progress = 0.8
        db.commit()

        # ================= STAGE 3: EMBED & INDEX =================
        logger.info("Starting STAGE 3 (INDEX) for document %s with %d questions", doc.id, len(created_questions))
        job.stage = ProcessingStage.INDEX
        job.status = StageStatus.RUNNING
        doc.indexing_status = StageStatus.RUNNING
        db.commit()

        if created_questions:
            try:
                q_texts = [q.question_text for q in created_questions]
                embeddings = embed_texts(q_texts)
                for q, emb in zip(created_questions, embeddings):
                    q.embedding_json = emb
            except Exception as e:
                logger.warning("Embedding generation failed for document %s: %s", doc.id, e)

        doc.indexing_status = StageStatus.COMPLETED
        doc.publication_status = PublicationStatus.DRAFT
        doc.error_message = None

        job.stage = ProcessingStage.INDEX
        job.status = StageStatus.COMPLETED
        job.progress = 1.0
        job.error_message = None
        db.commit()

        logger.info("Document pipeline completed successfully for %s (%d questions)", doc.id, len(created_questions))

        # Free up local disk space by purging local copy if mirrored in S3
        storage_service.cleanup_local_file(doc.storage_key)
        storage_service.cleanup_local_file(doc.markdown_key)

        # Update batch counters
        _update_batch_progress(doc.batch_id, db)
        return True

    except Exception as err:
        logger.exception("Processing failed for document %s: %s", document_id, err)
        error_msg = str(err)

        doc.parser_status = StageStatus.FAILED
        doc.extraction_status = StageStatus.FAILED
        doc.indexing_status = StageStatus.FAILED
        doc.error_message = error_msg

        job.status = StageStatus.FAILED
        job.error_message = error_msg
        job.retry_count += 1
        db.commit()

        _update_batch_progress(doc.batch_id, db)
        return False


def _update_batch_progress(batch_id: str, db: Session) -> None:
    """Recalculate batch statistics based on member documents."""
    batch = db.query(QuestionPaperBatch).filter(QuestionPaperBatch.id == batch_id).first()
    if not batch:
        return

    docs = db.query(QuestionPaper).filter(QuestionPaper.batch_id == batch_id).all()
    batch.total_files = len(docs)

    def is_completed(s) -> bool:
        v = s.value if hasattr(s, "value") else str(s)
        return v.upper() == "COMPLETED"

    def is_failed(s) -> bool:
        v = s.value if hasattr(s, "value") else str(s)
        return v.upper() == "FAILED"

    batch.processed_count = sum(1 for d in docs if is_completed(d.extraction_status))
    batch.failed_count = sum(1 for d in docs if is_failed(d.extraction_status))

    if batch.total_files > 0 and (batch.processed_count + batch.failed_count >= batch.total_files):
        if batch.failed_count == 0:
            batch.status = BatchStatus.COMPLETED
        elif batch.processed_count > 0:
            batch.status = BatchStatus.PARTIALLY_FAILED
        else:
            batch.status = BatchStatus.FAILED
    else:
        batch.status = BatchStatus.PROCESSING

    db.commit()
