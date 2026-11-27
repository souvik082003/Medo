"""Phase 3 tests: job normalization, India/US currency parsing, ingestion, dedup, versioning, and hybrid retrieval."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.core.config import Settings
from backend.app.core.database import get_sessionmaker
from backend.app.evaluation.retrieval_bench import compare_retrieval_strategies
from backend.app.ingestion.connectors import DemoDatasetConnector
from backend.app.ingestion.normalizer import (
    RawJobRecord,
    compute_content_hash,
    normalize_job_record,
    parse_salary_multicurrency,
)
from backend.app.ingestion.pipeline import JobIngestionPipeline
from backend.app.ml.embeddings import EmbeddingService
from backend.app.models import Job, JobSource, JobVersion, User
from backend.app.core.security import hash_password
from tests.conftest import auth_headers


def test_multicurrency_and_india_normalization():
    # Indian LPA salary + Bengaluru alias dedup
    smin, smax, cur, usd = parse_salary_multicurrency("₹30 LPA - ₹45 LPA")
    assert (smin, smax, cur) == (3_000_000, 4_500_000, "INR")
    assert usd == 36_000

    # US k salary
    assert parse_salary_multicurrency("$150k - $210k") == (150_000, 210_000, "USD", 150_000)

    # Cross-platform dedup: Bangalore vs Bengaluru, ML vs Machine Learning, Inc vs plain
    h1 = compute_content_hash("Senior ML Engineer", "Acme Labs Inc.", "Bangalore, India")
    h2 = compute_content_hash("Machine Learning Engineer", "Acme", "Bengaluru, KA")
    assert h1 == h2

    norm = normalize_job_record(
        RawJobRecord(
            source="adzuna",
            external_id="in-99",
            title="Senior ML Engineer",
            company="BharatAI Pvt Ltd",
            location="Bengaluru, India",
            description="Required: Python, PyTorch, PostgreSQL. 4+ years of experience. Master's degree.",
            salary_raw="₹35 LPA - ₹50 LPA",
            application_url="https://example.com/in-99",
        )
    )
    assert norm.region == "IN"
    assert norm.salary_currency == "INR"
    assert norm.seniority_level == "senior"
    assert norm.min_education == "master"
    assert norm.experience_min_years == 4.0


def test_ingestion_dedup_versioning_expiry_and_source_health(test_settings: Settings):
    SessionLocal = get_sessionmaker(test_settings)
    emb = EmbeddingService(test_settings)

    with SessionLocal() as db:
        pipeline = JobIngestionPipeline(db, embedding_service=emb)

        # Initial ingestion
        r1 = RawJobRecord(
            source="hackernews",
            external_id="hn-100",
            title="AI Engineer",
            company="Nexus Labs",
            location="Remote",
            salary_raw="$160k - $190k",
            description="Build RAG pipelines with Python, FastAPI, and pgvector.",
            application_url="https://news.ycombinator.com/item?id=100",
        )
        st1 = pipeline.ingest_records([r1], source_name="hackernews")
        assert st1.inserted == 1

        # Exact duplicate skipped (same hash, no new version)
        st2 = pipeline.ingest_records([r1], source_name="hackernews")
        assert st2.duplicates == 1
        assert st2.inserted == 0

        # Modified salary/description triggers JobVersion v2
        r1_updated = r1.model_copy(
            update={
                "salary_raw": "$180k - $220k",
                "description": "Build RAG pipelines with Python, FastAPI, pgvector, and Cross-Encoder reranking.",
            }
        )
        st3 = pipeline.ingest_records([r1_updated], source_name="hackernews")
        assert st3.updated == 1

        job = db.scalar(select(Job).where(Job.external_id == "hn-100"))
        assert job.current_version == 2
        versions = db.scalars(select(JobVersion).where(JobVersion.job_id == job.id)).all()
        assert len(versions) == 2

        # Expired job detection
        expired_rec = RawJobRecord(
            source="hackernews",
            external_id="hn-exp",
            title="Legacy Role",
            company="OldCorp",
            description="Expired listing",
            expires_at=datetime.now(timezone.utc) - timedelta(days=1),
            application_url="https://news.ycombinator.com/item?id=999",
        )
        st4 = pipeline.ingest_records([expired_rec], source_name="hackernews")
        assert st4.expired_marked >= 1
        exp_job = db.scalar(select(Job).where(Job.external_id == "hn-exp"))
        assert exp_job.is_expired is True

        # Existing active job becomes stale when last_seen_at is > 30 days old
        job.last_seen_at = datetime.now(timezone.utc) - timedelta(days=45)
        db.add(job)
        db.commit()
        marked_stale = pipeline.mark_expired_jobs(src_id := job.source_id, stale_after_days=30)
        db.commit()
        assert marked_stale == 1
        assert db.get(Job, job.id).is_expired is True

        src = db.scalar(select(JobSource).where(JobSource.name == "hackernews"))
        assert src.health_status == "healthy"
        assert src.consecutive_failures == 0


def test_hybrid_search_api_and_metadata_isolation(client: TestClient, test_settings: Settings):
    h_alice = auth_headers(client, "search.alice@example.com")
    h_bob = auth_headers(client, "search.bob@example.com")

    # Ingest shared demo dataset
    ing = client.post("/api/v1/jobs/ingest/demo", headers=h_alice)
    assert ing.status_code == 200
    assert ing.json()["inserted"] == 5

    # Alice creates a private manual job
    priv = client.post(
        "/api/v1/jobs",
        headers=h_alice,
        json={
            "title": "Secret Kernel CUDA Researcher",
            "company": "StealthGPU",
            "location": "Bengaluru, India",
            "region": "IN",
            "description": "Low-level CUDA kernels and NCCL collectives.",
            "salary_raw": "₹60 LPA",
            "work_mode": "onsite",
            "application_url": "https://stealth.example.com/1",
        },
    )
    assert priv.status_code == 201

    # Hybrid search with region=IN filter
    res_in = client.post(
        "/api/v1/jobs/search",
        headers=h_alice,
        json={"query": "PyTorch CUDA NCCL distributed training", "region": "IN", "mode": "hybrid", "use_reranker": True},
    )
    assert res_in.status_code == 200
    items_in = res_in.json()["items"]
    assert len(items_in) >= 2
    assert all(item["job"]["region"] == "IN" for item in items_in)
    assert items_in[0]["rerank_score"] is not None

    # Bob searches for Alice's private job -> must NOT see StealthGPU
    res_bob = client.post(
        "/api/v1/jobs/search",
        headers=h_bob,
        json={"query": "Secret Kernel CUDA Researcher StealthGPU", "mode": "bm25", "use_reranker": False},
    )
    assert res_bob.status_code == 200
    assert all(item["job"]["company"] != "StealthGPU" for item in res_bob.json()["items"])

    # Source health endpoint
    health = client.get("/api/v1/jobs/sources/health", headers=h_alice)
    assert health.status_code == 200
    assert any(s["name"] == "demo_dataset" and s["health_status"] == "healthy" for s in health.json())


def test_retrieval_strategy_comparison(test_settings: Settings):
    SessionLocal = get_sessionmaker(test_settings)
    with SessionLocal() as db:
        user = User(email="retbench@example.com", password_hash=hash_password("StrongPass123!"), full_name="Bench")
        db.add(user)
        db.commit()
        metrics = compare_retrieval_strategies(db, user, test_settings)

    assert len(metrics) == 4
    by_name = {m.strategy: m for m in metrics}
    assert by_name["hybrid_rrf_reranked"].mrr >= 0.8
    assert by_name["hybrid_rrf"].recall_at_3 == 1.0


def test_live_ingest_endpoint_apify_and_missing_token(client, monkeypatch, test_settings: Settings):
    from backend.app.ingestion.connectors import ApifyLinkedInConnector
    from backend.app.ingestion.normalizer import RawJobRecord

    reg = client.post(
        "/api/v1/auth/register",
        json={"email": "liveingest@example.com", "password": "StrongPass123!", "full_name": "Live User"},
    )
    assert reg.status_code == 201
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    # Missing Apify token returns clean 400
    monkeypatch.setattr(test_settings, "apify_api_token", "")
    missing_resp = client.post(
        "/api/v1/jobs/ingest/live",
        headers=headers,
        json={"source": "apify_linkedin", "keywords": ["ML Engineer"], "region": "IN", "limit": 5},
    )
    assert missing_resp.status_code == 400

    # Configured token invokes connector and persists normalized jobs
    monkeypatch.setattr(test_settings, "apify_api_token", "apify_test_token")
    monkeypatch.setattr(
        ApifyLinkedInConnector,
        "fetch_jobs",
        lambda self, keywords, region="IN", limit=15: [
            RawJobRecord(
                source="apify_linkedin",
                external_id="apify-job-1",
                title="Senior ML Systems Engineer",
                company="ApifyTestCorp",
                location="Bengaluru, India",
                region="IN",
                description="Distributed PyTorch, FastAPI, pgvector, and Kubernetes.",
                salary_raw="₹42 LPA",
                work_mode="hybrid",
                application_url="https://linkedin.com/jobs/view/apify-job-1",
            )
        ],
    )
    ok_resp = client.post(
        "/api/v1/jobs/ingest/live",
        headers=headers,
        json={"source": "apify_linkedin", "keywords": ["ML Systems Engineer"], "region": "IN", "limit": 5},
    )
    assert ok_resp.status_code == 200
    data = ok_resp.json()
    assert data["source"] == "apify_linkedin"
    assert data["fetched"] == 1
    assert data["inserted"] == 1


def test_all_free_ingest_and_ollama_provider(client, monkeypatch):
    from backend.app.core.config import Settings
    from backend.app.ingestion.connectors import (
        ArbeitnowConnector,
        HackerNewsConnector,
        HimalayasConnector,
        JobicyConnector,
        RemoteOKConnector,
        RemotiveConnector,
    )
    from backend.app.ingestion.normalizer import RawJobRecord
    from backend.app.services.llm_provider import LLMProvider

    reg = client.post(
        "/api/v1/auth/register",
        json={"email": "freeuser@example.com", "password": "StrongPass123!", "full_name": "Free User"},
    )
    assert reg.status_code == 201
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    monkeypatch.setattr(
        HimalayasConnector,
        "fetch_jobs",
        lambda self, keywords, region="IN", limit=25: [
            RawJobRecord(
                source="himalayas",
                external_id="him-1",
                title="AI Backend Engineer",
                company="HimalayasTest",
                location="India",
                region="IN",
                description="FastAPI, Python, and distributed ML retrieval.",
                work_mode="remote",
                application_url="https://himalayas.app/jobs/him-1",
            )
        ],
    )
    monkeypatch.setattr(
        JobicyConnector,
        "fetch_jobs",
        lambda self, keywords, region="IN", limit=25: [
            RawJobRecord(
                source="jobicy",
                external_id="jbc-1",
                title="Remote ML Engineer",
                company="JobicyTest",
                location="India",
                region="IN",
                description="PyTorch, RAG, and evaluation pipelines.",
                work_mode="remote",
                application_url="https://jobicy.com/jobs/jbc-1",
            )
        ],
    )

    monkeypatch.setattr(
        RemotiveConnector,
        "fetch_jobs",
        lambda self, keywords, region="GLOBAL", limit=25: [
            RawJobRecord(
                source="remotive",
                external_id="rem-1",
                title="AI Systems Engineer",
                company="RemotiveTest",
                location="Remote",
                description="PyTorch, FastAPI, and RAG retrieval systems.",
                work_mode="remote",
                application_url="https://remotive.com/jobs/rem-1",
            )
        ],
    )
    monkeypatch.setattr(
        RemoteOKConnector,
        "fetch_jobs",
        lambda self, keywords, region="GLOBAL", limit=25: [
            RawJobRecord(
                source="remoteok",
                external_id="rok-1",
                title="ML Platform Engineer",
                company="RemoteOKTest",
                location="Remote",
                description="Kubernetes, Python, and vector databases.",
                work_mode="remote",
                application_url="https://remoteok.com/jobs/rok-1",
            )
        ],
    )
    monkeypatch.setattr(
        ArbeitnowConnector,
        "fetch_jobs",
        lambda self, keywords, region="ALL", limit=25: [
            RawJobRecord(
                source="arbeitnow",
                external_id="arb-1",
                title="NLP Retrieval Engineer",
                company="ArbeitTest",
                location="Berlin",
                description="BM25, pgvector, and LLM evaluation.",
                work_mode="remote",
                application_url="https://arbeitnow.com/jobs/arb-1",
            )
        ],
    )
    # Simulate one failing free feed to verify graceful partial success
    monkeypatch.setattr(
        HackerNewsConnector,
        "fetch_jobs",
        lambda self, keywords, region="US", limit=25: (_ for _ in ()).throw(RuntimeError("HN timeout")),
    )

    resp = client.post(
        "/api/v1/jobs/ingest/live",
        headers=headers,
        json={"source": "all_free", "keywords": ["AI Engineer"], "region": "IN", "limit": 12},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "all_free"
    assert set(body["sources_succeeded"]) == {"himalayas", "jobicy", "remotive", "remoteok", "arbeitnow"}
    assert len(body["warnings"]) == 1
    assert body["inserted"] == 5

    # Verify Ollama provider uses free local endpoint without requiring API key
    called = {}
    def _fake_compat(self, provider, prompt, *, system=None, max_tokens=1024, t0=0.0):
        called["provider"] = provider
        called["base_url"] = self.settings.ollama_base_url
        called["model"] = self.settings.ollama_model
        from backend.app.services.llm_provider import LLMResponse
        return LLMResponse(text="ok", model=self.settings.ollama_model, provider=provider)

    monkeypatch.setattr(LLMProvider, "_call_openai_compat", _fake_compat)
    llm_res = LLMProvider(Settings(llm_provider="ollama")).complete("hello")
    assert llm_res.provider == "ollama"
    assert called["base_url"] == "http://localhost:11434/v1"
    assert called["model"] == "llama3.2"


def test_region_word_boundary_and_include_global(client):
    from backend.app.ingestion.normalizer import infer_region

    assert infer_region("Dusseldorf; Munich") == "EU"
    assert infer_region("Europe, USA, Canada, Australia, Singapore") == "GLOBAL"
    assert infer_region("Bengaluru, India") == "IN"
    assert infer_region("US Only") == "US"

    reg = client.post(
        "/api/v1/auth/register",
        json={"email": "regiontest@example.com", "password": "StrongPass123!", "full_name": "Region User"},
    )
    assert reg.status_code == 201
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    # Create one IN job and one GLOBAL job
    for title, loc, region, url in [
        ("India ML Engineer", "Bengaluru, India", "IN", "https://example.com/in-1"),
        ("Worldwide AI Engineer", "Worldwide", "GLOBAL", "https://example.com/gl-1"),
    ]:
        r = client.post(
            "/api/v1/jobs",
            headers=headers,
            json={
                "title": title,
                "company": "RegionCorp",
                "location": loc,
                "region": region,
                "description": "PyTorch FastAPI distributed training and RAG.",
                "work_mode": "remote",
                "application_url": url,
            },
        )
        assert r.status_code == 201

    strict_in = client.post(
        "/api/v1/jobs/search",
        headers=headers,
        json={"query": "PyTorch FastAPI", "region": "IN", "include_global": False, "mode": "bm25", "use_reranker": False},
    )
    assert strict_in.status_code == 200
    assert {item["job"]["region"] for item in strict_in.json()["items"]} == {"IN"}

    with_global = client.post(
        "/api/v1/jobs/search",
        headers=headers,
        json={"query": "PyTorch FastAPI", "region": "IN", "include_global": True, "mode": "bm25", "use_reranker": False},
    )
    assert with_global.status_code == 200
    assert {"IN", "GLOBAL"}.issubset({item["job"]["region"] for item in with_global.json()["items"]})


def test_himalayas_and_jobicy_india_parsing(monkeypatch):
    from backend.app.ingestion.connectors import HimalayasConnector, JobicyConnector
    from backend.app.ingestion.normalizer import normalize_job_record

    him = HimalayasConnector()
    monkeypatch.setattr(
        him,
        "_get_json",
        lambda url, **kwargs: {
            "jobs": [
                {
                    "guid": "h1",
                    "title": "Senior AI Engineer",
                    "companyName": "IndiaCloud",
                    "applicationLink": "https://himalayas.app/jobs/h1",
                    "locationRestrictions": [{"alpha2": "IN", "name": "India"}],
                    "minSalary": 40000,
                    "maxSalary": 60000,
                    "currency": "USD",
                    "pubDate": 1764000000,
                    "description": "<p>Build PyTorch and RAG services from India.</p>",
                }
            ]
        },
    )
    him_recs = list(him.fetch_jobs(["AI Engineer"], region="IN", limit=5))
    assert len(him_recs) == 1
    assert normalize_job_record(him_recs[0]).region == "IN"

    jbc = JobicyConnector()
    monkeypatch.setattr(
        jbc,
        "_get_json",
        lambda url, **kwargs: {
            "jobs": [
                {
                    "id": 991,
                    "url": "https://jobicy.com/jobs/991",
                    "jobTitle": "ML Engineer",
                    "companyName": "ApacAI",
                    "jobGeo": "India",
                    "jobDescription": "<p>FastAPI and pgvector retrieval systems.</p>",
                    "pubDate": "2026-11-26 10:00:00",
                }
            ]
        },
    )
    jbc_recs = list(jbc.fetch_jobs(["ML Engineer"], region="IN", limit=5))
    assert len(jbc_recs) == 1
    assert normalize_job_record(jbc_recs[0]).region == "IN"
