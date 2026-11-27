"""Hybrid retrieval engine: Dense embeddings + Sparse BM25 + RRF + Metadata filtering + Cross-Encoder."""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Literal, Optional

from rank_bm25 import BM25Okapi
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..core.config import Settings, get_settings
from ..ml.embeddings import EmbeddingService, cosine_similarity
from ..models import Job, JobEmbedding
from .reranker import CrossEncoderReranker


def tokenize_bm25(text: str) -> list[str]:
    return re.findall(r"[a-z0-9+#.]+", (text or "").lower())


@dataclass
class RetrievalFilters:
    region: Optional[str] = None
    include_global: bool = False
    work_mode: Optional[str] = None
    job_type: Optional[str] = None
    min_salary_usd_eq: Optional[int] = None
    location_contains: Optional[str] = None
    description_contains: Optional[str] = None
    source_name: Optional[str] = None
    include_expired: bool = False


@dataclass
class RetrievedJob:
    job: Job
    dense_score: float = 0.0
    bm25_score: float = 0.0
    rrf_score: float = 0.0
    rerank_score: Optional[float] = None
    final_score: float = 0.0


class HybridRetriever:
    """Executes dense, sparse BM25, RRF fusion, metadata filtering, and cross-encoder reranking."""

    def __init__(
        self,
        db: Session,
        *,
        settings: Settings | None = None,
        embedding_service: EmbeddingService | None = None,
        reranker: CrossEncoderReranker | None = None,
    ) -> None:
        self.db = db
        self.settings = settings or get_settings()
        self.emb = embedding_service or EmbeddingService(self.settings)
        self.reranker = reranker or CrossEncoderReranker(self.settings)

    def _filtered_jobs(self, user_id: uuid.UUID, filters: RetrievalFilters) -> list[Job]:
        stmt = select(Job).where(or_(Job.owner_user_id.is_(None), Job.owner_user_id == user_id))
        if not filters.include_expired:
            stmt = stmt.where(Job.is_expired.is_(False))
        if filters.region:
            reg = filters.region.upper()
            if filters.include_global and reg != "GLOBAL":
                stmt = stmt.where(Job.region.in_([reg, "GLOBAL"]))
            else:
                stmt = stmt.where(Job.region == reg)
        if filters.work_mode:
            stmt = stmt.where(Job.work_mode == filters.work_mode.lower())
        if filters.job_type:
            stmt = stmt.where(Job.job_type == filters.job_type.lower())
        if filters.min_salary_usd_eq is not None:
            stmt = stmt.where(
                Job.salary_min_usd_eq.is_not(None),
                Job.salary_min_usd_eq >= filters.min_salary_usd_eq,
            )
        if filters.source_name:
            stmt = stmt.where(Job.source_name == filters.source_name.lower())
        if filters.location_contains:
            raw_area = filters.location_contains.strip()
            area_lower = raw_area.lower()
            area_terms = [raw_area]
            alias_map = {
                "bengaluru": ["bangalore", "india"],
                "bangalore": ["bengaluru", "india"],
                "delhi ncr": ["delhi", "gurgaon", "gurugram", "noida"],
                "london": ["united kingdom", "uk"],
                "usa": ["united states", "us only", "americas", "san francisco", "new york"],
                "united states": ["usa", "us only", "americas"],
                "europe": ["eu", "berlin", "munich", "germany", "amsterdam", "london"],
                "remote": ["worldwide", "anywhere", "homeoffice", "global"],
            }
            for k, extras in alias_map.items():
                if k in area_lower:
                    area_terms.extend(extras)
            area_clauses = [Job.location.ilike(f"%{t}%") for t in area_terms] + [
                Job.description.ilike(f"%{raw_area}%")
            ]
            if filters.location_contains.strip().lower() in {"remote", "worldwide", "anywhere"}:
                area_clauses.append(Job.work_mode == "remote")
            stmt = stmt.where(or_(*area_clauses))
        if filters.description_contains:
            desc_q = filters.description_contains.strip()
            if desc_q:
                tokens = [t for t in re.split(r"[\s,]+", desc_q) if len(t) >= 2]
                if len(tokens) > 1:
                    for tok in tokens[:5]:
                        stmt = stmt.where(
                            or_(
                                Job.description.ilike(f"%{tok}%"),
                                Job.title.ilike(f"%{tok}%"),
                                Job.company.ilike(f"%{tok}%"),
                            )
                        )
                else:
                    stmt = stmt.where(
                        or_(
                            Job.description.ilike(f"%{desc_q}%"),
                            Job.title.ilike(f"%{desc_q}%"),
                            Job.company.ilike(f"%{desc_q}%"),
                        )
                    )
        return list(self.db.scalars(stmt).all())

    def search(
        self,
        query: str,
        user_id: uuid.UUID,
        *,
        filters: Optional[RetrievalFilters] = None,
        mode: Literal["hybrid", "dense", "bm25"] = "hybrid",
        use_reranker: bool = True,
        limit: int = 20,
        offset: int = 0,
        rrf_k: int = 60,
    ) -> tuple[list[RetrievedJob], int]:
        flt = filters or RetrievalFilters()
        candidates = self._filtered_jobs(user_id, flt)
        if not candidates:
            return [], 0

        q_clean = (query or "").strip()
        if not q_clean:
            candidates.sort(key=lambda j: j.created_at, reverse=True)
            total = len(candidates)
            return [RetrievedJob(job=j, final_score=1.0) for j in candidates[offset : offset + limit]], total

        candidate_ids = {j.id for j in candidates}
        id_to_job = {j.id: j for j in candidates}

        # 1) Dense retrieval scores
        dense_scores: dict[uuid.UUID, float] = {}
        dense_ranks: dict[uuid.UUID, int] = {}
        if mode in {"hybrid", "dense"}:
            q_vec = self.emb.encode_one(query, kind="query")
            mv = self.emb.get_or_register_model_version(self.db)
            dialect = self.db.bind.dialect.name if self.db.bind is not None else "sqlite"

            if dialect == "postgresql":
                dist_expr = JobEmbedding.embedding.cosine_distance(q_vec)
                rows = self.db.execute(
                    select(JobEmbedding.job_id, (1.0 - dist_expr).label("sim"))
                    .where(
                        JobEmbedding.model_version_id == mv.id,
                        JobEmbedding.job_id.in_(candidate_ids),
                    )
                    .order_by(dist_expr.asc())
                ).all()
                dense_ranked = [(jid, float(sim)) for jid, sim in rows]
            else:
                emb_rows = self.db.scalars(
                    select(JobEmbedding).where(
                        JobEmbedding.model_version_id == mv.id,
                        JobEmbedding.job_id.in_(candidate_ids),
                    )
                ).all()
                emb_map = {e.job_id: e.embedding for e in emb_rows}
                dense_ranked = []
                for job in candidates:
                    vec = emb_map.get(job.id)
                    if vec is None:
                        vec = self.emb.upsert_job_embedding(self.db, job).embedding
                    dense_ranked.append((job.id, cosine_similarity(q_vec, vec)))
                dense_ranked.sort(key=lambda x: -x[1])

            for rank_idx, (jid, sim) in enumerate(dense_ranked, start=1):
                dense_scores[jid] = round(sim, 4)
                dense_ranks[jid] = rank_idx

        # 2) Sparse BM25 retrieval scores
        bm25_scores: dict[uuid.UUID, float] = {}
        bm25_ranks: dict[uuid.UUID, int] = {}
        if mode in {"hybrid", "bm25"}:
            tokenized_docs = [
                tokenize_bm25(f"{j.title} {j.title} {j.company} {j.location or ''} {j.description}")
                for j in candidates
            ]
            q_tokens = tokenize_bm25(query)
            if q_tokens and any(tokenized_docs):
                bm25 = BM25Okapi(tokenized_docs)
                raw_bm25 = bm25.get_scores(q_tokens)
                bm25_ranked = sorted(
                    ((candidates[i].id, float(raw_bm25[i])) for i in range(len(candidates))),
                    key=lambda x: -x[1],
                )
            else:
                bm25_ranked = [(j.id, 0.0) for j in candidates]

            for rank_idx, (jid, bscore) in enumerate(bm25_ranked, start=1):
                bm25_scores[jid] = round(bscore, 4)
                bm25_ranks[jid] = rank_idx

        # 3) Fusion (RRF for hybrid, direct score for single-mode)
        fused: list[RetrievedJob] = []
        for jid, job in id_to_job.items():
            d_score = dense_scores.get(jid, 0.0)
            b_score = bm25_scores.get(jid, 0.0)
            if mode == "hybrid":
                rrf = (1.0 / (rrf_k + dense_ranks[jid])) + (1.0 / (rrf_k + bm25_ranks[jid]))
                final = rrf
            elif mode == "dense":
                rrf = 0.0
                final = d_score
            else:
                rrf = 0.0
                if b_score <= 0.0:
                    haystack = f"{job.title} {job.company} {job.location or ''} {job.description}".lower()
                    toks = tokenize_bm25(query)
                    if not toks or not any(t in haystack for t in toks):
                        continue
                    b_score = round(sum(1.0 for t in toks if t in haystack) / len(toks), 4)
                final = b_score

            fused.append(
                RetrievedJob(
                    job=job,
                    dense_score=d_score,
                    bm25_score=b_score,
                    rrf_score=round(rrf, 6),
                    final_score=round(final, 6),
                )
            )

        fused.sort(key=lambda r: -r.final_score)

        # 4) Cross-Encoder Reranking on top candidates
        if use_reranker and fused:
            rerank_pool_size = min(len(fused), max(25, limit + offset))
            pool = fused[:rerank_pool_size]
            passages = [f"{r.job.title} at {r.job.company} ({r.job.location or ''})\n{r.job.description[:1200]}" for r in pool]
            ce_scores = self.reranker.score_pairs(query, passages)
            for item, ce in zip(pool, ce_scores):
                item.rerank_score = ce
                # Blend normalized RRF rank signal with Cross-Encoder relevance
                item.final_score = round(0.75 * ce + 0.25 * min(1.0, item.rrf_score * 30.0 if mode == "hybrid" else max(0.0, item.final_score)), 6)
            pool.sort(key=lambda r: -r.final_score)
            fused = pool + fused[rerank_pool_size:]

        total = len(fused)
        return fused[offset : offset + limit], total
