# Nexus AI — Migration Plan (JobHunter → Nexus AI)

**Branch:** `feature/nexus-ai-upgrade`  
**Principle:** Incremental, verifiable phased migration. Never perform a destructive rewrite or delete existing data/functionality without preserving or migrating it cleanly.

---

## 1. Migration Strategy Overview

Rather than deleting `src/` in one step, we will execute a **strangler-fig + modular extraction migration** across Phases 1–9:

1. **Preserve Legacy Baseline:** Keep the initial `JobHunter` code committed on `main` and execute all upgrades on `feature/nexus-ai-upgrade`.
2. **Introduce New Modular Architecture Side-by-Side:** Build the new `backend/app/` modular FastAPI architecture (`api/`, `core/`, `auth/`, `models/`, `schemas/`, `repositories/`, `services/`, `agents/`, `ml/`, `rag/`, `retrieval/`, `ranking/`, `memory/`, `ingestion/`, `evaluation/`, `workers/`, `observability/`) and `frontend/` (Next.js + TypeScript + Tailwind CSS).
3. **Wrap & Refactor Working Domain Logic:** Port proven JobHunter modules (`dedup.py`, `resume_reader.py`, `collectors/*`, `pdf_generator.py`, `tailor.py`, `trends.py`) into typed, testable services under `backend/app/`, fixing duplicated code and security flaws during porting.
4. **Provide Legacy CLI & Data Compatibility:**
   - Keep `src/main.py` CLI commands operational or mapped cleanly to the new services via compatibility adapters until all workflows are migrated.
   - Provide an **idempotent SQLite + Flat-File Import Script** (`scripts/migrate_legacy_sqlite.py`) that reads an existing `data/jobs.db`, `data/resume/_profile.json`, `data/outputs/*_chat.json`, and `data/settings.json`, creates a designated owner user, and imports all profiles, jobs, revisions, events, and resumes into PostgreSQL without deleting the original SQLite file.
5. **Quarantine Unsanctioned Scrapers:** Deprecate cookie-dependent Playwright scrapers (`glassdoor.py`, `ziprecruiter.py`, `linkedin.py`, `indeed.py`) by default and route job ingestion through official APIs (HN, Adzuna/JSearch/Arbeitnow/Remotive/greenhouse-lever boards where permitted) and configured Apify actors.

---

## 2. Component-by-Component Migration Map

| Legacy Component | Target Module(s) | Migration Action | Backward Compatibility |
|---|---|---|---|
| `src/db.py` (SQLite, 4 tables) | `backend/app/models/*.py` + `backend/alembic/` | Replace with SQLAlchemy 2 + PostgreSQL + `pgvector` models (19 tables) and Alembic migrations. | `scripts/migrate_legacy_sqlite.py` non-destructively imports existing SQLite rows under a migrated user account. |
| `src/config.py`, `config.yaml`, `data/settings.json` | `backend/app/core/config.py` + `.env.example` | Migrate to `pydantic-settings` environment-driven config + per-user DB `user_preferences`. Remove personal emails from `config.yaml`. | Support reading fallback defaults from `config.yaml` if present. |
| `src/auth.py` (Playwright cookie saver) | `backend/app/auth/` (JWT + RBAC + Argon2) | Replace legacy cookie scraper login with real user auth (`POST /api/v1/auth/register`, `login`, `me`). | Move legacy platform cookie helper to `legacy` optional CLI only (disabled in API). |
| `src/agent.py` (dual SDK wrapper) | `backend/app/services/llm.py` | Unified `LLMProvider` abstraction (Anthropic, DeepSeek/OpenAI-compatible, `MockLLMProvider` for dev/tests) with timeouts, retries, structured output, token & latency tracking. | Keep `ClaudeClient` signature compatible during transition if needed. |
| `src/resume_reader.py` | `backend/app/services/resume.py` + `backend/app/ml/skill_extractor.py` | Preserve PDF/DOCX/MD/TXT parsing; add file validation/size limits, section parser, per-user storage, and `ResumeVersion` DB persistence. | Supports same file formats (`.pdf`, `.docx`, `.md`, `.txt`). |
| `src/profile_analyzer.py` | `backend/app/agents/profile_agent.py` + `backend/app/ml/skill_extractor.py` | Separate deterministic/ML skill extraction (rules + taxonomy + NLP + optional LLM) from agentic profile synthesis. | Store structured `CandidateProfile` in DB alongside optional legacy JSON export. |
| `src/matcher.py` | `backend/app/ml/embeddings.py`, `compatibility.py`, `ranking/`, `agents/matching_agent.py` | **Major architectural shift:** Replace single-prompt LLM scoring with: (1) embeddings + hybrid retrieval, (2) interpretable features + calibrated ML compatibility model, (3) LTR ranker, (4) evidence-grounded LLM explanation. | Preserve 6-dimension compatibility breakdown fields in `JobMatch` response for API clarity while clearly separating ML probability from LLM explanation. |
| `src/dedup.py`, `src/collect.py`, `src/collectors/` | `backend/app/ingestion/` | Preserve `content_hash` + 3-layer dedup; add India/international locations, multi-currency salary parser, normalization schema, retry/rate-limit, `JobSource` health, `JobVersion` history, expired-job detection. | Existing `CollectedJob` adapters wrapped into unified `NormalisedJob` schema. |
| `src/multiagent/` | `backend/app/agents/` | Replace static 6-node DAG with dynamic LangGraph Career Orchestrator + 6 specialist agents + validated tools + Postgres checkpointing + human approval interrupts. | Keep CLI `run-all` mapped to orchestrator pipeline mode. |
| `src/tailor.py`, `src/refine.py`, `src/cover_letter.py`, `src/pdf_generator.py` | `backend/app/agents/application_agent.py` + `backend/app/services/documents.py` | Move file-based chat history (`_chat.json`) to PostgreSQL `conversations`/`messages`; enforce human approval before external actions; preserve WeasyPrint PDF export. | Import existing `_chat.json` via migration script. |
| `src/trends.py` | `backend/app/services/analytics.py` + `backend/app/agents/advisor_agent.py` | Preserve Python-first aggregation; use canonical skill taxonomy and multi-currency salary stats. | Expose via `GET /api/v1/analytics`. |
| `src/scheduler.py`, `src/cron_manager.py`, `src/agent_state.py` | `backend/app/workers/` (Celery + Redis) | Replace in-process thread & JSON file state with Celery workers, Redis broker, and Celery Beat scheduled tasks. | Keep synchronous fallback runner for minimal local dev without Celery worker if needed. |
| `src/web.py`, `src/web_templates/` | `backend/app/api/v1/` + `frontend/` (Next.js/React + Tailwind) | Decompose 1,943-line `web.py` into versioned REST API routers + service/repository layers + Next.js App Router UI. | Legacy HTML routes remain untouched until Phase 8 cutover, then deprecated cleanly. |

---

## 3. Data Safety & Non-Destructive Cutover Checklist

- [ ] Before running any migration against an environment with existing `data/jobs.db`, create a timestamped backup (`data/jobs.db.bak.<timestamp>`).
- [ ] Verify `scripts/migrate_legacy_sqlite.py` runs in `--dry-run` mode first and reports counts for `profiles`, `jobs`, `resume_revisions`, `events`, and local resume files.
- [ ] Validate row counts and foreign-key integrity in PostgreSQL after import before retiring SQLite usage.
- [ ] Never delete `data/resume/` or `data/jobs/` files automatically during migration.
- [ ] All destructive schema changes in PostgreSQL go strictly through versioned Alembic `upgrade`/`downgrade` scripts.
