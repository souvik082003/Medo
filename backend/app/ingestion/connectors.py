"""Permitted official API / feed job connectors with rate limiting and retry handling."""
from __future__ import annotations

import html
import json
import re
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

import httpx

from ..core.config import PROJECT_ROOT, Settings, get_settings
from .normalizer import RawJobRecord


def _strip_html(raw_html: str) -> str:
    """Convert HTML job descriptions to clean single-spaced plain text."""
    text = html.unescape(re.sub(r"<[^>]+>", " ", raw_html or ""))
    return re.sub(r"\s+", " ", text).strip()


_STOPWORDS = {"and", "or", "the", "for", "with", "in", "on", "to", "of", "a", "an", "jobs", "role", "roles"}


def _keyword_tokens(keywords: list[str]) -> list[str]:
    """Expand phrases into deduplicated lowercase search tokens."""
    tokens: list[str] = []
    seen: set[str] = set()
    for kw in keywords:
        for part in re.split(r"[\s,;/|]+", (kw or "").lower()):
            tok = part.strip()
            if len(tok) >= 2 and tok not in _STOPWORDS and tok not in seen:
                seen.add(tok)
                tokens.append(tok)
    return tokens


def _keyword_score(haystack: str, tokens: list[str]) -> int:
    """Count how many search tokens appear in a job's title/description/tags."""
    hl = haystack.lower()
    return sum(1 for tok in tokens if tok in hl)


class BaseJobConnector(ABC):
    """Base connector enforcing rate limits and retry-safe HTTP fetching."""

    source_name: str = "base"
    source_type: str = "official_api"

    def __init__(self, settings: Settings | None = None, *, min_interval_sec: float = 0.25) -> None:
        self.settings = settings or get_settings()
        self.min_interval_sec = min_interval_sec
        self._last_request_at = 0.0

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < self.min_interval_sec:
            time.sleep(self.min_interval_sec - elapsed)
        self._last_request_at = time.monotonic()

    def _get_json(self, url: str, *, params: dict | None = None, retries: int = 2, timeout: float = 15.0) -> dict | list:
        last_exc: Exception | None = None
        for attempt in range(retries + 1):
            self._throttle()
            try:
                with httpx.Client(timeout=timeout, headers={"User-Agent": "Medo-CareerIntelligence/0.2"}) as client:
                    resp = client.get(url, params=params)
                    if resp.status_code == 429 or resp.status_code >= 500:
                        raise httpx.HTTPStatusError(
                            f"HTTP {resp.status_code}", request=resp.request, response=resp
                        )
                    resp.raise_for_status()
                    return resp.json()
            except Exception as exc:
                last_exc = exc
                if attempt < retries:
                    time.sleep(0.5 * (2**attempt))
        raise RuntimeError(f"{self.source_name} request failed: {last_exc}") from last_exc

    @abstractmethod
    def fetch_jobs(self, keywords: list[str], region: str = "US", limit: int = 25) -> Iterable[RawJobRecord]:
        """Yield raw job records from this permitted source."""
        ...


class HackerNewsConnector(BaseJobConnector):
    """Official HN Algolia + Firebase API connector."""

    source_name = "hackernews"
    source_type = "official_api"

    ALGOLIA_URL = "https://hn.algolia.com/api/v1/search"
    ITEM_URL = "https://hacker-news.firebaseio.com/v0/item/{id}.json"

    def fetch_jobs(self, keywords: list[str], region: str = "US", limit: int = 25) -> Iterable[RawJobRecord]:
        data = self._get_json(
            self.ALGOLIA_URL,
            params={"query": "Ask HN: Who is hiring?", "tags": "story,author_whoishiring", "hitsPerPage": 3},
        )
        hits = data.get("hits", []) if isinstance(data, dict) else []
        if not hits:
            return
        thread_id = int(hits[0]["objectID"])
        thread = self._get_json(self.ITEM_URL.format(id=thread_id))
        kids = (thread.get("kids", []) if isinstance(thread, dict) else [])[:40]
        kw_tokens = _keyword_tokens(keywords)

        count = 0
        for kid_id in kids:
            if count >= limit:
                break
            item = self._get_json(self.ITEM_URL.format(id=kid_id))
            if not isinstance(item, dict) or item.get("deleted") or item.get("dead"):
                continue
            text = _strip_html(item.get("text") or "")
            if len(text) < 40:
                continue
            if kw_tokens and _keyword_score(text, kw_tokens) == 0:
                continue

            parts = [p.strip() for p in text.split("\n")[0].split("|") if p.strip()]
            company = parts[0][:120] if parts else "HN Hiring Company"
            title = parts[1][:120] if len(parts) > 1 else "Software / ML Engineer"
            location = parts[2][:120] if len(parts) > 2 else "Remote"
            yield RawJobRecord(
                source=self.source_name,
                external_id=str(kid_id),
                title=title,
                company=company,
                location=location,
                description=text[:4000],
                posted_at=datetime.fromtimestamp(item["time"], tz=timezone.utc) if item.get("time") else None,
                application_url=f"https://news.ycombinator.com/item?id={kid_id}",
                source_metadata={"thread_id": thread_id},
            )
            count += 1


