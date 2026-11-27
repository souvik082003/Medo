"""Interpretable ML feature engineering for job compatibility and ranking."""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from ..ingestion.normalizer import APPROX_FX_TO_USD

FEATURE_NAMES: tuple[str, ...] = (
    "semantic_similarity",
    "skill_coverage",
    "required_skill_coverage",
    "experience_fit",
    "seniority_fit",
    "education_fit",
    "location_fit",
    "work_mode_fit",
    "job_type_fit",
    "salary_fit",
    "recency_score",
    "interaction_affinity",
)

_SENIORITY_ORD: dict[str, int] = {
    "intern": 0,
    "junior": 1,
    "mid": 2,
    "senior": 3,
    "lead": 4,
    "staff": 4,
    "principal": 5,
}

_EDU_ORD: dict[str, int] = {
    "unspecified": 0,
    "any": 0,
    "high_school": 1,
    "bachelor": 2,
    "master": 3,
    "phd": 4,
}


@dataclass
class MatchFeatureResult:
    features: dict[str, float]
    strong_matching_skills: list[str] = field(default_factory=list)
    missing_skills: list[str] = field(default_factory=list)
    experience_match: dict[str, Any] = field(default_factory=dict)
    location_match: dict[str, Any] = field(default_factory=dict)
    seniority_match: dict[str, Any] = field(default_factory=dict)
    ranking_reasons: list[str] = field(default_factory=list)

    def as_vector(self) -> list[float]:
        return [float(self.features[name]) for name in FEATURE_NAMES]


def compute_experience_fit(
    candidate_years: Optional[float],
    job_min_years: Optional[float],
    job_max_years: Optional[float],
) -> tuple[float, dict[str, Any]]:
    if candidate_years is None or (job_min_years is None and job_max_years is None):
        return 0.65, {
            "candidate_years": candidate_years,
            "required_min": job_min_years,
            "required_max": job_max_years,
            "status": "unspecified",
        }
    cy = float(candidate_years)
    lo = float(job_min_years) if job_min_years is not None else 0.0
    hi = float(job_max_years) if job_max_years is not None else max(lo + 4.0, lo * 1.5)
    if lo <= cy <= hi:
        return 1.0, {"candidate_years": cy, "required_min": lo, "required_max": hi, "status": "exact_fit"}
    if cy < lo:
        gap = lo - cy
        score = max(0.05, math.exp(-0.35 * gap))
        return round(score, 4), {"candidate_years": cy, "required_min": lo, "required_max": hi, "status": f"under_by_{gap:.1f}y"}
    over = cy - hi
    score = max(0.35, math.exp(-0.12 * over))
    return round(score, 4), {"candidate_years": cy, "required_min": lo, "required_max": hi, "status": f"over_by_{over:.1f}y"}


def compute_seniority_fit(candidate_level: Optional[str], job_level: Optional[str]) -> tuple[float, dict[str, Any]]:
    cl = (candidate_level or "unspecified").lower()
    jl = (job_level or "unspecified").lower()
    if cl not in _SENIORITY_ORD or jl not in _SENIORITY_ORD:
        return 0.65, {"candidate": cl, "job": jl, "status": "unspecified"}
    diff = abs(_SENIORITY_ORD[cl] - _SENIORITY_ORD[jl])
    score = max(0.1, 1.0 - 0.25 * diff)
    status = "exact_match" if diff == 0 else ("adjacent" if diff == 1 else "mismatch")
    return round(score, 4), {"candidate": cl, "job": jl, "status": status}


def compute_education_fit(candidate_edu: Optional[str], job_edu: Optional[str]) -> float:
    ce = _EDU_ORD.get((candidate_edu or "unspecified").lower(), 0)
    je = _EDU_ORD.get((job_edu or "unspecified").lower(), 0)
    if je == 0 or ce == 0:
        return 0.75
    if ce >= je:
        return 1.0
    return max(0.2, 1.0 - 0.35 * (je - ce))


def compute_location_fit(
    preferred_locations: list[str],
    preferred_regions: list[str],
    job_location: Optional[str],
    job_region: Optional[str],
    job_work_mode: Optional[str],
) -> tuple[float, dict[str, Any]]:
    wm = (job_work_mode or "unspecified").lower()
    jloc = (job_location or "").lower()
    jreg = (job_region or "GLOBAL").upper()
    pref_locs = [p.lower() for p in (preferred_locations or []) if p]
    pref_regs = {r.upper() for r in (preferred_regions or []) if r}

    if wm == "remote" and (not pref_regs or jreg in pref_regs or jreg == "GLOBAL" or "remote" in pref_locs):
        return 1.0, {"job_location": job_location, "job_region": jreg, "status": "remote_match"}
    if any(pl in jloc for pl in pref_locs if pl != "remote"):
        return 1.0, {"job_location": job_location, "job_region": jreg, "status": "city_match"}
    if pref_regs and jreg in pref_regs:
        return 0.75, {"job_location": job_location, "job_region": jreg, "status": "region_match"}
    if not pref_locs and not pref_regs:
        return 0.7, {"job_location": job_location, "job_region": jreg, "status": "no_preference_set"}
    return 0.2, {"job_location": job_location, "job_region": jreg, "status": "outside_preferred_region"}


