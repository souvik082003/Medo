"""Specialist agents with distinct responsibilities, tool sets, and measurable success criteria."""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from .tools import ToolExecutionResult, ToolExecutor


@dataclass
class SpecialistOutput:
    agent_name: str
    status_update: str
    success: bool
    summary: str
    tool_results: list[ToolExecutionResult] = field(default_factory=list)
    follow_up_questions: list[str] = field(default_factory=list)
    pending_approval: Optional[dict[str, Any]] = None


def _extract_job_uuid(text: str) -> Optional[str]:
    m = re.search(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", text, re.I)
    return m.group(0) if m else None


def _extract_region(text: str) -> Optional[str]:
    tl = text.lower()
    if any(k in tl for k in ("india", "bengaluru", "bangalore", "hyderabad", "pune", "mumbai", "inr", "lpa")):
        return "IN"
    if any(k in tl for k in ("united states", "san francisco", "new york", "usa", " us ")):
        return "US"
    if any(k in tl for k in ("europe", "berlin", "germany", "london", "uk")):
        return "EU" if "europe" in tl or "berlin" in tl or "germany" in tl else "UK"
    return None


def _extract_work_mode(text: str) -> Optional[str]:
    tl = text.lower()
    if "remote" in tl:
        return "remote"
    if "hybrid" in tl:
        return "hybrid"
    if "onsite" in tl or "on-site" in tl:
        return "onsite"
    return None


def run_profile_intelligence_agent(executor: ToolExecutor, user_message: str) -> SpecialistOutput:
    """Parse/inspect candidate profile, extract strengths & missing info, ask follow-ups if needed."""
    prof_res = executor.execute("get_candidate_profile", {})
    resume_res = executor.execute("analyse_resume", {})
    ok = prof_res.ok and resume_res.ok

    follow_ups: list[str] = []
    if resume_res.ok and resume_res.data:
        for gap in resume_res.data.get("missing_information", []):
            follow_ups.append(f"Please update: {gap}")
    if prof_res.ok and prof_res.data and not prof_res.data.get("preferred_roles"):
        follow_ups.append("What target job titles are you prioritizing?")

    summary = (
        f"Profile completeness {int((resume_res.data or {}).get('completeness_score', 0) * 100)}%, "
        f"{(resume_res.data or {}).get('skill_count', 0)} verified skills."
        if ok
        else "Could not inspect candidate profile."
    )
    return SpecialistOutput(
        agent_name="profile_intelligence_agent",
        status_update="Analyzing candidate profile",
        success=ok,
        summary=summary,
        tool_results=[prof_res, resume_res],
        follow_up_questions=follow_ups,
    )


def run_job_discovery_agent(executor: ToolExecutor, user_message: str) -> SpecialistOutput:
    """Search permitted indexed jobs using region/work-mode filters extracted from user intent."""
    region = _extract_region(user_message)
    work_mode = _extract_work_mode(user_message)
    res = executor.execute(
        "search_jobs",
        {"query": user_message[:250], "region": region, "work_mode": work_mode, "limit": 10},
    )
    jobs = (res.data or {}).get("jobs", []) if res.ok else []
    summary = f"Found {len(jobs)} normalized job opportunities" + (f" in {region}" if region else "") + "."
    return SpecialistOutput(
        agent_name="job_discovery_agent",
        status_update="Searching job sources",
        success=res.ok,
        summary=summary,
        tool_results=[res],
    )


def run_job_matching_agent(executor: ToolExecutor, user_message: str) -> SpecialistOutput:
    """Execute ML compatibility & Learning-to-Rank ranking across candidate jobs."""
    job_uuid = _extract_job_uuid(user_message)
    if job_uuid:
        res = executor.execute("calculate_job_match", {"job_id": job_uuid})
        data = res.data or {}
        summary = (
            f"Compatibility {round(data.get('compatibility_probability', 0) * 100)}% for {data.get('title', 'job')}."
            if res.ok
            else f"Job match failed: {res.error}"
        )
        return SpecialistOutput(
            agent_name="job_matching_agent",
            status_update="Running ranking model",
            success=res.ok,
            summary=summary,
            tool_results=[res],
        )

    res = executor.execute("rank_jobs", {"limit": 10})
    ranked = (res.data or {}).get("ranked_jobs", []) if res.ok else []
    summary = (
        f"Ranked {len(ranked)} jobs using {(res.data or {}).get('model_version', 'LTR')}."
        if res.ok
        else f"Ranking failed: {res.error}"
    )
    return SpecialistOutput(
        agent_name="job_matching_agent",
        status_update="Running ranking model",
        success=res.ok,
        summary=summary,
        tool_results=[res],
    )


def run_career_advisor_agent(executor: ToolExecutor, user_message: str) -> SpecialistOutput:
    """Analyze skill gaps, market trends, and practical improvement plans."""
    job_uuid = _extract_job_uuid(user_message)
    gap_res = executor.execute("get_skill_gap", {"job_id": job_uuid} if job_uuid else {"target_role": None})
    trend_res = executor.execute("get_market_trends", {"region": _extract_region(user_message), "limit": 8})
    kb_res = executor.execute("search_career_knowledge", {"query": user_message[:250], "limit": 3})

    missing = (gap_res.data or {}).get("missing_skills", []) if gap_res.ok else []
    top_mkt = [s["skill"] for s in (trend_res.data or {}).get("top_skills", [])[:5]] if trend_res.ok else []
    summary = (
        f"Identified {len(missing)} skill gaps ({', '.join(missing[:4]) or 'none'}). "
        f"Top market demand: {', '.join(top_mkt) or 'no indexed jobs yet'}."
    )
    return SpecialistOutput(
        agent_name="career_advisor_agent",
        status_update="Analyzing skill gaps and trends",
        success=gap_res.ok and trend_res.ok,
        summary=summary,
        tool_results=[gap_res, trend_res, kb_res],
    )


def run_application_assistant_agent(executor: ToolExecutor, user_message: str) -> SpecialistOutput:
    """Prepare resume tailoring, cover letters, or application tracking—blocking auto-submit behind approval."""
    job_uuid = _extract_job_uuid(user_message)
    tl = user_message.lower()
    if not job_uuid:
        return SpecialistOutput(
            agent_name="application_assistant_agent",
            status_update="Preparing application guidance",
            success=True,
            summary="Specify a job ID to tailor your resume, draft a cover letter, or update application tracking.",
            follow_up_questions=["Which job ID would you like to tailor or track?"],
        )

    if any(k in tl for k in ("apply", "submit", "send email", "send application")):
        res = executor.execute("track_application", {"job_id": job_uuid, "action": "submit_external"})
        pending = res.data if (res.ok and (res.data or {}).get("approval_required")) else None
        return SpecialistOutput(
            agent_name="application_assistant_agent",
            status_update="Checking human approval policy",
            success=res.ok,
            summary=(res.data or {}).get("message", "Approval check complete.") if res.ok else (res.error or "Failed"),
            tool_results=[res],
            pending_approval=pending,
        )

    if "cover letter" in tl:
        res = executor.execute("generate_cover_letter", {"job_id": job_uuid})
        return SpecialistOutput(
            agent_name="application_assistant_agent",
            status_update="Drafting cover letter",
            success=res.ok,
            summary="Generated grounded cover letter draft for review." if res.ok else (res.error or "Failed"),
            tool_results=[res],
        )

    res = executor.execute("tailor_resume", {"job_id": job_uuid})
    return SpecialistOutput(
        agent_name="application_assistant_agent",
        status_update="Preparing resume tailoring plan",
        success=res.ok,
        summary="Generated verified resume tailoring plan." if res.ok else (res.error or "Failed"),
        tool_results=[res],
    )


def run_memory_agent(executor: ToolExecutor, user_message: str) -> SpecialistOutput:
    """Extract inferred preferences into 3-tier memory without treating LLM inference as confirmed."""
    from ..memory.service import MemoryService

    region = _extract_region(user_message)
    work_mode = _extract_work_mode(user_message)
    mem_svc = MemoryService(executor.db, settings=executor.settings)
    explicit_confirm = any(k in user_message.lower() for k in ("confirm", "set my", "update my"))

    notes: list[str] = []
    if region:
        _, conflict = mem_svc.extract_and_store_memory(
            executor.user,
            memory_type="preference",
            key="preferred_region",
            value_text=region,
            confirmed_by_user=explicit_confirm,
        )
        notes.append(f"region={region}" + (f" ({conflict})" if conflict else ""))
    if work_mode:
        _, conflict = mem_svc.extract_and_store_memory(
            executor.user,
            memory_type="preference",
            key="preferred_work_mode",
            value_text=work_mode,
            confirmed_by_user=explicit_confirm,
        )
        notes.append(f"work_mode={work_mode}" + (f" ({conflict})" if conflict else ""))

    relevant = mem_svc.retrieve_relevant_memories(executor.user.id, user_message, top_k=3)
    res = executor.execute("get_candidate_profile", {})
    return SpecialistOutput(
        agent_name="memory_agent",
        status_update="Retrieving & updating semantic memory",
        success=res.ok,
        summary=f"Memory sync ({', '.join(notes) or 'read-only'}); retrieved {len(relevant)} semantic memories.",
        tool_results=[res],
    )
