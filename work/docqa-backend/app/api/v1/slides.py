import math
import os
import uuid
from pathlib import Path
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.security import get_current_admin_user, require_admin_or_superadmin
from app.db.session import get_db
from app.models.slide import Slide
from app.models.subject import Subject
from app.schemas.slide import (
    AdminSlidesListResponse,
    ProfessorSlidesResponse,
    ProfessorsBySubjectResponse,
    SlideResponse,
    SlideUpdate,
)
from app.services.slide_service import (
    format_slide_response,
    get_professors_with_slides,
)
from app.services.storage_service import storage_service

# Public endpoints for students
public_router = APIRouter(prefix="/slides", tags=["slides-student"])

# Admin endpoints for professors and administrators
admin_router = APIRouter(prefix="/admin/slides", tags=["slides-admin"])


# ==========================================
# PUBLIC STUDENT ENDPOINTS
# ==========================================

@public_router.get("", response_model=list[SlideResponse])
def list_public_slides(
    subject_id: str | None = Query(None, description="Filter by subject ID"),
    professor_name: str | None = Query(None, description="Filter by professor name"),
    topic_name: str | None = Query(None, description="Filter by topic name"),
    search: str | None = Query(None, description="General search filter"),
    db: Session = Depends(get_db),
) -> list[SlideResponse]:
    """List lecture slides filtered by subject, professor, topic, or search term."""
    query = db.query(Slide)
    if subject_id and subject_id not in ("", "all", "ALL", "None"):
        query = query.filter(Slide.subject_id == subject_id)
    if professor_name:
        query = query.filter(Slide.professor_name.ilike(f"%{professor_name.strip()}%"))
    if topic_name:
        query = query.filter(Slide.topic_name.ilike(f"%{topic_name.strip()}%"))
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            Slide.professor_name.ilike(term)
            | Slide.topic_name.ilike(term)
            | Slide.title.ilike(term)
        )

    slides = query.order_by(Slide.professor_name.asc(), Slide.topic_name.asc(), Slide.created_at.desc()).all()
    return [format_slide_response(s) for s in slides]


@public_router.get("/professors", response_model=ProfessorsBySubjectResponse)
def get_professors_by_subject(
    subject_id: str | None = Query(None, description="Optional subject ID filter"),
    search: str | None = Query(None, description="Search by professor, topic, or slide title"),
    db: Session = Depends(get_db),
) -> ProfessorsBySubjectResponse:
    """Retrieve all university professors in Alphabetical order (A-Z) with topic-wise slides."""
    profs = get_professors_with_slides(db, subject_id=subject_id, search=search)
    return ProfessorsBySubjectResponse(
        subject_id=subject_id,
        professors=profs,
    )


@public_router.get("/{slide_id}", response_model=SlideResponse)
def get_slide_detail(slide_id: str, db: Session = Depends(get_db)) -> SlideResponse:
    """Retrieve metadata and view URL for a specific slide deck."""
    slide = db.query(Slide).filter(Slide.id == slide_id).first()
    if not slide:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slide not found.")
    return format_slide_response(slide)


@public_router.get("/{slide_id}/file")
@public_router.get("/{slide_id}/view")
def stream_slide_file(slide_id: str, db: Session = Depends(get_db)):
    """Stream slide document for in-browser viewing."""
    slide = db.query(Slide).filter(Slide.id == slide_id).first()
    if not slide:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slide not found.")

    file_path = storage_service.get_slide_path(slide.storage_key)
    if not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slide file not found on server.")

    content_type = "application/pdf"
    ext = (slide.file_type or "pdf").lower()
    if ext == "pptx":
        content_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    elif ext == "ppt":
        content_type = "application/vnd.ms-powerpoint"

    return FileResponse(
        path=str(file_path),
        media_type=content_type,
        filename=slide.filename,
        content_disposition_type="inline",
        headers={"Content-Disposition": f'inline; filename="{slide.filename}"'},
    )


@public_router.get("/{slide_id}/download")
def download_slide_file(slide_id: str, db: Session = Depends(get_db)):
    """Download slide file as attachment and increment download counter."""
    slide = db.query(Slide).filter(Slide.id == slide_id).first()
    if not slide:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slide not found.")

    file_path = storage_service.get_slide_path(slide.storage_key)
    if not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slide file not found on server.")

    slide.download_count = (slide.download_count or 0) + 1
    db.commit()

    content_type = "application/pdf"
    ext = (slide.file_type or "pdf").lower()
    if ext == "pptx":
        content_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    elif ext == "ppt":
        content_type = "application/vnd.ms-powerpoint"

    return FileResponse(
        path=str(file_path),
        media_type=content_type,
        filename=slide.filename,
        content_disposition_type="attachment",
        headers={"Content-Disposition": f'attachment; filename="{slide.filename}"'},
    )


# ==========================================
# ADMIN ENDPOINTS FOR PROFESSOR / UPLOAD
# ==========================================

