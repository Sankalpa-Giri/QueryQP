from datetime import datetime
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=6, max_length=100)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: str
    username: str
    role: str = "admin"
    full_name: str | None = None
    must_change_password: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6, max_length=100)
    confirm_password: str = Field(min_length=6, max_length=100)


class AdminCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100, description="Unique Admin ID assigned by institution")
    default_password: str = Field(min_length=6, max_length=100, description="Initial default password")
    role: str = Field(default="admin", description="superadmin | admin | reviewer")
    full_name: str | None = Field(default=None, max_length=150)
    email: str | None = Field(default=None, max_length=255)


class AdminUpdateRequest(BaseModel):
    role: str | None = None
    is_active: bool | None = None
    full_name: str | None = None
    email: str | None = None
    reset_password: str | None = Field(default=None, min_length=6, max_length=100)


class AdminUserResponse(BaseModel):
    id: str
    username: str
    role: str
    is_active: bool
    must_change_password: bool = False
    full_name: str | None = None
    email: str | None = None
    last_login_at: datetime | None = None
    created_at: datetime | None = None
