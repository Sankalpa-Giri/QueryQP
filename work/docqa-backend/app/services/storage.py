from enum import Enum
from pathlib import Path
from pydantic import BaseModel, Field
from fastapi import UploadFile, HTTPException, status
from typing import Literal

PROJECT_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_DIRECTORY = PROJECT_ROOT / "data" / "uploads"
NORMALIZED_DIRECTORY = PROJECT_ROOT / "data" / "normalized"

for directory in (UPLOAD_DIRECTORY, NORMALIZED_DIRECTORY):
    directory.mkdir(parents=True, exist_ok=True)


class QuestionPaperMetadata(BaseModel):
    subject: str = Field(..., description="Subject acronym like CN, DSA, AI")
    year: int = Field(..., ge=2000, le=2100)
    exam: Literal["MID", "END"]
    semester: int = Field(..., ge=1, le=8)
    question_set: int = Field(default=1, ge=1, le=9)

    @property
    def document_key(self) -> str:
        """
        Generates deterministic key:
        e.g., CN-2024-END-5-01-S1
        """
        subj = self.subject.strip().upper()
        return f"{subj}-{self.year}-{self.exam}-{self.semester}-{self.question_set}"


def uploaded_path(doc_key: str) -> Path:
    """Generate the full file path for storing the raw PDF using its semantic key."""
    return UPLOAD_DIRECTORY / f"{doc_key}.pdf"


def normalized_destination(doc_key: str) -> Path:
    """Generate destination path for the normalized JSON output."""
    return NORMALIZED_DIRECTORY / f"{doc_key}.json"


def save_upload(doc_key: str, file: UploadFile) -> Path:
    """Stream uploaded file to disk in 1 MB chunks using the structured naming key."""
    destination = uploaded_path(doc_key)
    with destination.open("wb") as target:
        while content := file.file.read(1024 * 1024):
            target.write(content)
    return destination