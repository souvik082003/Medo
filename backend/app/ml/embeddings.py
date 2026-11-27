"""Sentence Transformer embedding pipeline, caching, model versioning, and pgvector retrieval."""
from __future__ import annotations

import hashlib
import json
import threading
import uuid
from typing import Iterable, Optional

import numpy as np
import redis
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import Settings, get_settings
from ..models import Job, JobEmbedding, ModelVersion

SUPPORTED_EMBEDDING_MODELS: dict[str, dict[str, str | int]] = {
    "all-MiniLM-L6-v2": {"dim": 384, "query_prefix": "", "doc_prefix": ""},
    "BAAI/bge-base-en-v1.5": {
        "dim": 768,
        "query_prefix": "Represent this sentence for searching relevant passages: ",
        "doc_prefix": "",
    },
    "intfloat/e5-base-v2": {"dim": 768, "query_prefix": "query: ", "doc_prefix": "passage: "},
}


def cosine_similarity(a: list[float] | np.ndarray, b: list[float] | np.ndarray) -> float:
    """Compute normalized cosine similarity in [-1.0, 1.0]."""
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    na = float(np.linalg.norm(va))
    nb = float(np.linalg.norm(vb))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))


class EmbeddingService:
    """Generates, caches, versions, and retrieves Sentence Transformer embeddings."""

    _model_cache: dict[str, object] = {}
    _lock = threading.Lock()

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.model_name = self.settings.embedding_model_name
        self._mem_cache: dict[str, list[float]] = {}
        self._redis: Optional[redis.Redis] = None
        self._redis_checked = False

    def _get_redis(self) -> Optional[redis.Redis]:
        if self._redis_checked:
            return self._redis
        self._redis_checked = True
        try:
            r = redis.Redis.from_url(self.settings.redis_url, socket_connect_timeout=0.3, decode_responses=True)
            r.ping()
            self._redis = r
        except Exception:
            self._redis = None
        return self._redis

    @property
    def is_stub(self) -> bool:
        return bool(self.settings.use_stub_embeddings)

    @property
    def effective_model_name(self) -> str:
        return f"stub:{self.model_name}" if self.is_stub else self.model_name

    @property
    def dimension(self) -> int:
        meta = SUPPORTED_EMBEDDING_MODELS.get(self.model_name)
        return int(meta["dim"]) if meta else self.settings.embedding_dim

    def _load_st_model(self):
        with self._lock:
            if self.model_name not in self._model_cache:
                from sentence_transformers import SentenceTransformer

                self._model_cache[self.model_name] = SentenceTransformer(self.model_name)
            return self._model_cache[self.model_name]

    @staticmethod
    def text_hash(text: str) -> str:
        return hashlib.sha256((text or "").encode("utf-8")).hexdigest()

    def _stub_encode(self, texts: list[str]) -> list[list[float]]:
        """Deterministic token-ngram projection used ONLY when USE_STUB_EMBEDDINGS=true."""
        dim = self.dimension
        out: list[list[float]] = []
        for t in texts:
            vec = np.zeros(dim, dtype=np.float32)
            tokens = [w for w in (t or "").lower().split() if w]
            if not tokens:
                out.append(vec.tolist())
                continue
            for tok in tokens:
                digest = hashlib.blake2b(tok.encode("utf-8"), digest_size=8).digest()
                idx = int.from_bytes(digest[:4], "little") % dim
                sign = 1.0 if (digest[4] & 1) == 0 else -1.0
                vec[idx] += sign
            norm = float(np.linalg.norm(vec))
            if norm > 0:
                vec = vec / norm
            out.append([round(float(x), 6) for x in vec])
        return out

    def _format_text(self, text: str, kind: str) -> str:
        meta = SUPPORTED_EMBEDDING_MODELS.get(self.model_name, {})
        prefix = str(meta.get("query_prefix" if kind == "query" else "doc_prefix", ""))
        return f"{prefix}{text}".strip()

    def encode_batch(self, texts: Iterable[str], *, kind: str = "document") -> list[list[float]]:
        """Encode texts in batch with Redis + in-memory caching."""
        raw_list = list(texts)
        if not raw_list:
            return []

        results: dict[int, list[float]] = {}
        missing_indices: list[int] = []
        missing_formatted: list[str] = []
        missing_keys: list[str] = []

        r = self._get_redis()
        for idx, raw in enumerate(raw_list):
            formatted = self._format_text(raw, kind)
            ckey = f"emb:{self.effective_model_name}:{self.text_hash(formatted)}"
            if ckey in self._mem_cache:
                results[idx] = self._mem_cache[ckey]
                continue
            if r is not None:
                try:
                    cached = r.get(ckey)
                    if cached:
                        vec = json.loads(cached)
                        self._mem_cache[ckey] = vec
                        results[idx] = vec
                        continue
                except Exception:
                    pass
            missing_indices.append(idx)
            missing_formatted.append(formatted)
            missing_keys.append(ckey)

        if missing_formatted:
            if self.is_stub:
                encoded = self._stub_encode(missing_formatted)
            else:
                model = self._load_st_model()
                arr = model.encode(missing_formatted, normalize_embeddings=True, batch_size=32, show_progress_bar=False)
                encoded = [[float(x) for x in row] for row in arr]

            for idx, ckey, vec in zip(missing_indices, missing_keys, encoded):
                self._mem_cache[ckey] = vec
                results[idx] = vec
                if r is not None:
                    try:
                        r.setex(ckey, 86400, json.dumps(vec))
                    except Exception:
                        pass

        return [results[i] for i in range(len(raw_list))]

    def encode_one(self, text: str, *, kind: str = "document") -> list[float]:
        return self.encode_batch([text], kind=kind)[0]

    def get_or_register_model_version(self, db: Session) -> ModelVersion:
        """Register or fetch active embedding ModelVersion in DB."""
        mv = db.scalar(
            select(ModelVersion).where(
                ModelVersion.model_kind == "embedding",
                ModelVersion.name == self.effective_model_name,
                ModelVersion.version == "v1",
            )
        )
        if mv is None:
            mv = ModelVersion(
                model_kind="embedding",
                name=self.effective_model_name,
                version="v1",
                training_data_provenance="stub" if self.is_stub else "pretrained",
                metrics_json={"dimension": self.dimension},
                is_active=True,
            )
            db.add(mv)
            db.flush()
        return mv

    def upsert_job_embedding(self, db: Session, job: Job) -> JobEmbedding:
        """Compute and persist embedding for a job posting if text changed or missing."""
        mv = self.get_or_register_model_version(db)
        job_text = f"{job.title}\n{job.company}\n{job.location or ''}\n{job.description}"
        thash = self.text_hash(job_text)
        existing = db.scalar(
            select(JobEmbedding).where(
                JobEmbedding.job_id == job.id,
                JobEmbedding.model_version_id == mv.id,
            )
        )
        if existing is not None and existing.text_hash == thash:
            return existing

        vec = self.encode_one(job_text, kind="document")
        if existing is None:
            existing = JobEmbedding(
                job_id=job.id,
                model_version_id=mv.id,
                text_hash=thash,
                embedding=vec,
            )
        else:
            existing.text_hash = thash
            existing.embedding = vec
        db.add(existing)
        db.flush()
        return existing

    def search_similar_jobs(
        self,
        db: Session,
        query_vector: list[float],
        user_id: uuid.UUID,
        *,
        top_k: int = 20,
    ) -> list[tuple[Job, float]]:
        """Retrieve top-k jobs by cosine similarity using pgvector on PostgreSQL or NumPy on SQLite."""
        mv = self.get_or_register_model_version(db)
        dialect = db.bind.dialect.name if db.bind is not None else "sqlite"

        if dialect == "postgresql":
            distance_expr = JobEmbedding.embedding.cosine_distance(query_vector)
            stmt = (
                select(Job, (1.0 - distance_expr).label("similarity"))
                .join(JobEmbedding, JobEmbedding.job_id == Job.id)
                .where(
                    JobEmbedding.model_version_id == mv.id,
                    Job.is_expired.is_(False),
                    (Job.owner_user_id.is_(None) | (Job.owner_user_id == user_id)),
                )
                .order_by(distance_expr.asc())
                .limit(top_k)
            )
            rows = db.execute(stmt).all()
            return [(job, float(sim)) for job, sim in rows]

        rows = db.execute(
            select(Job, JobEmbedding)
            .join(JobEmbedding, JobEmbedding.job_id == Job.id)
            .where(
                JobEmbedding.model_version_id == mv.id,
                Job.is_expired.is_(False),
                (Job.owner_user_id.is_(None) | (Job.owner_user_id == user_id)),
            )
        ).all()
        scored = [(job, cosine_similarity(query_vector, emb.embedding)) for job, emb in rows]
        scored.sort(key=lambda pair: -pair[1])
        return scored[:top_k]