class RemotiveConnector(BaseJobConnector):
    """Official public Remotive remote jobs API."""

    source_name = "remotive"
    source_type = "official_api"
    API_URL = "https://remotive.com/api/remote-jobs"

    def fetch_jobs(self, keywords: list[str], region: str = "GLOBAL", limit: int = 25) -> Iterable[RawJobRecord]:
        tokens = _keyword_tokens(keywords)
        data = self._get_json(self.API_URL, params={"category": "software-dev", "limit": 60})
        jobs = data.get("jobs", []) if isinstance(data, dict) else []
        if tokens:
            jobs = sorted(
                jobs,
                key=lambda item: _keyword_score(
                    f"{item.get('title', '')} {item.get('description', '')} {' '.join(item.get('tags') or [])}",
                    tokens,
                ),
                reverse=True,
            )
        for item in jobs[:limit]:
            desc = _strip_html(item.get("description") or "")
            posted = None
            if item.get("publication_date"):
                try:
                    posted = datetime.fromisoformat(item["publication_date"].replace("Z", "+00:00"))
                except ValueError:
                    posted = None
            yield RawJobRecord(
                source=self.source_name,
                external_id=str(item.get("id") or ""),
                title=item.get("title") or "Engineer",
                company=item.get("company_name") or "Unknown",
                location=item.get("candidate_required_location") or "Remote",
                description=desc[:5000],
                salary_raw=item.get("salary") or None,
                job_type=item.get("job_type"),
                work_mode="remote",
                posted_at=posted,
                application_url=item.get("url") or "",
                source_metadata={"category": item.get("category"), "tags": item.get("tags", [])},
            )


class AdzunaConnector(BaseJobConnector):
    """Official Adzuna API supporting India (in), US (us), UK (gb), Singapore (sg)."""

    source_name = "adzuna"
    source_type = "official_api"

    COUNTRY_MAP = {"IN": "in", "US": "us", "UK": "gb", "SG": "sg", "EU": "de"}

    def fetch_jobs(self, keywords: list[str], region: str = "IN", limit: int = 25) -> Iterable[RawJobRecord]:
        if not (self.settings.adzuna_app_id and self.settings.adzuna_app_key):
            return
        cc = self.COUNTRY_MAP.get(region.upper(), "us")
        query = " ".join(keywords[:2]) if keywords else "machine learning engineer"
        url = f"https://api.adzuna.com/v1/api/jobs/{cc}/search/1"
        data = self._get_json(
            url,
            params={
                "app_id": self.settings.adzuna_app_id,
                "app_key": self.settings.adzuna_app_key,
                "what": query,
                "results_per_page": min(limit, 50),
            },
        )
        for item in (data.get("results") or [])[:limit]:
            sal_min = item.get("salary_min")
            sal_max = item.get("salary_max")
            curr = "INR" if cc == "in" else ("GBP" if cc == "gb" else "USD")
            sal_raw = f"{int(sal_min)} - {int(sal_max)} {curr}" if sal_min and sal_max else None
            yield RawJobRecord(
                source=self.source_name,
                external_id=str(item.get("id") or ""),
                title=item.get("title") or "Engineer",
                company=(item.get("company") or {}).get("display_name") or "Unknown",
                location=(item.get("location") or {}).get("display_name"),
                description=item.get("description") or "",
                salary_raw=sal_raw,
                application_url=item.get("redirect_url") or "",
                source_metadata={"country": cc},
            )


