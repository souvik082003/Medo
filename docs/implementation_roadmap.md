# Nexus AI — Implementation Roadmap (Phases 0–9)

Every phase ends with:
1. Summary of changes & files created/modified
2. Automated test run (`pytest`) with zero critical failures
3. Documentation & decision log updates
4. Logical Git commit checkpoint on `feature/nexus-ai-upgrade`

---

## Phase 0: Repository Audit & Architecture Documentation (Current)
- **Deliverables:**
  - `docs/architecture_audit.md`
  - `docs/migration_plan.md`
  - `docs/database_schema.md`
  - `docs/implementation_roadmap.md`
  - `.gitignore` and Git branch `feature/nexus-ai-upgrade`
- **Exit Gate:** User approval before database/backend restructuring.

## Phase 1: Database, Migrations, Authentication & Backend Foundation
- **Scope:**
  - Modular FastAPI skeleton under `backend/app/` (`api/v1/`, `core/`, `auth/`, `models/`, `schemas/`, `repositories/`, `services/`, `main.py`).
  - Pydantic v2 settings (`core/config.py`) + `.env.example`.
  - PostgreSQL + `pgvector` SQLAlchemy 2 models + Alembic initial migration.
  - Argon2/bcrypt password hashing, JWT authentication, RBAC, rate-limit hooks, CORS, `/health` and `/ready` endpoints, pagination & uniform error envelopes.
  - Non-destructive `scripts/migrate_legacy_sqlite.py`.
- **Tests:** Auth registration/login, user isolation, schema & Alembic migration tests, API validation & error handling tests.

## Phase 2: Resume Intelligence, Skill Extraction & Embedding Pipeline
- **Scope:**
  - Hardened resume upload (size/MIME validation, user-isolated storage, PDF/DOCX/MD/TXT parsing).
  - Canonical `SkillTaxonomy` (`skills` + `skill_aliases`, e.g., `React.js`/`ReactJS` → `React`).
  - Hybrid skill extractor: rule-based + taxonomy + NLP + optional LLM-assisted extraction with confidence scores and exact `evidence_span` (never inventing skills).
  - Sentence Transformer embedding service evaluating `all-MiniLM-L6-v2`, `BAAI/bge-base-en-v1.5`, and `intfloat/e5-base-v2`, with batch generation, Redis/DB hash caching, `model_versions` tracking, and `pgvector` cosine retrieval.
- **Tests:** Resume parsing, upload security, skill normalization & evidence spans, embedding generation/caching/pgvector query tests.

## Phase 3: Semantic Search, Job Data Pipeline & Hybrid Retrieval
- **Scope:**
  - Job normalization layer (multi-region India + international, multi-currency salary parser, experience/work mode extraction).
  - Improved ingestion pipeline: official/permitted collectors, retry + rate limiting, incremental updates, 3-layer dedup, expired-job detection, `job_versions`, `job_sources` health monitoring, Celery background tasks.
  - Hybrid retrieval engine: dense `pgvector` + sparse BM25 + Reciprocal Rank Fusion (RRF) + metadata filtering + Cross-Encoder reranking.
- **Tests:** Ingestion, deduplication, job versioning, semantic search, BM25, RRF fusion, metadata isolation, and reranker tests.

## Phase 4: ML Compatibility Model & Learning-to-Rank System
- **Scope:**
  - Interpretable feature engineering (skill coverage, required-skill coverage, experience fit, seniority fit, location fit, work-mode fit, salary fit, semantic similarity, recency, interaction history).
  - Baseline models (Logistic Regression, Random Forest, Gradient Boosting) vs. LightGBM/XGBoost calibrated compatibility classifier (`predict_proba` + calibration).
  - Baseline weighted ranker vs. LightGBM LambdaMART / XGBoost ranking models trained on documented synthetic dev dataset + real implicit feedback (`save`, `shortlist`, `dismiss`, `apply`, `interview`, `offer`) — strictly keeping synthetic vs. real results separate.
  - Offline evaluation scripts (`NDCG@5`, `NDCG@10`, `Precision@K`, `Recall@K`, `MRR`, `MAP`) and explainability payloads separating ML predictions from LLM explanations.
