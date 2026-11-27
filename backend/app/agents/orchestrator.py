"""Dynamic Main Career Orchestrator implemented with LangGraph conditional routing & bounded retries."""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Literal, Optional, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from sqlalchemy.orm import Session

from ..core.config import Settings, get_settings
from ..models import User
from ..services.llm_provider import LLMProvider
from .specialists import (
    SpecialistOutput,
    run_application_assistant_agent,
    run_career_advisor_agent,
    run_job_discovery_agent,
    run_job_matching_agent,
    run_memory_agent,
    run_profile_intelligence_agent,
)
from .tools import ToolExecutor

IntentType = Literal[
    "job_discovery",
    "job_matching",
    "profile_analysis",
    "career_advice",
    "application_prep",
    "preference_memory",
]


class OrchestratorState(TypedDict, total=False):
    user_message: str
    intent: str
    plan: list[str]
    step_idx: int
    retries: int
    max_retries: int
    execution_updates: list[str]
    specialist_summaries: list[str]
    tool_results_summary: list[dict[str, Any]]
    follow_up_questions: list[str]
    pending_approval: Optional[dict[str, Any]]
    final_response: str
    failed: bool


def classify_intent_and_plan(user_message: str) -> tuple[IntentType, list[str]]:
    """Classify user intent and construct an ordered specialist execution plan."""
    tl = (user_message or "").lower().strip()

    if any(k in tl for k in ("apply", "submit", "cover letter", "tailor", "interview prep", "pitch", "track application")):
        return "application_prep", ["profile_intelligence_agent", "application_assistant_agent"]

    if any(k in tl for k in ("prefer", "remember", "update my location", "update preferences", "currency")):
        return "preference_memory", ["memory_agent", "job_discovery_agent"]

    if any(k in tl for k in ("find ", "search ", "discover ", "jobs in", "find remote", "openings", "vacancies")):
        return "job_discovery", ["profile_intelligence_agent", "job_discovery_agent", "job_matching_agent"]

    if any(k in tl for k in ("rank ", "rank my", "recommend", "compatible", "compatibility", "best fit", "match me")):
        return "job_matching", ["profile_intelligence_agent", "job_matching_agent"]

    if any(
        k in tl
        for k in (
            "skill gap",
            "gap",
            "roadmap",
            "learn",
            "trends",
            "market",
            "can i",
            "should i",
            "how do i",
            "how can i",
            "how to",
            "what should",
            "only know",
            "fresher",
            "beginner",
            "eligible",
            "advice",
            "guide",
            "explain",
            "salary",
            "cse",
            "html",
            "css",
            "python",
            "java",
            "react",
            "help",
        )
    ):
        return "career_advice", ["career_advisor_agent"]

    if any(k in tl for k in ("resume", "profile", "strength", "parse")):
        return "profile_analysis", ["profile_intelligence_agent"]

    if "?" in tl or len(tl.split()) <= 4:
        return "career_advice", ["career_advisor_agent"]

    # Default multi-step discovery + matching workflow
    return "job_discovery", ["profile_intelligence_agent", "job_discovery_agent", "job_matching_agent"]


def _format_structured_response(state: OrchestratorState) -> str:
    """Synthesize clean, structured markdown strictly grounded in tool outputs (fallback when LLM off)."""
    sections: list[str] = []
    summaries = list(state.get("specialist_summaries", []))
    tools = list(state.get("tool_results_summary", []))

    if summaries:
        sections.append("### Summary\n" + "\n".join(f"- {s}" for s in summaries))

    for tr in tools:
        if not tr.get("ok") or not isinstance(tr.get("data"), dict):
            continue
        tname = tr.get("tool")
        data = tr["data"]

        if tname == "rank_jobs" and data.get("ranked_jobs"):
            lines = ["### Top Ranked ML Matches"]
            for idx, r in enumerate(data["ranked_jobs"][:4], start=1):
                pct = round(float(r.get("compatibility_probability", 0)) * 100)
                matched = ", ".join(r.get("strong_matching_skills", [])[:4]) or "verified profile"
                missing = ", ".join(r.get("missing_skills", [])[:3])
                lines.append(
                    f"{idx}. **{r.get('title')}** — {r.get('company')} · **{pct}% compatibility** "
                    f"(LTR {float(r.get('ranking_score', 0)):.2f}) · Matched: {matched}"
                    + (f" · Missing: {missing}" if missing else "")
                )
            sections.append("\n".join(lines))

        elif tname == "search_jobs" and data.get("jobs"):
            lines = ["### Relevant Opportunities"]
            for idx, j in enumerate(data["jobs"][:4], start=1):
                meta = " · ".join(p for p in [j.get("region"), j.get("work_mode"), j.get("salary_raw")] if p)
                lines.append(f"{idx}. **{j.get('title')}** at {j.get('company')}" + (f" ({meta})" if meta else ""))
            sections.append("\n".join(lines))

        elif tname == "get_skill_gap":
            matched = data.get("matched_skills", [])[:6]
            missing = data.get("missing_skills", [])[:6]
            lines = [f"### Skill Coverage — {data.get('target', 'Market')}"]
            if matched:
                lines.append(f"- **Verified Strengths:** {', '.join(matched)}")
            if missing:
                lines.append(f"- **Priority Gaps:** {', '.join(missing)}")
            sections.append("\n".join(lines))

        elif tname == "tailor_resume":
            hi = ", ".join(data.get("highlight_verified_skills", [])[:6]) or "verified core stack"
            addr = ", ".join(data.get("address_missing_skills_honestly", [])[:4])
            lines = [
                f"### Tailoring Focus — {data.get('title')} @ {data.get('company')}",
                f"- **Emphasize:** {hi}",
            ]
            if addr:
                lines.append(f"- **Address Honestly / Upskill:** {addr}")
            sections.append("\n".join(lines))

        elif tname == "generate_cover_letter" and data.get("draft_cover_letter"):
            sections.append(f"### Cover Letter Draft\n{data['draft_cover_letter']}")

    if state.get("pending_approval"):
        sections.append(f"### Action Paused for Approval\n{state['pending_approval'].get('message')}")

    return "\n\n".join(sections) if sections else "Completed request."


