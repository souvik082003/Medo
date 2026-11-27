"""Phase 4 tests: feature engineering, ML compatibility calibration, Learning-to-Rank, and explainable recommendations API."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from backend.app.core.config import Settings
from backend.app.core.database import get_sessionmaker
from backend.app.evaluation.ranking_bench import (
    evaluate_real_feedback_ranking,
    run_synthetic_dev_benchmark,
)
from backend.app.ml.compatibility import (
    generate_synthetic_compatibility_dataset,
    group_train_val_test_split,
    train_and_compare_compatibility_models,
)
from backend.app.ml.features import FEATURE_NAMES, build_match_features
from backend.app.ranking.ltr import train_and_compare_rankers
from backend.app.ranking.metrics import evaluate_ranking_groups, ndcg_at_k
from tests.conftest import auth_headers


def test_interpretable_features_and_zero_leakage_splits():
    res = build_match_features(
        semantic_similarity=0.82,
        candidate_skills=["Python", "PyTorch", "PostgreSQL", "Docker"],
        job_required_skills=["Python", "PyTorch", "Kubernetes"],
        job_preferred_skills=["Docker", "vLLM"],
        candidate_years_exp=5.0,
        candidate_seniority="senior",
        candidate_education="master",
        preferred_locations=["Bengaluru", "Remote"],
        preferred_regions=["IN"],
        preferred_work_modes=["remote", "hybrid"],
        preferred_job_types=["full-time"],
        preferred_min_salary=3_000_000,
        preferred_currency="INR",
        job_min_exp=3.0,
        job_max_exp=7.0,
        job_seniority="senior",
        job_education="bachelor",
        job_location="Bengaluru, India",
        job_region="IN",
        job_work_mode="hybrid",
        job_type="full-time",
        job_salary_min_usd_eq=45_000,
        job_posted_at=datetime.now(timezone.utc),
        interaction_affinity=0.7,
    )
    vec = res.as_vector()
    assert len(vec) == len(FEATURE_NAMES)
    assert res.features["required_skill_coverage"] == round(2 / 3, 4)
    assert res.features["experience_fit"] == 1.0
    assert res.features["seniority_fit"] == 1.0
    assert res.features["location_fit"] == 1.0
    assert "Python" in res.strong_matching_skills
    assert "Kubernetes" in res.missing_skills

    # Verify zero group leakage across train/val/test splits
    X, y, _, groups = generate_synthetic_compatibility_dataset(n_candidates=30, jobs_per_candidate=10, seed=7)
    (_, _, g_tr), (_, _, g_val), (_, _, g_te) = group_train_val_test_split(X, y, groups, seed=7)
    assert set(g_tr).isdisjoint(set(g_val))
    assert set(g_tr).isdisjoint(set(g_te))
    assert set(g_val).isdisjoint(set(g_te))


def test_ml_compatibility_and_ltr_training_and_metrics(test_settings: Settings):
    X, y_bin, y_rel, groups = generate_synthetic_compatibility_dataset(n_candidates=60, jobs_per_candidate=12, seed=42)

    compat_wrapper, compat_reports = train_and_compare_compatibility_models(X, y_bin, groups, provenance="synthetic_dev")
    assert len(compat_reports) >= 3
    for r in compat_reports:
        assert r.provenance == "synthetic_dev"
        assert r.roc_auc >= 0.85
        assert 0.0 <= r.ece <= 0.25

    prob, conf = compat_wrapper.predict_probability([0.9, 0.9, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.9, 0.8])
    assert 0.5 < prob <= 1.0
    assert 0.5 <= conf <= 1.0

    ranker_wrapper, ranker_reports = train_and_compare_rankers(X, y_rel, groups, provenance="synthetic_dev")
    names = {r.model_name for r in ranker_reports}
    assert {"baseline_weighted", "pointwise_gbr", "pairwise_linear", "pairwise_pytorch"}.issubset(names)
    for r in ranker_reports:
        assert r.ndcg_at_5 >= 0.7
        assert r.ndcg_at_10 >= 0.75
        assert r.mrr >= 0.7

    # Offline benchmark persists EvaluationRun with synthetic provenance
    SessionLocal = get_sessionmaker(test_settings)
    with SessionLocal() as db:
        bench = run_synthetic_dev_benchmark(db)
        assert bench["provenance"] == "synthetic_dev"
        real_eval = evaluate_real_feedback_ranking(db)
        assert real_eval["provenance"] == "real_feedback"
        assert real_eval["status"] == "insufficient_data"

    # Sanity check NDCG metric directly
    assert ndcg_at_k([3, 2, 1, 0, 0], 5) == 1.0
    m = evaluate_ranking_groups([([0.9, 0.1, 0.5], [3.0, 0.0, 1.0])], relevance_threshold=2.0)
    assert m["mrr"] == 1.0


def test_matching_and_recommendations_api_with_consent_and_isolation(client: TestClient):
    h_alice = auth_headers(client, "ml.alice@example.com")
    h_bob = auth_headers(client, "ml.bob@example.com")

    # Upload resume for Alice
    resume_txt = (
        b"Summary\nSenior ML Engineer with 5 years of experience.\n"
        b"Skills\nPython, PyTorch, PostgreSQL, pgvector, FastAPI, Kubernetes\n"
        b"Education\nMaster of Science in CS\n"
    )
    up = client.post(
        "/api/v1/profile/resume",
        headers=h_alice,
        files={"file": ("alice.txt", resume_txt, "text/plain")},
    )
    assert up.status_code == 201

    # Load demo jobs
    ing = client.post("/api/v1/jobs/ingest/demo", headers=h_alice)
    assert ing.status_code == 200

    # Requesting explain_with_llm=True without consent -> 403 LLM_CONSENT_REQUIRED
    no_consent = client.post(
        "/api/v1/jobs/match",
        headers=h_alice,
        json={"explain_with_llm": True},
    )
    assert no_consent.status_code == 403
    assert no_consent.json()["error"]["code"] == "LLM_CONSENT_REQUIRED"

    # Match without LLM explanation -> returns calibrated ML predictions + deterministic reasons
    match_res = client.post(
        "/api/v1/jobs/match",
        headers=h_alice,
        json={"explain_with_llm": False},
    )
    assert match_res.status_code == 200, match_res.text
    mdata = match_res.json()
    assert mdata["matched_count"] == 5
    assert mdata["training_data_provenance"] == "synthetic_dev"
    first = mdata["items"][0]
    assert 0.0 <= first["compatibility_probability"] <= 1.0
    assert 0.5 <= first["confidence"] <= 1.0
    assert isinstance(first["strong_matching_skills"], list)
    assert isinstance(first["ranking_reasons"], list) and len(first["ranking_reasons"]) >= 1
    assert first["llm_explanation"] is None

    # Grant LLM consent -> explain_with_llm=True works cleanly
    assert client.post("/api/v1/auth/consent", headers=h_alice, json={"granted": True}).status_code == 200
    with_llm = client.post("/api/v1/jobs/match", headers=h_alice, json={"explain_with_llm": True})
    assert with_llm.status_code == 200
    assert with_llm.json()["items"][0]["llm_explanation"] is not None

    # GET /api/v1/recommendations returns sorted persisted matches for Alice
    recs = client.get("/api/v1/recommendations?limit=5", headers=h_alice)
    assert recs.status_code == 200
    scores = [it["ranking_score"] for it in recs.json()["items"]]
    assert scores == sorted(scores, reverse=True)

    # Bob's recommendations don't leak Alice's computed JobMatch records
    bob_recs = client.get("/api/v1/recommendations?refresh=false", headers=h_bob)
    assert bob_recs.status_code == 200
    # Even when Bob initializes fresh matches, Bob's strong_matching_skills reflects Bob's empty resume, not Alice's
    if bob_recs.json()["items"]:
        assert bob_recs.json()["items"][0]["strong_matching_skills"] == []
