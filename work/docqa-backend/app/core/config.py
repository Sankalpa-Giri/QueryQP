from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    PROJECT_NAME: str = "PYQ Recommender System"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False

    # Database: Supports SQLite (local dev/tests) and PostgreSQL (production / docker-compose)
    DATABASE_URL: str = Field(
        default="sqlite:///./data/pyq_database.db",
        description="SQLAlchemy database URL. For PostgreSQL: postgresql+psycopg2://user:password@localhost:5432/pyq_db",
    )

    # JWT Authentication
    JWT_SECRET_KEY: str = Field(
        default="pyq-secret-key-change-in-production-2026-super-secure",
        description="Secret key for signing admin access tokens",
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Default bootstrap admin
    ADMIN_DEFAULT_USERNAME: str = "admin"
    ADMIN_DEFAULT_PASSWORD: str = "admin123"

    # Queue & Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # Storage paths & AWS S3
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    AWS_S3_BUCKET: str | None = None
    AWS_REGION: str = "us-east-1"
    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None
    STORAGE_DIR: Path = Path("./data/storage")
    UPLOAD_DIR: Path = Path("./data/uploads")

    # Document Parsing
    LLAMA_CLOUD_API_KEY: str | None = None
    DOCUMENT_PARSER: Literal["auto", "llama_parse", "pymupdf"] = "auto"

    # Search & LLM
    GROQ_API_KEY: str | None = None
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    RERANKER_MODEL: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"

    def setup_directories(self) -> None:
        """Ensure storage and upload directories exist."""
        self.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        self.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        (self.STORAGE_DIR / "documents").mkdir(parents=True, exist_ok=True)
        (self.STORAGE_DIR / "markdown").mkdir(parents=True, exist_ok=True)
        (self.STORAGE_DIR / "assets").mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.setup_directories()
