from typing import Any

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.security import get_current_admin_user
from app.db.session import get_db
from app.schemas.subject import SubjectCreate, SubjectResponse, SubjectUpdate, TopicResponse
from app.services.subject_service import (
    create_subject,
    deactivate_subject,
    delete_subject_permanent,
    list_subject_topics,
    list_subjects,
    update_subject,
)

# Public router for student access
public_router = APIRouter(prefix="/subjects", tags=["subjects-public"])
# Protected router for admin operations
admin_router = APIRouter(prefix="/admin/subjects", tags=["subjects-admin"])


@public_router.get("", response_model=list[SubjectResponse])
def get_active_subjects(db: Session = Depends(get_db)) -> list[SubjectResponse]:
    """List active subjects available for student queries."""
    return list_subjects(db, active_only=True)


@public_router.get("/{subject_id}/topics", response_model=list[TopicResponse])
def get_subject_topics(subject_id: str, db: Session = Depends(get_db)) -> list[TopicResponse]:
    """Retrieve structured topic taxonomy for a subject with question counts."""
    return list_subject_topics(subject_id, db)



@admin_router.get("", response_model=list[SubjectResponse])
def get_all_subjects_admin(
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> list[SubjectResponse]:
    """List all subjects including inactive/archived subjects for admin management."""
    return list_subjects(db, active_only=False)


@admin_router.post("", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
def create_new_subject(
    payload: SubjectCreate,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> SubjectResponse:
    """Create a new subject ensuring unique subject code."""
    return create_subject(payload, db)


@admin_router.put("/{subject_id}", response_model=SubjectResponse)
@admin_router.patch("/{subject_id}", response_model=SubjectResponse)
def update_existing_subject(
    subject_id: str,
    payload: SubjectUpdate,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> SubjectResponse:
    """Update subject information or toggles active status."""
    return update_subject(subject_id, payload, db)


@admin_router.delete("/{subject_id}", response_model=SubjectResponse)
def deactivate_existing_subject(
    subject_id: str,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> SubjectResponse:
    """Deactivate subject to safely preserve historical examinations."""
    return deactivate_subject(subject_id, db)


@admin_router.delete("/{subject_id}/permanent", response_model=dict[str, Any])
def delete_existing_subject_permanent(
    subject_id: str,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> dict[str, Any]:
    """Permanently delete subject if it has no question papers."""
    return delete_subject_permanent(subject_id, db)

