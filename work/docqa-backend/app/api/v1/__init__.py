from fastapi import APIRouter

from app.api.v1.ai_prep import router as ai_prep_router
from app.api.v1.auth import router as auth_router
from app.api.v1.batches import router as batches_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.documents import admin_router as documents_admin_router
from app.api.v1.documents import public_router as documents_public_router
from app.api.v1.questions import admin_router as questions_admin_router
from app.api.v1.questions import public_router as questions_public_router
from app.api.v1.search import router as search_router
from app.api.v1.subjects import admin_router as subjects_admin_router
from app.api.v1.subjects import public_router as subjects_public_router

api_v1_router = APIRouter(prefix="/api/v1")

# Mount endpoints
api_v1_router.include_router(auth_router)
api_v1_router.include_router(dashboard_router)
api_v1_router.include_router(subjects_public_router)
api_v1_router.include_router(subjects_admin_router)
api_v1_router.include_router(batches_router)
api_v1_router.include_router(documents_admin_router)
api_v1_router.include_router(documents_public_router)
api_v1_router.include_router(questions_admin_router)
api_v1_router.include_router(questions_public_router)
api_v1_router.include_router(search_router)
api_v1_router.include_router(ai_prep_router)
