"""Job ingestion pipeline: deduplication, job versioning, expired detection, source health, and indexing."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..ml.embeddings import EmbeddingService
from ..ml.skill_taxonomy import sync_taxonomy_to_db
from ..models import Job, JobSkill, JobSource, JobVersion
from .connectors import BaseJobConnector
from .normalizer import NormalisedJob, RawJobRecord, normalize_job_record


@dataclass
class IngestionStats:
    source: str
    fetched: int = 0
    inserted: int = 0
    updated: int = 0
    duplicates: int = 0
    expired_marked: int = 0
    errors: int = 0


class JobIngestionPipeline:
    """Ingests normalized job records with 3-layer dedup, version history, and embeddings."""

    def __init__(self, db: Session, embedding_service: Optional[EmbeddingService] = None) -> None:
        self.db = db
        self.emb_service = embedding_service or EmbeddingService()

    def _get_or_create_source(self, name: str, source_type: str) -> JobSource:
        src = self.db.scalar(select(JobSource).where(JobSource.name == name))
        if src is None:
            src = JobSource(name=name, source_type=source_type)
            self.db.add(src)
            self.db.flush()
        return src

    @staticmethod
    def _desc_hash(norm: NormalisedJob) -> str:
        payload = f"{norm.title}|{norm.location or ''}|{norm.salary_raw or ''}|{norm.description}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _find_duplicate(self, source_id, norm: NormalisedJob) -> Optional[Job]:
        if norm.external_id:
            found = self.db.scalar(
                select(Job).where(Job.source_id == source_id, Job.external_id == norm.external_id)
            )
            if found is not None:
                return found
        if norm.application_url:
            found = self.db.scalar(select(Job).where(Job.application_url == norm.application_url))
            if found is not None:
                return found
        return self.db.scalar(select(Job).where(Job.content_hash == norm.content_hash))

    def ingest_records(
        self,
        records: Iterable[RawJobRecord],
        *,
        source_name: str,
        source_type: str = "official_api",
        stale_after_days: int = 30,
    ) -> IngestionStats:
        stats = IngestionStats(source=source_name)
        src = self._get_or_create_source(source_name, source_type)
        now = datetime.now(timezone.utc)
        src.last_run_at = now

        taxonomy = sync_taxonomy_to_db(self.db)
        seen_job_ids = set()

        try:
            for raw in records:
                stats.fetched += 1
                norm = normalize_job_record(raw)
                existing = self._find_duplicate(src.id, norm)
                dhash = self._desc_hash(norm)

                if existing is not None:
                    seen_job_ids.add(existing.id)
                    existing.last_seen_at = now
                    existing.is_expired = False

                    latest_ver = self.db.scalar(
                        select(JobVersion)
                        .where(JobVersion.job_id == existing.id)
                        .order_by(JobVersion.version_num.desc())
                    )
                    if latest_ver is None or latest_ver.description_hash != dhash:
                        next_ver = existing.current_version + 1
                        diff: dict[str, str] = {}
                        if existing.title != norm.title:
                            diff["title"] = f"{existing.title} -> {norm.title}"
                        if existing.salary_raw != norm.salary_raw:
                            diff["salary"] = f"{existing.salary_raw} -> {norm.salary_raw}"
                        if existing.description != norm.description:
                            diff["description"] = "updated"

                        existing.title = norm.title
                        existing.location = norm.location
                        existing.region = norm.region
                        existing.description = norm.description
                        existing.salary_raw = norm.salary_raw
                        existing.salary_min = norm.salary_min
                        existing.salary_max = norm.salary_max
                        existing.salary_currency = norm.salary_currency
                        existing.salary_min_usd_eq = norm.salary_min_usd_eq
                        existing.current_version = next_ver

                        self.db.add(
                            JobVersion(
                                job_id=existing.id,
                                version_num=next_ver,
                                title=norm.title,
                                location=norm.location,
                                salary_raw=norm.salary_raw,
                                description_hash=dhash,
                                diff_summary=diff,
                            )
                        )
                        self._sync_job_skills(existing, norm, taxonomy)
                        self.emb_service.upsert_job_embedding(self.db, existing)
                        stats.updated += 1
                    else:
                        stats.duplicates += 1
                    self.db.add(existing)
                    continue

                job = Job(
                    source_id=src.id,
                    source_name=norm.source,
                    external_id=norm.external_id,
                    content_hash=norm.content_hash,
                    title=norm.title,
                    company=norm.company,
                    location=norm.location,
                    region=norm.region,
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
                    posted_at=norm.posted_at or now,
                    expires_at=norm.expires_at,
                    is_expired=bool(norm.expires_at and norm.expires_at < now),
                    last_seen_at=now,
                    current_version=1,
                    source_metadata=norm.source_metadata,
                )
                self.db.add(job)
                self.db.flush()
                seen_job_ids.add(job.id)

                self.db.add(
                    JobVersion(
                        job_id=job.id,
                        version_num=1,
                        title=norm.title,
                        location=norm.location,
                        salary_raw=norm.salary_raw,
                        description_hash=dhash,
                        diff_summary={"initial": "created"},
                    )
                )
                self._sync_job_skills(job, norm, taxonomy)
                self.emb_service.upsert_job_embedding(self.db, job)
                stats.inserted += 1
                if job.is_expired:
                    stats.expired_marked += 1

            # Mark expired or stale jobs
            stats.expired_marked += self.mark_expired_jobs(src.id, stale_after_days=stale_after_days)

            src.last_success_at = now
            src.consecutive_failures = 0
            src.health_status = "healthy"
            src.last_error = None
            self.db.add(src)
            self.db.commit()
        except Exception as exc:
            self.db.rollback()
            src = self._get_or_create_source(source_name, source_type)
            src.last_run_at = now
            src.consecutive_failures += 1
            src.health_status = "failing" if src.consecutive_failures >= 3 else "degraded"
            src.last_error = str(exc)[:500]
            self.db.add(src)
            self.db.commit()
            stats.errors += 1
            raise

        return stats

    def run_connector(
        self, connector: BaseJobConnector, keywords: list[str], *, region: str = "US", limit: int = 25
    ) -> IngestionStats:
        records = list(connector.fetch_jobs(keywords, region=region, limit=limit))
        return self.ingest_records(
            records,
            source_name=connector.source_name,
            source_type=connector.source_type,
        )

    def mark_expired_jobs(self, source_id=None, *, stale_after_days: int = 30) -> int:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=stale_after_days)
        stmt = select(Job).where(
            Job.is_expired.is_(False),
            or_(
                (Job.expires_at.is_not(None) & (Job.expires_at < now)),
                Job.last_seen_at < cutoff,
            ),
        )
        if source_id is not None:
            stmt = stmt.where(Job.source_id == source_id)
        expired_jobs = list(self.db.scalars(stmt).all())
        for job in expired_jobs:
            job.is_expired = True
            self.db.add(job)
        return len(expired_jobs)

    def _sync_job_skills(self, job: Job, norm: NormalisedJob, taxonomy: dict) -> None:
        self.db.query(JobSkill).filter(JobSkill.job_id == job.id).delete()
        for sk in norm.skills:
            skill_row = taxonomy.get(sk.slug)
            if skill_row is None:
                continue
            self.db.add(
                JobSkill(
                    job_id=job.id,
                    skill_id=skill_row.id,
                    requirement_type=sk.proficiency if sk.proficiency in {"required", "preferred"} else "required",
                    confidence=sk.confidence,
                    evidence_span=sk.evidence_span,
                )
            )
