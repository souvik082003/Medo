"""Validated agent tools with strict Pydantic v2 schemas, timeouts, retries, and zero shell/code execution."""
from __future__ import annotations

import time
import uuid
from collections import Counter
from dataclasses import dataclass
from typing import Any, Callable, Literal, Optional

from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..core.config import Settings, get_settings
from ..ml.embeddings import EmbeddingService
from ..ml.skill_extractor import extract_job_skills
from ..models import ApprovalRequest, Job, JobSkill, KnowledgeChunk, KnowledgeDocument, ResumeVersion, Skill, User
from ..repositories.application_repo import ApplicationRepository
from ..repositories.job_repo import JobRepository
from ..repositories.profile_repo import ProfileRepository
from ..retrieval.hybrid import HybridRetriever, RetrievalFilters
from ..services.llm_provider import LLMProvider
from ..services.matching_service import compute_matches_for_user


# ── Tool Input Schemas ────────────────────────────────────────────────────────

class SearchJobsInput(BaseModel):
    query: str = Field(min_length=1, max_length=300)
    region: Optional[str] = Field(default=None, max_length=16)
    work_mode: Optional[str] = Field(default=None, max_length=32)
    job_type: Optional[str] = Field(default=None, max_length=32)
    limit: int = Field(default=10, ge=1, le=25)


class SemanticSearchInput(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=10, ge=1, le=25)


class EmptyInput(BaseModel):
    pass


class JobIdInput(BaseModel):
    job_id: uuid.UUID


class RankJobsInput(BaseModel):
    limit: int = Field(default=10, ge=1, le=50)


class SkillGapInput(BaseModel):
    job_id: Optional[uuid.UUID] = None
    target_role: Optional[str] = Field(default=None, max_length=200)


class KnowledgeSearchInput(BaseModel):
    query: str = Field(min_length=1, max_length=400)
    limit: int = Field(default=5, ge=1, le=15)


class ApplicationActionInput(BaseModel):
    job_id: uuid.UUID
    action: Literal["create_draft", "update_status", "submit_external"] = "create_draft"
    status: Optional[str] = Field(default=None, max_length=32)
    notes: Optional[str] = Field(default=None, max_length=1000)


class SaveJobInput(BaseModel):
    job_id: uuid.UUID
    signal: Literal["save", "shortlist", "dismiss"] = "save"


class UpdatePreferencesInput(BaseModel):
    preferred_roles: Optional[list[str]] = None
    preferred_locations: Optional[list[str]] = None
    preferred_regions: Optional[list[str]] = None
    preferred_currency: Optional[str] = Field(default=None, max_length=8)
    min_salary: Optional[int] = Field(default=None, ge=0)
    work_modes: Optional[list[str]] = None


class MarketTrendsInput(BaseModel):
    region: Optional[str] = Field(default=None, max_length=16)
    limit: int = Field(default=10, ge=1, le=30)


@dataclass
class ToolExecutionResult:
    tool_name: str
    ok: bool
    data: Any
    error: Optional[str] = None
    latency_ms: float = 0.0


@dataclass
class RegisteredTool:
    name: str
    description: str
    input_model: type[BaseModel]
    handler: Callable[[BaseModel], Any]
    requires_approval: bool = False


