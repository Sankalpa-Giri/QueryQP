import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.audit import AuditLog
from app.models.user import AdminUser
from app.schemas.auth import (
    AdminCreateRequest,
    AdminUpdateRequest,
    ChangePasswordRequest,
    LoginRequest,
    TokenResponse,
)


def init_default_admin(db: Session) -> AdminUser:
    """Ensure at least one root superadmin account exists."""
    existing = db.query(AdminUser).filter(AdminUser.username == settings.ADMIN_DEFAULT_USERNAME).first()
    if existing:
        return existing

    admin = AdminUser(
        username=settings.ADMIN_DEFAULT_USERNAME,
        hashed_password=get_password_hash(settings.ADMIN_DEFAULT_PASSWORD),
        role="superadmin",
        full_name="System Administrator",
        email="admin@institution.edu",
        is_active=True,
        must_change_password=False,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


def authenticate_admin(login_data: LoginRequest, db: Session) -> TokenResponse:
    """Validate credentials and issue JWT access token with role and password status."""
    user = db.query(AdminUser).filter(AdminUser.username == login_data.username).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin account is deactivated. Contact your institution administrator.",
        )

    # Record login timestamp
    user.last_login_at = datetime.now(UTC)
    db.commit()

    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token(
        subject=user.id,
        expires_delta=expires,
        extra_claims={
            "username": user.username,
            "role": user.role,
            "full_name": user.full_name,
            "must_change_password": user.must_change_password,
        },
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        username=user.username,
        role=user.role,
        full_name=user.full_name,
        must_change_password=user.must_change_password,
    )


def change_admin_password(
    user_id: str,
    payload: ChangePasswordRequest,
    db: Session,
) -> dict[str, Any]:
    """Allow an authenticated admin to change their password and clear default password status."""
    user = db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin account not found.")

    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password verification failed. Please check your default/current password.",
        )

    if payload.new_password != payload.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password and password confirmation do not match.",
        )

    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from your existing default password.",
        )

    user.hashed_password = get_password_hash(payload.new_password)
    user.must_change_password = False
    user.updated_at = datetime.now(UTC)

    audit = AuditLog(
        admin_id=user.id,
        entity_type="ADMIN_USER",
        entity_id=user.id,
        action="CHANGE_PASSWORD",
        changes_json={"status": "password_updated", "must_change_password": False},
    )
    db.add(audit)
    db.commit()

    return {
        "message": "Password changed successfully. Your account is now secured.",
        "must_change_password": False,
    }


def list_admin_users(db: Session) -> list[AdminUser]:
    """Retrieve all administrator accounts ordered by creation date."""
    return db.query(AdminUser).order_by(AdminUser.created_at.asc()).all()


def create_admin_user(
    payload: AdminCreateRequest,
    current_admin: dict[str, Any],
    db: Session,
) -> AdminUser:
    """Institution administrator creates an admin account with an assigned ID and temporary default password."""
    cleaned_username = payload.username.strip().lower()
    existing = db.query(AdminUser).filter(AdminUser.username == cleaned_username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Admin ID '{payload.username}' is already assigned. Please choose a different unique ID.",
        )

    new_admin = AdminUser(
        id=str(uuid.uuid4()),
        username=cleaned_username,
        hashed_password=get_password_hash(payload.default_password),
        role=payload.role.strip().lower() if payload.role else "admin",
        full_name=payload.full_name.strip() if payload.full_name else None,
        email=payload.email.strip().lower() if payload.email else None,
        is_active=True,
        must_change_password=True,  # Mandatory password change upon first login
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(new_admin)
    db.flush()

    audit = AuditLog(
        admin_id=current_admin["id"],
        entity_type="ADMIN_USER",
        entity_id=new_admin.id,
        action="CREATE_ADMIN",
        changes_json={
            "assigned_username": new_admin.username,
            "role": new_admin.role,
            "full_name": new_admin.full_name,
            "must_change_password": True,
        },
    )
    db.add(audit)
    db.commit()
    db.refresh(new_admin)
    return new_admin


def update_admin_user(
    user_id: str,
    payload: AdminUpdateRequest,
    current_admin: dict[str, Any],
    db: Session,
) -> AdminUser:
    """Update admin details, toggle active status, or reset default password."""
    target_user = db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found.")

    changes: dict[str, Any] = {}
    if payload.role is not None:
        changes["role"] = {"old": target_user.role, "new": payload.role}
        target_user.role = payload.role.strip().lower()

    if payload.full_name is not None:
        changes["full_name"] = {"old": target_user.full_name, "new": payload.full_name}
        target_user.full_name = payload.full_name.strip() if payload.full_name else None

    if payload.email is not None:
        changes["email"] = {"old": target_user.email, "new": payload.email}
        target_user.email = payload.email.strip().lower() if payload.email else None

    if payload.is_active is not None:
        if not payload.is_active and target_user.id == current_admin["id"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot deactivate your own admin account.",
            )
        changes["is_active"] = {"old": target_user.is_active, "new": payload.is_active}
        target_user.is_active = payload.is_active

    if payload.reset_password is not None and payload.reset_password.strip():
        target_user.hashed_password = get_password_hash(payload.reset_password.strip())
        target_user.must_change_password = True  # Must change reset password on next login
        changes["password_reset"] = True

    target_user.updated_at = datetime.now(UTC)

    audit = AuditLog(
        admin_id=current_admin["id"],
        entity_type="ADMIN_USER",
        entity_id=target_user.id,
        action="UPDATE_ADMIN",
        changes_json=changes,
    )
    db.add(audit)
    db.commit()
    db.refresh(target_user)
    return target_user


def delete_admin_user(
    user_id: str,
    current_admin: dict[str, Any],
    db: Session,
) -> dict[str, Any]:
    """Safely remove an admin account with protections."""
    if user_id == current_admin["id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own admin account while signed in.",
        )

    target_user = db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found.")

    # Guard: prevent removing the last superadmin
    if target_user.role == "superadmin":
        superadmin_count = db.query(AdminUser).filter(AdminUser.role == "superadmin", AdminUser.is_active == True).count()
        if superadmin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the only remaining active superadmin account.",
            )

    username_saved = target_user.username
    db.delete(target_user)

    audit = AuditLog(
        admin_id=current_admin["id"],
        entity_type="ADMIN_USER",
        entity_id=user_id,
        action="DELETE_ADMIN",
        changes_json={"deleted_username": username_saved},
    )
    db.add(audit)
    db.commit()

    return {"message": f"Admin account '{username_saved}' removed successfully."}