- **Tests:** Feature extraction, no-leakage splits, model training/inference, calibration, ranking metrics, explainability tests.

## Phase 5: Advanced LangGraph Orchestration & Validated Agent Tools
- **Scope:**
  - Central **Main Career Orchestrator** in LangGraph with intent classification, execution plan, conditional routing, bounded retries/recursion limits, and concise status events (no hidden CoT).
  - 6 specialist agents with typed I/O & measurable success criteria:
    1. Profile Intelligence Agent
    2. Job Discovery Agent
    3. Job Matching Agent
    4. Career Advisor Agent
    5. Application Assistant Agent
    6. Memory Agent
  - Validated Pydantic tool schemas (`search_jobs`, `search_jobs_semantically`, `get_candidate_profile`, `analyse_resume`, `calculate_job_match`, `rank_jobs`, `get_skill_gap`, `search_career_knowledge`, `generate_cover_letter`, `tailor_resume`, `track_application`, `save_job`, `update_preferences`, `get_market_trends`) with timeouts, retries, and zero shell/code execution.
- **Tests:** Agent routing, tool schema validation, retry bounds, failure handling, mocked LLM orchestration tests.

## Phase 6: Agentic RAG, Persistent Memory & Human Approval
- **Scope:**
  - Complete Agentic RAG LangGraph subgraph: `START -> Understand Query -> Rewrite Query -> Retrieve -> Grade Relevance -> (Refine & Retry up to limit) -> Rerank -> Generate Answer -> Verify Grounding -> Return Answer` with source citations, document IDs, snippets, private-doc isolation, and prompt-injection defense.
  - 3-tier Memory Architecture backed by PostgreSQL + LangGraph checkpointing: Conversation memory (messages + summaries), User profile memory, Long-term semantic memory with conflict resolution, explicit confirmation (never treating LLM inference as confirmed preference), and user editing/deletion.
  - Human-in-the-Loop approval gate (`approval_requests`) blocking automated job submission, external uploads, emails, PII sharing, or irreversible changes without explicit user approval.
- **Tests:** RAG grounding & citation verification, private-doc isolation, prompt injection resistance, memory isolation & deletion, human approval gate enforcement.

## Phase 7: Evaluation, Observability & Production Security
- **Scope:**
  - Reproducible evaluation runners & reports: ML ranking (`NDCG@K`, `MRR`, calibration), RAG (`context_precision`, `context_recall`, `faithfulness`, `answer_relevancy`), Agent (`task_completion_rate`, `tool_selection_accuracy`, `tool_failure_rate`, unnecessary tool calls, latency, tokens).
  - Structured JSON logging (PII/secret redacted), OpenTelemetry-compatible tracing, per-stage latency & token metrics, audit logging, and security hardening sweep.
- **Tests:** Security & privacy tests, PII log redaction tests, evaluation script smoke/reproducibility tests.

## Phase 8: Frontend Integration (Next.js + TypeScript + Tailwind CSS)
- **Scope:**
  - Responsive, polished AI Career Dashboard implementing all 14 required pages:
    1. Landing page
    2. Registration and login
    3. Candidate onboarding
    4. Resume intelligence
    5. Career dashboard (real DB stats only)
    6. Job discovery
    7. Job recommendation results
    8. Job detail and compatibility explanation
    9. AI career assistant (with concise live execution updates & approval prompts)
    10. Application tracker
    11. Skill-gap analysis
    12. Career roadmap
    13. Profile and preferences
    14. Privacy and memory settings
- **Tests:** TypeScript type-check (`tsc --noEmit`), production build (`npm run build`), API contract tests.

## Phase 9: Docker Deployment, CI, Integration Tests & Documentation
- **Scope:**
  - `Dockerfile` (backend + frontend), `docker-compose.yml` (FastAPI, Celery worker, Celery beat, Postgres+pgvector, Redis, Next.js), `.dockerignore`.
  - `.github/workflows/ci.yml` (lint, pytest unit + integration tests, frontend type-check/build).
  - Complete `README.md`, setup guide, architecture Mermaid diagrams, API documentation, database backup guide, demo dataset, reproducible experiment reports, and Engineering Decision Log.
- **Tests:** Full end-to-end integration test suite and container build/health verification.
