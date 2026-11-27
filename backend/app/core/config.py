"""Application configuration using Pydantic v2 Settings."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Typed environment-based configuration for Nexus AI."""

    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Application
    app_name: str = "Medo AI Career Intelligence"
    app_version: str = "0.2.0"
    environment: str = "development"
    debug: bool = False
    log_level: str = "INFO"
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Security
    secret_key: str = Field(
        default="dev-only-insecure-secret-change-in-production-min-32-chars",
        min_length=16,
    )
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    rate_limit_per_minute: int = 120
    max_upload_size_bytes: int = 10 * 1024 * 1024  # 10 MB

    # Database
    database_url: str = f"sqlite:///{PROJECT_ROOT / 'data' / 'nexus_dev.db'}"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_echo: bool = False

    # Redis & Celery
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # Storage
    storage_root: Path = PROJECT_ROOT / "data" / "storage"

    # ML & Embeddings
    embedding_model_name: str = "all-MiniLM-L6-v2"
    embedding_dim: int = 384
    cross_encoder_model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    use_stub_embeddings: bool = False

    # LLM Providers
    llm_provider: str = "mock"
    llm_model: str = ""
    llm_base_url: str = ""
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "llama3.2"
    anthropic_api_key: str = ""
    deepseek_api_key: str = ""
    openai_api_key: str = ""
    llm_timeout_seconds: int = 45
    llm_max_retries: int = 2

    # External Job Sources
    apify_api_token: str = ""
    adzuna_app_id: str = ""
    adzuna_app_key: str = ""
    rapidapi_key: str = ""
    serpapi_api_key: str = ""

    # Observability
    otel_exporter_otlp_endpoint: str = ""
    langsmith_api_key: str = ""
    langsmith_project: str = "nexus-ai"

    @field_validator("secret_key")
    @classmethod
    def validate_prod_secret(cls, v: str, info) -> str:
        env = (info.data.get("environment") or "development").lower()
        if env == "production" and ("dev-only" in v or "replace-with" in v or len(v) < 32):
            raise ValueError("Production environment requires a strong SECRET_KEY (>= 32 chars).")
        return v

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings instance."""
    settings = Settings()
    settings.storage_root.mkdir(parents=True, exist_ok=True)
    return settings
