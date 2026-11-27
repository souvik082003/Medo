# Nexus AI — Phase 0 Repository Architecture Audit

**Date:** 2026-11-25  
**Source Repository:** JobHunter (`/Users/souvik/Project/medo`)  
**Target Platform:** Nexus AI Career Intelligence Platform  
**Audit Scope:** Full inspection of `src/`, `prompts/`, `scripts/`, `data/`, `docs/`, `config.yaml`, `pyproject.toml`, `requirements.txt`, `README.md`.

---

## 1. Executive Summary

The existing **JobHunter** repository (~10,034 lines across Python modules and Markdown prompts) is a functional **single-user local prototype** for automated job collection, LLM-based 6-dimension scoring, resume tailoring, and application tracking.

While several core domain primitives work well and should be preserved (multi-platform collection abstractions, 3-layer deterministic job deduplication, multi-format resume parsing, 2-round resume tailoring with revision tracking, and deterministic Python market-trend aggregation), the system cannot serve as a production-grade AI Career Intelligence platform without foundational architectural upgrades:

1. **Zero real Machine Learning / Retrieval / Ranking:** All job matching is performed via a single LLM tool-call prompt (`src/matcher.py`). There are no embeddings, no vector search, no BM25/hybrid retrieval, no cross-encoder reranking, no supervised compatibility classifier, and no Learning-to-Rank (LTR) pipeline.
2. **Static DAG instead of Agentic AI:** `src/multiagent/graph.py` is a hardcoded linear pipeline (`context -> collection -> matching -> digest? -> trend? -> validation`). There is no dynamic planner, intent routing, validated tool calling, persistent checkpointing, or human-in-the-loop approval gate.
3. **Single-user SQLite + Flat-File State:** `src/db.py` uses SQLite with manual `ALTER TABLE` string interpolation and only 4 tables (`profiles`, `jobs`, `resume_revisions`, `events`). Active profile, user description, parsed resume, chat history, scheduler settings, and agent state are stored as flat JSON/TXT files under `data/`.
4. **Monolithic Web Layer & Critical Security Gaps:** `src/web.py` is 1,943 lines combining HTTP routes, SQL queries, in-memory global `pipeline_state`, background threads, and HTML template rendering. There is **no authentication, no user isolation, no CSRF protection, no upload size limits, no rate limiting**, and multiple XSS/secret-hygiene issues.
5. **No Tests, No CI, No Containers:** There is no `tests/` directory, no `pytest` suite, no `.env.example`, no `Dockerfile`, and no CI pipeline.

---

## 2. Inventory of Existing Modules

### 2.1 Core Entrypoints & Configuration
| File | LOC | Responsibility | Status & Assessment |
|---|---:|---|---|
| `src/main.py` | 574 | Click CLI (`init`, `parse-resume`, `analyze-profile`, `login`, `collect`, `add-job`, `match`, `list`, `tailor`, `mark-applied`, `digest`, `trends`, `enrich`, `backfill-hash`, `web`, `run-all`, `show`) | Working CLI; tightly coupled to local `Config` and synchronous `session_scope(db_path)`. Keep CLI ergonomics via thin API/service calls. |
| `src/config.py` | 140 | Loads `config.yaml` + `.env` + `data/settings.json` overrides | Functional, but mixes static YAML config with mutable runtime JSON (`settings.json`) and lacks typed Pydantic v2 validation (`pydantic-settings`). |
| `config.yaml` | 210 | LLM providers, model routing, preferences, scoring thresholds, digest SMTP, Apify & collector configs | Contains hardcoded personal email addresses (`yxd429@case.edu`, `pittsburghdaidai@gmail.com`) and Chinese comments; `model` defaults reference `deepseek-v4-flash` / `claude-opus-4-6`. |
| `requirements.txt` | 27 | Python dependencies | **Bug:** Missing `openai` package despite `src/agent.py` importing `from openai import OpenAI`. Missing `pytest`, `pydantic`, `alembic`, `psycopg`, `pgvector`, `redis`, `celery`, ML/RAG packages. |
| `pyproject.toml` | 12 | Project metadata (`job-agent`, `requires-python >= 3.10`) | Needs upgrade to `>=3.12`, updated package layout, and test/lint tool configuration. |

