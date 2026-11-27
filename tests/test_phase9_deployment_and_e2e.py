"""Phase 9 tests: Docker/Compose/CI configuration integrity & full end-to-end E2E platform flow."""
from __future__ import annotations

from pathlib import Path

import yaml
from fastapi.testclient import TestClient

from tests.conftest import auth_headers

ROOT = Path(__file__).resolve().parents[1]


def test_docker_compose_ci_and_documentation_artifacts() -> None:
    for rel in [
        "Dockerfile",
        "frontend/Dockerfile",
        ".dockerignore",
        "frontend/.dockerignore",
        "docker-compose.yml",
        ".github/workflows/ci.yml",
        ".env.example",
        "README.md",
        "docs/deployment_and_operations.md",
        "docs/decision_log.md",
        "docs/experiments/ml_ranking_report.json",
        "docs/experiments/phase7_evaluation_report.json",
    ]:
        assert (ROOT / rel).exists(), f"Missing deliverable: {rel}"

    compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text(encoding="utf-8"))
    services = compose["services"]
    assert {"postgres", "redis", "backend", "celery_worker", "celery_beat", "frontend"}.issubset(services.keys())
    assert "pgvector" in services["postgres"]["image"]
    assert "healthcheck" in services["backend"]
    assert "healthcheck" in services["postgres"]
    assert "healthcheck" in services["redis"]
    assert "API_INTERNAL_ORIGIN" in services["frontend"]["environment"]

    ci = yaml.safe_load((ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8"))
    assert "backend-test" in ci["jobs"]
    assert "frontend-build" in ci["jobs"]

    dockerfile_txt = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    assert "alembic -c backend/alembic.ini upgrade head" in dockerfile_txt
    assert "libgomp1" in dockerfile_txt

    readme_txt = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "mermaid" in readme_txt.lower()
    assert "approval_requests" in readme_txt


def test_full_end_to_end_isolated_platform_journey(client: TestClient) -> None:
    h_a = auth_headers(client, "e2e_a@example.com")
    h_b = auth_headers(client, "e2e_b@example.com")

    # 1. Resume upload & grounded skill extraction
    resume_bytes = b"Experience\nBuilt Python PyTorch FastAPI PostgreSQL RAG systems with Docker.\n"
    up = client.post(
        "/api/v1/profile/resume",
        files={"file": ("e2e_resume.txt", resume_bytes, "text/plain")},
        headers=h_a,
    )
    assert up.status_code == 201
    assert any(s["canonical_name"] == "Python" for s in up.json()["extracted_skills"])

    # 2. Demo job ingestion & hybrid search
    ing = client.post("/api/v1/jobs/ingest/demo", headers=h_a)
    assert ing.status_code == 200
    search = client.post("/api/v1/jobs/search", json={"query": "PyTorch RAG FastAPI", "mode": "hybrid"}, headers=h_a)
    assert search.status_code == 200
    job_id = search.json()["items"][0]["job"]["id"]

    # 3. ML Compatibility & Ranking + implicit feedback
    match = client.post("/api/v1/jobs/match", json={"job_ids": [job_id], "explain_with_llm": False}, headers=h_a)
    assert match.status_code == 200
    assert 0.0 <= match.json()["items"][0]["compatibility_probability"] <= 1.0

    fb = client.post("/api/v1/feedback", json={"job_id": job_id, "signal_type": "shortlist"}, headers=h_a)
    assert fb.status_code == 201

    # 4. Orchestrator submission request triggers ApprovalRequest gate
    chat = client.post(
        "/api/v1/agent/chat",
        json={"message": f"Submit external job application for {job_id}"},
        headers=h_a,
    )
    assert chat.status_code == 200
    approval_id = chat.json()["pending_approval"]["approval_request_id"]

    # User B cannot see or decide User A's approval request
    b_approvals = client.get("/api/v1/approvals", headers=h_b)
    assert b_approvals.status_code == 200
    assert all(ap["id"] != approval_id for ap in b_approvals.json())

    # User A approves cleanly
    dec = client.post(f"/api/v1/approvals/{approval_id}/decide", json={"decision": "approved"}, headers=h_a)
    assert dec.status_code == 200
    assert dec.json()["status"] == "approved"

    # 5. Private RAG note & telemetry verification
    rag_doc = client.post(
        "/api/v1/rag/documents",
        json={"title": "E2E Private Note", "source_type": "candidate_doc", "content": "E2E_SECRET_PIPELINE built in Rust."},
        headers=h_a,
    )
    assert rag_doc.status_code == 201
    b_rag = client.post("/api/v1/rag/query", json={"query": "Tell me about E2E_SECRET_PIPELINE"}, headers=h_b)
    assert b_rag.status_code == 200
    assert "E2E_SECRET_PIPELINE" not in b_rag.json()["answer"]

    # 6. Observability & Alembic audit trail present for User A only
    aud_a = client.get("/api/v1/observability/audit-logs", headers=h_a).json()["items"]
    assert any(item["action"] == "approval.approved" for item in aud_a)
