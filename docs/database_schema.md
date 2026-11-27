# Nexus AI — Proposed PostgreSQL + pgvector Database Schema

**Target Engine:** PostgreSQL 16+ with `pgvector` extension (`vector(384)` / `vector(768)` depending on active embedding model, or parameterized per `model_versions` / normalized table).  
**Migration Tool:** Alembic (`backend/alembic/`) with SQLAlchemy 2.0 declarative models (`Mapped[...]`, `mapped_column(...)`).

---

## 1. Entity Relationship Overview

```
users (tenant root)
 ├──< candidate_profiles
 │     ├──< resume_versions
 │     └──< candidate_skills >── skills ──< skill_aliases
 ├──< user_preferences
 ├──< saved_jobs >── jobs
 ├──< applications >── jobs
 │     └──< application_events
 ├──< conversations
 │     └──< messages
 ├──< agent_memory (with pgvector embedding)
 ├──< approval_requests
 ├──< feedback >── jobs
 ├──< job_matches >── jobs
 └──< audit_logs

job_sources ──< jobs ──< job_versions
                  ├──< job_skills >── skills
                  └──< job_embeddings >── model_versions

knowledge_documents ──< knowledge_chunks (with pgvector embedding)
model_versions ──< evaluation_runs
```

> **User Isolation Rule:** Every user-owned table (`candidate_profiles`, `resume_versions`, `candidate_skills`, `user_preferences`, `job_matches`, `saved_jobs`, `applications`, `application_events`, `conversations`, `messages`, `agent_memory`, `feedback`, `approval_requests`, `audit_logs`, and private `knowledge_documents`) carries `user_id` (UUID, FK → `users.id ON DELETE CASCADE`, indexed) and is enforced at the repository layer.

---

## 2. Table Definitions

### 2.1 Identity, Auth & Audit
1. **`users`**
   - `id`: `UUID` PK
   - `email`: `VARCHAR(320)` UNIQUE NOT NULL (indexed)
   - `password_hash`: `VARCHAR(255)` NOT NULL (Argon2/bcrypt)
   - `full_name`: `VARCHAR(150)` NOT NULL
   - `role`: `VARCHAR(32)` NOT NULL DEFAULT `'candidate'` (`candidate`, `admin`)
   - `is_active`: `BOOLEAN` NOT NULL DEFAULT `true`
   - `llm_consent_granted`: `BOOLEAN` NOT NULL DEFAULT `false` (explicit consent before sending resume/PII to external LLMs)
   - `llm_consent_at`: `TIMESTAMPTZ` NULL
   - `created_at`, `updated_at`: `TIMESTAMPTZ` NOT NULL

2. **`audit_logs`**
   - `id`: `UUID` PK
   - `user_id`: `UUID` FK → `users.id` NULL (indexed)
   - `action`: `VARCHAR(64)` NOT NULL (e.g., `auth.login`, `resume.upload`, `memory.delete`, `application.approve`)
   - `resource_type`: `VARCHAR(64)` NOT NULL
   - `resource_id`: `VARCHAR(128)` NULL
   - `ip_address`: `VARCHAR(64)` NULL
   - `metadata_json`: `JSONB` NOT NULL DEFAULT `'{}'` (strictly PII-redacted)
   - `created_at`: `TIMESTAMPTZ` NOT NULL (indexed)

---

### 2.2 Candidate Profile, Resumes & Skill Taxonomy
3. **`candidate_profiles`**
   - `id`: `UUID` PK
   - `user_id`: `UUID` FK → `users.id` NOT NULL (indexed)
   - `headline`: `VARCHAR(256)` NULL
   - `summary`: `TEXT` NULL
   - `years_experience`: `NUMERIC(4,1)` NULL
   - `seniority_level`: `VARCHAR(32)` NULL (`intern`, `junior`, `mid`, `senior`, `staff`, `principal`, `lead`)
   - `education_level`: `VARCHAR(32)` NULL (`high_school`, `bachelor`, `master`, `phd`, `other`)
   - `current_location`: `VARCHAR(256)` NULL
   - `work_authorization`: `VARCHAR(128)` NULL
   - `target_roles_json`: `JSONB` NOT NULL DEFAULT `'[]'`
   - `analysis_json`: `JSONB` NOT NULL DEFAULT `'{}'` (Top-10 positions, perspectives, completeness gaps)
   - `completeness_score`: `FLOAT` NOT NULL DEFAULT `0.0`
   - `is_active`: `BOOLEAN` NOT NULL DEFAULT `true`
   - `created_at`, `updated_at`: `TIMESTAMPTZ` NOT NULL

