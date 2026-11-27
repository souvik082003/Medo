"""Jobs API endpoints (/api/v1/jobs) including hybrid search and source health."""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...auth.dependencies import get_current_user
from ...core.config import get_settings
from ...core.database import get_db
from ...core.exceptions import AppError
from ...core.rate_limit import rate_limit_dependency
from ...core.security import sanitize_http_url
from ...ingestion.connectors import (
    AdzunaConnector,
    ApifyLinkedInConnector,
    ArbeitnowConnector,
    DemoDatasetConnector,
    GreenhousePublicConnector,
    HackerNewsConnector,
    HimalayasConnector,
    JobicyConnector,
    JSearchRapidAPIConnector,
    RemoteOKConnector,
    RemotiveConnector,
    SerpApiGoogleJobsConnector,
    TheMuseConnector,
    WorkingNomadsConnector,
    build_sources_catalog,
)
from ...ingestion.normalizer import RawJobRecord, normalize_job_record
from ...ingestion.pipeline import JobIngestionPipeline
from ...ml.embeddings import EmbeddingService
from ...models import Job, JobSource, User
from ...repositories.job_repo import JobRepository
from ...retrieval.hybrid import HybridRetriever, RetrievalFilters
from ...schemas.common import PaginatedResponse
from ...schemas.job import (
    JobCreateManual,
    JobResponse,
    JobSearchRequest,
    JobSearchResultItem,
    JobSourceCatalogItem,
    JobSourceHealthResponse,
    LiveIngestRequest,
)

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


