# Deployment, Backup & Operations Guide

## 1. Environment & Secret Requirements

In `ENVIRONMENT=production`:
- `SECRET_KEY` must be a high-entropy string (`>= 32` characters) and cannot contain `dev-only` or `replace-with` (enforced by Pydantic `Settings.validate_prod_secret`).
- `POST /api/v1/auth/demo` is automatically rejected with `403 DEMO_DISABLED`.
- `/ready` enforces reachability of both PostgreSQL (`pgvector`) and Redis before returning HTTP `200`.

Generate a production secret:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## 2. Database Migrations (Alembic)

Apply schema migrations cleanly before starting application workers:
```bash
alembic -c backend/alembic.ini upgrade head
```

Inspect current revision / rollback one step if needed:
```bash
alembic -c backend/alembic.ini current
alembic -c backend/alembic.ini downgrade -1
```

---

## 3. PostgreSQL + pgvector Backup & Restore

### Logical Backup (`pg_dump`)
```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-nexus}" -Fc "${POSTGRES_DB:-nexus_ai}" > "backups/nexus_ai_$(date +%Y%m%d_%H%M%S).dump"
```

### Restore (`pg_restore`)
```bash
cat backups/nexus_ai_YYYYMMDD_HHMMSS.dump | docker compose exec -T postgres pg_restore -U "${POSTGRES_USER:-nexus}" -d "${POSTGRES_DB:-nexus_ai}" --clean --if-exists
alembic -c backend/alembic.ini upgrade head
```

---

## 4. Legacy Data Migration (Non-Destructive)

To import legacy SQLite `JobHunter` records (`data/jobs.db`) into the Nexus schema without modifying the legacy database file:
```bash
python -m scripts.migrate_legacy_sqlite --legacy-db data/jobs.db --dry-run
python -m scripts.migrate_legacy_sqlite --legacy-db data/jobs.db
```

---

## 5. Celery Background Workers & Observability

- **Worker:** `celery -A backend.app.workers.celery_app:celery_app worker --loglevel=info`
- **Scheduler (Beat):** `celery -A backend.app.workers.celery_app:celery_app beat --loglevel=info`
- **Telemetry Endpoints (JWT-authenticated):**
  - `GET /api/v1/observability/metrics` — route latency percentiles (`p50`, `p95`, `max`), stage timings, LLM token counters, recent spans.
  - `GET /api/v1/observability/audit-logs` — user-isolated security & consent audit log stream.
  - `GET /api/v1/evaluation/runs` & `POST /api/v1/evaluation/run` — provenance-tracked offline evaluation runs.
