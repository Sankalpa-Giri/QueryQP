import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.db.session import Base, get_db
from app.main import app
from app.models.user import AdminUser
from app.core.security import get_password_hash

class TestPhase1AuthAndSubjects:

    def test_health_checks(self, client):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

        res_live = client.get("/health/live")
        assert res_live.status_code == 200

    def test_admin_login_success(self, client):
        res = client.post("/api/v1/admin/auth/login", json={"username": "admin", "password": "admin123"})
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["username"] == "admin"

    def test_admin_login_failure(self, client):
        res = client.post("/api/v1/admin/auth/login", json={"username": "admin", "password": "wrongpassword"})
        assert res.status_code == 401
        assert "Incorrect username or password" in res.json()["detail"]

    def test_protected_endpoint_requires_auth(self, client):
        res = client.get("/api/v1/admin/me")
        assert res.status_code == 401

        res_invalid = client.get("/api/v1/admin/me", headers={"Authorization": "Bearer invalid_token"})
        assert res_invalid.status_code == 401

    def test_admin_me_endpoint_with_token(self, client):
        login_res = client.post("/api/v1/admin/auth/login", json={"username": "admin", "password": "admin123"})
        token = login_res.json()["access_token"]

        res = client.get("/api/v1/admin/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        assert res.json()["username"] == "admin"
        assert res.json()["role"] == "admin"

    def test_subject_lifecycle(self, client):
        login_res = client.post("/api/v1/admin/auth/login", json={"username": "admin", "password": "admin123"})
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create subject
        sub_payload = {
            "name": "Data Structures & Algorithms",
            "code": "CS201",
            "department": "Computer Science",
            "semester": 3,
            "description": "Fundamental data structures and algorithmic complexity",
        }
        res_create = client.post("/api/v1/admin/subjects", json=sub_payload, headers=headers)
        assert res_create.status_code == 201
        sub_data = res_create.json()
        assert sub_data["code"] == "CS201"
        sub_id = sub_data["id"]

        # 2. Prevent duplicate code
        res_dup = client.post("/api/v1/admin/subjects", json=sub_payload, headers=headers)
        assert res_dup.status_code == 409
        assert "already exists" in res_dup.json()["detail"]

        # 3. Public subject listing (student facing)
        res_pub = client.get("/api/v1/subjects")
        assert res_pub.status_code == 200
        codes = [s["code"] for s in res_pub.json()]
        assert "CS201" in codes

        # 4. Update subject
        res_update = client.patch(
            f"/api/v1/admin/subjects/{sub_id}",
            json={"description": "Updated course description"},
            headers=headers,
        )
        assert res_update.status_code == 200
        assert res_update.json()["description"] == "Updated course description"

        # 5. Deactivate subject (soft delete)
        res_deact = client.delete(f"/api/v1/admin/subjects/{sub_id}", headers=headers)
        assert res_deact.status_code == 200
        assert res_deact.json()["is_active"] is False

        # 6. Verify deactivated subject does not appear in student list
        res_pub2 = client.get("/api/v1/subjects")
        codes2 = [s["code"] for s in res_pub2.json()]
        assert "CS201" not in codes2

        # 7. But admin can still see it
        res_admin_list = client.get("/api/v1/admin/subjects", headers=headers)
        assert res_admin_list.status_code == 200
        admin_codes = [s["code"] for s in res_admin_list.json()]
        assert "CS201" in admin_codes

    def test_dashboard_endpoint(self, client):
        login_res = client.post("/api/v1/admin/auth/login", json={"username": "admin", "password": "admin123"})
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        res = client.get("/api/v1/admin/dashboard", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "total_papers" in data
        assert "total_questions" in data
        assert "recent_batches" in data
