"""Phase 7 tests: PII-safe JSON logging, OpenTelemetry metrics, security hardening, RAG & Agent evaluations."""
from __future__ import annotations

import json
import logging

import pytest

from backend.app.core.config import Settings
from backend.app.core.database import get_sessionmaker
from backend.app.core.observability import JsonLogFormatter, get_metrics
from backend.app.core.security import redact_mapping, redact_pii, sanitize_filename, sanitize_http_url
from backend.app.evaluation.agent_bench import run_agent_benchmark
from backend.app.evaluation.rag_bench import run_rag_benchmark
from backend.app.evaluation.run_all import run_all_benchmarks
from tests.conftest import auth_headers


def test_pii_and_secret_redaction_in_logs() -> None:
    sample = (
        "User alice@example.com phone +1-415-555-0199 used Bearer abc123def456 "
        "and sk-proj_supersecretkey998877 and jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload123.sig456 "
        "with password=MySecretPassword!"
    )
    redacted = redact_pii(sample)
    assert "alice@example.com" not in redacted
    assert "555-0199" not in redacted
    assert "abc123def456" not in redacted
    assert "sk-proj_supersecretkey998877" not in redacted
    assert "eyJhbGciOi" not in redacted
    assert "MySecretPassword" not in redacted

    mapped = redact_mapping(
        {
            "email": "bob@company.org",
            "password": "StrongPassword123",
            "raw_text": "Confidential resume contents here",
            "nested": {"api_key": "AIzaSySecretKey1234567890", "safe": "ok"},
        }
    )
    assert mapped["email"] == "[REDACTED_EMAIL]"
    assert mapped["password"] == "[REDACTED]"
    assert mapped["raw_text"] == "[REDACTED]"
    assert mapped["nested"]["api_key"] == "[REDACTED]"
    assert mapped["nested"]["safe"] == "ok"

    formatter = JsonLogFormatter()
    record = logging.LogRecord(
        name="nexus_ai",
        level=logging.INFO,
        pathname=__file__,
        lineno=40,
        msg="Resume upload for user jane@doe.io",
        args=(),
        exc_info=None,
    )
    record.raw_text = "PRIVATE_RESUME_SECRET"
    line = formatter.format(record)
    parsed = json.loads(line)
    assert "jane@doe.io" not in line
    assert "PRIVATE_RESUME_SECRET" not in line
    assert parsed["context"]["raw_text"] == "[REDACTED]"


def test_security_headers_production_guards_and_audit_isolation(client, test_settings: Settings) -> None:
    # Security headers & no-store cache policy on auth endpoints
    h_a = auth_headers(client, "sec_a@example.com")
    h_b = auth_headers(client, "sec_b@example.com")

    health_resp = client.get("/health")
    assert health_resp.status_code == 200
    assert health_resp.headers["X-Content-Type-Options"] == "nosniff"
    assert health_resp.headers["X-Frame-Options"] == "DENY"
    assert health_resp.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "X-Request-ID" in health_resp.headers
    assert "X-Trace-ID" in health_resp.headers

    consent_resp = client.post("/api/v1/auth/consent", json={"granted": True}, headers=h_a)
    assert consent_resp.status_code == 200
    assert consent_resp.headers.get("Cache-Control") == "no-store"

    # Audit log user isolation
    aud_a = client.get("/api/v1/observability/audit-logs", headers=h_a)
    aud_b = client.get("/api/v1/observability/audit-logs", headers=h_b)
    assert aud_a.status_code == 200 and aud_b.status_code == 200
    actions_a = [item["action"] for item in aud_a.json()["items"]]
    actions_b = [item["action"] for item in aud_b.json()["items"]]
    assert "auth.llm_consent" in actions_a
    assert "auth.llm_consent" not in actions_b

    # Observability metrics auth + telemetry
    unauth = client.get("/api/v1/observability/metrics")
    assert unauth.status_code == 401
    metrics_resp = client.get("/api/v1/observability/metrics", headers=h_a)
    assert metrics_resp.status_code == 200
    snap = metrics_resp.json()["metrics"]
    assert snap["request_count"] >= 4
    assert len(metrics_resp.json()["recent_spans"]) >= 1

    # Production config, URL XSS, and filename path traversal guards
    with pytest.raises(ValueError):
        Settings(environment="production", secret_key="dev-only-insecure-secret-change-in-production-min-32-chars")
    with pytest.raises(Exception):
        sanitize_http_url("javascript:alert(1)")
    with pytest.raises(Exception):
        sanitize_filename("../../etc/passwd")
    assert sanitize_http_url("https://jobs.example.com/123") == "https://jobs.example.com/123"


def test_rag_agent_and_unified_evaluation_reproducibility(client, test_settings: Settings) -> None:
    h = auth_headers(client, "eval_runner@example.com")
    SessionLocal = get_sessionmaker(test_settings)
    with SessionLocal() as db:
        rag_res = run_rag_benchmark(db, test_settings)
        assert rag_res["provenance"] == "curated_benchmark"
        assert rag_res["isolation_pass_rate"] == 1.0
        assert rag_res["injection_defense_rate"] == 1.0
        assert rag_res["faithfulness"] >= 0.8

        agent_res = run_agent_benchmark(db, test_settings)
        assert agent_res["provenance"] == "curated_benchmark"
        assert agent_res["task_completion_rate"] >= 0.8
        assert agent_res["tool_selection_accuracy"] >= 0.8
        assert agent_res["tool_failure_rate"] == 0.0
        assert agent_res["approval_gate_pass_rate"] == 1.0

        all_res = run_all_benchmarks(db, test_settings)
        assert set(all_res["suites"].keys()) == {"embeddings", "retrieval", "ml_and_ltr", "rag", "agent"}
        assert all_res["suites"]["ml_and_ltr"]["provenance"] == "synthetic_dev"

    # Evaluation API endpoints return persisted EvaluationRun records
    post_eval = client.post("/api/v1/evaluation/run", json={"suite": "rag"}, headers=h)
    assert post_eval.status_code == 200
    assert post_eval.json()["suite"] == "rag"

    runs_resp = client.get("/api/v1/evaluation/runs", headers=h)
    assert runs_resp.status_code == 200
    suites = {r["suite"] for r in runs_resp.json()["items"]}
    assert {"rag", "agent", "ml_compatibility", "ltr_ranking"}.issubset(suites)
