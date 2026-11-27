"""Phase 8 end-to-end API contract verification for all 14 Next.js studio routes."""
from __future__ import annotations

from fastapi.testclient import TestClient


def test_frontend_full_api_contract_journey(client: TestClient) -> None:
    # 1. Demo login seeds profile, resume skills, jobs, and initial recommendations
    demo = client.post("/api/v1/auth/demo")
    assert demo.status_code == 200
    headers = {"Authorization": f"Bearer {demo.json()['access_token']}"}

    # 2. Dashboard KPIs & profile contract
    analytics = client.get("/api/v1/analytics", headers=headers)
    assert analytics.status_code == 200
    assert analytics.json()["total_jobs"] >= 1

    profile = client.get("/api/v1/profile", headers=headers)
    assert profile.status_code == 200
    assert len(profile.json()["skills"]) >= 3

    # 3. Discovery hybrid search & Job Detail match
    search = client.post("/api/v1/jobs/search", json={"query": "PyTorch FastAPI", "mode": "hybrid"}, headers=headers)
    assert search.status_code == 200
    job_id = search.json()["items"][0]["job"]["id"]

    detail = client.get(f"/api/v1/jobs/{job_id}", headers=headers)
    assert detail.status_code == 200

    match = client.post("/api/v1/jobs/match", json={"job_ids": [job_id], "explain_with_llm": False}, headers=headers)
    assert match.status_code == 200
    assert len(match.json()["items"]) == 1

    # 4. Recommendations + feedback
    recs = client.get("/api/v1/recommendations?refresh=false&limit=10", headers=headers)
    assert recs.status_code == 200
    assert len(recs.json()["items"]) >= 1

    # 5. Applications tracker
    created_app = client.post("/api/v1/applications", json={"job_id": job_id, "notes": "Frontend contract"}, headers=headers)
    assert created_app.status_code == 201
    apps = client.get("/api/v1/applications?limit=20", headers=headers)
    assert apps.status_code == 200
    assert len(apps.json()["items"]) >= 1

    # 6. Assistant orchestrator & Cited RAG QA
    chat = client.post("/api/v1/agent/chat", json={"message": "Rank compatible ML jobs for me"}, headers=headers)
    assert chat.status_code == 200
    assert "conversation_id" in chat.json()

    rag = client.post("/api/v1/rag/query", json={"query": "PyTorch FSDP interview preparation"}, headers=headers)
    assert rag.status_code == 200
    assert len(rag.json()["citations"]) >= 1

    # 7. Privacy, Memory, Approvals, Audit Trail & Observability contracts
    assert client.get("/api/v1/memory", headers=headers).status_code == 200
    assert client.get("/api/v1/approvals", headers=headers).status_code == 200
    assert client.get("/api/v1/observability/audit-logs?limit=8", headers=headers).status_code == 200
    assert client.get("/api/v1/observability/metrics", headers=headers).status_code == 200
    assert client.get("/api/v1/evaluation/runs?limit=6", headers=headers).status_code == 200