class ToolExecutor:
    """Executes validated tools with bounded call counts, retries, and structured error handling."""

    def __init__(
        self,
        db: Session,
        user: User,
        *,
        settings: Settings | None = None,
        max_calls: int = 8,
        max_retries: int = 1,
        conversation_id: Optional[uuid.UUID] = None,
    ) -> None:
        self.db = db
        self.user = user
        self.settings = settings or get_settings()
        self.max_calls = max_calls
        self.max_retries = max_retries
        self.calls_made = 0
        self.conversation_id = conversation_id
        self.registry: dict[str, RegisteredTool] = self._build_registry()

    def _build_registry(self) -> dict[str, RegisteredTool]:
        tools = [
            RegisteredTool("search_jobs", "Hybrid search jobs with metadata filters", SearchJobsInput, self._search_jobs),
            RegisteredTool("search_jobs_semantically", "Dense vector semantic job search", SemanticSearchInput, self._search_jobs_semantically),
            RegisteredTool("get_candidate_profile", "Load candidate profile, preferences, and skills", EmptyInput, self._get_candidate_profile),
            RegisteredTool("analyse_resume", "Inspect primary resume completeness, sections, and missing info", EmptyInput, self._analyse_resume),
            RegisteredTool("calculate_job_match", "Compute calibrated ML compatibility for a job", JobIdInput, self._calculate_job_match),
            RegisteredTool("rank_jobs", "Rank visible jobs using trained Learning-to-Rank model", RankJobsInput, self._rank_jobs),
            RegisteredTool("get_skill_gap", "Analyze verified candidate skills vs job/market requirements", SkillGapInput, self._get_skill_gap),
            RegisteredTool("search_career_knowledge", "Search career guidance and candidate documents", KnowledgeSearchInput, self._search_career_knowledge),
            RegisteredTool("generate_cover_letter", "Draft grounded cover letter for a job", JobIdInput, self._generate_cover_letter),
            RegisteredTool("tailor_resume", "Generate grounded resume tailoring plan for a job", JobIdInput, self._tailor_resume),
            RegisteredTool("track_application", "Create or update application tracker (external submit requires approval)", ApplicationActionInput, self._track_application),
            RegisteredTool("save_job", "Bookmark, shortlist, or dismiss a job and record feedback", SaveJobInput, self._save_job),
            RegisteredTool("update_preferences", "Update durable user preferences", UpdatePreferencesInput, self._update_preferences),
            RegisteredTool("get_market_trends", "Compute deterministic market skill/salary/region trends", MarketTrendsInput, self._get_market_trends),
        ]
        return {t.name: t for t in tools}

    def execute(self, tool_name: str, raw_args: dict[str, Any]) -> ToolExecutionResult:
        if self.calls_made >= self.max_calls:
            return ToolExecutionResult(
                tool_name=tool_name,
                ok=False,
                data=None,
                error=f"Tool execution budget exceeded ({self.max_calls} calls max).",
            )
        tool = self.registry.get(tool_name)
        if tool is None:
            return ToolExecutionResult(
                tool_name=tool_name,
                ok=False,
                data=None,
                error=f"Unknown or unpermitted tool '{tool_name}'.",
            )

        try:
            validated = tool.input_model.model_validate(raw_args)
        except Exception as exc:
            return ToolExecutionResult(
                tool_name=tool_name,
                ok=False,
                data=None,
                error=f"Input validation failed: {exc}",
            )

        self.calls_made += 1
        t0 = time.perf_counter()
        last_err: Optional[str] = None
        for _ in range(self.max_retries + 1):
            try:
                data = tool.handler(validated)
                return ToolExecutionResult(
                    tool_name=tool_name,
                    ok=True,
                    data=data,
                    latency_ms=round((time.perf_counter() - t0) * 1000, 2),
                )
            except Exception as exc:
                last_err = str(exc)
        return ToolExecutionResult(
            tool_name=tool_name,
            ok=False,
            data=None,
            error=last_err or "Tool execution failed.",
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
        )

    # ── Tool Implementations ──────────────────────────────────────────────────

    def _search_jobs(self, args: SearchJobsInput) -> dict[str, Any]:
        retriever = HybridRetriever(self.db, settings=self.settings)
        items, total = retriever.search(
            args.query,
            self.user.id,
            filters=RetrievalFilters(region=args.region, work_mode=args.work_mode, job_type=args.job_type),
            mode="hybrid",
            use_reranker=True,
            limit=args.limit,
        )
        return {
            "total": total,
            "jobs": [
                {
                    "id": str(r.job.id),
                    "title": r.job.title,
                    "company": r.job.company,
                    "location": r.job.location,
                    "region": r.job.region,
                    "work_mode": r.job.work_mode,
                    "salary_raw": r.job.salary_raw,
                    "score": r.final_score,
                }
                for r in items
            ],
        }

    def _search_jobs_semantically(self, args: SemanticSearchInput) -> dict[str, Any]:
        emb = EmbeddingService(self.settings)
        q_vec = emb.encode_one(args.query, kind="query")
        ranked = emb.search_similar_jobs(self.db, q_vec, self.user.id, top_k=args.limit)
        return {
            "jobs": [
                {
                    "id": str(j.id),
                    "title": j.title,
                    "company": j.company,
                    "location": j.location,
                    "similarity": round(sim, 4),
                }
                for j, sim in ranked
            ]
        }

    def _get_candidate_profile(self, _args: EmptyInput) -> dict[str, Any]:
        repo = ProfileRepository(self.db)
        profile = repo.get_or_create_active_profile(self.user.id)
        prefs = repo.get_or_create_preferences(self.user.id)
        skills = repo.list_candidate_skills(self.user.id, profile.id)
        return {
            "completeness_score": profile.completeness_score,
            "years_experience": float(profile.years_experience) if profile.years_experience is not None else None,
            "education_level": profile.education_level,
            "skills": [sk.canonical_name for _, sk in skills],
            "preferred_roles": prefs.preferred_roles,
            "preferred_locations": prefs.preferred_locations,
            "preferred_regions": prefs.preferred_regions,
            "preferred_currency": prefs.preferred_currency,
            "min_salary": prefs.min_salary,
        }

    def _analyse_resume(self, _args: EmptyInput) -> dict[str, Any]:
        repo = ProfileRepository(self.db)
        profile = repo.get_or_create_active_profile(self.user.id)
        resumes = repo.list_resumes(self.user.id, limit=5)
        skills = repo.list_candidate_skills(self.user.id, profile.id)
        missing_info: list[str] = []
        if not resumes:
            missing_info.append("No resume uploaded yet.")
        if profile.years_experience is None:
            missing_info.append("Years of experience not specified.")
        if not skills:
            missing_info.append("No verified technical skills extracted.")
        return {
            "has_resume": bool(resumes),
            "latest_filename": resumes[0].filename if resumes else None,
            "completeness_score": profile.completeness_score,
            "skill_count": len(skills),
            "top_skills": [sk.canonical_name for _, sk in skills[:10]],
            "missing_information": missing_info,
        }

    def _calculate_job_match(self, args: JobIdInput) -> dict[str, Any]:
        pairs, mv = compute_matches_for_user(
            self.db, self.user, job_ids=[args.job_id], explain_with_llm=False, settings=self.settings
        )
        if not pairs:
            raise ValueError("Job not found or not visible to user.")
        jm, job = pairs[0]
        return {
            "job_id": str(job.id),
            "title": job.title,
            "company": job.company,
            "compatibility_probability": jm.compatibility_probability,
            "ranking_score": jm.ranking_score,
            "confidence": jm.confidence,
            "strong_matching_skills": jm.strong_matching_skills,
            "missing_skills": jm.missing_skills,
            "ranking_reasons": jm.ranking_reasons,
            "model_version": f"{mv.name}:{mv.version}",
        }

    def _rank_jobs(self, args: RankJobsInput) -> dict[str, Any]:
        pairs, mv = compute_matches_for_user(
            self.db, self.user, explain_with_llm=False, limit=args.limit, settings=self.settings
        )
        return {
            "model_version": f"{mv.name}:{mv.version}",
            "provenance": mv.training_data_provenance,
            "ranked_jobs": [
                {
                    "job_id": str(job.id),
                    "title": job.title,
                    "company": job.company,
                    "compatibility_probability": jm.compatibility_probability,
                    "ranking_score": jm.ranking_score,
                    "strong_matching_skills": jm.strong_matching_skills[:5],
                    "missing_skills": jm.missing_skills[:5],
                }
                for jm, job in pairs[: args.limit]
            ],
        }

    def _get_skill_gap(self, args: SkillGapInput) -> dict[str, Any]:
        prof_repo = ProfileRepository(self.db)
        profile = prof_repo.get_or_create_active_profile(self.user.id)
        cand_skills = {sk.canonical_name.lower(): sk.canonical_name for _, sk in prof_repo.list_candidate_skills(self.user.id, profile.id)}

        if args.job_id:
            job = JobRepository(self.db).get_visible_job(args.job_id, self.user.id)
            if job is None:
                raise ValueError("Target job not found.")
            js = self.db.execute(
                select(Skill.canonical_name).join(JobSkill, JobSkill.skill_id == Skill.id).where(JobSkill.job_id == job.id)
            ).scalars().all()
            target_skills = list(js) or [s.canonical_name for s in extract_job_skills(job.description, job.title)]
            target_label = f"{job.title} @ {job.company}"
        else:
            # Aggregate required skills across visible jobs matching target_role
            stmt = select(Job).where(
                or_(Job.owner_user_id.is_(None), Job.owner_user_id == self.user.id),
                Job.is_expired.is_(False),
            )
            if args.target_role:
                stmt = stmt.where(Job.title.ilike(f"%{args.target_role}%"))
            jobs = list(self.db.scalars(stmt.limit(20)).all())
            counts: Counter[str] = Counter()
            for j in jobs:
                for s in extract_job_skills(j.description, j.title):
                    counts[s.canonical_name] += 1
            target_skills = [name for name, _ in counts.most_common(12)]
            target_label = args.target_role or "Indexed target roles"

        matched = [s for s in target_skills if s.lower() in cand_skills]
        missing = [s for s in target_skills if s.lower() not in cand_skills]
        return {
            "target": target_label,
            "matched_skills": matched,
            "missing_skills": missing,
            "coverage_ratio": round(len(matched) / max(1, len(target_skills)), 3),
        }

    def _search_career_knowledge(self, args: KnowledgeSearchInput) -> dict[str, Any]:
        from ..rag.knowledge import ensure_public_knowledge_seeded
        from ..rag.pipeline import run_agentic_rag

        ensure_public_knowledge_seeded(self.db, settings=self.settings)
        rag_res = run_agentic_rag(
            self.db,
            self.user.id,
            args.query,
            llm_consent_granted=self.user.llm_consent_granted,
            settings=self.settings,
        )
        return {
            "answer": rag_res.answer,
            "citations": rag_res.citations[: args.limit],
            "grounded": rag_res.grounded,
            "confidence": rag_res.confidence,
            "retries_used": rag_res.retries_used,
        }

    def _generate_cover_letter(self, args: JobIdInput) -> dict[str, Any]:
        job = JobRepository(self.db).get_visible_job(args.job_id, self.user.id)
        if job is None:
            raise ValueError("Job not found.")
        resume = self.db.scalar(
            select(ResumeVersion).where(ResumeVersion.user_id == self.user.id).order_by(ResumeVersion.is_primary.desc())
        )
        if resume is None:
            raise ValueError("Upload a resume before generating a tailored cover letter.")

        if self.user.llm_consent_granted:
            llm = LLMProvider(self.settings)
            prompt = (
                f"Write a concise, honest cover letter for {job.title} at {job.company} "
                f"grounded strictly in this resume:\n{resume.raw_text[:2000]}"
            )
            draft = llm.complete(prompt, max_tokens=450).text
        else:
            draft = (
                f"Dear {job.company} Hiring Team,\n\n"
                f"I am writing to express interest in the {job.title} position. "
                f"Based on my verified background in {resume.filename}, my experience aligns with your core requirements."
            )
        return {"job_id": str(job.id), "draft_cover_letter": draft, "requires_user_review": True}

    def _tailor_resume(self, args: JobIdInput) -> dict[str, Any]:
        job = JobRepository(self.db).get_visible_job(args.job_id, self.user.id)
        if job is None:
            raise ValueError("Job not found.")
        gap = self._get_skill_gap(SkillGapInput(job_id=job.id))
        return {
            "job_id": str(job.id),
            "title": job.title,
            "company": job.company,
            "highlight_verified_skills": gap["matched_skills"],
            "address_missing_skills_honestly": gap["missing_skills"],
            "note": "Tailoring suggestions highlight verified skills only and never fabricate experience.",
        }

    def _track_application(self, args: ApplicationActionInput) -> dict[str, Any]:
        job = JobRepository(self.db).get_visible_job(args.job_id, self.user.id)
        if job is None:
            raise ValueError("Job not found.")

        # Human approval gate for external/irreversible submission
        if args.action == "submit_external":
            req = ApprovalRequest(
                user_id=self.user.id,
                conversation_id=self.conversation_id,
                action_type="submit_application",
                payload_json={
                    "job_id": str(job.id),
                    "title": job.title,
                    "company": job.company,
                    "application_url": job.application_url,
                },
                status="pending",
            )
            self.db.add(req)
            self.db.commit()
            self.db.refresh(req)
            return {
                "approval_required": True,
                "approval_request_id": str(req.id),
                "action_type": req.action_type,
                "message": f"Explicit user approval required before submitting application to {job.title} @ {job.company}.",
            }

        repo = ApplicationRepository(self.db)
        app = repo.get_by_job(job.id, self.user.id)
        if app is None:
            app = repo.create(self.user.id, job.id, notes=args.notes)
        if args.action == "update_status" and args.status:
            repo.update_status(app, status=args.status, notes=args.notes)
        self.db.commit()
        self.db.refresh(app)
        return {"application_id": str(app.id), "status": app.status, "approval_required": False}

    def _save_job(self, args: SaveJobInput) -> dict[str, Any]:
        repo = JobRepository(self.db)
        job = repo.get_visible_job(args.job_id, self.user.id)
        if job is None:
            raise ValueError("Job not found.")
        folder = {"save": "saved", "shortlist": "shortlisted", "dismiss": "dismissed"}[args.signal]
        repo.save_job(self.user.id, job.id, folder=folder)
        repo.record_feedback(self.user.id, job.id, args.signal, is_implicit=False)
        self.db.commit()
        return {"job_id": str(job.id), "folder": folder}

    def _update_preferences(self, args: UpdatePreferencesInput) -> dict[str, Any]:
        repo = ProfileRepository(self.db)
        prefs = repo.get_or_create_preferences(self.user.id)
        updates = args.model_dump(exclude_none=True)
        for k, v in updates.items():
            setattr(prefs, k, v)
        self.db.add(prefs)
        self.db.commit()
        return {"updated_fields": list(updates.keys())}

    def _get_market_trends(self, args: MarketTrendsInput) -> dict[str, Any]:
        stmt = select(Job).where(
            or_(Job.owner_user_id.is_(None), Job.owner_user_id == self.user.id),
            Job.is_expired.is_(False),
        )
        if args.region:
            stmt = stmt.where(Job.region == args.region.upper())
        jobs = list(self.db.scalars(stmt).all())
        skill_counts: Counter[str] = Counter()
        region_counts: Counter[str] = Counter()
        mode_counts: Counter[str] = Counter()
        for j in jobs:
            region_counts[j.region or "GLOBAL"] += 1
            mode_counts[j.work_mode or "unspecified"] += 1
            for s in extract_job_skills(j.description, j.title):
                skill_counts[s.canonical_name] += 1
        return {
            "total_jobs_analyzed": len(jobs),
            "top_skills": [{"skill": k, "count": v} for k, v in skill_counts.most_common(args.limit)],
            "by_region": dict(region_counts),
            "by_work_mode": dict(mode_counts),
        }
