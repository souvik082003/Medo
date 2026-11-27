"""Multi-region, multi-currency job normalization and cross-platform deduplication."""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field

from ..ml.skill_extractor import ExtractedSkill, extract_job_skills

# Approximate FX rates to USD for cross-region ML feature normalization only.
# Raw currency and amounts are always preserved faithfully.
APPROX_FX_TO_USD: dict[str, float] = {
    "USD": 1.0,
    "INR": 0.012,
    "EUR": 1.08,
    "GBP": 1.27,
    "SGD": 0.75,
    "CAD": 0.73,
}

_COMPANY_SUFFIXES = re.compile(
    r"\b(inc|corp|corporation|ltd|limited|llc|pvt|private|co|company|companies|"
    r"technologies|technology|tech|labs|laboratory|laboratories|systems|solutions|"
    r"group|holdings|ventures|global|international|services|software|consulting|"
    r"networks|network|media|studio|studios)\b\.?",
    re.IGNORECASE,
)
_PUNCT = re.compile(r"[^\w\s]")
_SPACES = re.compile(r"\s+")

_SENIORITY_PREFIX = re.compile(
    r"^(senior|sr\.?|junior|jr\.?|lead|staff|principal|associate|assoc\.?|"
    r"distinguished|fellow|founding|head of|director of|vp of|entry.?level|mid.?level)\s+",
    re.IGNORECASE,
)
_LEVEL_SUFFIX = re.compile(
    r"\s*[\(\[]?(l\d|e\d|m\d|t\d|\biv\b|\biii\b|\bii\b|\bi\b|\b[1-6]\b)[\)\]]?\s*$",
    re.IGNORECASE,
)
_PARENS = re.compile(r"\s*[\(\[][^\)\]]*[\)\]]")

_TITLE_ABBREV: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bml\b", re.I), "machine learning"),
    (re.compile(r"\bmle\b", re.I), "machine learning engineer"),
    (re.compile(r"\bsre\b", re.I), "site reliability engineer"),
    (re.compile(r"\bswe\b", re.I), "software engineer"),
    (re.compile(r"\bsde\b", re.I), "software development engineer"),
    (re.compile(r"\bai\b", re.I), "artificial intelligence"),
    (re.compile(r"\bnlp\b", re.I), "natural language processing"),
    (re.compile(r"\bllm\b", re.I), "large language model"),
    (re.compile(r"\binfra\b", re.I), "infrastructure"),
    (re.compile(r"\beng\b", re.I), "engineer"),
    (re.compile(r"\bmts\b", re.I), "member technical staff"),
)

_CITY_ALIASES: dict[str, str] = {
    "sf": "san francisco",
    "bay area": "san francisco",
    "silicon valley": "san francisco",
    "nyc": "new york",
    "new york city": "new york",
    "ny": "new york",
    "la": "los angeles",
    "bangalore": "bengaluru",
    "blr": "bengaluru",
    "gurgaon": "gurugram",
    "delhi ncr": "delhi",
    "new delhi": "delhi",
    "bombay": "mumbai",
    "madras": "chennai",
}

_IN_LOCATIONS = {
    "india", "bengaluru", "bangalore", "hyderabad", "pune", "mumbai",
    "gurugram", "gurgaon", "noida", "delhi", "chennai", "kolkata",
}
_US_LOCATIONS = {
    "united states", "usa", "us", "san francisco", "new york", "seattle",
    "austin", "boston", "chicago", "los angeles", "denver", "california",
}
_UK_LOCATIONS = {"united kingdom", "uk", "london", "manchester", "cambridge", "edinburgh"}
_SG_LOCATIONS = {"singapore"}
_EU_LOCATIONS = {
    "germany", "berlin", "munich", "münchen", "dusseldorf", "düsseldorf", "frankfurt",
    "hamburg", "cologne", "stuttgart", "france", "paris", "netherlands", "amsterdam",
    "zurich", "switzerland", "austria", "vienna", "ireland", "dublin", "spain",
    "madrid", "barcelona", "poland", "warsaw", "sweden", "stockholm", "europe", "eu",
}
_GLOBAL_LOCATIONS = {"worldwide", "anywhere", "global", "apac", "remote only", "homeoffice"}


def _has_location_token(text: str, tokens: set[str]) -> bool:
    return any(re.search(rf"(?<![a-z0-9]){re.escape(tok)}(?![a-z0-9])", text) for tok in tokens)


class RawJobRecord(BaseModel):
    """Unnormalized job payload emitted by any collector."""

    source: str
    external_id: Optional[str] = None
    title: str
    company: str
    location: Optional[str] = None
    region: Optional[str] = None
    description: str = ""
    salary_raw: Optional[str] = None
    job_type: Optional[str] = None
    work_mode: Optional[str] = None
    posted_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    application_url: str
    source_metadata: dict[str, Any] = Field(default_factory=dict)


