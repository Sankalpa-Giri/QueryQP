import json
import uuid
from typing import Any

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.batch import QuestionPaperBatch
from app.models.document import QuestionPaper
from app.models.enums import BatchStatus, ExamType, PublicationStatus, StageStatus
from app.models.job import ProcessingJob
from app.models.question import Question
from app.models.subject import Subject
from app.schemas.batch import BatchDetailResponse, BatchResponse, DocumentSummary
from app.services.storage_service import storage_service
from app.workers.queue import dispatch_document_processing


def create_batch(admin_id: str, db: Session) -> QuestionPaperBatch:
    """Initialize a new batch container for bulk upload."""
    batch = QuestionPaperBatch(
        id=str(uuid.uuid4()),
        admin_id=admin_id,
        status=BatchStatus.QUEUED,
        total_files=0,
        processed_count=0,
        failed_count=0,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def process_bulk_upload(
    admin_id: str,
    files: list[UploadFile],
    db: Session,
    default_subject_id: str | None = None,
    default_year: int | None = None,
    default_exam_type: str | None = None,
    per_file_metadata_json: str | None = None,
    batch_id: str | None = None,
    parser_type: str | None = None,
    auto_process: bool = True,
    overwrite: bool = True,
) -> BatchDetailResponse:

    """Handle bulk upload of question papers with validation, deduplication, and worker queuing."""
    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files provided for upload.")

    # Parse per-file metadata overrides if provided
    metadata_map: dict[str, dict[str, Any]] = {}
    if per_file_metadata_json:
        try:
            metadata_map = json.loads(per_file_metadata_json)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid per_file_metadata JSON format.",
            )

    # Initialize batch if not already supplied
    if batch_id:
        batch = db.query(QuestionPaperBatch).filter(QuestionPaperBatch.id == batch_id).first()
        if not batch:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")
    else:
        batch = create_batch(admin_id, db)

    created_docs: list[QuestionPaper] = []

    for file in files:
        fname = file.filename or "question_paper.pdf"
        file_meta = metadata_map.get(fname, {})

        subj_id = file_meta.get("subject_id") or default_subject_id
        yr = file_meta.get("exam_year") or default_year
        etype_str = file_meta.get("exam_type") or default_exam_type

        # Validate required metadata
        if not subj_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Missing subject_id for file '{fname}'.",
            )
        if not yr or not (1990 <= int(yr) <= 2050):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid or missing exam_year for file '{fname}'.",
            )
        if not etype_str:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Missing exam_type for file '{fname}'.",
            )

        try:
            etype = ExamType(etype_str.upper())
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid exam_type '{etype_str}' for file '{fname}'. Must be MIDSEM or ENDSEM.",
            )

        # Verify subject exists
        subject = db.query(Subject).filter(Subject.id == subj_id).first()
        if not subject:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Subject '{subj_id}' for file '{fname}' does not exist.",
            )

        # Save to storage and get checksum
        doc_id = str(uuid.uuid4())
        storage_key, checksum, size_bytes = storage_service.save_uploaded_pdf(file, doc_id)

        # Duplicate detection: Check if paper already exists in same subject & exam
        existing_dup = (
            db.query(QuestionPaper)
            .filter(
                QuestionPaper.subject_id == subj_id,
                QuestionPaper.exam_year == int(yr),
                QuestionPaper.exam_type == etype,
            )
            .filter(
                (QuestionPaper.checksum == checksum) | (QuestionPaper.filename == fname)
            )
            .first()
        )
        if existing_dup:
            if overwrite:
                # Clean up existing duplicate document so the new upload replaces it cleanly
                try:
                    if existing_dup.storage_key != storage_key:
                        storage_service.get_document_path(existing_dup.storage_key).unlink(missing_ok=True)
                except Exception:
                    pass
                db.delete(existing_dup)
                db.flush()
            else:
                # Clean up the newly uploaded physical file to avoid orphan duplicates
                try:
                    storage_service.get_document_path(storage_key).unlink(missing_ok=True)
                except Exception:
                    pass
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Duplicate question paper detected: '{fname}' is identical to already indexed paper '{existing_dup.filename}' for {subject.name} {yr} {etype.value}.",
                )

        doc = QuestionPaper(
            id=doc_id,
            batch_id=batch.id,
            subject_id=subj_id,
            exam_year=int(yr),
            exam_type=etype,
            filename=fname,
            storage_key=storage_key,
            checksum=checksum,
            page_count=0,
            parser_status=StageStatus.PENDING,
            extraction_status=StageStatus.PENDING,
            indexing_status=StageStatus.PENDING,
            publication_status=PublicationStatus.DRAFT,
        )
        db.add(doc)
        created_docs.append(doc)

    db.commit()

    # Update batch total files count
    all_batch_docs = db.query(QuestionPaper).filter(QuestionPaper.batch_id == batch.id).all()
    batch.total_files = len(all_batch_docs)
    batch.status = BatchStatus.PROCESSING if auto_process else BatchStatus.QUEUED
    db.commit()

    # Dispatch background jobs if auto_process is enabled
    if auto_process:
        for doc in created_docs:
            dispatch_document_processing(doc.id, parser_type=parser_type)

    return get_batch_detail(batch.id, db)



