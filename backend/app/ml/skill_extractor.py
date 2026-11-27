"""Structured skill, experience, education, certification, and project extraction pipeline."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional

from .skill_taxonomy import CANONICAL_SKILLS, SkillDefinition, normalize_skill_name


@dataclass
class ExtractedSkill:
    canonical_name: str
    slug: str
    category: str
    proficiency: str
    extraction_method: str
    confidence: float
    evidence_span: str
    source_section: str


@dataclass
class StructuredResumeExtract:
    skills: list[ExtractedSkill] = field(default_factory=list)
    sections: dict[str, str] = field(default_factory=dict)
    experience_years: Optional[float] = None
    education_level: str = "unspecified"
    certifications: list[dict[str, str]] = field(default_factory=list)
    projects: list[dict[str, str]] = field(default_factory=list)
    experiences: list[dict[str, str]] = field(default_factory=list)


_SECTION_PATTERNS: dict[str, re.Pattern[str]] = {
    "summary": re.compile(r"^(summary|profile|objective|about)\b", re.I),
    "skills": re.compile(r"^(skills|technical skills|core competencies|tech stack)\b", re.I),
    "experience": re.compile(r"^(experience|work experience|employment|professional experience)\b", re.I),
    "projects": re.compile(r"^(projects|selected projects|open source|research)\b", re.I),
    "education": re.compile(r"^(education|academic)\b", re.I),
    "certifications": re.compile(r"^(certifications|certificates|licenses)\b", re.I),
}


def segment_resume_sections(text: str) -> dict[str, str]:
    """Split resume text into normalized semantic sections."""
    sections: dict[str, list[str]] = {"header": []}
    current = "header"
    for line in (text or "").splitlines():
        stripped = line.strip()
        clean_heading = re.sub(r"^[#*\-\s]+|[:\s]+$", "", stripped)
        matched_section = None
        if 2 <= len(clean_heading) <= 45:
            for sec_name, pat in _SECTION_PATTERNS.items():
                if pat.match(clean_heading):
                    matched_section = sec_name
                    break
        if matched_section:
            current = matched_section
            sections.setdefault(current, [])
        else:
            sections.setdefault(current, []).append(line)

    return {k: "\n".join(v).strip() for k, v in sections.items() if "\n".join(v).strip()}


def _find_evidence_line(text: str, term: str) -> tuple[str | None, int]:
    """Find the exact line containing `term` (word-boundary aware) and occurrence count."""
    tl = term.lower()
    if any(ch in tl for ch in (" ", "/", ".", "+")):
        pattern = re.compile(rf"(?<!\w){re.escape(tl)}(?!\w)", re.I)
    else:
        pattern = re.compile(rf"\b{re.escape(tl)}\b", re.I)

    matches = list(pattern.finditer(text))
    if not matches:
        return None, 0

    first_pos = matches[0].start()
    line_start = text.rfind("\n", 0, first_pos) + 1
    line_end = text.find("\n", first_pos)
    if line_end == -1:
        line_end = len(text)
    snippet = text[line_start:line_end].strip()
    return snippet[:240], len(matches)


def _infer_proficiency(evidence_lines: list[str], occurrence_count: int) -> str:
    joined = " ".join(evidence_lines).lower()
    if any(k in joined for k in ("published", "paper", "open-source", "open source", "maintainer", "stars")):
        return "published_or_open_source"
    if any(k in joined for k in ("architected", "designed", "built", "led", "production", "scaled", "reduced", "improved")):
        return "deep_project"
    if occurrence_count >= 2:
        return "proficient"
    return "exposure"


def _estimate_experience_years(text: str) -> Optional[float]:
    explicit = re.findall(r"(\d+(?:\.\d+)?)\+?\s+years?\s+of\s+(?:experience|engineering|industry)", text, re.I)
    if explicit:
        return max(float(x) for x in explicit)
    years = sorted({int(y) for y in re.findall(r"\b(199\d|20[0-2]\d)\b", text)})
    if len(years) >= 2:
        span = years[-1] - years[0]
        if 0 <= span <= 40:
            return float(span)
    return None


def _detect_education_level(text: str) -> str:
    lower = text.lower()
    if re.search(r"\b(ph\.?d|doctorate)\b", lower):
        return "phd"
    if re.search(r"\b(master|m\.?s\.?|m\.?tech|m\.?eng|mba)\b", lower):
        return "master"
    if re.search(r"\b(bachelor|b\.?s\.?|b\.?tech|b\.?e\.?|undergraduate)\b", lower):
        return "bachelor"
    return "unspecified"


def extract_structured_resume(
    raw_text: str,
    llm_candidates: list[dict[str, Any]] | None = None,
) -> StructuredResumeExtract:
    """Extract normalized skills with confidence & evidence spans + structured sections.

    Never invents candidate skills: any LLM-suggested skill is only accepted if its
    canonical name or alias is verified in `raw_text` with a real evidence span.
    """
    sections = segment_resume_sections(raw_text)
    found_map: dict[str, ExtractedSkill] = {}

    for sdef in CANONICAL_SKILLS:
        terms = (sdef.canonical_name, *sdef.aliases)
        best_snippet: str | None = None
        total_hits = 0
        best_section = "general"

        for sec_name, sec_text in sections.items():
            for term in terms:
                snippet, hits = _find_evidence_line(sec_text, term)
                if snippet and hits > 0:
                    total_hits += hits
                    if best_snippet is None or sec_name in {"experience", "projects"}:
                        best_snippet = snippet
                        best_section = sec_name

        if best_snippet is not None:
            prof = _infer_proficiency([best_snippet], total_hits)
            conf = min(0.99, 0.72 + 0.08 * min(total_hits, 3) + (0.05 if best_section in {"skills", "experience"} else 0.0))
            found_map[sdef.slug] = ExtractedSkill(
                canonical_name=sdef.canonical_name,
                slug=sdef.slug,
                category=sdef.category,
                proficiency=prof,
                extraction_method="taxonomy_rule",
                confidence=round(conf, 3),
                evidence_span=best_snippet,
                source_section=best_section,
            )

    # Optional LLM-assisted candidates — STRICTLY verified against raw_text (never fabricate)
    if llm_candidates:
        for item in llm_candidates:
            raw_skill = str(item.get("skill", "")).strip()
            sdef = normalize_skill_name(raw_skill)
            if sdef is None:
                continue
            verified_snippet, hits = _find_evidence_line(raw_text, raw_skill)
            if not verified_snippet:
                for alias in (sdef.canonical_name, *sdef.aliases):
                    verified_snippet, hits = _find_evidence_line(raw_text, alias)
                    if verified_snippet:
                        break
            if not verified_snippet:
                continue  # Reject ungrounded LLM claim
            if sdef.slug not in found_map:
                found_map[sdef.slug] = ExtractedSkill(
                    canonical_name=sdef.canonical_name,
                    slug=sdef.slug,
                    category=sdef.category,
                    proficiency=str(item.get("proficiency") or _infer_proficiency([verified_snippet], hits)),
                    extraction_method="llm_verified",
                    confidence=0.85,
                    evidence_span=verified_snippet,
                    source_section="llm_verified",
                )

    certs = [
        {"name": line.strip("-• "), "evidence_span": line.strip()}
        for line in sections.get("certifications", "").splitlines()
        if len(line.strip()) > 3
    ]
    projects = [
        {"summary": line.strip("-• "), "evidence_span": line.strip()}
        for line in sections.get("projects", "").splitlines()
        if line.strip().startswith(("-", "•", "#")) or len(line.strip()) > 20
    ][:10]
    experiences = [
        {"summary": line.strip("-• "), "evidence_span": line.strip()}
        for line in sections.get("experience", "").splitlines()
        if len(line.strip()) > 15
    ][:20]

    skills_sorted = sorted(found_map.values(), key=lambda s: (-s.confidence, s.canonical_name))
    return StructuredResumeExtract(
        skills=skills_sorted,
        sections=sections,
        experience_years=_estimate_experience_years(raw_text),
        education_level=_detect_education_level(raw_text),
        certifications=certs,
        projects=projects,
        experiences=experiences,
    )


def extract_job_skills(description: str, title: str = "") -> list[ExtractedSkill]:
    """Extract normalized skills from a job description with required vs preferred hint."""
    combined = f"{title}\n{description or ''}"
    lower = combined.lower()
    req_idx = lower.find("required")
    pref_idx = lower.find("nice to have")
    if pref_idx == -1:
        pref_idx = lower.find("preferred")

    extracted: list[ExtractedSkill] = []
    for sdef in CANONICAL_SKILLS:
        for term in (sdef.canonical_name, *sdef.aliases):
            snippet, hits = _find_evidence_line(combined, term)
            if snippet and hits > 0:
                pos = lower.find(term.lower())
                req_type = "preferred" if (pref_idx != -1 and pos >= pref_idx and (req_idx == -1 or pref_idx > req_idx)) else "required"
                extracted.append(
                    ExtractedSkill(
                        canonical_name=sdef.canonical_name,
                        slug=sdef.slug,
                        category=sdef.category,
                        proficiency=req_type,
                        extraction_method="taxonomy_rule",
                        confidence=min(0.98, 0.78 + 0.06 * min(hits, 3)),
                        evidence_span=snippet,
                        source_section=req_type,
                    )
                )
                break
    return extracted