4. **`resume_versions`**
   - `id`: `UUID` PK
   - `user_id`: `UUID` FK → `users.id` NOT NULL (indexed)
   - `profile_id`: `UUID` FK → `candidate_profiles.id` NULL
   - `job_id`: `UUID` FK → `jobs.id` NULL (non-null when tailored for a specific job)
   - `version_num`: `INTEGER` NOT NULL DEFAULT `1`
   - `kind`: `VARCHAR(32)` NOT NULL (`uploaded`, `tailored`, `refined`)
   - `filename`: `VARCHAR(256)` NOT NULL
   - `mime_type`: `VARCHAR(128)` NOT NULL
   - `file_size_bytes`: `INTEGER` NOT NULL
   - `storage_key`: `VARCHAR(512)` NOT NULL (user-isolated storage path)
   - `sha256_hash`: `VARCHAR(64)` NOT NULL (indexed)
   - `raw_text`: `TEXT` NOT NULL
   - `parsed_sections_json`: `JSONB` NOT NULL DEFAULT `'{}'`
   - `embedding`: `VECTOR(768)` NULL (or stored alongside `model_version_id`)
   - `embedding_model_id`: `UUID` FK → `model_versions.id` NULL
   - `modification_note`: `TEXT` NULL
   - `is_primary`: `BOOLEAN` NOT NULL DEFAULT `false`
   - `created_at`: `TIMESTAMPTZ` NOT NULL
   - Constraints: `UNIQUE (user_id, job_id, version_num)` when `job_id IS NOT NULL`

5. **`skills`** (Canonical Normalized Skill Taxonomy)
   - `id`: `UUID` PK
   - `canonical_name`: `VARCHAR(128)` UNIQUE NOT NULL (e.g., `React`, `PostgreSQL`, `PyTorch`)
   - `slug`: `VARCHAR(128)` UNIQUE NOT NULL (e.g., `react`, `postgresql`, `pytorch`)
   - `category`: `VARCHAR(64)` NOT NULL (`language`, `framework`, `library`, `database`, `cloud`, `tool`, `soft_skill`, `domain`)
   - `description`: `TEXT` NULL
   - `embedding`: `VECTOR(768)` NULL
   - `created_at`: `TIMESTAMPTZ` NOT NULL

6. **`skill_aliases`**
   - `id`: `UUID` PK
   - `skill_id`: `UUID` FK → `skills.id ON DELETE CASCADE` NOT NULL
   - `alias`: `VARCHAR(128)` UNIQUE NOT NULL (lowercase normalized, e.g., `react.js`, `reactjs`)

7. **`candidate_skills`**
   - `id`: `UUID` PK
   - `user_id`: `UUID` FK → `users.id` NOT NULL (indexed)
   - `profile_id`: `UUID` FK → `candidate_profiles.id ON DELETE CASCADE` NOT NULL
   - `skill_id`: `UUID` FK → `skills.id` NOT NULL
   - `proficiency`: `VARCHAR(32)` NOT NULL DEFAULT `'proficient'` (`exposure`, `proficient`, `deep_project`, `published_or_open_source`)
   - `extraction_method`: `VARCHAR(32)` NOT NULL (`rule`, `taxonomy`, `nlp`, `llm`, `user_confirmed`)
   - `confidence`: `FLOAT` NOT NULL (0.0–1.0)
   - `evidence_span`: `TEXT` NOT NULL (exact snippet from resume/materials; never invented)
   - `source_section`: `VARCHAR(64)` NULL
   - Constraints: `UNIQUE (profile_id, skill_id)`

8. **`user_preferences`**
   - `id`: `UUID` PK
   - `user_id`: `UUID` FK → `users.id` UNIQUE NOT NULL
   - `preferred_roles`: `JSONB` NOT NULL DEFAULT `'[]'`
   - `preferred_locations`: `JSONB` NOT NULL DEFAULT `'[]'`
   - `preferred_regions`: `JSONB` NOT NULL DEFAULT `'["IN", "US"]'`
   - `preferred_currency`: `VARCHAR(8)` NOT NULL DEFAULT `'USD'`
   - `min_salary`: `INTEGER` NULL (normalized in `preferred_currency` or annual USD equivalent)
   - `work_modes`: `JSONB` NOT NULL DEFAULT `'["remote", "hybrid", "onsite"]'`
   - `job_types`: `JSONB` NOT NULL DEFAULT `'["full-time"]'`
   - `company_sizes`: `JSONB` NOT NULL DEFAULT `'["startup", "mid-size", "large"]'`
   - `exclude_keywords`: `JSONB` NOT NULL DEFAULT `'[]'`
   - `career_goals`: `TEXT` NULL
   - `updated_at`: `TIMESTAMPTZ` NOT NULL

