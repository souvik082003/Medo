# Nexus AI — Engineering Decision Log

## ADR-001: Portable SQLAlchemy Types for PostgreSQL + pgvector & Local Dev Mode
- **Context:** Production targets PostgreSQL 16 + `pgvector` (`UUID`, `JSONB`, `VECTOR`), whereas local development/CI without Docker or Postgres requires fast deterministic execution.
- **Decision:** Implemented `GUID`, `JSONBType`, and `VectorType` SQLAlchemy `TypeDecorator`s in `backend/app/core/database.py` compiling to native PostgreSQL types and falling back cleanly to SQLite types in `development`/`test` mode, with dialect-aware cosine similarity in `EmbeddingService.search_similar_jobs()`.
- **Trade-off:** Avoids maintaining two separate ORM schemas while keeping PostgreSQL as the primary target; `pgvector` HNSW indexes and SQL `<=>` distance operators are used exclusively when connected to PostgreSQL.

## ADR-002: Argon2id + JWT Auth & Explicit LLM Consent Gate
- **Context:** Legacy JobHunter had zero authentication, zero user isolation, and transmitted resume text to LLMs unconditionally.
- **Decision:** Adopted Argon2id (`argon2-cffi`) password hashing, HS256 JWT bearer tokens, strict `user_id` repository filtering, and an explicit `llm_consent_granted` flag (`POST /api/v1/auth/consent` + `require_llm_consent` dependency).
- **Trade-off:** Adds a consent step before external LLM calls, ensuring private resumes are never sent externally without explicit user approval.

## ADR-003: Grounded Skill Taxonomy + Verified Extraction
- **Context:** Pure LLM skill extraction can hallucinate unmentioned skills and produces inconsistent variants (`React.js` vs `ReactJS` vs `React`).
- **Decision:** Built canonical `CANONICAL_SKILLS` + `SkillAlias` mapping (`backend/app/ml/skill_taxonomy.py`) paired with section-aware rule extraction (`backend/app/ml/skill_extractor.py`) storing confidence and exact `evidence_span` lines. Any LLM-suggested skills are rejected unless verified in source text.
- **Trade-off:** Deterministic precision and zero hallucinated skills; new niche technologies require adding entries to the taxonomy.

## ADR-004: Sentence Transformer Embedding Model Selection & Caching
- **Context:** Part 3.1 requires evaluating `all-MiniLM-L6-v2`, `BAAI/bge-base-en-v1.5`, and `intfloat/e5-base-v2` rather than assuming the largest model is best.
- **Decision:** Built `EmbeddingService` supporting model-specific query/document prefixes (`BGE`, `E5`), SHA-256 `text_hash` caching (in-memory + Redis + `job_embeddings`), and `ModelVersion` tracking, plus `backend/app/evaluation/embedding_bench.py`.
- **Observed Baseline (`all-MiniLM-L6-v2`, cached locally, 384-dim):** `MRR = 1.0`, `Recall@1 = 1.0`, `avg_query_ms = 6.62 ms` on the small 3-query/9-doc sanity benchmark (`is_stub = false`). `BAAI/bge-base-en-v1.5` and `intfloat/e5-base-v2` (768-dim) are configured and will be evaluated alongside `all-MiniLM-L6-v2` on a larger retrieval dataset in Phase 3/7.

## ADR-005: Multi-Currency Job Normalisation & Hybrid RRF + Cross-Encoder Retrieval
- **Context:** Legacy collectors hardcoded US/USD assumptions and lacked sparse/dense hybrid retrieval or job version history.
- **Decision:** Built `NormalisedJob` (`backend/app/ingestion/normalizer.py`) with India/international location aliases, multi-currency parsing (`INR` LPA/Crore, `USD`, `EUR`, `GBP`, `SGD`), 3-layer deduplication, `JobVersion` diffs, stale/expired-job marking, and `JobSource` health monitoring. Combined `pgvector`/NumPy dense cosine similarity with `BM25Okapi` via Reciprocal Rank Fusion (`k=60`) and `CrossEncoderReranker` (`backend/app/retrieval/hybrid.py`).
- **Trade-off:** Dual-index retrieval adds ~0.5 ms per query on small corpora while recovering both exact technical keywords (e.g. `NCCL`, `pgvector`) and semantic paraphrases.

## ADR-006: Calibrated ML Compatibility & Learning-to-Rank Separation
- **Context:** Legacy JobHunter scored jobs via a single LLM prompt and lacked supervised compatibility prediction, calibration, or Learning-to-Rank.
- **Decision:** Built 12 interpretable features (`backend/app/ml/features.py`), grouped zero-leakage splits (`GroupShuffleSplit`), sigmoid-calibrated classifiers (`LogisticRegression`, `RandomForest`, `GradientBoosting`, plus optional `XGBoost`/`LightGBM` when `libomp` is available), and LTR rankers (`BaselineWeightedRanker`, `GradientBoostingRegressor`, `PairwiseLinearRanker`, `PairwiseTorchRanker`, plus optional `XGBRanker`/`LGBMRanker`). Strictly separated deterministic ML predictions (`JobMatch`) from optional consent-gated `llm_explanation`, and separated `synthetic_dev` bootstrap evaluations from `real_feedback`.
- **Trade-off:** On macOS without Homebrew `libomp`, `xgboost`/`lightgbm` C-APIs gracefully defer to Scikit-learn and PyTorch pairwise models, while Linux Docker builds use all five implementations automatically.

