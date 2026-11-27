"""Reproducible embedding model evaluation benchmark (MiniLM vs BGE vs E5)."""
from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

from ..core.config import Settings
from ..ml.embeddings import SUPPORTED_EMBEDDING_MODELS, EmbeddingService, cosine_similarity


@dataclass
class EmbeddingBenchmarkResult:
    model_name: str
    dimension: int
    mrr: float
    recall_at_1: float
    recall_at_3: float
    avg_query_ms: float
    is_stub: bool


DEFAULT_BENCHMARK_PAIRS: list[tuple[str, str, list[str]]] = [
    (
        "Senior ML Systems Engineer with PyTorch distributed training, CUDA, and NCCL optimization",
        "Distributed LLM Training Infrastructure Engineer: PyTorch FSDP, NCCL all-reduce, CUDA kernels, H100 clusters",
        [
            "Frontend React Engineer building customer marketing dashboards with Tailwind CSS",
            "PostgreSQL Database Administrator managing OLTP backups and replication",
        ],
    ),
    (
        "Full-Stack TypeScript developer specializing in React, Next.js, FastAPI, and PostgreSQL",
        "Product Full-Stack Engineer: Next.js, TypeScript, React, FastAPI REST APIs, PostgreSQL",
        [
            "Embedded Firmware Engineer writing bare-metal C for ARM microcontrollers",
            "Quantitative Researcher in fixed-income derivatives pricing",
        ],
    ),
    (
        "Applied NLP & RAG Engineer experienced in LangGraph, Sentence Transformers, pgvector, and BM25",
        "AI Retrieval & Agentic RAG Engineer: hybrid BM25 + pgvector search, cross-encoder reranking, LangGraph",
        [
            "iOS Mobile Developer building SwiftUI consumer apps",
            "Enterprise Sales Account Executive for SaaS accounts",
        ],
    ),
]


def evaluate_embedding_models(
    model_names: Iterable[str] = tuple(SUPPORTED_EMBEDDING_MODELS.keys()),
    *,
    use_stub: bool = False,
) -> list[EmbeddingBenchmarkResult]:
    """Compare embedding models on retrieval MRR, Recall@1, Recall@3, and latency."""
    results: list[EmbeddingBenchmarkResult] = []
    corpus: list[str] = []
    query_targets: list[tuple[str, int]] = []

    for q, pos_doc, neg_docs in DEFAULT_BENCHMARK_PAIRS:
        pos_idx = len(corpus)
        corpus.append(pos_doc)
        corpus.extend(neg_docs)
        query_targets.append((q, pos_idx))

    for name in model_names:
        settings = Settings(embedding_model_name=name, use_stub_embeddings=use_stub)
        svc = EmbeddingService(settings)
        doc_vecs = svc.encode_batch(corpus, kind="document")

        rr_scores: list[float] = []
        r1_hits = 0
        r3_hits = 0
        t_start = time.perf_counter()

        for q_text, pos_idx in query_targets:
            q_vec = svc.encode_one(q_text, kind="query")
            ranked = sorted(
                ((i, cosine_similarity(q_vec, dv)) for i, dv in enumerate(doc_vecs)),
                key=lambda x: -x[1],
            )
            rank = next(pos + 1 for pos, (doc_idx, _) in enumerate(ranked) if doc_idx == pos_idx)
            rr_scores.append(1.0 / rank)
            if rank == 1:
                r1_hits += 1
            if rank <= 3:
                r3_hits += 1

        elapsed_ms = (time.perf_counter() - t_start) * 1000.0
        n_q = len(query_targets)
        results.append(
            EmbeddingBenchmarkResult(
                model_name=svc.effective_model_name,
                dimension=svc.dimension,
                mrr=round(sum(rr_scores) / n_q, 4),
                recall_at_1=round(r1_hits / n_q, 4),
                recall_at_3=round(r3_hits / n_q, 4),
                avg_query_ms=round(elapsed_ms / n_q, 2),
                is_stub=use_stub,
            )
        )
    return results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Benchmark Sentence Transformer models")
    parser.add_argument("--stub", action="store_true", help="Run deterministic stub benchmark without downloading HF weights")
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()
    res = [asdict(r) for r in evaluate_embedding_models(use_stub=args.stub)]
    payload = json.dumps(res, indent=2)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(payload, encoding="utf-8")
    print(payload)
