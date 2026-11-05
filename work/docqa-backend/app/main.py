from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models  # Ensure all SQLAlchemy models are registered
from app.api.chat import router as chat_router
from app.api.documents import router as documents_router
from app.api.search import router as search_router
from app.api.v1 import api_v1_router
from app.core.config import settings
from app.db.session import Base, SessionLocal, engine, upgrade_schema
from app.services.auth_service import init_default_admin
from app.services.subject_service import init_default_subjects


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure database schema is created
    Base.metadata.create_all(bind=engine)
    # Ensure incremental schema updates are applied
    upgrade_schema(engine)
    # Ensure directories exist
    settings.setup_directories()
    # Bootstrap default admin & curriculum subjects
    db = SessionLocal()
    try:
        init_default_admin(db)
        init_default_subjects(db)
    finally:
        db.close()
    yield



app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Full-stack Previous Year Question (PYQ) Recommender & Management System",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API v1 endpoints
app.include_router(api_v1_router)

# Legacy / Prototype endpoints preserved
app.include_router(documents_router)
app.include_router(search_router)
app.include_router(chat_router)


@app.get("/health")
@app.get("/health/live")
@app.get("/health/ready")
def health_check() -> dict[str, str]:
    return {"status": "ok", "project": settings.PROJECT_NAME}