### 2.2 Database & State Persistence
| File | LOC | Responsibility | Status & Assessment |
|---|---:|---|---|
| `src/db.py` | 228 | SQLAlchemy 2 models (`Profile`, `Job`, `ResumeRevision`, `Event`), `JobStatus` enum, SQLite engine & ad-hoc `_migrate_add_columns()` | **Critical limitations:** Creates a new `create_engine()` on every `session_scope()` call (no connection pooling); uses `datetime.utcnow()` (deprecated); no `User` model or tenant isolation; no Alembic; raw f-string SQL in `PRAGMA`/`ALTER TABLE`; no vector/embedding/ML/memory/evaluation tables. |
| `src/agent_state.py` | 348 | Cross-process run/heartbeat state via `data/agent_state.json` + PID liveness check (`os.kill(pid, 0)`) | Clever local workaround for cron vs. web visibility, but non-atomic file writes (race conditions) and single-host only. Replace with Redis + PostgreSQL task/run tracking. |
| `src/scheduler.py` | 156 | In-process `threading.Thread` polling `data/settings.json` every 60s | Only works in single-process web server; duplicates `cron_manager.py`. Replace with Celery Beat / Redis worker scheduling. |
| `src/cron_manager.py` | 111 | Subprocess `crontab -l` / `crontab -` wrapper | OS-dependent, assumes local conda env (`scripts/daily.sh`). Replace with containerized Celery Beat while keeping CLI scripts optional. |

### 2.3 LLM Abstraction & LangGraph Workflow
| File | LOC | Responsibility | Status & Assessment |
|---|---:|---|---|
| `src/agent.py` | 179 | `make_client()`, `llm_complete()`, `ClaudeClient`, prompt template loader/renderer (`{{ var }}`), `_convert_tool_to_openai()`, `_extract_json()` | Only supports basic single-turn completion (`llm_complete`) without tool-calling loop, retries, timeouts, token/cost telemetry, or mock/local provider fallback. |
| `src/multiagent/graph.py` | 104 | Compiles 6-node LangGraph `StateGraph` | **Static workflow:** Fixed sequential path `context -> collection -> matching -> digest? -> trend? -> validation`. No dynamic planning, no conditional error recovery, no checkpointer. |
| `src/multiagent/nodes.py` | 285 | 6 node functions wrapping existing CLI functions | Each node calls Python functions directly; not true autonomous agents with schemas, tools, or measurable success criteria. |
| `src/multiagent/state.py` | 44 | `JobAgentRunOptions` dataclass & `JobAgentState` TypedDict | Passes non-serializable `Config` object inside graph state, preventing Postgres/Redis LangGraph checkpointing. |
| `src/multiagent/types.py` | 21 | `AgentEvent` TypedDict & helper | Useful structured event idea; expand for SSE/WebSocket concise progress streaming. |

### 2.4 Resume, Profile, Matching, Tailoring & Trends
| File | LOC | Responsibility | Status & Assessment |
|---|---:|---|---|
| `src/resume_reader.py` | 187 | Extracts text from PDF (`pypdf`), DOCX (`python-docx`), MD/TXT; pause/unpause resumes; reads `data/materials/` | **Preserve & harden:** Clean parsing logic. Needs structured section/chunk extraction, skill evidence span offsets, PII handling, and per-user DB/object storage instead of shared `data/resume/`. |
| `src/profile_analyzer.py` | 961 | 3-round LLM pipeline (`profile_extract` -> `profile_perspectives` -> `profile_analyzer`) producing Top-10 positions + regional companies | **Preserve domain logic, refactor architecture:** Duplicated Anthropic/OpenAI tool-call boilerplate; relies 100% on LLM for skill extraction without canonical taxonomy or confidence scores; stores active state in `_profile.json`. |
| `src/matcher.py` | 262 | LLM 6-dimension scoring (`background`, `skills`, `experience`, `seniority`, `authorization`, `company`, `overall`) via `submit_match_score` tool | **Major upgrade target:** Currently asks LLM to compute math (`overall` sum) and judge fit without ML models, embeddings, or calibrated probabilities. Should be split into deterministic feature extraction + ML compatibility prediction + LTR ranking + grounded LLM explanation. |
| `src/tailor.py` | 293 | 2-round tailoring (DeepSeek plan -> Claude Opus markdown) + WeasyPrint PDF | **Preserve & refactor:** Good separation of planning vs. generation; needs unified LLM provider calls, user-isolated paths, and strict factual grounding checks. |
| `src/refine.py` | 315 | Interactive HR/HM resume refinement chat with `ResumeRevision` DB versions and `{id}_chat.json` | **Preserve & refactor:** Good compact history pattern (`_migrate_message`); chat history should move from `{id}_chat.json` to PostgreSQL `conversations`/`messages`. |
| `src/cover_letter.py` | 50 | Reuses `match_connector` + `match_fit_bullets` to generate cover letter | Good token-saving pattern; keep behind approval/user-controlled workflow. |
| `src/pdf_generator.py` | 88 | Markdown -> HTML -> WeasyPrint PDF | Working utility; keep in document service (note WeasyPrint OS library requirements in Docker). |
| `src/trends.py` | 462 | Python Counter aggregations (`TECH_KEYWORDS`, `SENIORITY_PATTERNS`, salary regex, locations) + LLM narrative | **Preserve design principle ("Python computes, LLM interprets")**, expand skill taxonomy & multi-currency salary parsing (INR/USD/EUR/GBP). |
| `src/enricher.py` | 124 | Backfills `work_mode` and `min_education` via LLM | Duplicates provider branching; replace/augment with deterministic rule/NLP extractors + LLM fallback. |
| `src/manual_add.py` | 284 | Parses pasted/uploaded JD via LLM tool call -> deduplicates -> stores -> scores | Useful feature; needs file size/type validation and unified parser/ML scoring pipeline. |
| `src/tracker.py` | 25 | `mark_applied()` updates `Job.status` and adds `Event` | Keep and expand into full application lifecycle + implicit feedback tracking. |
| `src/digest.py` | 157 | Builds HTML digest email & sends via `smtplib` | **Security fix needed:** Unescaped `j.url`, `match_strengths`, `match_gaps` in HTML template. |

