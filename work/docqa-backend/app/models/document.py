import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.enums import ExamType, PublicationStatus, StageStatus


class QuestionPaper(Base):
    __tablename__ = "question_papers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    batch_id: Mapped[str] = mapped_column(String(36), ForeignKey("question_paper_batches.id"), index=True, nullable=False)
    subject_id: Mapped[str] = mapped_column(String(36), ForeignKey("subjects.id"), index=True, nullable=False)
    exam_year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    exam_type: Mapped[ExamType] = mapped_column(Enum(ExamType), index=True, nullable=False)

    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    page_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    markdown_key: Mapped[str | None] = mapped_column(String(500), nullable=True)

    parser_status: Mapped[StageStatus] = mapped_column(
        Enum(StageStatus), default=StageStatus.PENDING, index=True, nullable=False
    )
    extraction_status: Mapped[StageStatus] = mapped_column(
        Enum(StageStatus), default=StageStatus.PENDING, index=True, nullable=False
    )
    indexing_status: Mapped[StageStatus] = mapped_column(
        Enum(StageStatus), default=StageStatus.PENDING, index=True, nullable=False
    )
    publication_status: Mapped[PublicationStatus] = mapped_column(
        Enum(PublicationStatus), default=PublicationStatus.DRAFT, index=True, nullable=False
    )

    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    parser_version: Mapped[str | None] = mapped_column(String(50), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    batch: Mapped["QuestionPaperBatch"] = relationship("QuestionPaperBatch", back_populates="documents")  # type: ignore # noqa: F821
    subject: Mapped["Subject"] = relationship("Subject", back_populates="question_papers")  # type: ignore # noqa: F821
    questions: Mapped[list["Question"]] = relationship(  # type: ignore # noqa: F821
        "Question", back_populates="document", cascade="all, delete-orphan"
    )
    jobs: Mapped[list["ProcessingJob"]] = relationship(  # type: ignore # noqa: F821
        "ProcessingJob", back_populates="document", cascade="all, delete-orphan"
    )
    assets: Mapped[list["DocumentAsset"]] = relationship(  # type: ignore # noqa: F821
        "DocumentAsset", back_populates="document", cascade="all, delete-orphan"
    )