---

### 2.3 Job Data Pipeline & Vector Storage
9. **`job_sources`**
   - `id`: `UUID` PK
   - `name`: `VARCHAR(64)` UNIQUE NOT NULL (`hackernews`, `linkedin_apify`, `indeed_apify`, `yc_apify`, `dice_apify`, `remotive`, `arbeitnow`, `manual`, etc.)
   - `source_type`: `VARCHAR(32)` NOT NULL (`official_api`, `apify_actor`, `feed`, `manual`)
   - `is_enabled`: `BOOLEAN` NOT NULL DEFAULT `true`
   - `rate_limit_per_min`: `INTEGER` NOT NULL DEFAULT `30`
   - `last_run_at`: `TIMESTAMPTZ` NULL
   - `last_success_at`: `TIMESTAMPTZ` NULL
   - `consecutive_failures`: `INTEGER` NOT NULL DEFAULT `0`
   - `health_status`: `VARCHAR(32)` NOT NULL DEFAULT `'healthy'` (`healthy`, `degraded`, `failing`, `disabled`)
   - `last_error`: `TEXT` NULL
   - `config_json`: `JSONB` NOT NULL DEFAULT `'{}'`

10. **`jobs`**
    - `id`: `UUID` PK
    - `source_id`: `UUID` FK → `job_sources.id` NOT NULL (indexed)
    - `source_name`: `VARCHAR(64)` NOT NULL (denormalized for fast filters)
    - `external_id`: `VARCHAR(256)` NULL
    - `content_hash`: `VARCHAR(32)` NOT NULL (indexed; cross-platform dedup key)
    - `owner_user_id`: `UUID` FK → `users.id` NULL (non-null for private manually-added jobs; null for shared ingested jobs)
    - `title`: `VARCHAR(256)` NOT NULL
    - `company`: `VARCHAR(256)` NOT NULL (indexed)
    - `location`: `VARCHAR(256)` NULL
    - `region`: `VARCHAR(16)` NULL (`IN`, `US`, `EU`, `SG`, `UK`, `GLOBAL`)
    - `description`: `TEXT` NOT NULL
    - `salary_raw`: `VARCHAR(128)` NULL
    - `salary_min`: `INTEGER` NULL
    - `salary_max`: `INTEGER` NULL
    - `salary_currency`: `VARCHAR(8)` NULL (`USD`, `INR`, `EUR`, `GBP`, `SGD`)
    - `salary_min_usd_eq`: `INTEGER` NULL (normalized annual equivalent for ML features)
    - `experience_min_years`: `NUMERIC(4,1)` NULL
    - `experience_max_years`: `NUMERIC(4,1)` NULL
    - `seniority_level`: `VARCHAR(32)` NULL
    - `min_education`: `VARCHAR(32)` NULL
    - `job_type`: `VARCHAR(32)` NOT NULL DEFAULT `'full-time'`
    - `work_mode`: `VARCHAR(32)` NOT NULL DEFAULT `'unspecified'` (`remote`, `hybrid`, `onsite`, `unspecified`)
    - `application_url`: `VARCHAR(1024)` NOT NULL
    - `posted_at`: `TIMESTAMPTZ` NULL (indexed)
    - `expires_at`: `TIMESTAMPTZ` NULL
    - `is_expired`: `BOOLEAN` NOT NULL DEFAULT `false` (indexed)
    - `last_seen_at`: `TIMESTAMPTZ` NOT NULL
    - `current_version`: `INTEGER` NOT NULL DEFAULT `1`
    - `source_metadata`: `JSONB` NOT NULL DEFAULT `'{}'`
    - `created_at`, `updated_at`: `TIMESTAMPTZ` NOT NULL
    - Indexes & Constraints:
      - `UNIQUE (source_id, external_id)` WHERE `external_id IS NOT NULL`
      - GIN index on `to_tsvector('english', coalesce(title,'') || ' ' || coalesce(company,'') || ' ' || coalesce(description,''))`

