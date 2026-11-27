"""Unified reproducible evaluation runner across Embedding, Retrieval, ML/LTR, RAG, and Agent suites."""
from __future__ import annotations

import json
import subprocess
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from ..core.config import Settings, get_settings
from ..core.security import hash_password
from ..models import User
from .agent_bench import run_agent_benchmark
from .embedding_bench import evaluate_embedding_models
from .rag_bench import run_rag_benchmark
from .ranking_bench import run_synthetic_dev_benchmark
from .retrieval_bench import compare_retrieval_strategies


def _current_git_sha() -> str | None:
    try:
        out = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], stderr=subprocess.DEVNULL, text=True)
        return out.strip()
    except Exception:
        return None


def run_all_benchmarks(
    db: Session,
    settings: Settings,
    *,
    report_path: Path | None = None,
) -> dict[str, Any]:
    """Run reproducible Phase 2–7 evaluation suites with explicit provenance separation."""
    suffix = uuid.uuid4().hex[:8]
    ret_user = User(
        email=f"ret_eval_{suffix}@example.com",
        password_hash=hash_password("EvalPass123!"),
        full_name="Retrieval Eval",
    )
    db.add(ret_user)
    db.commit()

    emb_results = [
        asdict(r)
        for r in evaluate_embedding_models(
            model_names=[settings.embedding_model_name],
            use_stub=settings.use_stub_embeddings,
        )
    ]
    retrieval_results = [asdict(r) for r in compare_retrieval_strategies(db, ret_user, settings)]
    ml_results = run_synthetic_dev_benchmark(db)
    rag_results = run_rag_benchmark(db, settings)
    agent_results = run_agent_benchmark(db, settings)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "git_sha": _current_git_sha(),
        "use_stub_embeddings": settings.use_stub_embeddings,
        "provenance_notice": (
            "Synthetic ML splits (`synthetic_dev`) and curated benchmark suites (`curated_benchmark`) "
            "are strictly separated from real user feedback metrics."
        ),
        "suites": {
            "embeddings": emb_results,
            "retrieval": retrieval_results,
            "ml_and_ltr": ml_results,
            "rag": rag_results,
            "agent": agent_results,
        },
    }

    if report_path is not None:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    return payload


if __name__ == "__main__":
    import tempfile
    from backend.app.core.database import build_engine, get_sessionmaker
    from backend.app.models import Base

    out_file = Path("docs/experiments/phase7_evaluation_report.json")
    with tempfile.TemporaryDirectory() as tmp:
        cfg = get_settings().model_copy(
            update={
                "database_url": f"sqlite:///{Path(tmp) / 'eval_all.db'}",
                "use_stub_embeddings": True,
                "llm_provider": "mock",
            }
        )
        eng = build_engine(cfg)
        Base.metadata.create_all(bind=eng)
        with get_sessionmaker(cfg)() as session:
            summary = run_all_benchmarks(session, cfg, report_path=out_file)
        eng.dispose()
    print(f"Wrote evaluation report to {out_file} (git_sha={summary['git_sha']})")