### 2.5 Job Collectors & Deduplication
| File | LOC | Responsibility | Status & Assessment |
|---|---:|---|---|
| `src/collect.py` | 267 | Orchestrates collectors, excludes keywords, 3-layer dedup, stores `Job` | **Preserve core flow:** Good `matches_excluded` and 3-layer dedup. Needs normalization layer, incremental updates, expired-job detection, version history, and source health tracking. |
| `src/dedup.py` | 176 | Normalizes company/title/location -> 16-char SHA256 `content_hash` | **Preserve:** Well-engineered deterministic deduplication. Expand location aliases for India (Bengaluru/Bangalore, Hyderabad, Pune, Gurugram/Gurgaon, Mumbai, Delhi NCR) and international hubs. |
| `src/collectors/base.py` | 50 | `CollectedJob` dataclass & `BaseCollector` ABC | Clean interface; extend `CollectedJob` for currency, min/max salary, experience range, skills, work mode, raw metadata. |
| `src/collectors/apify_base.py` | 161 | Async Apify actor runner (`POST runs` -> poll -> `GET items`) | Good async polling pattern; lacks HTTP retry/backoff, rate limiting, and structured error telemetry. |
| `src/collectors/hackernews.py` | 140 | Direct HN Algolia + Firebase API | Free, official API, working. Needs rate limiting & retry logic. |
| `src/collectors/linkedin_apify.py` | 231 | Per-title LinkedIn search via Apify `harvestapi` | Working; currently US-biased `_normalize_location` and sequential blocking calls. |
| `src/collectors/indeed_apify.py` | 125 | Indeed via Apify `misceres` | Working; hardcoded `"country": "US"` — must be configurable for India (`IN`) and international regions. |
| `src/collectors/yc_apify.py` | 175 | YC Work at a Startup via Apify | **Bug/Inconsistency:** Does not inherit `ApifyCollector`, uses sync `run-sync-get-dataset-items` (300s timeout risk). |
| `src/collectors/dice_apify.py` | 85 | Dice via Apify `worldunboxer` | Hardcodes `"employment_type": ["FULLTIME"]` and `keywords[0]` / `locations[0]` only. |
| `src/collectors/wellfound_apify.py` | 83 | Wellfound via Apify (disabled) | Disabled in `config.yaml` due to actor cost. |
| `src/collectors/linkedin.py`, `indeed.py`, `glassdoor.py`, `ziprecruiter.py`, `_browser.py`, `auth.py` | 607 | Playwright scrapers + manual cookie login | Fragile DOM selectors, `glassdoor`/`ziprecruiter` blocked by Cloudflare. Deprecate/quarantine Playwright scrapers in favor of official APIs/RSS/permitted feeds (no anti-bot circumvention). |

