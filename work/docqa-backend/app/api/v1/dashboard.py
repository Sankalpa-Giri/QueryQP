from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import get_current_admin_user
from app.db.session import get_db
from app.schemas.dashboard import DashboardStatsResponse
from app.services.dashboard_service import get_dashboard_stats

router = APIRouter(prefix="/admin", tags=["admin-dashboard"])


@router.get("/dashboard", response_model=DashboardStatsResponse)
def get_admin_dashboard(
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(get_current_admin_user),
) -> DashboardStatsResponse:
    """Retrieve aggregate statistics and batch history for the Admin Dashboard."""
    return get_dashboard_stats(db)
