from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.user import AdminUser

security_scheme = HTTPBearer(auto_error=False)


def get_password_hash(password: str) -> str:
    """Hash password using bcrypt with salt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plaintext password against bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(
    subject: str | Any,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Generate signed JWT access token."""
    expire = datetime.now(UTC) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode = {"sub": str(subject), "exp": expire}
    if extra_claims:
        to_encode.update(extra_claims)
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Decode and validate a JWT access token."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except jwt.PyJWTError:
        return None


def get_current_admin_user(
    auth: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Dependency verifying admin bearer token and active DB account status."""
    if not auth or not auth.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(auth.credentials)
    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    sub = str(payload["sub"])
    username = payload.get("username", sub)

    db_user = (
        db.query(AdminUser)
        .filter((AdminUser.id == sub) | (AdminUser.username == username))
        .first()
    )
    if db_user is not None and not db_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Administrator account has been deactivated.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return {
        "id": db_user.id if db_user else sub,
        "username": db_user.username if db_user else username,
        "role": (db_user.role if db_user else payload.get("role", "admin")).strip().lower(),
        "full_name": db_user.full_name if db_user else payload.get("full_name"),
        "must_change_password": (
            db_user.must_change_password
            if db_user is not None
            else payload.get("must_change_password", False)
        ),
    }


def require_roles(*allowed_roles: str):
    """Enforce Role-Based Access Control (RBAC) on API endpoints."""
    normalized_allowed = [r.strip().lower() for r in allowed_roles]

    def role_checker(
        current_user: dict[str, Any] = Depends(get_current_admin_user),
    ) -> dict[str, Any]:
        user_role = str(current_user.get("role", "admin")).strip().lower()
        if user_role not in normalized_allowed:
            allowed_str = ", ".join([r.upper() for r in allowed_roles])
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: This operation requires {allowed_str} privilege. Your current role is '{user_role.upper()}'.",
            )
        return current_user

    return role_checker


# Reusable role dependencies
require_superadmin = require_roles("superadmin")
require_admin_or_superadmin = require_roles("superadmin", "admin")
require_any_admin = get_current_admin_user  # superadmin, admin, or reviewer