### 2.6 Web UI & Templates
| File | LOC | Responsibility | Status & Assessment |
|---|---:|---|---|
| `src/web.py` | 1,943 | FastAPI app with 40+ HTML/form/JSON routes, background pipeline threads, Jinja2 rendering, health probes | **High technical debt:** Monolithic, no auth, global mutable `pipeline_state`, mixes business logic with route handlers, hardcodes `"Yuanjun Dai"` default name on `/job/{id}/tailor`. |
| `src/web_templates/*.html` | 18 files | Server-rendered Jinja2 templates with CSS bilingual `.zh`/`.en` toggle | `index.html` uses invalid `<span class="zh">` inside `<option>` and `{{ label | safe }}`. Will be superseded by Next.js/React + TypeScript + Tailwind frontend while keeping legacy routes deprecated or API-backed during migration. |

---

## 3. Duplicated Logic Identified

1. **Dual-SDK Tool-Calling Boilerplate (5x duplication):**  
   The exact `if provider == "deepseek": ... client.chat.completions.stream(...) else: client.messages.stream(...)` pattern with `_convert_tool_to_openai()` is duplicated in:
   - `src/matcher.py` (lines 160–190)
   - `src/profile_analyzer.py` (lines 736–961, three times!)
   - `src/manual_add.py` (lines 120–171)
   - `src/enricher.py` (lines 79–121)
   - `src/tailor.py` (lines 135–171)
   **Resolution:** Centralize tool-calling, retries, timeouts, and token accounting into a unified `LLMProvider` abstraction.

2. **Salary Parsing Duplicated (2x):**  
   Regex salary parsing exists independently in `src/web.py` (`_parse_salary_min`, lines 84–106) and `src/trends.py` (`extract_salary_range`, lines 101–122). Both assume USD and scale `< 1000` by `1000`.
   **Resolution:** Consolidate into a single multi-currency (`USD`, `INR` LPA/Crore, `EUR`, `GBP`, `SGD`) salary normalizer in the ingestion/feature layer.

3. **Location Normalization Duplicated (2x):**  
   `src/dedup.py` (`normalize_location`) and `src/trends.py` (`normalize_location`) implement separate normalization rules.
   **Resolution:** Unify canonical location parsing in `ingestion/normalizer.py`.

4. **Skill Extraction Hardcoded in `trends.py`:**  
   `TECH_KEYWORDS` in `src/trends.py` is a flat list of ~85 keywords without synonyms (`React.js`/`ReactJS`), categories, or taxonomy IDs, while `profile_analyzer.py` prompts an LLM for skills independently.
   **Resolution:** Build one canonical `SkillTaxonomy` shared across resume parsing, JD normalization, ML features, and trend analytics.

5. **Dual Scheduling Implementations:**  
   `src/scheduler.py` (in-process thread + `settings.json`) and `src/cron_manager.py` (system `crontab` + `scripts/daily.sh`) duplicate scheduling logic and cause double-execution guards in `web.py`.

---

## 4. Security Audit

| Severity | Finding | Location | Remediation in Target Architecture |
|---|---|---|---|
| **Critical** | **Zero Authentication & Authorization:** All endpoints (including `/job/{id}/delete`, `/agent/delete`, `/resume/{filename}/delete`, `/onboarding/...`) are completely unauthenticated. | `src/web.py` | Implement JWT + Argon2/bcrypt password hashing, RBAC (`candidate`, `admin`), and strict `user_id` ownership checks on every query. |
| **Critical** | **No Multi-Tenant Data Isolation:** `jobs`, `profiles`, `resume_revisions`, and `data/` files are global; one user's data is exposed to everyone. | `src/db.py`, `src/web.py` | Enforce `user_id` foreign keys on all user-owned tables and isolate uploaded/generated documents per user. |
| **High** | **XSS via Markdown Links & Unescaped HTML:** `_render_md_simple()` turns `[text](javascript:...)` into `<a href="javascript:...">`; `index.html` uses `| safe`; `digest.py` interpolates `j.url`, `match_strengths`, `match_gaps` without HTML escaping. | `src/web.py:138`, `src/web_templates/index.html:12`, `src/digest.py:48-57` | Sanitize/validate URL schemes (`http://`, `https://` only), escape all dynamic fields, and move UI rendering to React (auto-escaped JSX). |
| **High** | **Unbounded File Uploads & Missing Validation:** `await resume.read()`, `await material.read()`, and `await jd_file.read()` load full files into RAM with no max size limit; `/job/add` skips filename/extension validation before writing a temp file. | `src/web.py:918-925, 1237, 1308, 1696` | Enforce max upload size (e.g., 10 MB), MIME/magic-byte & extension checks, streaming chunked reads, and sanitized storage keys. |
| **High** | **No Rate Limiting or Abuse Controls:** LLM-triggering and scraping endpoints (`/refresh`, `/job/{id}/tailor`, `/job/{id}/refine/chat`) have no rate limits. | `src/web.py` | Add Redis-backed rate limiting per user/IP on auth, upload, search, and LLM/agent endpoints. |
| **Medium** | **CSRF on State-Changing Forms:** Form `POST` routes lack CSRF tokens and rely on redirects. | `src/web.py` | Move to JSON REST API (`/api/v1/...`) with `Authorization: Bearer <JWT>` (or `SameSite` HttpOnly cookies + CSRF token) and strict CORS origins. |
| **Medium** | **PII & Secret Exposure Risks:** Personal emails committed in `config.yaml`; raw exception traces and internal paths returned in HTTP responses; no audit log; no user consent gate before sending resume text to external LLMs. | `config.yaml:110,115`, `src/web.py:321,851,973` | Strip personal defaults from `config.yaml`, add `.env.example`, sanitize HTTP errors, implement PII-redacted structured logging, add `audit_logs`, and require explicit user LLM consent. |
| **Medium** | **Prompt Injection Surface:** Untrusted JD descriptions and retrieved text are interpolated directly into LLM prompts (`prompts/matcher.md`, `prompts/tailor_plan.md`) without delimiter hardening or output validation. | `src/matcher.py`, `src/tailor.py`, `src/manual_add.py` | Isolate untrusted content in structured data blocks, instruct models to ignore embedded instructions, and validate outputs strictly via Pydantic schemas. |
| **Low** | **Raw SQL f-string Interpolation:** `PRAGMA table_info({table})` and `ALTER TABLE {table} ADD COLUMN {col} {col_type}` use f-strings. | `src/db.py:214,218` | Replace completely with Alembic migrations and parameterized SQLAlchemy queries. |

