"""Health and readiness probes."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ...core.config import get_settings
from ...core.database import check_database_ready
from ...core.rate_limit import check_redis_ready
from ...schemas.common import HealthStatus, ReadinessStatus

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthStatus)
def health() -> HealthStatus:
    settings = get_settings()
    return HealthStatus(
        status="ok",
        app=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
    )


@router.get("/ready", response_model=ReadinessStatus)
def ready():
    settings = get_settings()
    db_ok, db_msg = check_database_ready(settings)
    redis_ok, redis_msg = check_redis_ready(settings)

    # In local SQLite development mode without Redis, report degraded-ready accurately if DB is up
    # In production, both PostgreSQL and Redis must be reachable.
    is_ready = db_ok and (redis_ok or settings.environment != "production")
    payload = ReadinessStatus(
        status="ready" if is_ready else "not_ready",
        database="ok" if db_ok else "error",
        redis="ok" if redis_ok else ("optional_offline" if settings.environment != "production" else "error"),
        details={
            "database": db_msg,
            "redis": redis_msg,
            "db_dialect": "postgresql" if settings.is_postgres else "sqlite_dev",
        },
    )
    status_code = 200 if is_ready else 503
    return JSONResponse(content=payload.model_dump(), status_code=status_code)