class DemoDatasetConnector(BaseJobConnector):
    """Loads documented local demo dataset for offline development and demos."""

    source_name = "demo_dataset"
    source_type = "fixture"

    def __init__(self, dataset_path: Path | None = None, settings: Settings | None = None) -> None:
        super().__init__(settings, min_interval_sec=0.0)
        self.dataset_path = dataset_path or (PROJECT_ROOT / "data" / "demo" / "demo_jobs.json")

    def fetch_jobs(self, keywords: list[str], region: str = "ALL", limit: int = 50) -> Iterable[RawJobRecord]:
        if not self.dataset_path.exists():
            return
        items = json.loads(self.dataset_path.read_text(encoding="utf-8"))
        kw_lower = [k.lower() for k in keywords if k]
        count = 0
        for item in items:
            if count >= limit:
                break
            haystack = f"{item.get('title', '')} {item.get('description', '')}".lower()
            if kw_lower and not any(k in haystack for k in kw_lower):
                continue
            yield RawJobRecord(source=self.source_name, **item)
            count += 1


class ApifyLinkedInConnector(BaseJobConnector):
    """LinkedIn job search via Apify Actor (harvestapi/linkedin-job-search)."""

    source_name = "apify_linkedin"
    source_type = "apify_actor"
    ACTOR_SLUG = "harvestapi~linkedin-job-search"
    RUN_SYNC_URL = f"https://api.apify.com/v2/acts/{ACTOR_SLUG}/run-sync-get-dataset-items"
    REGION_LOCATIONS = {
        "IN": "India",
        "US": "United States",
        "UK": "United Kingdom",
        "EU": "Europe",
        "SG": "Singapore",
    }

    def fetch_jobs(self, keywords: list[str], region: str = "IN", limit: int = 15) -> Iterable[RawJobRecord]:
        token = (self.settings.apify_api_token or "").strip()
        if not token:
            raise ValueError("APIFY_API_TOKEN is not configured.")

        titles = [k.strip() for k in keywords if k.strip()][:3] or ["Machine Learning Engineer"]
        location_name = self.REGION_LOCATIONS.get(region.upper(), "India")
        payload = {
            "jobTitles": titles,
            "locations": [location_name],
            "sortBy": "date",
            "postedLimit": "week",
            "maxItems": max(1, min(limit, 50)),
        }

        self._throttle()
        with httpx.Client(
            timeout=95.0,
            headers={
                "Authorization": f"Bearer {token}",
                "User-Agent": "Medo-CareerIntelligence/0.2",
            },
        ) as client:
            resp = client.post(self.RUN_SYNC_URL, params={"timeout": 85}, json=payload)
            if resp.status_code >= 400:
                detail = resp.text[:300]
                try:
                    err_data = resp.json().get("error") or {}
                    err_type = err_data.get("type")
                    err_msg = err_data.get("message")
                    if err_msg:
                        detail = f"{err_type}: {err_msg}" if err_type else err_msg
                except Exception:
                    pass
                raise RuntimeError(f"Apify HTTP {resp.status_code}: {detail}")
            items = resp.json()

        if not isinstance(items, list):
            raise RuntimeError(f"Unexpected Apify response type: {type(items).__name__}")

        for item in items[:limit]:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "").strip()
            url = str(item.get("linkedinUrl") or item.get("url") or "").strip()
            company_obj = item.get("company")
            company = (
                str(company_obj.get("name") or "").strip()
                if isinstance(company_obj, dict)
                else str(company_obj or "").strip()
            )
            if not (title and company and url):
                continue

            loc_obj = item.get("location")
            if isinstance(loc_obj, dict):
                location = str(
                    loc_obj.get("linkedinText")
                    or (loc_obj.get("parsed") or {}).get("text")
                    or location_name
                ).strip()
            else:
                location = str(loc_obj or location_name).strip()

            salary_obj = item.get("salary")
            salary_raw = (
                salary_obj.get("text")
                if isinstance(salary_obj, dict)
                else (str(salary_obj) if salary_obj else None)
            )
            desc = str(item.get("descriptionText") or item.get("description") or "").strip()
            if len(desc) < 20:
                desc = f"{title} at {company} ({location})."

            posted_at = None
            if item.get("postedDate"):
                try:
                    posted_at = datetime.fromisoformat(str(item["postedDate"]).replace("Z", "+00:00"))
                except ValueError:
                    posted_at = None

            work_raw = str(item.get("workplaceType") or "").lower()
            work_mode = (
                "remote"
                if "remote" in work_raw
                else ("hybrid" if "hybrid" in work_raw else ("onsite" if "on-site" in work_raw or "onsite" in work_raw else None))
            )

            yield RawJobRecord(
                source=self.source_name,
                external_id=str(item.get("id") or url),
                title=title[:256],
                company=company[:256],
                location=location[:256] if location else None,
                region=region.upper() if region else None,
                description=desc[:8000],
                salary_raw=str(salary_raw)[:128] if salary_raw else None,
                job_type=str(item.get("employmentType") or "").lower() or None,
                work_mode=work_mode,
                posted_at=posted_at,
                application_url=url[:1024],
                source_metadata={"actor": self.ACTOR_SLUG},
            )