11. **`job_versions`**
    - `id`: `UUID` PK
    - `job_id`: `UUID` FK → `jobs.id ON DELETE CASCADE` NOT NULL (indexed)
    - `version_num`: `INTEGER` NOT NULL
    - `title`: `VARCHAR(256)` NOT NULL
    - `location`: `VARCHAR(256)` NULL
    - `salary_raw`: `VARCHAR(128)` NULL
    - `description_hash`: `VARCHAR(64)` NOT NULL
    - `diff_summary`: `JSONB` NOT NULL DEFAULT `'{}'`
    - `captured_at`: `TIMESTAMPTZ` NOT NULL
    - Constraints: `UNIQUE (job_id, version_num)`

12. **`job_skills`**
    - `id`: `UUID` PK
    - `job_id`: `UUID` FK → `jobs.id ON DELETE CASCADE` NOT NULL
    - `skill_id`: `UUID` FK → `skills.id` NOT NULL
    - `requirement_type`: `VARCHAR(16)` NOT NULL DEFAULT `'required'` (`required`, `preferred`)
    - `confidence`: `FLOAT` NOT NULL DEFAULT `1.0`
    - `evidence_span`: `TEXT` NULL
    - Constraints: `UNIQUE (job_id, skill_id)`

13. **`job_embeddings`**
    - `id`: `UUID` PK
    - `job_id`: `UUID` FK → `jobs.id ON DELETE CASCADE` NOT NULL
    - `model_version_id`: `UUID` FK → `model_versions.id` NOT NULL
    - `text_hash`: `VARCHAR(64)` NOT NULL (for embedding cache invalidation)
    - `embedding`: `VECTOR(768)` NOT NULL (plus HNSW index `vector_cosine_ops` on normalized/selected dim)
    - `created_at`: `TIMESTAMPTZ` NOT NULL
    - Constraints: `UNIQUE (job_id, model_version_id)`

---

### 2.4 ML Matching, Ranking, Applications & Implicit Feedback
14. **`job_matches`**
    - `id`: `UUID` PK
    - `user_id`: `UUID` FK → `users.id ON DELETE CASCADE` NOT NULL (indexed)
    - `profile_id`: `UUID` FK → `candidate_profiles.id` NOT NULL
    - `job_id`: `UUID` FK → `jobs.id ON DELETE CASCADE` NOT NULL
    - `model_version_id`: `UUID` FK → `model_versions.id` NULL
    - `semantic_similarity`: `FLOAT` NOT NULL
    - `compatibility_probability`: `FLOAT` NOT NULL (calibrated ML score 0.0–1.0)
    - `ranking_score`: `FLOAT` NOT NULL (LTR or baseline weighted score)
    - `confidence`: `FLOAT` NOT NULL (uncertainty/confidence indicator)
    - `feature_vector_json`: `JSONB` NOT NULL (exact interpretable features used by ML model)
    - `strong_matching_skills`: `JSONB` NOT NULL DEFAULT `'[]'`
    - `missing_skills`: `JSONB` NOT NULL DEFAULT `'[]'`
    - `experience_match`: `JSONB` NOT NULL DEFAULT `'{}'`
    - `location_match`: `JSONB` NOT NULL DEFAULT `'{}'`
    - `seniority_match`: `JSONB` NOT NULL DEFAULT `'{}'`
    - `ranking_reasons`: `JSONB` NOT NULL DEFAULT `'[]'` (deterministic ML feature attributions)
    - `llm_explanation`: `TEXT` NULL (strictly separated from ML prediction; evidence-grounded only)
    - `computed_at`: `TIMESTAMPTZ` NOT NULL
    - Constraints: `UNIQUE (user_id, profile_id, job_id)`

15. **`saved_jobs`**
    - `id`: `UUID` PK
    - `user_id`: `UUID` FK → `users.id ON DELETE CASCADE` NOT NULL
    - `job_id`: `UUID` FK → `jobs.id ON DELETE CASCADE` NOT NULL
    - `folder`: `VARCHAR(64)` NOT NULL DEFAULT `'saved'` (`saved`, `shortlisted`, `dismissed`)
    - `notes`: `TEXT` NULL
    - `created_at`: `TIMESTAMPTZ` NOT NULL
    - Constraints: `UNIQUE (user_id, job_id)`