## ADR-007: Dynamic LangGraph Career Orchestrator & Bounded Validated Tools
- **Context:** Legacy `src/multiagent/graph.py` was a static 6-node sequential pipeline without intent routing, validated tool calling, bounded execution, or human-approval gates.
- **Decision:** Implemented a dynamic `StateGraph` Main Career Orchestrator (`backend/app/agents/orchestrator.py`) routing to 6 specialist agents (`ProfileIntelligence`, `JobDiscovery`, `JobMatching`, `CareerAdvisor`, `ApplicationAssistant`, `Memory`) backed by 14 Pydantic-validated tools (`backend/app/agents/tools.py`) with call budgets (`max_calls=8`), retries (`max_retries=2`), `recursion_limit=18`, zero shell/code execution, and `ApprovalRequest` gating for external submissions.
- **Trade-off:** Deterministic intent/plan routing guarantees predictable bounded latency without wasted LLM planner loops while still supporting multi-step conditional delegation.

## ADR-008: Iterative Agentic RAG, Three-Tier Memory & Human-in-the-Loop Approval Gate
- **Context:** Career QA, private notes/resumes, and user preferences require verified citations, cross-user isolation, resistance to untrusted text injection, and explicit user consent before external submissions.
- **Decision:** Built an iterative LangGraph Agentic RAG pipeline (`backend/app/rag/pipeline.py`) with hybrid dense+BM25+RRF retrieval, optional cross-encoder reranking, owner isolation (`owner_user_id`), regex/pattern prompt-injection sanitization, `max_retries=2` / `recursion_limit=16`, and explicit insufficient-evidence refusal; implemented a 3-tier memory service (`backend/app/memory/service.py`) distinguishing `inferred` vs `confirmed` items so inferred traits cannot silently overwrite confirmed preferences; and wired `ApprovalService` (`backend/app/services/approval_service.py`) + `/api/v1/approvals` so external actions remain gated behind user sign-off.
- **Trade-off:** Rule-backed query rewriting and strict substring/evidence grading prioritize low-latency safety and zero fabricated citations over open-ended generative synthesis when retrieved context is sparse.

## ADR-009: Structured PII-Redacted Observability, OpenTelemetry Spans & Reproducible Evaluation Suites
- **Context:** Production AI career workflows process sensitive PII (resumes, emails, tokens) and must provide inspectable latency/token telemetry plus reproducible ML, RAG, and Agent metrics without polluting real user signals with synthetic benchmarks.
- **Decision:** Implemented `JsonLogFormatter` + `ObservabilityMiddleware` + `trace_stage` (`backend/app/core/observability.py`) backed by the OpenTelemetry SDK with regex & key-level redaction (`redact_pii` / `redact_mapping`), strict security headers, user-isolated audit log endpoints (`backend/app/api/v1/observability.py`), and deterministic RAG/Agent/Unified evaluation runners (`backend/app/evaluation/rag_bench.py`, `agent_bench.py`, `run_all.py`) storing runs in `evaluation_runs` tagged by provenance (`synthetic_dev` vs `curated_benchmark` vs `real_feedback`).
- **Trade-off:** In-memory OpenTelemetry `SimpleSpanProcessor` + `ObservabilityMetrics` ring buffers avoid hard external collector dependencies in dev/CI while preserving full OpenTelemetry trace semantics for production OTLP export.

## ADR-010: Direct Client API Routing in Local Dev & Full 14-Route Studio Integration
- **Context:** Running Next.js inside a restricted local sandbox blocked server-side `/api/*` rewrite proxying (`connect EPERM 127.0.0.1:8000`), and several pages (Job Detail, Assistant RAG QA, Skill-Gap, Privacy) needed full live wiring to Phase 4–7 APIs.
- **Decision:** Added `resolveApiUrl` in `frontend/src/lib/api.ts` routing port `3000` local browser requests directly to `:8000` via FastAPI CORS (while preserving `NEXT_PUBLIC_API_ORIGIN` and relative routes behind reverse proxies), wired `/api/v1/jobs/match`, `/api/v1/rag/query`, `/api/v1/approvals/*/decide`, `/api/v1/observability/*`, and `/api/v1/evaluation/*` across Dashboard, Job Detail, Assistant, Skill-Gap, and Privacy, and added non-production Demo Login (`POST /api/v1/auth/demo`).
- **Trade-off:** Requires FastAPI CORS to include `localhost:3000` and `127.0.0.1:3000` during local development while retaining reverse-proxy compatibility in Docker/production.

## ADR-011: Multi-Container Docker Compose Topology & CI Quality Gate
- **Context:** Nexus AI combines stateful ML/vector storage (`PostgreSQL + pgvector`), caching/task queues (`Redis`, Celery worker/beat), FastAPI APIs, and a Next.js SSR/static studio frontend, requiring reproducible builds and automated regression gates.
- **Decision:** Added hardened non-root multi-service `Dockerfile`s (`libgomp1` for LightGBM/XGBoost OpenMP on Linux), `docker-compose.yml` orchestration with healthcheck dependencies and persistent volumes, `.github/workflows/ci.yml` enforcing `compileall`, Alembic upgrades, `pytest`, reproducible offline benchmarks, `tsc --noEmit`, and `next build`, plus complete README and backup/operations runbooks.
- **Trade-off:** Using pre-compiled container wheels and stub/mock flags in CI keeps PR runtimes under a few minutes while testing real model architectures offline.
