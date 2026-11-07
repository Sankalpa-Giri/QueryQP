import uuid
from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base


class Slide(Base):
    """Lecture PPT or PDF slides uploaded by university professors."""

    __tablename__ = "slides"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    subject_id = Column(String(36), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)

    # Professor / Teacher details
    professor_name = Column(String(150), nullable=False, index=True)
    professor_title = Column(String(200), nullable=True)  # e.g. "Dr. Ramesh Kumar, Associate Professor"

    # Slide content metadata
    topic_name = Column(String(200), nullable=False, index=True)  # e.g. "Unit 1: Linked Lists & Stacks"
    title = Column(String(250), nullable=False)  # e.g. "Lecture 03 - Singly & Doubly Linked Lists"
    description = Column(Text, nullable=True)

    # File storage
    filename = Column(String(255), nullable=False)
    storage_key = Column(String(255), nullable=False)
    file_type = Column(String(10), nullable=False, default="pdf")  # pdf, pptx, ppt
    file_size_bytes = Column(Integer, nullable=False, default=0)

    # Academic metadata
    semester = Column(Integer, nullable=True)
    academic_year = Column(Integer, nullable=True)
    download_count = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    subject = relationship("Subject", backref="slides")