class ArbeitnowConnector(BaseJobConnector):
    """Free public Arbeitnow job board API (zero API key required)."""

    source_name = "arbeitnow"
    source_type = "official_api"
    API_URL = "https://www.arbeitnow.com/api/job-board-api"

    def fetch_jobs(self, keywords: list[str], region: str = "ALL", limit: int = 25) -> Iterable[RawJobRecord]:
        data = self._get_json(self.API_URL)
        items = [it for it in (data.get("data", []) if isinstance(data, dict) else []) if isinstance(it, dict)]
        tokens = _keyword_tokens(keywords) or ["engineer", "developer", "python", "ai", "ml", "data", "software"]
        scored = sorted(
            items,
            key=lambda item: _keyword_score(
                f"{item.get('title', '')} {item.get('description', '')} {' '.join(item.get('tags') or [])}",
                tokens,
            ),
            reverse=True,
        )
        chosen = scored[:limit]
        for item in chosen:
            desc = _strip_html(item.get("description") or "")
            if len(desc) < 20:
                desc = f"{item.get('title', 'Engineer')} at {item.get('company_name', 'Company')}."
            posted = None
            if item.get("created_at"):
                try:
                    posted = datetime.fromtimestamp(int(item["created_at"]), tz=timezone.utc)
                except (ValueError, TypeError):
                    posted = None
            yield RawJobRecord(
                source=self.source_name,
                external_id=str(item.get("slug") or item.get("url") or ""),
                title=str(item.get("title") or "Engineer")[:256],
                company=str(item.get("company_name") or "Unknown")[:256],
                location=str(item.get("location") or ("Remote" if item.get("remote") else ""))[:256] or None,
                description=desc[:8000],
                job_type=", ".join(item.get("job_types") or []) or None,
                work_mode="remote" if item.get("remote") else None,
                posted_at=posted,
                application_url=str(item.get("url") or "")[:1024],
                source_metadata={"tags": item.get("tags", [])},
            )


