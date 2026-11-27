"""FastAPI application entrypoint for Nexus AI."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.v1 import agent as v1_agent
from .api.v1 import applications as v1_applications
from .api.v1 import auth as v1_auth
from .api.v1 import health as v1_health
from .api.v1 import jobs as v1_jobs
from .api.v1 import observability as v1_observability
from .api.v1 import profile as v1_profile
from .api.v1 import rag_memory_approvals as v1_rag_mem
from .api.v1 import recommendations as v1_recommendations
from .core.config import Settings, get_settings
from .core.database import build_engine
from .core.exceptions import register_exception_handlers
from .core.observability import ObservabilityMiddleware, configure_logging


def create_app(settings: Settings | None = None) -> FastAPI:
    """Construct and configure the modular FastAPI application."""
    cfg = settings or get_settings()
    configure_logging(cfg.log_level)
    build_engine(cfg)

    app = FastAPI(
        title=cfg.app_name,
        version=cfg.app_version,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(ObservabilityMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    register_exception_handlers(app)

    app.include_router(v1_health.router)
    app.include_router(v1_auth.router)
    app.include_router(v1_profile.router)
    app.include_router(v1_jobs.router)
    app.include_router(v1_applications.router)
    app.include_router(v1_recommendations.router)
    app.include_router(v1_agent.router)
    app.include_router(v1_rag_mem.router)
    app.include_router(v1_observability.router)

    return app


app = create_app()
