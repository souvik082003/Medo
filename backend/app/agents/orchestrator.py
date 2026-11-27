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
    tl = (user_message or "").lower()

    if any(k in tl for k in ("apply", "submit", "cover letter", "tailor", "interview prep", "track")):
        return "application_prep", ["profile_intelligence_agent", "application_assistant_agent"]

    if any(k in tl for k in ("prefer", "remember", "update my location", "update preferences", "currency")):
        return "preference_memory", ["memory_agent", "job_discovery_agent"]

    if any(k in tl for k in ("skill gap", "gap", "roadmap", "learn", "trends", "market")):
        return "career_advice", ["profile_intelligence_agent", "career_advisor_agent"]

    if any(k in tl for k in ("find", "search", "discover", "jobs in")):
        return "job_discovery", ["profile_intelligence_agent", "job_discovery_agent", "job_matching_agent"]

    if any(k in tl for k in ("rank", "recommend", "match", "compatible", "fit")):
        return "job_matching", ["profile_intelligence_agent", "job_matching_agent"]

    if any(k in tl for k in ("resume", "profile", "strength", "parse")):
        return "profile_analysis", ["profile_intelligence_agent"]

    # Default multi-step discovery + matching workflow
    return "job_discovery", ["profile_intelligence_agent", "job_discovery_agent", "job_matching_agent"]


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
        summaries = [*state.get("specialist_summaries", []), f"[{out.agent_name}] {out.summary}"]
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
        follow_ups = [*state.get("follow_up_questions", []), *out.follow_up_questions]
        pending = out.pending_approval or state.get("pending_approval")

        if not out.success and state.get("retries", 0) < state.get("max_retries", 2):
            return {
                **state,
                "retries": state.get("retries", 0) + 1,
                "execution_updates": updates,
                "specialist_summaries": summaries,
                "tool_results_summary": tool_summaries,
                "follow_up_questions": follow_ups,
                "pending_approval": pending,
            }

        return {
            **state,
            "step_idx": state.get("step_idx", 0) + 1,
            "execution_updates": updates,
            "specialist_summaries": summaries,
            "tool_results_summary": tool_summaries,
            "follow_up_questions": follow_ups,
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
        parts = list(state.get("specialist_summaries", []))
        if state.get("pending_approval"):
            parts.append(
                f"Action paused pending explicit approval: {state['pending_approval'].get('message')}"
            )
        if state.get("follow_up_questions"):
            parts.append("Suggested next steps: " + " ".join(state["follow_up_questions"]))
        return {
            **state,
            "execution_updates": updates,
            "final_response": "\n".join(parts) if parts else "Completed request.",
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