class RemoteOKConnector(BaseJobConnector):
    """Free public RemoteOK JSON jobs feed (zero API key required)."""

    source_name = "remoteok"
    source_type = "official_api"
    API_URL = "https://remoteok.com/api"

    def fetch_jobs(self, keywords: list[str], region: str = "GLOBAL", limit: int = 25) -> Iterable[RawJobRecord]:
        data = self._get_json(self.API_URL)
        items = [it for it in (data if isinstance(data, list) else []) if isinstance(it, dict) and it.get("position")]
        tokens = _keyword_tokens(keywords) or ["engineer", "developer", "python", "ai", "ml", "data", "software"]
        scored = sorted(
            items,
            key=lambda item: _keyword_score(
                f"{item.get('position', '')} {item.get('description', '')} {' '.join(item.get('tags') or [])}",
                tokens,
            ),
            reverse=True,
        )
        chosen = scored[:limit]
        for item in chosen:
            desc = _strip_html(item.get("description") or "")
            if len(desc) < 20:
                desc = f"{item.get('position', 'Engineer')} at {item.get('company', 'Company')}."
            sal_min = item.get("salary_min")
            sal_max = item.get("salary_max")
            salary_raw = f"${int(sal_min):,} - ${int(sal_max):,} USD" if sal_min and sal_max else None
            posted = None
            if item.get("date"):
                try:
                    posted = datetime.fromisoformat(str(item["date"]).replace("Z", "+00:00"))
                except ValueError:
                    posted = None
            url = str(item.get("apply_url") or item.get("url") or "").strip()
            if not url:
                continue
            yield RawJobRecord(
                source=self.source_name,
                external_id=str(item.get("id") or url),
                title=str(item.get("position") or "Engineer")[:256],
                company=str(item.get("company") or "Unknown")[:256],
                location=str(item.get("location") or "Remote")[:256],
                description=desc[:8000],
                salary_raw=salary_raw,
                work_mode="remote",
                posted_at=posted,
                application_url=url[:1024],
                source_metadata={"tags": item.get("tags", [])},
            )


class HimalayasConnector(BaseJobConnector):
    """Free public Himalayas Remote Jobs API supporting India (IN) and worldwide roles (no key required)."""

    source_name = "himalayas"
    source_type = "official_api"
    SEARCH_URL = "https://himalayas.app/jobs/api/search"
    FEED_URL = "https://himalayas.app/jobs/api"

    def fetch_jobs(self, keywords: list[str], region: str = "IN", limit: int = 25) -> Iterable[RawJobRecord]:
        tokens = _keyword_tokens(keywords)
        query = " ".join(tokens[:2]) if tokens else "engineer"
        reg = (region or "").upper()
        params: dict[str, Any] = {"q": query, "limit": min(limit, 50)}
        if reg in {"IN", "US", "UK", "SG", "EU"}:
            params["country"] = "DE" if reg == "EU" else ("GB" if reg == "UK" else reg)

        try:
            data = self._get_json(self.SEARCH_URL, params=params)
        except Exception:
            data = self._get_json(self.FEED_URL, params={"limit": min(limit, 50)})

        jobs = data.get("jobs", []) if isinstance(data, dict) else []
        if not jobs and "country" in params:
            # Broaden to unfiltered global feed if country-filtered search is empty
            data = self._get_json(self.SEARCH_URL, params={"q": query, "limit": min(limit, 50)})
            jobs = data.get("jobs", []) if isinstance(data, dict) else []

        if tokens:
            jobs = sorted(
                jobs,
                key=lambda item: _keyword_score(
                    f"{item.get('title', '')} {item.get('description', '')} {' '.join(item.get('categories') or [])}",
                    tokens,
                ),
                reverse=True,
            )

        for item in jobs[:limit]:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "").strip()
            company = str(item.get("companyName") or "").strip()
            url = str(item.get("applicationLink") or item.get("guid") or "").strip()
            if not (title and company and url):
                continue

            locs = item.get("locationRestrictions") or []
            loc_names = [
                str(l.get("name") or l.get("alpha2") or "") if isinstance(l, dict) else str(l)
                for l in locs
            ]
            loc_names = [n for n in loc_names if n]
            location = ", ".join(loc_names[:3]) if loc_names else "Worldwide"

            sal_min = item.get("minSalary")
            sal_max = item.get("maxSalary")
            curr = str(item.get("currency") or "USD").upper()
            salary_raw = (
                f"{int(sal_min):,} - {int(sal_max or sal_min):,} {curr}"
                if sal_min
                else None
            )

            posted = None
            if item.get("pubDate"):
                try:
                    posted = datetime.fromtimestamp(int(item["pubDate"]), tz=timezone.utc)
                except (ValueError, TypeError):
                    posted = None

            desc = _strip_html(item.get("description") or "")
            if len(desc) < 20:
                desc = f"{title} at {company} ({location})."

            inferred_reg = None
            if reg == "IN" and (
                any(x.upper() == "IN" or "india" in x.lower() for x in loc_names)
                or params.get("country") == "IN" and loc_names
            ):
                inferred_reg = "IN"

            yield RawJobRecord(
                source=self.source_name,
                external_id=str(item.get("guid") or url),
                title=title[:256],
                company=company[:256],
                location=location[:256],
                region=inferred_reg,
                description=desc[:8000],
                salary_raw=salary_raw,
                job_type=str(item.get("employmentType") or "").lower() or None,
                work_mode="remote",
                posted_at=posted,
                application_url=url[:1024],
                source_metadata={"categories": item.get("categories", [])},
            )