def compute_salary_fit(
    pref_min_salary: Optional[int],
    pref_currency: str,
    job_salary_min_usd_eq: Optional[int],
) -> float:
    if not pref_min_salary or not job_salary_min_usd_eq:
        return 0.65
    fx = APPROX_FX_TO_USD.get((pref_currency or "USD").upper(), 1.0)
    pref_usd = max(1.0, float(pref_min_salary) * fx)
    ratio = float(job_salary_min_usd_eq) / pref_usd
    if ratio >= 1.0:
        return 1.0
    return round(max(0.1, ratio), 4)


def compute_recency_score(posted_at: Optional[datetime], now: Optional[datetime] = None) -> float:
    if posted_at is None:
        return 0.5
    ref = now or datetime.now(timezone.utc)
    pa = posted_at if posted_at.tzinfo else posted_at.replace(tzinfo=timezone.utc)
    age_days = max(0.0, (ref - pa).total_seconds() / 86400.0)
    return round(math.exp(-age_days / 14.0), 4)


def build_match_features(
    *,
    semantic_similarity: float,
    candidate_skills: list[str],
    job_required_skills: list[str],
    job_preferred_skills: list[str],
    candidate_years_exp: Optional[float],
    candidate_seniority: Optional[str],
    candidate_education: Optional[str],
    preferred_locations: list[str],
    preferred_regions: list[str],
    preferred_work_modes: list[str],
    preferred_job_types: list[str],
    preferred_min_salary: Optional[int],
    preferred_currency: str,
    job_min_exp: Optional[float],
    job_max_exp: Optional[float],
    job_seniority: Optional[str],
    job_education: Optional[str],
    job_location: Optional[str],
    job_region: Optional[str],
    job_work_mode: Optional[str],
    job_type: Optional[str],
    job_salary_min_usd_eq: Optional[int],
    job_posted_at: Optional[datetime],
    interaction_affinity: float = 0.5,
) -> MatchFeatureResult:
    """Compute all 12 interpretable ML features and structured explainability fields."""
    cand_map = {s.lower(): s for s in candidate_skills}
    req_set = {s.lower(): s for s in job_required_skills}
    pref_set = {s.lower(): s for s in job_preferred_skills if s.lower() not in req_set}
    all_job_skills = {**req_set, **pref_set}

    matched_req = [orig for low, orig in req_set.items() if low in cand_map]
    matched_all = [orig for low, orig in all_job_skills.items() if low in cand_map]
    missing_req = [orig for low, orig in req_set.items() if low not in cand_map]
    missing_pref = [orig for low, orig in pref_set.items() if low not in cand_map]

    req_cov = (len(matched_req) / len(req_set)) if req_set else (min(1.0, len(cand_map) / 8.0) * 0.6 + 0.2)
    all_cov = (len(matched_all) / len(all_job_skills)) if all_job_skills else req_cov

    exp_fit, exp_meta = compute_experience_fit(candidate_years_exp, job_min_exp, job_max_exp)
    sen_fit, sen_meta = compute_seniority_fit(candidate_seniority, job_seniority)
    edu_fit = compute_education_fit(candidate_education, job_education)
    loc_fit, loc_meta = compute_location_fit(
        preferred_locations, preferred_regions, job_location, job_region, job_work_mode
    )

    wm = (job_work_mode or "unspecified").lower()
    pref_wms = {w.lower() for w in (preferred_work_modes or [])}
    wm_fit = 1.0 if (not pref_wms or wm in pref_wms) else (0.55 if wm == "unspecified" else 0.15)

    jt = (job_type or "full-time").lower()
    pref_jts = {j.lower() for j in (preferred_job_types or [])}
    jt_fit = 1.0 if (not pref_jts or jt in pref_jts) else 0.1

    sal_fit = compute_salary_fit(preferred_min_salary, preferred_currency, job_salary_min_usd_eq)
    recency = compute_recency_score(job_posted_at)
    sem_clamped = round(max(0.0, min(1.0, float(semantic_similarity))), 4)

    features = {
        "semantic_similarity": sem_clamped,
        "skill_coverage": round(all_cov, 4),
        "required_skill_coverage": round(req_cov, 4),
        "experience_fit": exp_fit,
        "seniority_fit": sen_fit,
        "education_fit": round(edu_fit, 4),
        "location_fit": loc_fit,
        "work_mode_fit": wm_fit,
        "job_type_fit": jt_fit,
        "salary_fit": sal_fit,
        "recency_score": recency,
        "interaction_affinity": round(max(0.0, min(1.0, interaction_affinity)), 4),
    }

    reasons: list[str] = []
    if req_cov >= 0.7 and matched_req:
        reasons.append(f"Strong required skill coverage ({len(matched_req)}/{len(req_set)}): {', '.join(matched_req[:5])}")
    elif missing_req:
        reasons.append(f"Missing {len(missing_req)} required skills: {', '.join(missing_req[:4])}")
    if sem_clamped >= 0.55:
        reasons.append(f"High semantic resume-JD alignment ({sem_clamped:.2f})")
    if loc_fit >= 0.9:
        reasons.append(f"Location/work-mode fit ({loc_meta['status']})")
    if exp_fit >= 0.9:
        reasons.append("Experience range aligns with job requirements")
    if sal_fit >= 0.95 and job_salary_min_usd_eq:
        reasons.append("Compensation meets or exceeds target threshold")

    return MatchFeatureResult(
        features=features,
        strong_matching_skills=sorted(set(matched_all)),
        missing_skills=missing_req + missing_pref,
        experience_match=exp_meta,
        location_match=loc_meta,
        seniority_match=sen_meta,
        ranking_reasons=reasons or ["Ranked using combined ML compatibility and preference signals"],
    )
