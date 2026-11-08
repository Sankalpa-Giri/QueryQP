from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.security import get_current_admin_user, require_superadmin
from app.db.session import get_db
from app.models.user import AdminUser
from app.schemas.auth import (
    AdminCreateRequest,
    AdminUpdateRequest,
    AdminUserResponse,
    ChangePasswordRequest,
    LoginRequest,
    TokenResponse,
)
from app.services.auth_service import (
    authenticate_admin,
    change_admin_password,
    create_admin_user,
    delete_admin_user,
    list_admin_users,
    update_admin_user,
)

router = APIRouter(tags=["admin-auth"])


@router.post("/admin/auth/login", response_model=TokenResponse)
@router.post("/auth/login", response_model=TokenResponse)
@router.post("/admin/login", response_model=TokenResponse)
async def admin_login(
    request: Request,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Authenticate administrator credentials and return JWT bearer token.
    Supports both JSON payloads and standard x-www-form-urlencoded forms."""
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        body = await request.json()
        payload = LoginRequest(**body)
    elif "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        form = await request.form()
        payload = LoginRequest(
            username=str(form.get("username", "")),
            password=str(form.get("password", "")),
        )
    else:
        try:
            body = await request.json()
            payload = LoginRequest(**body)
        except Exception:
            form = await request.form()
            payload = LoginRequest(
                username=str(form.get("username", "")),
                password=str(form.get("password", "")),
            )

    return authenticate_admin(payload, db)


@router.post("/admin/auth/change-password")
@router.post("/auth/change-password")
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_admin_user),
) -> dict[str, Any]:
    """Change current admin's password and remove default temporary password state."""
    return change_admin_password(current_user["id"], payload, db)


@router.get("/admin/me", response_model=AdminUserResponse)
@router.get("/auth/me", response_model=AdminUserResponse)
def get_current_admin(
    db: Session = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_admin_user),
) -> AdminUserResponse:
    """Return fresh identity, roles, and password status of the currently authenticated administrator."""
    user = db.query(AdminUser).filter(AdminUser.id == current_user["id"]).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User record not found.")

    return AdminUserResponse(
        id=user.id,
        username=user.username,
        role=user.role,
        is_active=user.is_active,
        must_change_password=user.must_change_password,
        full_name=user.full_name,
        email=user.email,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
    )


@router.get("/admin/users", response_model=list[AdminUserResponse])
def get_admin_users(
    db: Session = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_superadmin),
) -> list[AdminUserResponse]:
    """List all registered administrators in the institution."""
    admins = list_admin_users(db)
    return [
        AdminUserResponse(
            id=u.id,
            username=u.username,
            role=u.role,
            is_active=u.is_active,
            must_change_password=u.must_change_password,
            full_name=u.full_name,
            email=u.email,
            last_login_at=u.last_login_at,
            created_at=u.created_at,
        )
        for u in admins
    ]


@router.post("/admin/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
def create_admin_account(
    payload: AdminCreateRequest,
    db: Session = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_superadmin),
) -> AdminUserResponse:
    """Create a new administrator account with an assigned ID and temporary default password."""
    new_admin = create_admin_user(payload, current_user, db)
    return AdminUserResponse(
        id=new_admin.id,
        username=new_admin.username,
        role=new_admin.role,
        is_active=new_admin.is_active,
        must_change_password=new_admin.must_change_password,
        full_name=new_admin.full_name,
        email=new_admin.email,
        last_login_at=new_admin.last_login_at,
        created_at=new_admin.created_at,
    )


@router.patch("/admin/users/{user_id}", response_model=AdminUserResponse)
def update_admin_account(
    user_id: str,
    payload: AdminUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_superadmin),
) -> AdminUserResponse:
    """Update an administrator's role, active status, profile, or reset default password."""
    updated = update_admin_user(user_id, payload, current_user, db)
    return AdminUserResponse(
        id=updated.id,
        username=updated.username,
        role=updated.role,
        is_active=updated.is_active,
        must_change_password=updated.must_change_password,
        full_name=updated.full_name,
        email=updated.email,
        last_login_at=updated.last_login_at,
        created_at=updated.created_at,
    )


@router.delete("/admin/users/{user_id}")
def delete_admin_account(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_superadmin),
) -> dict[str, Any]:
    """Delete an administrator account."""
    return delete_admin_user(user_id, current_user, db)
