"""Non-destructive importer from legacy JobHunter SQLite + flat files into Nexus AI database."""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select

from backend.app.core.config import get_settings
from backend.app.core.database import get_sessionmaker
from backend.app.core.security import hash_password
from backend.app.models import (
    Application,
    ApplicationEvent,
    CandidateProfile,
    Job,
    JobSource,
    ResumeVersion,
    User,
    UserPreference,
    UserRole,
)


def _parse_dt(val: str | None) -> datetime | None:
    if not val:
        return None
    try:
        dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def migrate_legacy_data(
    legacy_db_path: Path,
    owner_email: str,
    owner_password: str,
    owner_name: str = "Migrated Candidate",
    *,
    dry_run: bool = False,
) -> dict[str, int]:
    """Import legacy SQLite profiles, jobs, resume revisions, and events idempotently."""
    counts = {"profiles": 0, "jobs": 0, "revisions": 0, "applications": 0, "events": 0}
    if not legacy_db_path.exists():
        raise FileNotFoundError(f"Legacy database not found: {legacy_db_path}")

    conn = sqlite3.connect(str(legacy_db_path))
    conn.row_factory = sqlite3.Row
    try:
        legacy_profiles = conn.execute("SELECT * FROM profiles").fetchall() if _table_exists(conn, "profiles") else []
        legacy_jobs = conn.execute("SELECT * FROM jobs").fetchall() if _table_exists(conn, "jobs") else []
        legacy_revs = (
            conn.execute("SELECT * FROM resume_revisions").fetchall()
            if _table_exists(conn, "resume_revisions")
            else []
        )
        legacy_events = conn.execute("SELECT * FROM events").fetchall() if _table_exists(conn, "events") else []
    finally:
        conn.close()

    if dry_run:
        return {
            "profiles": len(legacy_profiles),
            "jobs": len(legacy_jobs),
            "revisions": len(legacy_revs),
            "applications": sum(1 for j in legacy_jobs if j["status"] not in ("new", "scored")),
            "events": len(legacy_events),
        }

    SessionLocal = get_sessionmaker(get_settings())
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == owner_email.strip().lower()))
        if user is None:
            user = User(
                email=owner_email.strip().lower(),
                password_hash=hash_password(owner_password),
                full_name=owner_name,
                role=UserRole.CANDIDATE.value,
                is_active=True,
            )
            db.add(user)
            db.flush()
            db.add(UserPreference(user_id=user.id))

        for lp in legacy_profiles:
            analysis: dict[str, Any] = {}
            try:
                analysis = json.loads(lp["profile_json"]) if lp["profile_json"] else {}
            except Exception:
                analysis = {}
            db.add(
                CandidateProfile(
                    user_id=user.id,
                    headline=lp["label"],
                    summary=analysis.get("summary") or lp["user_description"],
                    target_roles_json=analysis.get("top_10_positions") or [],
                    analysis_json=analysis,
                    is_active=bool(lp["is_current"]),
                )
            )
            counts["profiles"] += 1

        job_id_map: dict[int, Job] = {}
        source_cache: dict[str, JobSource] = {}
        for lj in legacy_jobs:
            src_name = (lj["source"] or "legacy").lower()
            if src_name not in source_cache:
                src = db.scalar(select(JobSource).where(JobSource.name == src_name))
                if src is None:
                    src = JobSource(name=src_name, source_type="legacy_import")
                    db.add(src)
                    db.flush()
                source_cache[src_name] = src
            src = source_cache[src_name]

            chash = lj["content_hash"] or hashlib.sha256(
                f"{lj['company']}|{lj['title']}|{lj['location'] or ''}".lower().encode("utf-8")
            ).hexdigest()[:16]
            existing = db.scalar(select(Job).where(Job.content_hash == chash, Job.source_id == src.id))
            if existing is None:
                job = Job(
                    source_id=src.id,
                    source_name=src_name,
                    external_id=lj["external_id"],
                    content_hash=chash,
                    owner_user_id=user.id if src_name == "manual" else None,
                    title=lj["title"],
                    company=lj["company"],
                    location=lj["location"],
                    description=lj["description"] or "",
                    salary_raw=lj["salary"],
                    job_type=lj["job_type"] or "full-time",
                    work_mode=lj["work_mode"] or "unspecified",
                    min_education=lj["min_education"],
                    application_url=lj["url"],
                    posted_at=_parse_dt(lj["posted_at"]),
                )
                db.add(job)
                db.flush()
                counts["jobs"] += 1
            else:
                job = existing
            job_id_map[lj["id"]] = job

            if lj["status"] not in ("new", "scored", "archived", None):
                app_existing = db.scalar(
                    select(Application).where(Application.user_id == user.id, Application.job_id == job.id)
                )
                if app_existing is None:
                    db.add(
                        Application(
                            user_id=user.id,
                            job_id=job.id,
                            status=lj["status"] if lj["status"] != "interview" else "hr_interview",
                            applied_at=_parse_dt(lj["applied_at"]),
                            notes=lj["notes"],
                        )
                    )
                    db.flush()
                    counts["applications"] += 1

        for lr in legacy_revs:
            mapped_job = job_id_map.get(lr["job_id"])
            if mapped_job is None:
                continue
            md = lr["md_content"] or ""
            db.add(
                ResumeVersion(
                    user_id=user.id,
                    job_id=mapped_job.id,
                    version_num=lr["version_num"],
                    kind="refined",
                    filename=f"legacy_job_{lr['job_id']}_v{lr['version_num']}.md",
                    mime_type="text/markdown",
                    file_size_bytes=len(md.encode("utf-8")),
                    storage_key=f"legacy/job_{lr['job_id']}_v{lr['version_num']}.md",
                    sha256_hash=hashlib.sha256(md.encode("utf-8")).hexdigest(),
                    raw_text=md,
                    modification_note=lr["note"],
                )
            )
            counts["revisions"] += 1

        for le in legacy_events:
            mapped_job = job_id_map.get(le["job_id"])
            if mapped_job is None:
                continue
            app = db.scalar(
                select(Application).where(Application.user_id == user.id, Application.job_id == mapped_job.id)
            )
            if app is not None:
                db.add(
                    ApplicationEvent(
                        user_id=user.id,
                        application_id=app.id,
                        event_type=le["kind"],
                        details=le["content"],
                        occurred_at=_parse_dt(le["timestamp"]) or datetime.now(timezone.utc),
                    )
                )
                counts["events"] += 1

        db.commit()
    return counts


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Non-destructive import of legacy JobHunter SQLite DB")
    parser.add_argument("--legacy-db", type=Path, default=Path("data/jobs.db"))
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    res = migrate_legacy_data(args.legacy_db, args.email, args.password, dry_run=args.dry_run)
    print(json.dumps(res, indent=2))
