"""Reproducible LangGraph Agent Orchestrator evaluation benchmark."""
from __future__ import annotations

import json
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..agents.orchestrator import run_career_orchestrator
from ..core.config import Settings
from ..core.security import hash_password
from ..ingestion.connectors import DemoDatasetConnector
from ..ingestion.pipeline import JobIngestionPipeline
from ..ml.embeddings import EmbeddingService
from ..models import CandidateProfile, EvaluationRun, Job, JobMatch, User


@dataclass
class AgentEvalCaseResult:
    case_id: str
    expected_intent: str
    actual_intent: str
    expected_tools: list[str]
    actual_tools: list[str]
    completed: bool
    tool_selection_correct: bool
    unnecessary_tool_calls: int
    failed_tool_calls: int
    approval_gated_when_required: bool
    latency_ms: float


def run_agent_benchmark(
    db: Session,
    settings: Settings,
    *,
    report_path: Path | None = None,
) -> dict[str, Any]:
    """Evaluate orchestrator intent routing, tool precision, retry bounds, and approval gates."""
    suffix = uuid.uuid4().hex[:8]
    user = User(
        email=f"agent_eval_{suffix}@example.com",
        password_hash=hash_password("EvalPass123!"),
        full_name="Agent Eval Candidate",
        llm_consent_granted=True,
    )
    db.add(user)
    db.flush()

    prof = CandidateProfile(
        user_id=user.id,
        headline="ML Systems Engineer",
        current_location="Bengaluru, India",
        years_experience=4.0,
        target_roles_json=["ML Engineer", "AI Engineer"],
        completeness_score=0.8,
    )
    db.add(prof)
    db.flush()
    emb = EmbeddingService(settings)
    JobIngestionPipeline(db, embedding_service=emb).run_connector(
        DemoDatasetConnector(settings=settings), keywords=[], limit=10
    )
    first_job = db.scalar(select(Job).limit(1))
    if first_job is not None:
        db.add(
            JobMatch(
                user_id=user.id,
                profile_id=prof.id,
                job_id=first_job.id,
                semantic_similarity=0.88,
                compatibility_probability=0.86,
                ranking_score=0.91,
                confidence=0.89,
                strong_matching_skills=["Python", "PyTorch"],
                missing_skills=["CUDA", "NCCL"],
                ranking_reasons=["Strong ML foundation; missing CUDA optimization."],
            )
        )
    db.commit()
    job_id_str = str(first_job.id) if first_job is not None else str(uuid.uuid4())

    scenarios = [
        {
            "case_id": "agent_job_discovery",
            "message": "Search jobs for PyTorch ML engineer in Bengaluru",
            "expected_intent": "job_discovery",
            "expected_tools": {"get_candidate_profile", "analyse_resume", "search_jobs", "rank_jobs"},
            "require_approval": False,
        },
        {
            "case_id": "agent_job_matching",
            "message": "Recommend and rank compatible matches for me",
            "expected_intent": "job_matching",
            "expected_tools": {"get_candidate_profile", "analyse_resume", "rank_jobs"},
            "require_approval": False,
        },
        {
            "case_id": "agent_profile_analysis",
            "message": "Analyze my resume strength and completeness",
            "expected_intent": "profile_analysis",
            "expected_tools": {"get_candidate_profile", "analyse_resume"},
            "require_approval": False,
        },
        {
            "case_id": "agent_career_advice",
            "message": "What are my skill gaps and market trends for AI engineer roles?",
            "expected_intent": "career_advice",
            "expected_tools": {
                "get_candidate_profile",
                "analyse_resume",
                "get_skill_gap",
                "search_career_knowledge",
                "get_market_trends",
            },
            "require_approval": False,
        },
        {
            "case_id": "agent_application_approval_gate",
            "message": f"Submit external job application for job {job_id_str}",
            "expected_intent": "application_prep",
            "expected_tools": {"get_candidate_profile", "analyse_resume", "track_application"},
            "require_approval": True,
        },
        {
            "case_id": "agent_memory_update",
            "message": "Remember that I prefer remote Bengaluru roles",
            "expected_intent": "preference_memory",
            "expected_tools": {"get_candidate_profile", "search_jobs"},
            "require_approval": False,
        },
    ]

    case_results: list[AgentEvalCaseResult] = []
    total_tool_calls = 0
    total_failed_tools = 0
    total_unnecessary = 0
    estimated_tokens = 0
    approval_required_count = 0
    approval_gated_count = 0

    for sc in scenarios:
        t0 = time.perf_counter()
        res = run_career_orchestrator(
            db,
            user,
            sc["message"],
            thread_id=f"eval:{user.id}:{sc['case_id']}",
            settings=settings,
        )
        latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)

        actual_tools = [t["tool"] for t in res.tool_results_summary]
        failed = sum(1 for t in res.tool_results_summary if not t.get("ok", False))
        expected_set = set(sc["expected_tools"])
        actual_set = set(actual_tools)
        unnecessary = len([t for t in actual_tools if t not in expected_set])
        selection_correct = res.intent == sc["expected_intent"] and expected_set.issubset(actual_set)

        gated_ok = True
        if sc["require_approval"]:
            approval_required_count += 1
            pa = res.pending_approval or {}
            gated_ok = bool(pa.get("approval_required") or pa.get("status") == "pending")
            if gated_ok:
                approval_gated_count += 1

        completed = bool(res.reply) and selection_correct and gated_ok and failed == 0
        total_tool_calls += len(actual_tools)
        total_failed_tools += failed
        total_unnecessary += unnecessary
        estimated_tokens += max(20, (len(sc["message"]) + len(res.reply)) // 4)

        case_results.append(
            AgentEvalCaseResult(
                case_id=sc["case_id"],
                expected_intent=sc["expected_intent"],
                actual_intent=res.intent,
                expected_tools=sorted(expected_set),
                actual_tools=actual_tools,
                completed=completed,
                tool_selection_correct=selection_correct,
                unnecessary_tool_calls=unnecessary,
                failed_tool_calls=failed,
                approval_gated_when_required=gated_ok,
                latency_ms=latency_ms,
            )
        )

    n = max(1, len(case_results))
    summary = {
        "provenance": "curated_benchmark",
        "task_completion_rate": round(sum(1 for c in case_results if c.completed) / n, 4),
        "tool_selection_accuracy": round(sum(1 for c in case_results if c.tool_selection_correct) / n, 4),
        "tool_failure_rate": round(total_failed_tools / max(1, total_tool_calls), 4),
        "unnecessary_tool_calls": total_unnecessary,
        "approval_gate_pass_rate": round(approval_gated_count / max(1, approval_required_count), 4),
        "avg_latency_ms": round(sum(c.latency_ms for c in case_results) / n, 2),
        "estimated_tokens_total": estimated_tokens,
        "cases": [asdict(c) for c in case_results],
    }

    db.add(
        EvaluationRun(
            suite="agent",
            dataset_name="nexus_agent_eval_v1",
            dataset_provenance="curated_benchmark",
            metrics_json={k: v for k, v in summary.items() if k != "cases"},
            report_path=str(report_path) if report_path else None,
        )
    )
    db.commit()

    if report_path is not None:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    return summary