@router.get("", response_model=PaginatedResponse[JobResponse])
def list_jobs(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    job_type: Optional[str] = Query(default=None),
    work_mode: Optional[str] = Query(default=None),
    region: Optional[str] = Query(default=None),
    source_name: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaginatedResponse[JobResponse]:
    repo = JobRepository(db)
    items, total = repo.list_visible_jobs(
        current_user.id,
        limit=limit,
        offset=offset,
        job_type=job_type,
        work_mode=work_mode,
        region=region,
        source_name=source_name,
    )
    return PaginatedResponse(
        items=[JobResponse.model_validate(j) for j in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=JobResponse, status_code=201)
def create_manual_job(
    payload: JobCreateManual,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobResponse:
    safe_url = sanitize_http_url(payload.application_url)
    norm = normalize_job_record(
        RawJobRecord(
            source="manual",
            title=payload.title,
            company=payload.company,
            location=payload.location,
            description=payload.description,
            salary_raw=payload.salary_raw,
            job_type=payload.job_type,
            work_mode=payload.work_mode,
            application_url=safe_url or payload.application_url,
        )
    )
    repo = JobRepository(db)
    src = repo.get_or_create_source("manual", source_type="manual")
    job = Job(
        source_id=src.id,
        source_name="manual",
        content_hash=norm.content_hash,
        owner_user_id=current_user.id,
        title=norm.title,
        company=norm.company,
        location=norm.location,
        region=payload.region or norm.region,
        description=norm.description,
        salary_raw=norm.salary_raw,
        salary_min=norm.salary_min,
        salary_max=norm.salary_max,
        salary_currency=norm.salary_currency,
        salary_min_usd_eq=norm.salary_min_usd_eq,
        experience_min_years=norm.experience_min_years,
        experience_max_years=norm.experience_max_years,
        seniority_level=norm.seniority_level,
        min_education=norm.min_education,
        job_type=norm.job_type,
        work_mode=norm.work_mode,
        application_url=norm.application_url,
    )
    db.add(job)
    db.flush()
    EmbeddingService(get_settings()).upsert_job_embedding(db, job)
    db.commit()
    db.refresh(job)
    return JobResponse.model_validate(job)


@router.post(
    "/search",
    response_model=PaginatedResponse[JobSearchResultItem],
    dependencies=[Depends(rate_limit_dependency(limit=60, window_seconds=60))],
)
def search_jobs(
    payload: JobSearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaginatedResponse[JobSearchResultItem]:
    retriever = HybridRetriever(db, settings=get_settings())
    filters = RetrievalFilters(
        region=payload.region,
        include_global=payload.include_global,
        work_mode=payload.work_mode,
        job_type=payload.job_type,
        min_salary_usd_eq=payload.min_salary_usd_eq,
        location_contains=payload.location_contains,
        description_contains=payload.description_contains,
        source_name=payload.source_name,
    )
    items, total = retriever.search(
        payload.query,
        current_user.id,
        filters=filters,
        mode=payload.mode,
        use_reranker=payload.use_reranker,
        limit=payload.limit,
        offset=payload.offset,
    )
    return PaginatedResponse(
        items=[
            JobSearchResultItem(
                job=JobResponse.model_validate(r.job),
                dense_score=r.dense_score,
                bm25_score=r.bm25_score,
                rrf_score=r.rrf_score,
                rerank_score=r.rerank_score,
                final_score=r.final_score,
            )
            for r in items
        ],
        total=total,
        limit=payload.limit,
        offset=payload.offset,
    )


@router.post("/ingest/demo")
def ingest_demo_jobs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Ingest documented local demo dataset for offline exploration."""
    settings = get_settings()
    pipeline = JobIngestionPipeline(db, embedding_service=EmbeddingService(settings))
    stats = pipeline.run_connector(DemoDatasetConnector(settings=settings), keywords=[], limit=50)
    return {
        "source": stats.source,
        "fetched": stats.fetched,
        "inserted": stats.inserted,
        "updated": stats.updated,
        "duplicates": stats.duplicates,
    }


@router.post(
    "/ingest/live",
    dependencies=[Depends(rate_limit_dependency(limit=10, window_seconds=60))],
)
def ingest_live_jobs(
    payload: LiveIngestRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Ingest live jobs from 9 free public APIs (all_free, remotive, remoteok, arbeitnow, hackernews, themuse, workingnomads, greenhouse) or keyed APIs."""
    settings = get_settings()
    if payload.source == "apify_linkedin" and not (settings.apify_api_token or "").strip():
        raise AppError("APIFY_NOT_CONFIGURED", "APIFY_API_TOKEN is not configured in .env ($5/mo free credit, then $49/mo).", status_code=400)
    if payload.source == "adzuna" and not (settings.adzuna_app_id and settings.adzuna_app_key):
        raise AppError("ADZUNA_NOT_CONFIGURED", "ADZUNA_APP_ID and ADZUNA_APP_KEY are not configured (250 calls/day free).", status_code=400)
    if payload.source == "jsearch_rapidapi" and not (settings.rapidapi_key or "").strip():
        raise AppError("RAPIDAPI_NOT_CONFIGURED", "RAPIDAPI_KEY is not configured in .env (200 req/mo free, Pro $25/mo).", status_code=400)
    if payload.source == "serpapi_jobs" and not (settings.serpapi_api_key or "").strip():
        raise AppError("SERPAPI_NOT_CONFIGURED", "SERPAPI_API_KEY is not configured in .env (100 searches/mo free, $75/mo Dev).", status_code=400)

    connector_map = {
        "himalayas": HimalayasConnector,
        "jobicy": JobicyConnector,
        "remotive": RemotiveConnector,
        "remoteok": RemoteOKConnector,
        "arbeitnow": ArbeitnowConnector,
        "hackernews": HackerNewsConnector,
        "themuse": TheMuseConnector,
        "workingnomads": WorkingNomadsConnector,
        "greenhouse": GreenhousePublicConnector,
        "apify_linkedin": ApifyLinkedInConnector,
        "adzuna": AdzunaConnector,
        "jsearch_rapidapi": JSearchRapidAPIConnector,
        "serpapi_jobs": SerpApiGoogleJobsConnector,
    }
    pipeline = JobIngestionPipeline(db, embedding_service=EmbeddingService(settings))

    if payload.source == "all_free":
        free_sources = [
            "himalayas",
            "jobicy",
            "remotive",
            "remoteok",
            "arbeitnow",
            "hackernews",
            "themuse",
            "workingnomads",
            "greenhouse",
        ]
        per_source_limit = max(3, min(12, (payload.limit + len(free_sources) - 1) // len(free_sources)))
        totals = {"fetched": 0, "inserted": 0, "updated": 0, "duplicates": 0}
        succeeded: list[str] = []
        warnings: list[str] = []

        for src_key in free_sources:
            try:
                stats = pipeline.run_connector(
                    connector_map[src_key](settings=settings),
                    keywords=payload.keywords,
                    region=payload.region,
                    limit=per_source_limit,
                )
                totals["fetched"] += stats.fetched
                totals["inserted"] += stats.inserted
                totals["updated"] += stats.updated
                totals["duplicates"] += stats.duplicates
                succeeded.append(src_key)
            except Exception as exc:
                warnings.append(f"{src_key}: {exc}")

        if not succeeded:
            raise AppError(
                "LIVE_INGEST_FAILED",
                f"All free live sources failed: {'; '.join(warnings)}",
                status_code=502,
            )
        return {
            "source": "all_free",
            "sources_succeeded": succeeded,
            "warnings": warnings,
            **totals,
        }

    connector_cls = connector_map[payload.source]
    try:
        stats = pipeline.run_connector(
            connector_cls(settings=settings),
            keywords=payload.keywords,
            region=payload.region,
            limit=payload.limit,
        )
    except Exception as exc:
        raise AppError("LIVE_INGEST_FAILED", f"Live ingestion from {payload.source} failed: {exc}", status_code=502) from exc

    return {
        "source": stats.source,
        "fetched": stats.fetched,
        "inserted": stats.inserted,
        "updated": stats.updated,
        "duplicates": stats.duplicates,
    }


@router.get("/sources/health", response_model=list[JobSourceHealthResponse])
def list_source_health(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[JobSourceHealthResponse]:
    sources = db.scalars(select(JobSource).order_by(JobSource.name.asc())).all()
    return [JobSourceHealthResponse.model_validate(s) for s in sources]


@router.get("/sources/catalog", response_model=list[JobSourceCatalogItem])
def list_sources_catalog(
    current_user: User = Depends(get_current_user),
) -> list[JobSourceCatalogItem]:
    """Return all supported free & paid job API sources with exact pricing and setup status."""
    return [JobSourceCatalogItem(**item) for item in build_sources_catalog(get_settings())]


@router.get("/{job_id}", response_model=JobResponse)
def get_job(
    job_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobResponse:
    repo = JobRepository(db)
    job = repo.get_visible_job(job_id, current_user.id)
    if job is None:
        raise AppError("JOB_NOT_FOUND", "Job not found.", status_code=404)
    return JobResponse.model_validate(job)
