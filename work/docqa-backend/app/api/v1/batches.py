from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.security import get_current_admin_user
from app.db.session import get_db
from app.schemas.batch import BatchCreate, BatchDetailResponse, BatchResponse
from app.services.batch_service import (
    create_batch,
    delete_batch,
    get_batch_detail,
    list_batches,
    process_bulk_upload,
    trigger_batch_processing,
)

router = APIRouter(prefix="/admin/batches", tags=["admin-batches"])



@router.post("", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
def create_new_batch(
    payload: BatchCreate | None = None,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> BatchResponse:
    """Create a new batch container to which examination papers can be attached."""
    batch = create_batch(admin["id"], db)
    return BatchResponse.model_validate(batch)


@router.get("", response_model=list[BatchResponse])
def get_batches(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> list[BatchResponse]:
    """List recent ingestion batches with processing status."""
    return list_batches(db, skip=skip, limit=limit)


@router.get("/{batch_id}", response_model=BatchDetailResponse)
def get_batch(
    batch_id: str,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> BatchDetailResponse:
    """Fetch batch details and real-time document processing statuses."""
    return get_batch_detail(batch_id, db)


@router.delete("/{batch_id}", status_code=status.HTTP_200_OK)
def delete_batch_endpoint(
    batch_id: str,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> dict[str, str]:
    """Permanently delete a batch and cascade delete all its documents, questions, and physical files."""
    delete_batch(batch_id, db, admin["id"])
    return {"status": "ok", "message": f"Batch {batch_id} deleted successfully"}


@router.post("/{batch_id}/documents", response_model=BatchDetailResponse)
def upload_documents_to_batch(
    batch_id: str,
    files: list[UploadFile] = File(...),
    subject_id: str | None = Form(None),
    exam_year: int | None = Form(None),
    exam_type: str | None = Form(None),
    per_file_metadata: str | None = Form(None),
    parser_type: str | None = Form(None),
    overwrite: bool = Form(True),
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> BatchDetailResponse:
    """Upload multiple examination papers into an existing batch."""
    return process_bulk_upload(
        admin_id=admin["id"],
        files=files,
        db=db,
        default_subject_id=subject_id,
        default_year=exam_year,
        default_exam_type=exam_type,
        per_file_metadata_json=per_file_metadata,
        batch_id=batch_id,
        parser_type=parser_type,
        overwrite=overwrite,
    )


@router.post("/{batch_id}/process", response_model=BatchDetailResponse)
def trigger_batch_processing_endpoint(
    batch_id: str,
    parser_type: str | None = None,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> BatchDetailResponse:
    """Explicitly trigger background processing for all eligible documents in a batch."""
    return trigger_batch_processing(batch_id, db, parser_type=parser_type)