---

## 5. Architectural Limitations Relative to Nexus AI Requirements

1. **No ML Pipeline:** Missing Sentence Transformers (`all-MiniLM-L6-v2`, `BAAI/bge-base-en-v1.5`, `intfloat/e5-base-v2`), skill taxonomy + NLP extractor, feature engineering, baseline + LightGBM/XGBoost compatibility models, and LambdaMART/XGBoost Learning-to-Rank.
2. **No Vector or Hybrid Retrieval:** No `pgvector` embeddings, no BM25 sparse index, no Reciprocal Rank Fusion (RRF), no cross-encoder reranker, and no iterative Agentic RAG workflow with grounding verification.
3. **No Memory Architecture:** Missing short-term conversation memory/summarization, structured user preference memory, and long-term semantic memory with conflict resolution and user deletion controls.
4. **No Evaluation or Observability:** Missing RAGAS/DeepEval RAG metrics, ML ranking metrics (`NDCG@K`, `Precision@K`, `Recall@K`, `MRR`, `MAP`, calibration), agent evaluation metrics, structured JSON logs, and OpenTelemetry/LangSmith-compatible tracing.
5. **US-Only Ingestion Assumptions:** Collectors, salary parsers, and location normalizers assume US/USD; need configurable regions (including India + international), currencies (`INR`, `USD`, `EUR`, `GBP`), and source health monitoring.

---

## 6. External Service Requirements

| Service | Purpose | Required in Prod? | Local Dev / Mock Fallback |
|---|---|---|---|
| **PostgreSQL 16 + `pgvector`** | Primary relational DB, vector similarity search, LangGraph checkpointing | Yes | Local Docker Compose container (or test SQLite/in-memory unit mocks for isolated unit tests; integration tests against Postgres+pgvector) |
| **Redis 7** | Caching (embeddings, search results), rate limiting, Celery broker & result backend | Yes | Local Docker Compose container (with in-memory fakeredis/sync fallback in unit tests) |
| **LLM Provider (Anthropic / DeepSeek / OpenAI-compatible)** | Agent planning, RAG grounded generation, resume tailoring, structured extraction assistance | Yes for live LLM features | Deterministic `MockLLMProvider` documented for local development & unit/CI tests without paid API keys |
| **Apify API (`APIFY_API_TOKEN`)** | Permitted third-party job collection actors (LinkedIn, Indeed, YC, Dice) | Optional | Direct free APIs (`HackerNews`, Remotive/Arbeitnow/Adzuna if configured) + documented demo/fixture collector |
| **SMTP Server (`SMTP_PASSWORD`)** | Optional email digest notifications | Optional | Disabled by default; logs/saves HTML artifact locally |
| **Embedding / Reranker Weights (HuggingFace)** | Sentence Transformers & Cross-Encoder models | Yes for ML/RAG | Local model cache or deterministic lightweight embedding stub in fast CI unit tests |