16. **`applications`**
    - `id`: `UUID` PK
    - `user_id`: `UUID` FK → `users.id ON DELETE CASCADE` NOT NULL (indexed)
    - `job_id`: `UUID` FK → `jobs.id ON DELETE CASCADE` NOT NULL
    - `resume_version_id`: `UUID` FK → `resume_versions.id` NULL
    - `cover_letter_text`: `TEXT` NULL
    - `status`: `VARCHAR(32)` NOT NULL DEFAULT `'draft'` (`draft`, `shortlisted`, `approved`, `applied`, `phone_screen`, `hr_interview`, `hm_interview`, `final_round`, `offer`, `rejected`, `withdrawn`, `archived`)
    - `applied_at`: `TIMESTAMPTZ` NULL
    - `notes`: `TEXT` NULL
    - `created_at`, `updated_at`: `TIMESTAMPTZ` NOT NULL
    - Constraints: `UNIQUE (user_id, job_id)`

17. **`application_events`**
    - `id`: `UUID` PK
    - `user_id`: `UUID` FK → `users.id ON DELETE CASCADE` NOT NULL
    - `application_id`: `UUID` FK → `applications.id ON DELETE CASCADE` NOT NULL (indexed)
    - `event_type`: `VARCHAR(32)` NOT NULL
    - `details`: `TEXT` NULL
    - `occurred_at`: `TIMESTAMPTZ` NOT NULL

18. **`feedback`** (Implicit & Explicit Ranking Relevance Signals)
    - `id`: `UUID` PK
    - `user_id`: `UUID` FK → `users.id ON DELETE CASCADE` NOT NULL (indexed)
    - `job_id`: `UUID` FK → `jobs.id ON DELETE CASCADE` NOT NULL (indexed)
    - `signal_type`: `VARCHAR(32)` NOT NULL (`save`, `shortlist`, `dismiss`, `apply`, `interview`, `offer`, `thumbs_up`, `thumbs_down`)
    - `relevance_weight`: `FLOAT` NOT NULL (e.g., `dismiss=-1`, `save=1`, `shortlist=2`, `apply=3`, `interview=4`, `offer=5`)
    - `is_implicit`: `BOOLEAN` NOT NULL DEFAULT `true`
    - `context_json`: `JSONB` NOT NULL DEFAULT `'{}'` (position in list, query/session id, model version)
    - `created_at`: `TIMESTAMPTZ` NOT NULL

---

### 2.5 Agents, RAG, Memory & Human Approval
19. **`conversations`**
    - `id`: `UUID` PK
    - `user_id`: `UUID` FK → `users.id ON DELETE CASCADE` NOT NULL (indexed)
    - `title`: `VARCHAR(256)` NOT NULL DEFAULT `'New Career Session'`
    - `thread_id`: `VARCHAR(128)` UNIQUE NOT NULL (LangGraph checkpoint thread key)
    - `summary`: `TEXT` NULL (rolling conversation summary)
    - `metadata_json`: `JSONB` NOT NULL DEFAULT `'{}'`
    - `created_at`, `updated_at`: `TIMESTAMPTZ` NOT NULL

20. **`messages`**
    - `id`: `UUID` PK
    - `conversation_id`: `UUID` FK → `conversations.id ON DELETE CASCADE` NOT NULL (indexed)
    - `user_id`: `UUID` FK → `users.id ON DELETE CASCADE` NOT NULL
    - `role`: `VARCHAR(24)` NOT NULL (`user`, `assistant`, `system`, `tool`)
    - `content`: `TEXT` NOT NULL
    - `execution_steps_json`: `JSONB` NOT NULL DEFAULT `'[]'` (concise execution summaries, NEVER hidden CoT)
    - `citations_json`: `JSONB` NOT NULL DEFAULT `'[]'`
    - `token_usage_json`: `JSONB` NOT NULL DEFAULT `'{}'`
    - `created_at`: `TIMESTAMPTZ` NOT NULL

