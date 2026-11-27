"""Retrieval strategy benchmark comparing BM25, Dense, Hybrid RRF, and Hybrid+Reranker."""
from __future__ import annotations

import json
import math
import time
from dataclasses import asdict, dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from ..core.config import Settings
from ..ingestion.connectors import DemoDatasetConnector
from ..ingestion.pipeline import JobIngestionPipeline
from ..ml.embeddings import EmbeddingService
from ..models import User
from ..retrieval.hybrid import HybridRetriever


@dataclass
class RetrievalStrategyMetrics:
    strategy: str
    precision_at_1: float
    recall_at_3: float
    mrr: float
    ndcg_at_3: float
    avg_latency_ms: float


BENCHMARK_QUERIES: list[tuple[str, str]] = [
    ("PyTorch CUDA NCCL distributed GPU training vLLM", "demo-in-1"),
    ("LangGraph hybrid BM25 pgvector cross-encoder RAG", "demo-us-2"),
    ("Next.js TypeScript React Tailwind FastAPI", "demo-in-3"),
    ("LightGBM LambdaMART XGBoost learning to rank NDCG", "demo-us-4"),
    ("Kubernetes Terraform Prometheus Grafana MLOps", "demo-eu-5"),
]


def compare_retrieval_strategies(db: Session, user: User, settings: Settings) -> list[RetrievalStrategyMetrics]:
    """Ingest demo corpus and benchmark all 4 retrieval strategies."""
    emb = EmbeddingService(settings)
    pipeline = JobIngestionPipeline(db, embedding_service=emb)
    pipeline.run_connector(DemoDatasetConnector(settings=settings), keywords=[], limit=50)

    retriever = HybridRetriever(db, settings=settings, embedding_service=emb)
    configs = [
        ("bm25_only", "bm25", False),
        ("dense_only", "dense", False),
        ("hybrid_rrf", "hybrid", False),
        ("hybrid_rrf_reranked", "hybrid", True),
    ]

    report: list[RetrievalStrategyMetrics] = []
    for label, mode, rerank in configs:
        p1, r3, mrr_sum, ndcg_sum = 0.0, 0.0, 0.0, 0.0
        t0 = time.perf_counter()
        for query, target_ext_id in BENCHMARK_QUERIES:
            results, _ = retriever.search(query, user.id, mode=mode, use_reranker=rerank, limit=5)
            ext_ids = [item.job.external_id for item in results]
            if target_ext_id in ext_ids:
                rank = ext_ids.index(target_ext_id) + 1
                mrr_sum += 1.0 / rank
                if rank == 1:
                    p1 += 1.0
                if rank <= 3:
                    r3 += 1.0
                    ndcg_sum += 1.0 / math.log2(rank + 1)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        n = len(BENCHMARK_QUERIES)
        report.append(
            RetrievalStrategyMetrics(
                strategy=label,
                precision_at_1=round(p1 / n, 4),
                recall_at_3=round(r3 / n, 4),
                mrr=round(mrr_sum / n, 4),
                ndcg_at_3=round(ndcg_sum / n, 4),
                avg_latency_ms=round(elapsed_ms / n, 2),
            )
        )
    return report


if __name__ == "__main__":
    import tempfile
    from backend.app.core.database import build_engine, get_sessionmaker
    from backend.app.core.security import hash_password
    from backend.app.models import Base

    with tempfile.TemporaryDirectory() as tmp:
        s = Settings(database_url=f"sqlite:///{Path(tmp) / 'bench.db'}", use_stub_embeddings=True)
        eng = build_engine(s)
        Base.metadata.create_all(bind=eng)
        with get_sessionmaker(s)() as db:
            u = User(email="bench@example.com", password_hash=hash_password("StrongPass123!"), full_name="Bench")
            db.add(u)
            db.commit()
            res = [asdict(r) for r in compare_retrieval_strategies(db, u, s)]
        eng.dispose()
        print(json.dumps(res, indent=2))
