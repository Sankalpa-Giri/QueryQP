import hashlib
import logging
import os
import shutil
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

logger = logging.getLogger(__name__)

# 25MB maximum per examination paper PDF
MAX_FILE_BYTES = 25 * 1024 * 1024


class StorageService:
    """Manages secure private storage for original PDFs, parsed Markdown, and assets.
    Supports both local volume storage and AWS S3 object storage with automatic local caching.
    """

    def __init__(self, base_dir: Path = settings.STORAGE_DIR):
        self.base_dir = base_dir
        self.docs_dir = base_dir / "documents"
        self.md_dir = base_dir / "markdown"
        self.assets_dir = base_dir / "assets"
        self.slides_dir = base_dir / "slides"
        self.ensure_dirs()
        self._s3_client = None

    def ensure_dirs(self) -> None:
        self.docs_dir.mkdir(parents=True, exist_ok=True)
        self.md_dir.mkdir(parents=True, exist_ok=True)
        self.assets_dir.mkdir(parents=True, exist_ok=True)
        self.slides_dir.mkdir(parents=True, exist_ok=True)

    @property
    def s3_client(self):
        """Lazily initialize boto3 S3 client using instance metadata (IAM role) or provided credentials."""
        if self._s3_client is None and settings.STORAGE_BACKEND == "s3" and settings.AWS_S3_BUCKET:
            try:
                import boto3

                kwargs: dict[str, Any] = {"region_name": settings.AWS_REGION}
                if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
                    kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
                    kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY

                self._s3_client = boto3.client("s3", **kwargs)
                logger.info("Connected to AWS S3 bucket: %s (%s)", settings.AWS_S3_BUCKET, settings.AWS_REGION)
            except Exception as e:
                logger.error("Failed to initialize AWS S3 client: %s", e)
        return self._s3_client

    def calculate_checksum(self, file_path: Path) -> str:
        """Calculate SHA-256 checksum of a file."""
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    def save_uploaded_pdf(self, file: UploadFile, document_id: str) -> tuple[str, str, int]:
        """Save an uploaded PDF to private storage and mirror to AWS S3 if enabled."""
        filename = file.filename or "question_paper.pdf"
        target_path = self.docs_dir / f"{document_id}.pdf"

        # Stream save and compute checksum simultaneously
        sha256 = hashlib.sha256()
        size_bytes = 0

        with open(target_path, "wb") as out_file:
            while chunk := file.file.read(65536):
                size_bytes += len(chunk)
                if size_bytes > MAX_FILE_BYTES:
                    target_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="File exceeds maximum allowed size of 25 MB.",
                    )
                sha256.update(chunk)
                out_file.write(chunk)

        # Validate PDF magic header (%PDF-)
        with open(target_path, "rb") as f:
            header = f.read(5)
            if not header.startswith(b"%PDF"):
                target_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    detail=f"Invalid file format: '{filename}' is not a valid PDF document.",
                )

        checksum = sha256.hexdigest()
        storage_key = str(target_path.relative_to(self.base_dir).as_posix())

        # Sync to AWS S3 if active
        if self.s3_client and settings.AWS_S3_BUCKET:
            try:
                self.s3_client.upload_file(
                    str(target_path),
                    settings.AWS_S3_BUCKET,
                    storage_key,
                    ExtraArgs={"ContentType": "application/pdf"},
                )
                logger.info("Uploaded %s to AWS S3 bucket %s", storage_key, settings.AWS_S3_BUCKET)
            except Exception as e:
                logger.warning("Failed to upload %s to AWS S3 (saved locally): %s", storage_key, e)

        return storage_key, checksum, size_bytes

    def get_document_path(self, storage_key: str) -> Path:
        """Resolve full path to stored document, downloading from AWS S3 if absent locally."""
        full_path = self.base_dir / storage_key
        if full_path.is_file():
            return full_path

        # If not present in local directory, fetch from AWS S3
        if self.s3_client and settings.AWS_S3_BUCKET:
            try:
                full_path.parent.mkdir(parents=True, exist_ok=True)
                self.s3_client.download_file(settings.AWS_S3_BUCKET, storage_key, str(full_path))
                if full_path.is_file():
                    logger.info("Restored %s from AWS S3 to local cache", storage_key)
                    return full_path
            except Exception as e:
                logger.error("Failed to fetch %s from AWS S3: %s", storage_key, e)

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored document file not found.")

    def generate_presigned_url(
        self,
        storage_key: str,
        expires_in: int = 3600,
        filename: str | None = None,
        inline: bool = True,
    ) -> str | None:
        """Generate a secure pre-signed AWS S3 URL for direct client downloading/viewing if S3 is active."""
        if self.s3_client and settings.AWS_S3_BUCKET:
            try:
                params: dict[str, Any] = {"Bucket": settings.AWS_S3_BUCKET, "Key": storage_key}
                if filename:
                    disposition = "inline" if inline else "attachment"
                    params["ResponseContentDisposition"] = f'{disposition}; filename="{filename}"'
                url = self.s3_client.generate_presigned_url(
                    "get_object",
                    Params=params,
                    ExpiresIn=expires_in,
                )
                return url
            except Exception as e:
                logger.warning("Error generating presigned S3 URL: %s", e)
        return None

    def cleanup_local_file(self, storage_key: str | None) -> bool:
        """Safely delete local cached file if S3 storage is active, keeping EC2 disk completely free."""
        if not storage_key:
            return False
        if not (self.s3_client and settings.AWS_S3_BUCKET):
            return False
        try:
            local_path = self.base_dir / storage_key
            if local_path.is_file():
                local_path.unlink(missing_ok=True)
                logger.info("Purged local cache for %s (stored in S3)", storage_key)
                return True
        except Exception as e:
            logger.warning("Failed to purge local file %s: %s", storage_key, e)
        return False

    def save_markdown(self, document_id: str, markdown_content: str) -> str:
        """Persist intermediate Markdown representation."""
        target_path = self.md_dir / f"{document_id}.md"
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(markdown_content)

        storage_key = str(target_path.relative_to(self.base_dir).as_posix())
        if self.s3_client and settings.AWS_S3_BUCKET:
            try:
                self.s3_client.upload_file(
                    str(target_path),
                    settings.AWS_S3_BUCKET,
                    storage_key,
                    ExtraArgs={"ContentType": "text/markdown"},
                )
            except Exception as e:
                logger.warning("Failed to upload markdown to S3: %s", e)

        return storage_key

    def get_markdown(self, markdown_key: str) -> str:
        """Retrieve stored intermediate Markdown."""
        target_path = self.base_dir / markdown_key
        if not target_path.is_file() and self.s3_client and settings.AWS_S3_BUCKET:
            try:
                target_path.parent.mkdir(parents=True, exist_ok=True)
                self.s3_client.download_file(settings.AWS_S3_BUCKET, markdown_key, str(target_path))
            except Exception:
                pass

        if not target_path.is_file():
            return ""
        with open(target_path, "r", encoding="utf-8") as f:
            return f.read()

    def save_slide_file(self, slide_id: str, file_obj: Any, extension: str, content_type: str = "application/pdf") -> str:
        """Store uploaded lecture slides (PDF, PPT, PPTX)."""
        clean_ext = extension.lstrip(".").lower()
        target_path = self.slides_dir / f"{slide_id}.{clean_ext}"
        with open(target_path, "wb") as buffer:
            shutil.copyfileobj(file_obj, buffer)

        storage_key = str(target_path.relative_to(self.base_dir).as_posix())
        if self.s3_client and settings.AWS_S3_BUCKET:
            try:
                self.s3_client.upload_file(
                    str(target_path),
                    settings.AWS_S3_BUCKET,
                    storage_key,
                    ExtraArgs={"ContentType": content_type},
                )
            except Exception as e:
                logger.warning("Failed to upload slide to S3: %s", e)

        return storage_key

    def get_slide_path(self, storage_key: str) -> Path:
        """Resolve path to stored slide file."""
        target_path = self.base_dir / storage_key
        if not target_path.is_file() and self.s3_client and settings.AWS_S3_BUCKET:
            try:
                target_path.parent.mkdir(parents=True, exist_ok=True)
                self.s3_client.download_file(settings.AWS_S3_BUCKET, storage_key, str(target_path))
            except Exception:
                pass
        return target_path

    def delete_slide_file(self, storage_key: str) -> bool:
        """Delete slide file from local disk and S3."""
        target_path = self.base_dir / storage_key
        if target_path.is_file():
            try:
                target_path.unlink()
            except Exception:
                pass
        if self.s3_client and settings.AWS_S3_BUCKET:
            try:
                self.s3_client.delete_object(Bucket=settings.AWS_S3_BUCKET, Key=storage_key)
            except Exception:
                pass
        return True


storage_service = StorageService()