@dataclass
class OrchestratorRunResult:
    intent: str
    plan: list[str]
    execution_updates: list[str]
    tool_results_summary: list[dict[str, Any]]
    follow_up_questions: list[str]
    pending_approval: Optional[dict[str, Any]]
    reply: str


def run_career_orchestrator(
    db: Session,
    user: User,
    user_message: str,
    *,
    thread_id: str,
    conversation_id: Optional[uuid.UUID] = None,
    history: Optional[list[dict[str, str]]] = None,
    language: str = "en",
    settings: Settings | None = None,
) -> OrchestratorRunResult:
    """Compile and execute the dynamic LangGraph Main Career Orchestrator."""
    cfg = settings or get_settings()
    executor = ToolExecutor(db, user, settings=cfg, max_calls=8, max_retries=1, conversation_id=conversation_id)

    def understand_node(state: OrchestratorState) -> OrchestratorState:
        intent, plan = classify_intent_and_plan(state["user_message"])
        return {
            **state,
            "intent": intent,
            "plan": plan,
            "step_idx": 0,
            "retries": 0,
            "max_retries": 2,
            "execution_updates": ["Understanding request"],
            "specialist_summaries": [],
            "tool_results_summary": [],
            "follow_up_questions": [],
            "pending_approval": None,
            "failed": False,
        }

    def _run_specialist(state: OrchestratorState, runner) -> OrchestratorState:
        out: SpecialistOutput = runner(executor, state["user_message"])
        updates = [*state.get("execution_updates", []), out.status_update]
        summaries = [*state.get("specialist_summaries", []), out.summary]
        tool_summaries = [
            *state.get("tool_results_summary", []),
            *[
                {
                    "tool": tr.tool_name,
                    "ok": tr.ok,
                    "latency_ms": tr.latency_ms,
                    "error": tr.error,
                    "data": tr.data,
                }
                for tr in out.tool_results
            ],
        ]
        existing_fqs = list(state.get("follow_up_questions", []))
        for fq in out.follow_up_questions:
            if fq not in existing_fqs and len(existing_fqs) < 4:
                existing_fqs.append(fq)
        pending = out.pending_approval or state.get("pending_approval")

        if not out.success and state.get("retries", 0) < state.get("max_retries", 2):
            return {
                **state,
                "retries": state.get("retries", 0) + 1,
                "execution_updates": updates,
                "specialist_summaries": summaries,
                "tool_results_summary": tool_summaries,
                "follow_up_questions": existing_fqs,
                "pending_approval": pending,
            }

        return {
            **state,
            "step_idx": state.get("step_idx", 0) + 1,
            "execution_updates": updates,
            "specialist_summaries": summaries,
            "tool_results_summary": tool_summaries,
            "follow_up_questions": existing_fqs,
            "pending_approval": pending,
            "failed": not out.success,
        }

    def route_next(state: OrchestratorState) -> str:
        if state.get("pending_approval") is not None:
            return "synthesize"
        plan = state.get("plan", [])
        idx = state.get("step_idx", 0)
        if idx >= len(plan):
            return "synthesize"
        return plan[idx]

    def synthesize_node(state: OrchestratorState) -> OrchestratorState:
        updates = [*state.get("execution_updates", []), "Preparing recommendation"]
        structured_reply = _format_structured_response(state)

        provider_name = cfg.llm_provider.lower()
        # Local Ollama runs entirely on-device; external cloud LLMs require explicit user consent.
        can_use_llm = (provider_name == "ollama") or (user.llm_consent_granted and provider_name != "mock")

        if can_use_llm:
            try:
                llm = LLMProvider(cfg)
                history_lines = []
                for h in (history or [])[-6:]:
                    role_lbl = "User" if h.get("role") == "user" else "Medo AI"
                    history_lines.append(f"{role_lbl}: {h.get('content', '')[:350]}")
                history_block = "\n".join(history_lines) if history_lines else "(New conversation)"

                intent = state.get("intent", "career_advice")
                has_devanagari = any("\u0900" <= ch <= "\u097f" for ch in state["user_message"])
                reply_in_hindi = (language or "en").lower() == "hi" or has_devanagari or "in hindi" in state["user_message"].lower()

                lang_directive = (
                    "CRITICAL LANGUAGE REQUIREMENT: Write your entire response in natural, clear, professional Hindi (Devanagari script - हिंदी). "
                    "Use standard English technical nouns (like Python, React, HTML, CSS, SQL, FastAPI, ML, RAG) inline where appropriate in Indian tech hiring. "
                    if reply_in_hindi
                    else ""
                )
                system_prompt = (
                    "You are Medo AI, an expert technical career mentor and career intelligence orchestrator. "
                    + lang_directive
                    + "Always answer the user's exact question directly, honestly, empathetically, and practically using crisp Markdown "
                    "(### headings, short bullet points, bold highlights, numbered next steps). "
                    "Never output internal debug tags like [agent_name] or raw JSON. "
                    "Never invent fake job postings or compatibility percentages."
                )

                if intent == "career_advice":
                    # Prioritize answering the user's stated skills/situation directly
                    prompt = (
                        f"Conversation History:\n{history_block}\n\n"
                        f"User's Exact Question: {state['user_message']}\n\n"
                        f"Optional Market Context:\n{structured_reply}\n\n"
                        "Instructions:\n"
                        "1. Answer the user's exact question directly in the first 2 sentences based on the skills/background THEY stated in their message (for example, if they say they only know HTML / CSE, tailor your advice strictly to HTML + CSE rather than unrelated roles).\n"
                        "2. Give realistic entry-level job roles possible now vs skills to learn next (e.g. CSS, JavaScript, Git, React/Backend, SQL) to become strongly employable.\n"
                        "3. Provide a concrete 4-week learning & project action plan.\n"
                        "4. Keep the tone encouraging, realistic, and concise."
                    )
                else:
                    prompt = (
                        f"Conversation History:\n{history_block}\n\n"
                        f"User Request: {state['user_message']}\n\n"
                        f"Verified Workspace Telemetry (strictly preserve numbers/companies):\n{structured_reply}\n\n"
                        "Instructions:\n"
                        "Synthesize a clear, direct, executive-quality response addressing the user's request grounded strictly in the verified workspace telemetry above."
                    )

                ans = llm.complete(prompt, system=system_prompt, max_tokens=750).text.strip()
                if ans:
                    structured_reply = ans
            except Exception:
                # Preserve grounded deterministic brief if local Ollama or external LLM fails
                pass

        return {
            **state,
            "execution_updates": updates,
            "final_response": structured_reply,
        }

    graph = StateGraph(OrchestratorState)
    graph.add_node("understand", understand_node)
    graph.add_node("profile_intelligence_agent", lambda s: _run_specialist(s, run_profile_intelligence_agent))
    graph.add_node("job_discovery_agent", lambda s: _run_specialist(s, run_job_discovery_agent))
    graph.add_node("job_matching_agent", lambda s: _run_specialist(s, run_job_matching_agent))
    graph.add_node("career_advisor_agent", lambda s: _run_specialist(s, run_career_advisor_agent))
    graph.add_node("application_assistant_agent", lambda s: _run_specialist(s, run_application_assistant_agent))
    graph.add_node("memory_agent", lambda s: _run_specialist(s, run_memory_agent))
    graph.add_node("synthesize", synthesize_node)

    routing_table = {
        "profile_intelligence_agent": "profile_intelligence_agent",
        "job_discovery_agent": "job_discovery_agent",
        "job_matching_agent": "job_matching_agent",
        "career_advisor_agent": "career_advisor_agent",
        "application_assistant_agent": "application_assistant_agent",
        "memory_agent": "memory_agent",
        "synthesize": "synthesize",
    }

    graph.add_edge(START, "understand")
    graph.add_conditional_edges("understand", route_next, routing_table)
    for node_name in (
        "profile_intelligence_agent",
        "job_discovery_agent",
        "job_matching_agent",
        "career_advisor_agent",
        "application_assistant_agent",
        "memory_agent",
    ):
        graph.add_conditional_edges(node_name, route_next, routing_table)
    graph.add_edge("synthesize", END)

    compiled = graph.compile(checkpointer=MemorySaver())
    final_state = compiled.invoke(
        {"user_message": user_message},
        config={"configurable": {"thread_id": thread_id}, "recursion_limit": 18},
    )

    return OrchestratorRunResult(
        intent=final_state["intent"],
        plan=final_state["plan"],
        execution_updates=final_state["execution_updates"],
        tool_results_summary=final_state["tool_results_summary"],
        follow_up_questions=final_state.get("follow_up_questions", []),
        pending_approval=final_state.get("pending_approval"),
        reply=final_state["final_response"],
    )
