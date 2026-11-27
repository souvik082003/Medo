"""Phase 5 tests: LangGraph orchestrator routing, 14 validated tools, bounded execution, and human approval gate."""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from backend.app.agents.orchestrator import classify_intent_and_plan
from backend.app.agents.tools import ToolExecutor
from backend.app.core.config import Settings
from backend.app.core.database import get_sessionmaker
from backend.app.core.security import hash_password
from backend.app.models import ApprovalRequest, User
from tests.conftest import auth_headers


def test_intent_classification_and_tool_validation_bounds(test_settings: Settings):
    intent, plan = classify_intent_and_plan("Find remote ML jobs in India and rank them")
    assert intent == "job_discovery"
    assert plan == ["profile_intelligence_agent", "job_discovery_agent", "job_matching_agent"]

    intent2, plan2 = classify_intent_and_plan("What are my skill gaps and market trends?")
    assert intent2 == "career_advice"
    assert "career_advisor_agent" in plan2

    intent3, _ = classify_intent_and_plan("Please submit application to this job")
    assert intent3 == "application_prep"

    SessionLocal = get_sessionmaker(test_settings)
    with SessionLocal() as db:
        u = User(email="tool@example.com", password_hash=hash_password("StrongPass123!"), full_name="Tool User")
        db.add(u)
        db.commit()

        executor = ToolExecutor(db, u, settings=test_settings, max_calls=2)
        assert len(executor.registry) == 14
        assert "bash" not in executor.registry
        assert "eval" not in executor.registry

        # Invalid schema rejected gracefully
        bad_schema = executor.execute("search_jobs", {"query": ""})
        assert bad_schema.ok is False
        assert "Input validation failed" in (bad_schema.error or "")

        # Unknown tool rejected
        unknown = executor.execute("run_shell_command", {"cmd": "ls"})
        assert unknown.ok is False

        # Budget enforcement after max_calls=2
        r1 = executor.execute("get_candidate_profile", {})
        r2 = executor.execute("analyse_resume", {})
        r3 = executor.execute("get_market_trends", {})
        assert r1.ok and r2.ok
        assert r3.ok is False
        assert "budget exceeded" in (r3.error or "").lower()


def test_agent_chat_routing_conversations_and_human_approval(client: TestClient, test_settings: Settings):
    h_alice = auth_headers(client, "agent.alice@example.com")
    h_bob = auth_headers(client, "agent.bob@example.com")

    # Setup Alice's resume and demo jobs
    client.post(
        "/api/v1/profile/resume",
        headers=h_alice,
        files={"file": ("resume.txt", b"Skills\nPython, PyTorch, FastAPI, PostgreSQL\n", "text/plain")},
    )
    client.post("/api/v1/jobs/ingest/demo", headers=h_alice)
    jobs = client.get("/api/v1/jobs", headers=h_alice).json()["items"]
    target_job_id = jobs[0]["id"]

    # 1. Discovery + matching flow
    chat1 = client.post(
        "/api/v1/agent/chat",
        headers=h_alice,
        json={"message": "Find Bengaluru ML Systems jobs with PyTorch"},
    )
    assert chat1.status_code == 200, chat1.text
    d1 = chat1.json()
    assert d1["intent"] == "job_discovery"
    assert "Understanding request" in d1["execution_updates"]
    assert "Preparing recommendation" in d1["execution_updates"]
    assert len(d1["tool_results_summary"]) >= 3
    conv_id = d1["conversation_id"]

    # 2. Skill gap & trends flow on same conversation
    chat2 = client.post(
        "/api/v1/agent/chat",
        headers=h_alice,
        json={"message": "Analyze my skill gaps and market trends", "conversation_id": conv_id},
    )
    assert chat2.status_code == 200
    assert chat2.json()["intent"] == "career_advice"

    # 3. External application submission must pause for explicit human approval!
    chat3 = client.post(
        "/api/v1/agent/chat",
        headers=h_alice,
        json={"message": f"Please submit application for job {target_job_id}", "conversation_id": conv_id},
    )
    assert chat3.status_code == 200
    d3 = chat3.json()
    assert d3["pending_approval"] is not None
    assert d3["pending_approval"]["approval_required"] is True
    assert d3["pending_approval"]["action_type"] == "submit_application"

    # Verify conversation history persisted & Bob cannot access Alice's conversation
    detail_alice = client.get(f"/api/v1/conversations/{conv_id}", headers=h_alice)
    assert detail_alice.status_code == 200
    assert len(detail_alice.json()["messages"]) == 6  # 3 user + 3 assistant

    assert client.get(f"/api/v1/conversations/{conv_id}", headers=h_bob).status_code == 404
    assert client.get("/api/v1/conversations", headers=h_bob).json()["total"] == 0

    # Bob cannot delete Alice's conversation; Alice can delete cleanly even with approval ref
    assert client.delete(f"/api/v1/conversations/{conv_id}", headers=h_bob).status_code == 404
    assert client.delete(f"/api/v1/conversations/{conv_id}", headers=h_alice).status_code == 204
    assert client.get(f"/api/v1/conversations/{conv_id}", headers=h_alice).status_code == 404