class JobicyConnector(BaseJobConnector):
    """Free public Jobicy Remote Jobs API supporting geo filters including India/APAC (no key required)."""

    source_name = "jobicy"
    source_type = "official_api"
    API_URL = "https://jobicy.com/api/v2/remote-jobs"
    GEO_MAP = {"IN": "india", "US": "usa", "UK": "uk", "EU": "europe", "SG": "apac", "GLOBAL": "anywhere"}

    def fetch_jobs(self, keywords: list[str], region: str = "IN", limit: int = 25) -> Iterable[RawJobRecord]:
        tokens = _keyword_tokens(keywords)
        reg = (region or "").upper()
        params: dict[str, Any] = {"count": min(max(limit, 10), 50)}
        geo = self.GEO_MAP.get(reg)
        if geo and geo != "anywhere":
            params["geo"] = geo

        data = self._get_json(self.API_URL, params=params)
        jobs = data.get("jobs", []) if isinstance(data, dict) else []
        if not jobs and "geo" in params:
            # Fallback to global/all-geo Jobicy feed if country-specific geo returns empty
            data = self._get_json(self.API_URL, params={"count": min(max(limit, 10), 50)})
            jobs = data.get("jobs", []) if isinstance(data, dict) else []

        if tokens:
            jobs = sorted(
                jobs,
                key=lambda item: _keyword_score(
                    f"{item.get('jobTitle', '')} {item.get('jobExcerpt', '')} {item.get('jobDescription', '')}",
                    tokens,
                ),
                reverse=True,
            )

        for item in jobs[:limit]:
            if not isinstance(item, dict):
                continue
            title = html.unescape(str(item.get("jobTitle") or "")).strip()
            company = html.unescape(str(item.get("companyName") or "")).strip()
            url = str(item.get("url") or "").strip()
            if not (title and company and url):
                continue

            geo_str = str(item.get("jobGeo") or "Worldwide").strip()
            sal_min = item.get("annualSalaryMin")
            sal_max = item.get("annualSalaryMax")
            curr = str(item.get("salaryCurrency") or "USD").upper()
            salary_raw = (
                f"{int(sal_min):,} - {int(sal_max or sal_min):,} {curr}"
                if sal_min
                else None
            )

            posted = None
            if item.get("pubDate"):
                try:
                    posted = datetime.fromisoformat(str(item["pubDate"]).replace("Z", "+00:00").replace(" ", "T"))
                except ValueError:
                    posted = None

            desc = _strip_html(item.get("jobDescription") or item.get("jobExcerpt") or "")
            if len(desc) < 20:
                desc = f"{title} at {company} ({geo_str})."

            jtype = item.get("jobType")
            jtype_str = ", ".join(jtype) if isinstance(jtype, list) else str(jtype or "")
            explicit_reg = "IN" if "india" in geo_str.lower() else None

            yield RawJobRecord(
                source=self.source_name,
                external_id=str(item.get("id") or url),
                title=title[:256],
                company=company[:256],
                location=geo_str[:256],
                region=explicit_reg,
                description=desc[:8000],
                salary_raw=salary_raw,
                job_type=jtype_str.lower() or None,
                work_mode="remote",
                posted_at=posted,
                application_url=url[:1024],
                source_metadata={"industry": item.get("jobIndustry")},
            )
