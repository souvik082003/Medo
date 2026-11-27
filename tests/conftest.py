"""Shared deterministic pytest fixtures for Nexus AI tests."""
from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import Settings, get_settings
from backend.app.core.database import build_engine, get_db
from backend.app.core.rate_limit import get_rate_limiter
from backend.app.main import create_app
from backend.app.models import Base


@pytest.fixture()
def test_settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Settings:
    db_file = tmp_path / "test_nexus.db"
    storage_dir = tmp_path / "storage"
    storage_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-at-least-32-characters-long")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_file}")
    monkeypatch.setenv("STORAGE_ROOT", str(storage_dir))
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.setenv("USE_STUB_EMBEDDINGS", "true")

    get_settings.cache_clear()
    settings = get_settings()
    engine = build_engine(settings)
    Base.metadata.create_all(bind=engine)
    get_rate_limiter().reset_local()
    yield settings
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    get_settings.cache_clear()


@pytest.fixture()
def client(test_settings: Settings) -> TestClient:
    app = create_app(test_settings)
    with TestClient(app) as tc:
        yield tc


def auth_headers(client: TestClient, email: str, password: str = "StrongPass123!", full_name: str = "Test User") -> dict[str, str]:
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )
    if resp.status_code == 409:
        resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code in (200, 201), resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
