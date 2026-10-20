import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.enums import PublicationStatus, ReviewStatus


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    subject_id: Mapped[str] = mapped_column(String(36), ForeignKey("subjects.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    parent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("topics.id"), nullable=True)

    # Relationships
    questions: Mapped[list["QuestionTopic"]] = relationship("QuestionTopic", back_populates="topic")  # type: ignore # noqa: F821


class QuestionTopic(Base):
    __tablename__ = "question_topics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    question_id: Mapped[str] = mapped_column(String(36), ForeignKey("questions.id"), index=True, nullable=False)
    topic_id: Mapped[str] = mapped_column(String(36), ForeignKey("topics.id"), index=True, nullable=False)

    # Relationships
    question: Mapped["Question"] = relationship("Question", back_populates="topic_associations")  # type: ignore # noqa: F821
    topic: Mapped["Topic"] = relationship("Topic", back_populates="questions")  # type: ignore # noqa: F821


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("question_papers.id"), index=True, nullable=False)
    subject_id: Mapped[str] = mapped_column(String(36), ForeignKey("subjects.id"), index=True, nullable=False)

    question_number: Mapped[str] = mapped_column(String(50), nullable=False)
    parent_question_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("questions.id"), nullable=True)

    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_text: Mapped[str] = mapped_column(Text, nullable=False)

    page_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    page_end: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    marks: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Structured arrays
    topics: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    bbox: Mapped[list[float] | None] = mapped_column(JSON, nullable=True)
    embedding_json: Mapped[list[float] | None] = mapped_column(JSON, nullable=True)

    review_status: Mapped[ReviewStatus] = mapped_column(
        Enum(ReviewStatus), default=ReviewStatus.PENDING, index=True, nullable=False
    )
    publication_status: Mapped[PublicationStatus] = mapped_column(
        Enum(PublicationStatus), default=PublicationStatus.DRAFT, index=True, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    document: Mapped["QuestionPaper"] = relationship("QuestionPaper", back_populates="questions")  # type: ignore # noqa: F821
    subject: Mapped["Subject"] = relationship("Subject", back_populates="questions")  # type: ignore # noqa: F821
    subquestions: Mapped[list["Question"]] = relationship("Question", backref="parent_question", remote_side=[id])
    topic_associations: Mapped[list["QuestionTopic"]] = relationship(
        "QuestionTopic", back_populates="question", cascade="all, delete-orphan"
    )
