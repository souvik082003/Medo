"""Offline reproducible ML compatibility & Learning-to-Rank evaluation runner."""
from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ml.compatibility import (
    generate_synthetic_compatibility_dataset,
    train_and_compare_compatibility_models,
)
from ..models import EvaluationRun, Feedback, JobMatch
from ..ranking.ltr import BaselineWeightedRanker, train_and_compare_rankers
from ..ranking.metrics import evaluate_ranking_groups


def run_synthetic_dev_benchmark(db: Session | None = None, *, report_path: Path | None = None) -> dict:
    """Train & evaluate compatibility and LTR models on documented synthetic_dev splits."""
    X, y_bin, y_rel, groups = generate_synthetic_compatibility_dataset(
        n_candidates=100, jobs_per_candidate=15, seed=42
    )
    compat_wrapper, compat_reports = train_and_compare_compatibility_models(
        X, y_bin, groups, provenance="synthetic_dev", seed=42
    )
    ranker_wrapper, ranker_reports = train_and_compare_rankers(
        X, y_rel, groups, provenance="synthetic_dev", seed=42
    )

    payload = {
        "provenance": "synthetic_dev",
        "warning": "Synthetic development benchmark — NOT real-world user performance.",
        "dataset_summary": {"n_rows": int(len(X)), "n_groups": int(len(set(groups.tolist())))},
        "compatibility_models": [asdict(r) for r in compat_reports],
        "ranking_models": [asdict(r) for r in ranker_reports],
        "selected_compatibility_model": compat_wrapper.model_name,
        "selected_ranker_model": ranker_wrapper.model_name,
    }

    if db is not None:
        db.add(
            EvaluationRun(
                suite="ml_compatibility",
                dataset_name="synthetic_compat_100x15_v1",
                dataset_provenance="synthetic",
                metrics_json={"best_model": compat_wrapper.model_name, **compat_wrapper.metrics},
                report_path=str(report_path) if report_path else None,
            )
        )
        db.add(
            EvaluationRun(
                suite="ltr_ranking",
                dataset_name="synthetic_ltr_100x15_v1",
                dataset_provenance="synthetic",
                metrics_json={"best_model": ranker_wrapper.model_name, **ranker_wrapper.metrics},
                report_path=str(report_path) if report_path else None,
            )
        )
        db.commit()

    if report_path is not None:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    return payload


def evaluate_real_feedback_ranking(db: Session) -> dict:
    """Evaluate ranking strictly on real persisted Feedback signals (kept separate from synthetic)."""
    rows = db.execute(
        select(Feedback.user_id, Feedback.relevance_weight, JobMatch.ranking_score)
        .join(JobMatch, (JobMatch.user_id == Feedback.user_id) & (JobMatch.job_id == Feedback.job_id))
    ).all()

    if not rows:
        return {
            "provenance": "real_feedback",
            "status": "insufficient_data",
            "n_interactions": 0,
            "metrics": None,
        }

    by_user: dict[str, tuple[list[float], list[float]]] = {}
    for uid, rel, score in rows:
        key = str(uid)
        preds, rels = by_user.setdefault(key, ([], []))
        preds.append(float(score))
        rels.append(max(0.0, float(rel)))

    groups = [(preds, rels) for preds, rels in by_user.values() if len(preds) >= 2]
    if not groups:
        return {
            "provenance": "real_feedback",
            "status": "insufficient_grouped_data",
            "n_interactions": len(rows),
            "metrics": None,
        }

    metrics = evaluate_ranking_groups(groups, relevance_threshold=1.0)
    db.add(
        EvaluationRun(
            suite="ltr_ranking",
            dataset_name="real_user_feedback",
            dataset_provenance="real",
            metrics_json=metrics,
        )
    )
    db.commit()
    return {
        "provenance": "real_feedback",
        "status": "evaluated",
        "n_interactions": len(rows),
        "n_user_groups": len(groups),
        "metrics": metrics,
    }


if __name__ == "__main__":
    out = Path("docs/experiments/ml_ranking_report.json")
    report = run_synthetic_dev_benchmark(report_path=out)
    print(json.dumps(report, indent=2))