class NormalisedJob(BaseModel):
    """Canonical job schema produced by the normalization layer."""

    source: str
    external_id: Optional[str] = None
    content_hash: str
    title: str
    company: str
    location: Optional[str] = None
    region: str = "GLOBAL"
    description: str
    skills: list[ExtractedSkill] = Field(default_factory=list)
    salary_raw: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    salary_currency: Optional[str] = None
    salary_min_usd_eq: Optional[int] = None
    experience_min_years: Optional[float] = None
    experience_max_years: Optional[float] = None
    seniority_level: str = "unspecified"
    min_education: str = "unspecified"
    job_type: str = "full-time"
    work_mode: str = "unspecified"
    posted_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    application_url: str
    source_metadata: dict[str, Any] = Field(default_factory=dict)


def normalize_company(name: str) -> str:
    if not name:
        return ""
    s = _COMPANY_SUFFIXES.sub(" ", name.lower().strip())
    s = _PUNCT.sub(" ", s)
    return _SPACES.sub(" ", s).strip()


def normalize_title(title: str) -> str:
    if not title:
        return ""
    s = _PARENS.sub("", title.strip())
    s = _LEVEL_SUFFIX.sub("", s)
    for _ in range(3):
        nxt = _SENIORITY_PREFIX.sub("", s).strip()
        if nxt == s:
            break
        s = nxt
    s = s.lower()
    for pat, repl in _TITLE_ABBREV:
        s = pat.sub(repl, s)
    s = _PUNCT.sub(" ", s)
    return _SPACES.sub(" ", s).strip()


def normalize_location(location: str | None) -> str:
    if not location:
        return "unknown"
    s = location.lower().strip()
    if re.search(r"\bremote\b", s):
        return "remote"
    city = s.split(",")[0].strip()
    return _CITY_ALIASES.get(city, city) or "unknown"


def compute_content_hash(title: str, company: str, location: str | None) -> str:
    key = f"{normalize_company(company)}|{normalize_title(title)}|{normalize_location(location)}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]


def infer_region(location: str | None, salary_raw: str | None = None) -> str:
    loc_l = (location or "").lower()
    sal_l = (salary_raw or "").lower()

    if _has_location_token(loc_l, _GLOBAL_LOCATIONS):
        return "GLOBAL"

    matched_regions: list[str] = []
    if _has_location_token(loc_l, _IN_LOCATIONS) or "₹" in sal_l or "inr" in sal_l or "lpa" in sal_l:
        matched_regions.append("IN")
    if _has_location_token(loc_l, _US_LOCATIONS) or ", ca" in loc_l or ", ny" in loc_l or ", wa" in loc_l:
        matched_regions.append("US")
    if _has_location_token(loc_l, _UK_LOCATIONS) or "£" in sal_l or "gbp" in sal_l:
        matched_regions.append("UK")
    if _has_location_token(loc_l, _SG_LOCATIONS) or "sgd" in sal_l or "s$" in sal_l:
        matched_regions.append("SG")
    if _has_location_token(loc_l, _EU_LOCATIONS) or "€" in sal_l or "eur" in sal_l:
        matched_regions.append("EU")

    if len(matched_regions) >= 2:
        return "GLOBAL"
    if len(matched_regions) == 1:
        return matched_regions[0]
    return "GLOBAL"


def parse_salary_multicurrency(
    salary_raw: str | None,
) -> tuple[Optional[int], Optional[int], Optional[str], Optional[int]]:
    """Parse USD, INR (LPA/Crore/Rs), EUR, GBP, SGD salary ranges.

    Returns (salary_min, salary_max, currency, salary_min_usd_eq).
    """
    if not salary_raw:
        return None, None, None, None
    s = salary_raw.strip()
    sl = s.lower()

    currency = "USD"
    if "₹" in s or "inr" in sl or "rs." in sl or "rs " in sl or "lpa" in sl or "lakhs" in sl or "crore" in sl:
        currency = "INR"
    elif "€" in s or "eur" in sl:
        currency = "EUR"
    elif "£" in s or "gbp" in sl:
        currency = "GBP"
    elif "s$" in sl or "sgd" in sl:
        currency = "SGD"
    elif "cad" in sl or "c$" in sl:
        currency = "CAD"

    nums: list[int] = []
    # Match numbers with optional decimals and optional K/LPA/Cr/M multipliers
    for m in re.finditer(r"(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)\s*(k|lpa|lakhs?|cr|crores?|m)?", sl):
        raw_num = m.group(1).replace(",", "")
        suffix = (m.group(2) or "").lower()
        try:
            val = float(raw_num)
        except ValueError:
            continue
        if suffix == "k":
            val *= 1_000
        elif suffix in {"lpa", "lakh", "lakhs"}:
            val *= 100_000
        elif suffix in {"cr", "crore", "crores"}:
            val *= 10_000_000
        elif suffix == "m":
            val *= 1_000_000
        elif currency == "INR" and ("lpa" in sl or "lakh" in sl) and val < 500:
            val *= 100_000
        elif currency != "INR" and val < 1000 and ("k" in sl or val >= 20):
            # e.g. "$150 - $200k"
            if "k" in sl:
                val *= 1_000

        ival = int(round(val))
        if ival >= 5_000:
            nums.append(ival)

    if not nums:
        return None, None, currency if any(sym in sl for sym in ("₹", "inr", "$", "€", "£")) else None, None

    sal_min = min(nums)
    sal_max = max(nums) if len(nums) > 1 else sal_min
    fx = APPROX_FX_TO_USD.get(currency, 1.0)
    usd_eq = int(round(sal_min * fx))
    return sal_min, sal_max, currency, usd_eq