@admin_router.get("", response_model=AdminSlidesListResponse)
def list_admin_slides(
    subject_id: str | None = Query(None),
    professor_name: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> AdminSlidesListResponse:
    """Admin inspection of all uploaded slides with pagination."""
    query = db.query(Slide)
    if subject_id and subject_id not in ("", "all", "ALL", "None"):
        query = query.filter(Slide.subject_id == subject_id)
    if professor_name and professor_name.strip():
        query = query.filter(Slide.professor_name.ilike(f"%{professor_name.strip()}%"))
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            Slide.professor_name.ilike(term)
            | Slide.topic_name.ilike(term)
            | Slide.title.ilike(term)
        )

    total = query.count()
    pages = max(1, math.ceil(total / limit))
    offset = (page - 1) * limit

    slides = query.order_by(Slide.created_at.desc()).offset(offset).limit(limit).all()
    items = [format_slide_response(s) for s in slides]

    return AdminSlidesListResponse(
        items=items,
        total=total,
        page=page,
        pages=pages,
    )


@admin_router.post("", response_model=SlideResponse, status_code=status.HTTP_201_CREATED)
def upload_slide_admin(
    file: UploadFile = File(..., description="Slide PDF or PPT/PPTX file"),
    subject_id: str | None = Form(None),
    professor_name: str = Form(...),
    professor_title: str | None = Form(None),
    topic_name: str = Form(...),
    title: str = Form(...),
    description: str | None = Form(None),
    semester: str | None = Form(None),
    academic_year: str | None = Form(None),
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(require_admin_or_superadmin),
) -> SlideResponse:
    """Upload a new lecture slide document for a professor and subject."""
    # Resolve subject: if not provided or empty, resolve to first available subject
    resolved_subject_id = (subject_id or "").strip()
    if resolved_subject_id:
        subject = db.query(Subject).filter(Subject.id == resolved_subject_id).first()
    else:
        subject = db.query(Subject).first()

    if not subject:
        # Create a default Computer Science subject if none exist
        subject = Subject(
            id=str(uuid.uuid4()),
            name="General Engineering",
            code="GEN-101",
            department="Computer Science & Engineering",
            is_active=True,
        )
        db.add(subject)
        db.commit()
        db.refresh(subject)

    orig_filename = file.filename or "lecture_slide.pdf"
    ext = Path(orig_filename).suffix.lstrip(".").lower()
    if not ext:
        ext = "pdf"

    if ext not in ("pdf", "pptx", "ppt"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '.{ext}'. Please upload PDF, PPTX, or PPT slides.",
        )

    slide_id = str(uuid.uuid4())
    storage_key = storage_service.save_slide_file(
        slide_id=slide_id,
        file_obj=file.file,
        extension=ext,
        content_type=file.content_type or "application/pdf",
    )

    file_path = storage_service.get_slide_path(storage_key)
    file_size = file_path.stat().st_size if file_path.is_file() else 0

    slide = Slide(
        id=slide_id,
        subject_id=subject.id,
        professor_name=professor_name.strip(),
        professor_title=professor_title.strip() if professor_title else None,
        topic_name=topic_name.strip(),
        title=title.strip(),
        description=description.strip() if description else None,
        filename=orig_filename,
        storage_key=storage_key,
        file_type=ext,
        file_size_bytes=file_size,
        semester=semester.strip() if semester else None,
        academic_year=academic_year.strip() if academic_year else None,
        download_count=0,
    )
    db.add(slide)
    db.commit()
    db.refresh(slide)

    return format_slide_response(slide)


@admin_router.put("/{slide_id}", response_model=SlideResponse)
def update_slide_admin(
    slide_id: str,
    payload: SlideUpdate,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> SlideResponse:
    """Update slide metadata (topic, title, professor details, semester)."""
    slide = db.query(Slide).filter(Slide.id == slide_id).first()
    if not slide:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slide not found.")

    if payload.subject_id is not None and payload.subject_id.strip():
        subj = db.query(Subject).filter(Subject.id == payload.subject_id.strip()).first()
        if subj:
            slide.subject_id = subj.id

    if payload.professor_name is not None and payload.professor_name.strip():
        slide.professor_name = payload.professor_name.strip()
    if payload.professor_title is not None:
        slide.professor_title = payload.professor_title.strip() or None
    if payload.topic_name is not None and payload.topic_name.strip():
        slide.topic_name = payload.topic_name.strip()
    if payload.title is not None and payload.title.strip():
        slide.title = payload.title.strip()
    if payload.description is not None:
        slide.description = payload.description.strip() or None
    if payload.semester is not None:
        slide.semester = payload.semester.strip() or None
    if payload.academic_year is not None:
        slide.academic_year = payload.academic_year.strip() or None

    db.commit()
    db.refresh(slide)
    return format_slide_response(slide)


@admin_router.delete("/{slide_id}")
def delete_slide_admin(
    slide_id: str,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(require_admin_or_superadmin),
) -> dict[str, Any]:
    """Delete a slide and purge its stored document file."""
    slide = db.query(Slide).filter(Slide.id == slide_id).first()
    if not slide:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slide not found.")

    storage_service.delete_slide_file(slide.storage_key)
    db.delete(slide)
    db.commit()
    return {"success": True, "message": "Slide deleted successfully."}
