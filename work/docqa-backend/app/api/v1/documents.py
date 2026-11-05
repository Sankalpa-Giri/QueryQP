from typing import Any

import pymupdf
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.security import get_current_admin_user
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.document import QuestionPaper
from app.models.enums import ExamType, PublicationStatus, StageStatus
from app.models.job import ProcessingJob
from app.models.question import Question
from app.models.subject import Subject
from app.schemas.batch import BatchDetailResponse
from app.schemas.document import DocumentStatusResponse, QuestionPaperResponse
from app.services.batch_service import process_bulk_upload
from app.services.storage_service import storage_service
from app.workers.queue import dispatch_document_processing

admin_router = APIRouter(prefix="/admin/documents", tags=["admin-documents"])
public_router = APIRouter(prefix="/documents", tags=["documents-public"])


@admin_router.post("/upload", response_model=BatchDetailResponse, status_code=status.HTTP_201_CREATED)
def bulk_upload_papers(
    files: list[UploadFile] = File(...),
    subject_id: str | None = Form(None),
    exam_year: int | None = Form(None),
    exam_type: str | None = Form(None),
    per_file_metadata: str | None = Form(None),
    parser_type: str | None = Form(None),
    auto_process: bool = Form(True),
    overwrite: bool = Form(True),
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> BatchDetailResponse:
    """Direct bulk upload endpoint creating a new batch and queuing papers for LlamaParse extraction."""
    return process_bulk_upload(
        admin_id=admin["id"],
        files=files,
        db=db,
        default_subject_id=subject_id,
        default_year=exam_year,
        default_exam_type=exam_type,
        per_file_metadata_json=per_file_metadata,
        parser_type=parser_type,
        auto_process=auto_process,
        overwrite=overwrite,
    )



@admin_router.get("", response_model=list[QuestionPaperResponse])
def list_documents(
    subject_id: str | None = None,
    exam_year: int | None = None,
    exam_type: str | None = None,
    publication_status: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> list[QuestionPaperResponse]:
    """List question papers with metadata and extraction status."""
    query = db.query(QuestionPaper, Subject).join(Subject, QuestionPaper.subject_id == Subject.id)

    if subject_id:
        query = query.filter(QuestionPaper.subject_id == subject_id)
    if exam_year:
        query = query.filter(QuestionPaper.exam_year == exam_year)
    if exam_type:
        try:
            query = query.filter(QuestionPaper.exam_type == ExamType(exam_type.upper()))
        except ValueError:
            pass
    if publication_status:
        try:
            query = query.filter(QuestionPaper.publication_status == PublicationStatus(publication_status.upper()))
        except ValueError:
            pass

    rows = query.order_by(QuestionPaper.created_at.desc()).offset(skip).limit(limit).all()
    results: list[QuestionPaperResponse] = []

    for doc, subj in rows:
        q_cnt = db.query(Question).filter(Question.document_id == doc.id).count()
        resp = QuestionPaperResponse.model_validate(doc)
        resp.subject_name = subj.name
        resp.subject_code = subj.code
        resp.exam_type = doc.exam_type.value
        resp.parser_status = doc.parser_status.value
        resp.extraction_status = doc.extraction_status.value
        resp.indexing_status = doc.indexing_status.value
        resp.publication_status = doc.publication_status.value
        resp.question_count = q_cnt
        results.append(resp)

    return results


@admin_router.get("/{document_id}", response_model=QuestionPaperResponse)
def get_document_detail(
    document_id: str,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> QuestionPaperResponse:
    """Fetch question paper details including parser version and error messages."""
    row = (
        db.query(QuestionPaper, Subject)
        .join(Subject, QuestionPaper.subject_id == Subject.id)
        .filter(QuestionPaper.id == document_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question paper not found.")

    doc, subj = row
    q_cnt = db.query(Question).filter(Question.document_id == doc.id).count()
    resp = QuestionPaperResponse.model_validate(doc)
    resp.subject_name = subj.name
    resp.subject_code = subj.code
    resp.exam_type = doc.exam_type.value
    resp.parser_status = doc.parser_status.value
    resp.extraction_status = doc.extraction_status.value
    resp.indexing_status = doc.indexing_status.value
    resp.publication_status = doc.publication_status.value
    resp.question_count = q_cnt
    return resp


@admin_router.get("/{document_id}/status", response_model=DocumentStatusResponse)
def get_document_status(
    document_id: str,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> DocumentStatusResponse:
    """Live processing stage, progress, and error inspection for real-time monitors."""
    doc = db.query(QuestionPaper).filter(QuestionPaper.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    job = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.document_id == document_id)
        .order_by(ProcessingJob.created_at.desc())
        .first()
    )

    stage_str = job.stage.value if job else doc.extraction_status.value
    status_str = job.status.value if job else doc.extraction_status.value
    progress = job.progress if job else (1.0 if doc.extraction_status == StageStatus.COMPLETED else 0.0)

    return DocumentStatusResponse(
        document_id=doc.id,
        stage=stage_str,
        status=status_str,
        progress=progress,
        error_message=doc.error_message or (job.error_message if job else None),
        retry_count=job.retry_count if job else 0,
    )


@admin_router.post("/{document_id}/retry", response_model=DocumentStatusResponse)
def retry_document_processing(
    document_id: str,
    parser_type: str | None = None,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> DocumentStatusResponse:
    """Retry failed extraction without creating duplicate records."""
    doc = db.query(QuestionPaper).filter(QuestionPaper.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    doc.error_message = None
    doc.parser_status = StageStatus.PENDING
    doc.extraction_status = StageStatus.PENDING
    doc.indexing_status = StageStatus.PENDING
    db.commit()

    dispatch_document_processing(doc.id, parser_type=parser_type)
    return get_document_status(document_id, db, admin)


@admin_router.post("/{document_id}/reprocess", response_model=DocumentStatusResponse)
def reprocess_document(
    document_id: str,
    parser_type: str | None = None,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> DocumentStatusResponse:
    """Reprocess document and refresh its question bank extraction."""
    return retry_document_processing(document_id, parser_type, db, admin)


@admin_router.post("/{document_id}/process", response_model=DocumentStatusResponse)
def trigger_document_processing_endpoint(
    document_id: str,
    parser_type: str | None = None,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> DocumentStatusResponse:
    """Explicitly trigger document processing pipeline after administrative inspection."""
    return retry_document_processing(document_id, parser_type, db, admin)


@admin_router.delete("/{document_id}", status_code=status.HTTP_200_OK)
def delete_document_endpoint(
    document_id: str,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> dict[str, str]:
    """Permanently delete a question paper document and cascade delete its questions, jobs, and storage files."""
    doc = db.query(QuestionPaper).filter(QuestionPaper.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    try:
        storage_service.get_document_path(doc.storage_key).unlink(missing_ok=True)
    except Exception:
        pass

    audit = AuditLog(
        admin_id=admin["id"],
        entity_type="DOCUMENT",
        entity_id=doc.id,
        action="DELETE",
        changes_json={"filename": doc.filename, "exam_year": doc.exam_year, "exam_type": doc.exam_type.value},
    )
    db.add(audit)
    db.delete(doc)
    db.commit()
    return {"status": "ok", "message": f"Document {document_id} deleted successfully"}



# ================= Document File & Page Rendering for Viewer =================


@public_router.get("/{document_id}/file")
def stream_document_file(document_id: str, request: Request, db: Session = Depends(get_db)) -> Response:
    """Stream PDF file inline for document viewer with HTTP cache headers."""
    doc = db.query(QuestionPaper).filter(QuestionPaper.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    updated_ts = int(doc.updated_at.timestamp()) if hasattr(doc, "updated_at") and doc.updated_at else 0
    etag = f'W/"doc-{document_id}-{updated_ts}"'

    if request.headers.get("if-none-match") == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED)

    path = storage_service.get_document_path(doc.storage_key)
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=doc.filename,
        content_disposition_type="inline",
        headers={
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
            "ETag": etag,
        },
    )


@public_router.get("/{document_id}/pages/{page_number}/image")
def render_page_image(
    document_id: str,
    page_number: int,
    request: Request,
    dpi: int = 150,
    x0: float | None = None,
    y0: float | None = None,
    x1: float | None = None,
    y1: float | None = None,
    db: Session = Depends(get_db),
) -> Response:
    """Render a specific PDF page or cropped diagram region to a crisp PNG image with edge caching."""
    doc = db.query(QuestionPaper).filter(QuestionPaper.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    effective_dpi = min(max(dpi, 72), 300)
    # Generate deterministic ETag for browser and CDN caching
    crop_sig = f"{x0}_{y0}_{x1}_{y1}" if x0 is not None else "full"
    etag = f'"{document_id}-p{page_number}-d{effective_dpi}-{crop_sig}"'

    # Fast 304 Not Modified exit before touching PDF disk or rasterizer
    if request.headers.get("if-none-match") == etag:
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={
                "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
                "ETag": etag,
            },
        )

    path = storage_service.get_document_path(doc.storage_key)
    try:
        with pymupdf.open(path) as pdf:
            if page_number < 1 or page_number > len(pdf):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page number out of range.")
            page = pdf[page_number - 1]
            if x0 is not None and y0 is not None and x1 is not None and y1 is not None:
                clip = pymupdf.Rect(x0, y0, x1, y1)
                pix = page.get_pixmap(dpi=effective_dpi, clip=clip)
            else:
                pix = page.get_pixmap(dpi=effective_dpi)

            headers = {
                "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
                "ETag": etag,
            }
            return Response(content=pix.tobytes("png"), media_type="image/png", headers=headers)
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Render error: {err}")