def get_batch_detail(batch_id: str, db: Session) -> BatchDetailResponse:
    """Retrieve batch with all document summaries and statuses."""
    batch = db.query(QuestionPaperBatch).filter(QuestionPaperBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")

    docs = db.query(QuestionPaper).filter(QuestionPaper.batch_id == batch.id).all()
    doc_summaries: list[DocumentSummary] = []

    for d in docs:
        q_cnt = db.query(Question).filter(Question.document_id == d.id).count()
        subj = db.query(Subject).filter(Subject.id == d.subject_id).first()
        doc_summaries.append(
            DocumentSummary(
                id=d.id,
                filename=d.filename,
                exam_year=d.exam_year,
                exam_type=d.exam_type.value,
                subject_id=d.subject_id,
                subject_name=subj.name if subj else None,
                subject_code=subj.code if subj else None,
                parser_status=d.parser_status.value,
                extraction_status=d.extraction_status.value,
                indexing_status=d.indexing_status.value,
                question_count=q_cnt,
                error_message=d.error_message,
            )
        )

    return BatchDetailResponse(
        id=batch.id,
        admin_id=batch.admin_id,
        status=batch.status.value,
        total_files=batch.total_files,
        processed_count=batch.processed_count,
        failed_count=batch.failed_count,
        created_at=batch.created_at,
        updated_at=batch.updated_at,
        documents=doc_summaries,
    )


def list_batches(db: Session, skip: int = 0, limit: int = 50) -> list[BatchResponse]:
    """List batches ordered by creation timestamp."""
    batches = (
        db.query(QuestionPaperBatch)
        .order_by(QuestionPaperBatch.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [BatchResponse.model_validate(b) for b in batches]


def trigger_batch_processing(
    batch_id: str,
    db: Session,
    parser_type: str | None = None,
) -> BatchDetailResponse:
    """Trigger background processing for all eligible documents in a batch."""
    batch = db.query(QuestionPaperBatch).filter(QuestionPaperBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")

    docs = db.query(QuestionPaper).filter(QuestionPaper.batch_id == batch.id).all()
    if not docs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Batch contains no documents to process.",
        )

    for doc in docs:
        if doc.extraction_status != StageStatus.RUNNING:
            doc.error_message = None
            doc.parser_status = StageStatus.PENDING
            doc.extraction_status = StageStatus.PENDING
            doc.indexing_status = StageStatus.PENDING
            dispatch_document_processing(doc.id, parser_type=parser_type)

    batch.status = BatchStatus.PROCESSING
    db.commit()

    return get_batch_detail(batch.id, db)


def delete_batch(batch_id: str, db: Session, admin_id: str) -> None:
    """Delete a batch and cascade delete all its documents, questions, and physical files."""
    batch = db.query(QuestionPaperBatch).filter(QuestionPaperBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")

    docs = db.query(QuestionPaper).filter(QuestionPaper.batch_id == batch_id).all()
    for doc in docs:
        try:
            storage_service.get_document_path(doc.storage_key).unlink(missing_ok=True)
        except Exception:
            pass

    audit = AuditLog(
        admin_id=admin_id,
        entity_type="BATCH",
        entity_id=batch_id,
        action="DELETE",
        changes_json={"total_files": batch.total_files, "status": batch.status.value},
    )
    db.add(audit)
    db.delete(batch)
    db.commit()