21. **`agent_memory`** (Long-Term Semantic & Profile Memory)
    - `id`: `UUID` PK
    - `user_id`: `UUID` FK → `users.id ON DELETE CASCADE` NOT NULL (indexed)
    - `memory_type`: `VARCHAR(32)` NOT NULL (`preference`, `career_decision`, `feedback`, `learned_context`)
    - `key`: `VARCHAR(128)` NOT NULL
    - `value_text`: `TEXT` NOT NULL
    - `value_json`: `JSONB` NOT NULL DEFAULT `'{}'`
    - `confirmation_status`: `VARCHAR(24)` NOT NULL DEFAULT `'inferred'` (`inferred`, `confirmed`, `rejected`) — *never treat LLM inference as confirmed preference*
    - `confidence`: `FLOAT` NOT NULL DEFAULT `0.5`
    - `source_conversation_id`: `UUID` FK → `conversations.id` NULL
    - `embedding`: `VECTOR(768)` NULL
    - `is_deleted`: `BOOLEAN` NOT NULL DEFAULT `false` (supports soft + hard user-controlled deletion)
    - `created_at`, `updated_at`: `TIMESTAMPTZ` NOT NULL

22. **`approval_requests`** (Human-in-the-Loop Gate)
    - `id`: `UUID` PK
    - `user_id`: `UUID` FK → `users.id ON DELETE CASCADE` NOT NULL (indexed)
    - `conversation_id`: `UUID` FK → `conversations.id` NULL
    - `action_type`: `VARCHAR(64)` NOT NULL (`submit_application`, `send_email`, `upload_external`, `irreversible_change`, `share_pii`)
    - `payload_json`: `JSONB` NOT NULL
    - `status`: `VARCHAR(24)` NOT NULL DEFAULT `'pending'` (`pending`, `approved`, `rejected`, `expired`)
    - `decision_note`: `TEXT` NULL
    - `decided_at`: `TIMESTAMPTZ` NULL
    - `created_at`: `TIMESTAMPTZ` NOT NULL

23. **`knowledge_documents` & `knowledge_chunks`** (Agentic RAG Corpus)
    - `knowledge_documents`: `id`, `owner_user_id` (NULL for shared public career/skill/company docs; non-null for private candidate materials), `source_type` (`job_description`, `company_info`, `candidate_doc`, `career_guidance`, `skill_desc`, `interview_prep`), `title`, `external_ref`, `metadata_json`, `created_at`.
    - `knowledge_chunks`: `id`, `document_id` FK, `owner_user_id` (denormalized for strict retrieval filter isolation), `chunk_index`, `content`, `tsv` (`TSVECTOR` for BM25/sparse), `embedding` (`VECTOR(768)`), `metadata_json`.

---

### 2.6 ML Model Registry & Evaluation Tracking
24. **`model_versions`**
    - `id`: `UUID` PK
    - `model_kind`: `VARCHAR(32)` NOT NULL (`embedding`, `compatibility`, `ranker`, `reranker`)
    - `name`: `VARCHAR(128)` NOT NULL (e.g., `BAAI/bge-base-en-v1.5`, `lgbm_compat_v1`)
    - `version`: `VARCHAR(64)` NOT NULL
    - `artifact_path`: `VARCHAR(512)` NULL
    - `training_data_provenance`: `VARCHAR(64)` NOT NULL (`synthetic_dev`, `real_feedback`, `pretrained`)
    - `metrics_json`: `JSONB` NOT NULL DEFAULT `'{}'`
    - `is_active`: `BOOLEAN` NOT NULL DEFAULT `false`
    - `created_at`: `TIMESTAMPTZ` NOT NULL
    - Constraints: `UNIQUE (model_kind, name, version)`

25. **`evaluation_runs`**
    - `id`: `UUID` PK
    - `suite`: `VARCHAR(32)` NOT NULL (`ml_compatibility`, `ltr_ranking`, `rag`, `agent`)
    - `dataset_name`: `VARCHAR(128)` NOT NULL
    - `dataset_provenance`: `VARCHAR(32)` NOT NULL (`synthetic`, `real`, `benchmark`) — *keeps synthetic and real results strictly separated*
    - `model_version_id`: `UUID` FK → `model_versions.id` NULL
    - `metrics_json`: `JSONB` NOT NULL (`ndcg@5`, `ndcg@10`, `precision@k`, `recall@k`, `mrr`, `map`, `faithfulness`, `context_precision`, `tool_selection_accuracy`, etc.)
    - `report_path`: `VARCHAR(512)` NULL
    - `git_sha`: `VARCHAR(64)` NULL
    - `created_at`: `TIMESTAMPTZ` NOT NULL

> **LangGraph Checkpointing:** LangGraph's `PostgresSaver` tables (`checkpoints`, `checkpoint_blobs`, `checkpoint_writes`) will live in PostgreSQL under the `langgraph` schema (or dedicated migration) alongside our application tables.
