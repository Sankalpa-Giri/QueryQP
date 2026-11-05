import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    admin_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # "CREATE", "UPDATE", "PUBLISH", "UNPUBLISH", "DELETE"
    changes_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
