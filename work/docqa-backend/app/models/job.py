import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.enums import ProcessingStage, StageStatus


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    batch_id: Mapped[str] = mapped_column(String(36), ForeignKey("question_paper_batches.id"), index=True, nullable=False)
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("question_papers.id"), index=True, nullable=False)

    stage: Mapped[ProcessingStage] = mapped_column(Enum(ProcessingStage), index=True, nullable=False)
    status: Mapped[StageStatus] = mapped_column(
        Enum(StageStatus), default=StageStatus.PENDING, index=True, nullable=False
    )
    progress: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    batch: Mapped["QuestionPaperBatch"] = relationship("QuestionPaperBatch", back_populates="jobs")  # type: ignore # noqa: F821
    document: Mapped["QuestionPaper"] = relationship("QuestionPaper", back_populates="jobs")  # type: ignore # noqa: F821
