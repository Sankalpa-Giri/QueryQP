import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.enums import BatchStatus


class QuestionPaperBatch(Base):
    __tablename__ = "question_paper_batches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    admin_id: Mapped[str] = mapped_column(String(36), ForeignKey("admin_users.id"), nullable=False)
    status: Mapped[BatchStatus] = mapped_column(
        Enum(BatchStatus), default=BatchStatus.QUEUED, index=True, nullable=False
    )
    total_files: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    processed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    admin: Mapped["AdminUser"] = relationship("AdminUser", back_populates="batches")  # type: ignore # noqa: F821
    documents: Mapped[list["QuestionPaper"]] = relationship(  # type: ignore # noqa: F821
        "QuestionPaper", back_populates="batch", cascade="all, delete-orphan"
    )
    jobs: Mapped[list["ProcessingJob"]] = relationship(  # type: ignore # noqa: F821
        "ProcessingJob", back_populates="batch", cascade="all, delete-orphan"
    )
