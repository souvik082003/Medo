"""Observability, audit log, and reproducible evaluation API endpoints."""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...auth.dependencies import get_current_user
from ...core.config import get_settings
from ...core.database import get_db
from ...core.observability import get_metrics, get_recent_spans
from ...core.rate_limit import rate_limit_dependency
from ...evaluation.agent_bench import run_agent_benchmark
from ...evaluation.rag_bench import run_rag_benchmark
from ...evaluation.ranking_bench import run_synthetic_dev_benchmark
from ...evaluation.run_all import run_all_benchmarks
from ...models import AuditLog, EvaluationRun, User, UserRole

router = APIRouter(prefix="/api/v1", tags=["observability-evaluation"])


class TriggerEvalRequest(BaseModel):
    suite: Literal["ranking", "rag", "agent", "all"] = "all"


@router.get("/observability/metrics")
def get_observability_metrics(
    span_limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return runtime latency percentiles, error rate, stage timings, token usage, and recent OTel spans."""
    return {
        "service": get_settings().app_name,
        "environment": get_settings().environment,
        "viewer_role": current_user.role,
        "metrics": get_metrics().snapshot(),
        "recent_spans": get_recent_spans(limit=span_limit),
    }


@router.get("/observability/audit-logs")
def list_audit_logs(
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """List security/privacy audit events (strictly scoped to current user unless admin)."""
    stmt = select(AuditLog)
    count_stmt = select(func.count(AuditLog.id))
    if current_user.role != UserRole.ADMIN.value:
        stmt = stmt.where(AuditLog.user_id == current_user.id)
        count_stmt = count_stmt.where(AuditLog.user_id == current_user.id)

    total = int(db.scalar(count_stmt) or 0)
    rows = db.scalars(stmt.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)).all()
    return {
        "total": total,
        "items": [
            {
                "id": str(r.id),
                "action": r.action,
                "resource_type": r.resource_type,
                "resource_id": r.resource_id,
                "ip_address": r.ip_address,
                "metadata": r.metadata_json,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ],
    }


@router.get("/evaluation/runs")
def list_evaluation_runs(
    suite: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """List persisted evaluation benchmark runs with explicit synthetic vs real provenance."""
    stmt = select(EvaluationRun)
    if suite:
        stmt = stmt.where(EvaluationRun.suite == suite)
    rows = db.scalars(stmt.order_by(EvaluationRun.created_at.desc()).limit(limit)).all()
    return {
        "items": [
            {
                "id": str(r.id),
                "suite": r.suite,
                "dataset_name": r.dataset_name,
                "dataset_provenance": r.dataset_provenance,
                "metrics": r.metrics_json,
                "report_path": r.report_path,
                "git_sha": r.git_sha,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]
    }


@router.post(
    "/evaluation/run",
    dependencies=[Depends(rate_limit_dependency(limit=10, window_seconds=60))],
)
def run_evaluation_suite(
    payload: TriggerEvalRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Run reproducible evaluation suite cleanly and persist EvaluationRun metrics."""
    settings = get_settings()
    if payload.suite == "ranking":
        res = run_synthetic_dev_benchmark(db)
    elif payload.suite == "rag":
        res = run_rag_benchmark(db, settings)
    elif payload.suite == "agent":
        res = run_agent_benchmark(db, settings)
    else:
        res = run_all_benchmarks(db, settings)
    return {"suite": payload.suite, "triggered_by": str(current_user.id), "results": res}
