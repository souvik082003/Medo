"""Celery application and background ingestion/embedding tasks."""
from __future__ import annotations

from celery import Celery

from ..core.config import get_settings
from ..core.database import transaction_scope
from ..ml.embeddings import EmbeddingService
from ..ingestion.connectors import DemoDatasetConnector, HackerNewsConnector, RemotiveConnector
from ..ingestion.pipeline import JobIngestionPipeline

_settings = get_settings()

celery_app = Celery(
    "nexus_ai",
    broker=_settings.celery_broker_url,
    backend=_settings.celery_result_backend,
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "scheduled-job-ingestion-6h": {
            "task": "nexus.ingest_jobs",
            "schedule": 6 * 3600,
            "args": (["machine learning", "ai engineer", "backend"], "US", 25),
        }
    },
)


@celery_app.task(name="nexus.ingest_jobs")
def ingest_jobs_task(keywords: list[str], region: str = "US", limit: int = 25, use_demo: bool = False) -> dict:
    """Scheduled or on-demand job ingestion task."""
    settings = get_settings()
    emb = EmbeddingService(settings)
    connectors = (
        [DemoDatasetConnector(settings=settings)]
        if use_demo
        else [HackerNewsConnector(settings=settings), RemotiveConnector(settings=settings)]
    )
    summary: dict[str, dict] = {}
    with transaction_scope(settings) as db:
        pipeline = JobIngestionPipeline(db, embedding_service=emb)
        for conn in connectors:
            try:
                st = pipeline.run_connector(conn, keywords, region=region, limit=limit)
                summary[conn.source_name] = {
                    "fetched": st.fetched,
                    "inserted": st.inserted,
                    "updated": st.updated,
                    "duplicates": st.duplicates,
                    "expired_marked": st.expired_marked,
                }
            except Exception as exc:
                summary[conn.source_name] = {"error": str(exc)}
    return summary