def infer_work_mode(work_mode: str | None, title: str, location: str | None, description: str) -> str:
    if work_mode and work_mode.lower() in {"remote", "hybrid", "onsite"}:
        return work_mode.lower()
    haystack = f"{title}\n{location or ''}\n{(description or '')[:1500]}".lower()
    if re.search(r"\b(hybrid)\b", haystack):
        return "hybrid"
    if re.search(r"\b(remote|work from anywhere|wfh)\b", haystack):
        return "remote"
    if re.search(r"\b(on-?site|in-?office)\b", haystack):
        return "onsite"
    return "unspecified"


def infer_job_type(job_type: str | None, title: str) -> str:
    raw = (job_type or "").lower().strip()
    if "intern" in raw or "intern" in title.lower():
        return "internship"
    if "contract" in raw:
        return "contract"
    if "part" in raw:
        return "part-time"
    return "full-time"


def infer_seniority(title: str, description: str) -> str:
    text = f"{title} {(description or '')[:600]}".lower()
    for level, pat in (
        ("intern", r"\b(intern|internship)\b"),
        ("principal", r"\b(principal|distinguished|fellow)\b"),
        ("staff", r"\b(staff)\b"),
        ("lead", r"\b(lead|tech lead)\b"),
        ("senior", r"\b(senior|sr\.?)\b"),
        ("junior", r"\b(junior|jr\.?|entry[- ]level|new grad)\b"),
        ("mid", r"\b(mid[- ]level)\b"),
    ):
        if re.search(pat, text):
            return level
    return "unspecified"


def infer_experience_range(description: str) -> tuple[Optional[float], Optional[float]]:
    text = description or ""
    m_range = re.search(r"(\d{1,2})\s*[-–to]+\s*(\d{1,2})\s*\+?\s*years?", text, re.I)
    if m_range:
        lo, hi = float(m_range.group(1)), float(m_range.group(2))
        if lo <= hi <= 30:
            return lo, hi
    m_min = re.search(r"(\d{1,2})\s*\+?\s*years?\s+of\s+(?:experience|industry|engineering)", text, re.I)
    if m_min:
        val = float(m_min.group(1))
        if val <= 30:
            return val, None
    return None, None


def infer_min_education(description: str) -> str:
    lower = (description or "").lower()
    if re.search(r"\b(ph\.?d|doctorate)\b", lower):
        return "phd"
    if re.search(r"\b(master'?s|m\.?s\.?|m\.?tech)\b", lower):
        return "master"
    if re.search(r"\b(bachelor'?s|b\.?s\.?|b\.?tech|b\.?e\.?)\b", lower):
        return "bachelor"
    return "unspecified"


def normalize_job_record(raw: RawJobRecord) -> NormalisedJob:
    """Transform any RawJobRecord into a canonical NormalisedJob."""
    title = raw.title.strip()
    company = raw.company.strip()
    location = raw.location.strip() if raw.location else None
    sal_min, sal_max, sal_cur, usd_eq = parse_salary_multicurrency(raw.salary_raw)
    exp_min, exp_max = infer_experience_range(raw.description)
    skills = extract_job_skills(raw.description, title=title)
    posted = raw.posted_at
    if posted and posted.tzinfo is None:
        posted = posted.replace(tzinfo=timezone.utc)

    return NormalisedJob(
        source=raw.source.strip().lower(),
        external_id=raw.external_id,
        content_hash=compute_content_hash(title, company, location),
        title=title,
        company=company,
        location=location,
        region=raw.region.upper() if raw.region else infer_region(location, raw.salary_raw),
        description=raw.description.strip() or f"{title} at {company}",
        skills=skills,
        salary_raw=raw.salary_raw,
        salary_min=sal_min,
        salary_max=sal_max,
        salary_currency=sal_cur,
        salary_min_usd_eq=usd_eq,
        experience_min_years=exp_min,
        experience_max_years=exp_max,
        seniority_level=infer_seniority(title, raw.description),
        min_education=infer_min_education(raw.description),
        job_type=infer_job_type(raw.job_type, title),
        work_mode=infer_work_mode(raw.work_mode, title, location, raw.description),
        posted_at=posted,
        expires_at=raw.expires_at,
        application_url=raw.application_url.strip(),
        source_metadata=raw.source_metadata,
    )
