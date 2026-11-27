"""Phase 1 tests: Alembic migrations, API validation, pagination, analytics, and legacy SQLite import."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi.testclient import TestClient

from backend.app.core.config import Settings
from scripts.migrate_legacy_sqlite import migrate_legacy_data
from tests.conftest import auth_headers


def test_alembic_upgrade_and_downgrade(tmp_path: Path):
    db_file = tmp_path / "alembic_test.db"
    alembic_cfg = AlembicConfig("backend/alembic.ini")
    alembic_cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_file}")

    command.upgrade(alembic_cfg, "head")
    conn = sqlite3.connect(str(db_file))
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    conn.close()
    expected = {
        "users",
        "audit_logs",
        "candidate_profiles",
        "resume_versions",
        "skills",
        "skill_aliases",
        "candidate_skills",
        "user_preferences",
        "job_sources",
        "jobs",
        "job_versions",
        "job_skills",
        "job_embeddings",
        "job_matches",
        "saved_jobs",
        "applications",
        "application_events",
        "feedback",
        "conversations",
        "messages",
        "agent_memory",
        "approval_requests",
        "knowledge_documents",
        "knowledge_chunks",
        "model_versions",
        "evaluation_runs",
    }
    assert expected.issubset(tables)

    command.downgrade(alembic_cfg, "base")
    conn = sqlite3.connect(str(db_file))
    tables_after = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    conn.close()
    assert not expected.intersection(tables_after)


def test_health_ready_validation_and_analytics(client: TestClient):
    h = client.get("/health")
    assert h.status_code == 200
    assert h.json()["status"] == "ok"

    r = client.get("/ready")
    assert r.status_code == 200
    assert r.json()["database"] == "ok"

    headers = auth_headers(client, "api@example.com")

    # Validation error envelope
    bad_job = client.post(
        "/api/v1/jobs",
        headers=headers,
        json={"title": "A", "company": "", "description": "short", "application_url": "bad"},
    )
    assert bad_job.status_code == 422
    assert bad_job.json()["error"]["code"] == "VALIDATION_ERROR"

    # Update preferences
    pref_resp = client.put(
        "/api/v1/profile/preferences",
        headers=headers,
        json={
            "preferred_roles": ["ML Engineer", "AI Systems Engineer"],
            "preferred_locations": ["Bengaluru", "Remote"],
            "preferred_regions": ["IN", "US"],
            "preferred_currency": "INR",
            "min_salary": 3000000,
            "work_modes": ["remote", "hybrid"],
            "job_types": ["full-time"],
            "company_sizes": ["startup", "mid-size"],
            "exclude_keywords": ["intern"],
            "career_goals": "Build production retrieval and ranking systems",
        },
    )
    assert pref_resp.status_code == 200
    assert pref_resp.json()["preferred_currency"] == "INR"

    # Create job -> feedback -> application -> analytics
    job_id = client.post(
        "/api/v1/jobs",
        headers=headers,
        json={
            "title": "Senior AI Engineer",
            "company": "Acme AI",
            "location": "Remote",
            "region": "GLOBAL",
            "description": "Production LLM orchestration, hybrid search, and ranking systems.",
            "application_url": "https://acme.example.com/jobs/42",
        },
    ).json()["id"]

    fb = client.post("/api/v1/feedback", headers=headers, json={"job_id": job_id, "signal_type": "save"})
    assert fb.status_code == 201
    assert fb.json()["relevance_weight"] == 1.0

    app_id = client.post("/api/v1/applications", headers=headers, json={"job_id": job_id}).json()["id"]
    upd = client.patch(f"/api/v1/applications/{app_id}", headers=headers, json={"status": "applied"})
    assert upd.status_code == 200
    assert upd.json()["applied_at"] is not None

    analytics = client.get("/api/v1/analytics", headers=headers)
    assert analytics.status_code == 200
    adata = analytics.json()
    assert adata["total_jobs"] == 1
    assert adata["total_saved"] == 1
    assert adata["total_applications"] == 1
    assert adata["applications_by_status"]["applied"] == 1


def test_legacy_sqlite_migration_non_destructive(tmp_path: Path, test_settings: Settings):
    legacy_db = tmp_path / "legacy_jobs.db"
    conn = sqlite3.connect(str(legacy_db))
    conn.executescript(
        """
        CREATE TABLE profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at DATETIME,
            label VARCHAR(120),
            user_description TEXT,
            resume_filename VARCHAR(256),
            profile_json TEXT,
            is_current BOOLEAN
        );
        CREATE TABLE jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source VARCHAR(32),
            external_id VARCHAR(128),
            profile_id INTEGER,
            url VARCHAR(1024),
            title VARCHAR(256),
            company VARCHAR(256),
            location VARCHAR(256),
            content_hash VARCHAR(16),
            salary VARCHAR(128),
            description TEXT,
            posted_at DATETIME,
            job_type VARCHAR(32),
            work_mode VARCHAR(32),
            min_education VARCHAR(32),
            status VARCHAR(32),
            created_at DATETIME,
            applied_at DATETIME,
            notes TEXT
        );
        CREATE TABLE resume_revisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            version_num INTEGER NOT NULL,
            md_content TEXT NOT NULL,
            note TEXT
        );
        CREATE TABLE events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            timestamp DATETIME,
            kind VARCHAR(32),
            content TEXT
        );
        """
    )
    conn.execute(
        "INSERT INTO profiles (label, user_description, profile_json, is_current) VALUES (?, ?, ?, ?)",
        ("ML Systems", "Seeking ML Systems roles", json.dumps({"summary": "ML Systems Engineer"}), 1),
    )
    conn.execute(
        "INSERT INTO jobs (source, external_id, url, title, company, location, content_hash, description, status) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("hackernews", "hn-1", "https://news.ycombinator.com/item?id=1", "ML Engineer", "Anthropic", "SF", "abc123", "Build systems", "applied"),
    )
    conn.execute(
        "INSERT INTO resume_revisions (job_id, version_num, md_content, note) VALUES (?, ?, ?, ?)",
        (1, 1, "# Candidate\n- Built distributed PyTorch pipelines", "Initial tailor"),
    )
    conn.execute(
        "INSERT INTO events (job_id, timestamp, kind, content) VALUES (?, ?, ?, ?)",
        (1, "2026-05-12T10:00:00", "applied", "Applied online"),
    )
    conn.commit()
    conn.close()

    dry = migrate_legacy_data(legacy_db, "migrated@example.com", "StrongPass123!", dry_run=True)
    assert dry == {"profiles": 1, "jobs": 1, "revisions": 1, "applications": 1, "events": 1}

    migrated = migrate_legacy_data(legacy_db, "migrated@example.com", "StrongPass123!", dry_run=False)
    assert migrated["profiles"] == 1
    assert migrated["jobs"] == 1
    assert migrated["revisions"] == 1
    assert migrated["applications"] == 1
    assert migrated["events"] == 1
    assert legacy_db.exists()  # Original SQLite DB preserved untouched
