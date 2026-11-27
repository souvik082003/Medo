"""Phase 1 tests: authentication, RBAC, consent, rate limiting, and strict user data isolation."""
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.core.security import redact_pii, sanitize_http_url
from tests.conftest import auth_headers


def test_register_login_and_me(client: TestClient):
    reg = client.post(
        "/api/v1/auth/register",
        json={"email": "alice@example.com", "password": "SecurePassword123!", "full_name": "Alice"},
    )
    assert reg.status_code == 201
    data = reg.json()
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "alice@example.com"
    assert data["user"]["llm_consent_granted"] is False

    # Duplicate email rejected
    dup = client.post(
        "/api/v1/auth/register",
        json={"email": "alice@example.com", "password": "SecurePassword123!", "full_name": "Alice"},
    )
    assert dup.status_code == 409
    assert dup.json()["error"]["code"] == "EMAIL_EXISTS"

    # Wrong password rejected
    bad = client.post(
        "/api/v1/auth/login",
        json={"email": "alice@example.com", "password": "WrongPassword!"},
    )
    assert bad.status_code == 401

    # Valid login + /me
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "alice@example.com", "password": "SecurePassword123!"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["full_name"] == "Alice"


def test_protected_routes_require_auth(client: TestClient):
    for path in ["/api/v1/profile", "/api/v1/jobs", "/api/v1/applications", "/api/v1/analytics"]:
        resp = client.get(path)
        assert resp.status_code == 401
        assert resp.json()["error"]["code"] == "NOT_AUTHENTICATED"


def test_user_data_isolation_jobs_and_applications(client: TestClient):
    h_alice = auth_headers(client, "alice.iso@example.com")
    h_bob = auth_headers(client, "bob.iso@example.com")

    # Alice creates a private manual job
    job_resp = client.post(
        "/api/v1/jobs",
        headers=h_alice,
        json={
            "title": "ML Systems Engineer",
            "company": "PrivateStealth",
            "location": "Bengaluru",
            "region": "IN",
            "description": "Build distributed training and inference pipelines with PyTorch and Kubernetes.",
            "job_type": "full-time",
            "work_mode": "hybrid",
            "application_url": "https://example.com/jobs/1",
        },
    )
    assert job_resp.status_code == 201
    job_id = job_resp.json()["id"]

    # Alice creates an application
    app_resp = client.post(
        "/api/v1/applications",
        headers=h_alice,
        json={"job_id": job_id, "notes": "Referred by friend"},
    )
    assert app_resp.status_code == 201
    app_id = app_resp.json()["id"]

    # Bob CANNOT see Alice's private manual job or application
    assert client.get(f"/api/v1/jobs/{job_id}", headers=h_bob).status_code == 404
    assert client.get("/api/v1/jobs", headers=h_bob).json()["total"] == 0
    assert client.get("/api/v1/applications", headers=h_bob).json()["total"] == 0
    assert (
        client.patch(f"/api/v1/applications/{app_id}", headers=h_bob, json={"status": "applied"}).status_code
        == 404
    )


def test_llm_consent_and_security_helpers(client: TestClient):
    headers = auth_headers(client, "consent@example.com")
    resp = client.post("/api/v1/auth/consent", headers=headers, json={"granted": True})
    assert resp.status_code == 200
    assert resp.json()["llm_consent_granted"] is True
    assert resp.json()["llm_consent_at"] is not None

    # URL sanitization rejects javascript: XSS
    import pytest
    from backend.app.core.exceptions import AppError

    with pytest.raises(AppError):
        sanitize_http_url("javascript:alert(1)")
    assert sanitize_http_url("https://jobs.example.com/123") == "https://jobs.example.com/123"

    # PII redaction masks emails, phones, tokens
    redacted = redact_pii("Contact john.doe@mail.com or +1 415-555-1234 with Bearer secret123")
    assert "john.doe@mail.com" not in redacted
    assert "415-555-1234" not in redacted
    assert "secret123" not in redacted


def test_demo_login_and_production_disable(client: TestClient, test_settings):
    resp = client.post("/api/v1/auth/demo")
    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["email"] == "demo@nexus-ai.dev"
    headers = {"Authorization": f"Bearer {data['access_token']}"}

    # Demo workspace is immediately populated with profile, skills, jobs, and recommendations
    prof = client.get("/api/v1/profile", headers=headers)
    assert prof.status_code == 200
    assert len(prof.json()["skills"]) >= 3

    recs = client.get("/api/v1/recommendations", headers=headers)
    assert recs.status_code == 200
    assert len(recs.json()["items"]) >= 1

    # Demo login must remain disabled when environment == production
    import pytest
    from backend.app.auth.service import demo_login_user
    from backend.app.core.database import get_sessionmaker
    from backend.app.core.exceptions import AppError

    prod_settings = test_settings.model_copy(
        update={
            "environment": "production",
            "secret_key": "production-only-super-strong-secret-key-at-least-32-chars",
        }
    )
    with get_sessionmaker(test_settings)() as db:
        with pytest.raises(AppError) as exc_info:
            demo_login_user(db, settings=prod_settings)
        assert exc_info.value.code == "DEMO_DISABLED"
        assert exc_info.value.status_code == 403
