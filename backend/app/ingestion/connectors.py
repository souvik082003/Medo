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
    """Unescape HTML entities first, preserve section/list structure, and strip all tags cleanly."""
    s = html.unescape(html.unescape(raw_html or ""))
    s = re.sub(r"<(br|hr)\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"</(p|div|section|article|h[1-6]|tr|ul|ol)>", "\n", s, flags=re.I)
    s = re.sub(r"<li[^>]*>", "\n- ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s*Find Jobs in [^\n]*on Arbeitnow\s*$", "", s, flags=re.I)
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in s.splitlines()]
    return "\n".join(ln for ln in lines if ln).strip()


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

    def _get_json(
        self,
        url: str,
        *,
        params: dict | None = None,
        headers: dict[str, str] | None = None,
        retries: int = 2,
        timeout: float = 15.0,
    ) -> dict | list:
        last_exc: Exception | None = None
        req_headers = {"User-Agent": "Medo-CareerIntelligence/0.2", **(headers or {})}
        for attempt in range(retries + 1):
            self._throttle()
            try:
                with httpx.Client(timeout=timeout, headers=req_headers) as client:
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


def _parse_iso_dt(value: Any) -> datetime | None:
    """Safely parse ISO-8601 timestamps into aware datetimes."""
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None


def _infer_work_mode(location_text: str | None, *, default: str = "onsite") -> str:
    low = (location_text or "").lower()
    if "remote" in low or "flexible" in low or "anywhere" in low:
        return "remote"
    if "hybrid" in low:
        return "hybrid"
    return default


class TheMuseConnector(BaseJobConnector):
    """Official The Muse public jobs API (no API key required)."""

    source_name = "themuse"
    source_type = "official_api"

    BASE_URL = "https://www.themuse.com/api/public/jobs"

    def fetch_jobs(self, keywords: list[str], region: str = "IN", limit: int = 25) -> Iterable[RawJobRecord]:
        kw_tokens = _keyword_tokens(keywords)
        candidates: list[tuple[int, dict]] = []
        fetched_any_page = False
        last_exc: Exception | None = None
        for page in (1, 2):
            try:
                data = self._get_json(
                    self.BASE_URL,
                    params={"page": page, "category": "Software Engineering"},
                )
                fetched_any_page = True
            except Exception as exc:
                last_exc = exc
                break
            results = data.get("results", []) if isinstance(data, dict) else []
            if not results:
                break
            for item in results:
                if not isinstance(item, dict):
                    continue
                locs = ", ".join(loc.get("name", "") for loc in (item.get("locations") or []) if isinstance(loc, dict))
                haystack = f"{item.get('name', '')} {locs} {(item.get('company') or {}).get('name', '')}"
                score = _keyword_score(haystack, kw_tokens) if kw_tokens else 1
                candidates.append((score, item))

        if not fetched_any_page and last_exc is not None:
            raise last_exc

        candidates.sort(key=lambda pair: pair[0], reverse=True)
        seen_ids: set[str] = set()
        emitted = 0
        for _, item in candidates:
            if emitted >= limit:
                break
            ext_id = str(item.get("id") or "")
            url = (item.get("refs") or {}).get("landing_page") or ""
            if not url or not ext_id or ext_id in seen_ids:
                continue
            seen_ids.add(ext_id)
            locs = [loc.get("name", "").strip() for loc in (item.get("locations") or []) if isinstance(loc, dict) and loc.get("name")]
            loc_str = ", ".join(locs) if locs else "Global / Flexible"
            desc = _strip_html(item.get("contents") or "")
            levels = [lvl.get("name", "") for lvl in (item.get("levels") or []) if isinstance(lvl, dict)]
            emitted += 1
            yield RawJobRecord(
                source=self.source_name,
                external_id=ext_id,
                title=(item.get("name") or "Software Engineer")[:255],
                company=((item.get("company") or {}).get("name") or "Unknown")[:255],
                location=loc_str[:255],
                description=desc[:8000],
                work_mode=_infer_work_mode(loc_str, default="hybrid"),
                posted_at=_parse_iso_dt(item.get("publication_date")),
                application_url=url[:1024],
                source_metadata={"levels": levels},
            )


class WorkingNomadsConnector(BaseJobConnector):
    """Official Working Nomads public remote tech jobs API (no API key required)."""

    source_name = "workingnomads"
    source_type = "official_api"

    API_URL = "https://www.workingnomads.com/api/exposed_jobs/"

    def fetch_jobs(self, keywords: list[str], region: str = "ALL", limit: int = 25) -> Iterable[RawJobRecord]:
        data = self._get_json(self.API_URL, timeout=18.0)
        if not isinstance(data, list):
            return
        kw_tokens = _keyword_tokens(keywords)
        scored: list[tuple[int, dict]] = []
        for item in data[:250]:
            if not isinstance(item, dict):
                continue
            haystack = f"{item.get('title', '')} {item.get('category_name', '')} {item.get('tags', '')} {item.get('company_name', '')}"
            score = _keyword_score(haystack, kw_tokens) if kw_tokens else 1
            scored.append((score, item))

        scored.sort(key=lambda pair: pair[0], reverse=True)
        count = 0
        for _, item in scored:
            if count >= limit:
                break
            url = (item.get("url") or "").strip()
            if not url:
                continue
            desc = _strip_html(item.get("description") or "")
            count += 1
            yield RawJobRecord(
                source=self.source_name,
                external_id=url,
                title=(item.get("title") or "Remote Engineer")[:255],
                company=(item.get("company_name") or "Unknown")[:255],
                location=(item.get("location") or "Remote Worldwide")[:255],
                description=desc[:8000],
                work_mode="remote",
                posted_at=_parse_iso_dt(item.get("pub_date")),
                application_url=url[:1024],
                source_metadata={"category": item.get("category_name"), "tags": item.get("tags")},
            )


class GreenhousePublicConnector(BaseJobConnector):
    """Official Greenhouse public job board JSON API across engineering-first tech orgs (no API key required)."""

    source_name = "greenhouse"
    source_type = "official_api"

    BOARDS = (
        ("anthropic", "Anthropic"),
        ("stripe", "Stripe"),
        ("figma", "Figma"),
        ("databricks", "Databricks"),
        ("vercel", "Vercel"),
        ("discord", "Discord"),
    )

    def fetch_jobs(self, keywords: list[str], region: str = "IN", limit: int = 25) -> Iterable[RawJobRecord]:
        kw_tokens = _keyword_tokens(keywords)
        candidates: list[tuple[int, str, dict]] = []
        per_board_cap = max(4, (limit // len(self.BOARDS)) + 3)
        succeeded_boards = 0
        last_exc: Exception | None = None

        for slug, company_name in self.BOARDS:
            try:
                data = self._get_json(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs", params={"content": "true"}, timeout=12.0)
                succeeded_boards += 1
            except Exception as exc:
                last_exc = exc
                continue
            jobs = data.get("jobs", []) if isinstance(data, dict) else []
            board_items: list[tuple[int, str, dict]] = []
            for item in jobs:
                if not isinstance(item, dict):
                    continue
                loc_name = (item.get("location") or {}).get("name") or ""
                haystack = f"{item.get('title', '')} {loc_name} {company_name}"
                score = _keyword_score(haystack, kw_tokens) if kw_tokens else 1
                if region.upper() == "IN" and "india" in loc_name.lower():
                    score += 2
                board_items.append((score, company_name, item))
            board_items.sort(key=lambda pair: pair[0], reverse=True)
            candidates.extend(board_items[:per_board_cap])

        if succeeded_boards == 0 and last_exc is not None:
            raise last_exc

        candidates.sort(key=lambda pair: pair[0], reverse=True)
        count = 0
        for _, company_name, item in candidates:
            if count >= limit:
                break
            url = (item.get("absolute_url") or "").strip()
            ext_id = str(item.get("id") or "")
            if not url or not ext_id:
                continue
            loc_name = ((item.get("location") or {}).get("name") or "Global").strip()
            desc = _strip_html(item.get("content") or "")
            count += 1
            yield RawJobRecord(
                source=self.source_name,
                external_id=f"{company_name.lower()}-{ext_id}",
                title=(item.get("title") or "Engineer")[:255],
                company=company_name,
                location=loc_name[:255],
                description=desc[:8000],
                work_mode=_infer_work_mode(loc_name, default="hybrid"),
                posted_at=_parse_iso_dt(item.get("updated_at")),
                application_url=url[:1024],
                source_metadata={"board": company_name},
            )


class JSearchRapidAPIConnector(BaseJobConnector):
    """RapidAPI JSearch aggregator (LinkedIn, Indeed, Glassdoor, ZipRecruiter via RAPIDAPI_KEY)."""

    source_name = "jsearch_rapidapi"
    source_type = "paid_api"

    API_URL = "https://jsearch.p.rapidapi.com/search"

    def fetch_jobs(self, keywords: list[str], region: str = "IN", limit: int = 25) -> Iterable[RawJobRecord]:
        api_key = (self.settings.rapidapi_key or "").strip()
        if not api_key:
            return
        query_role = keywords[0] if keywords else "Software Engineer"
        loc_hint = {"IN": "India", "US": "United States", "UK": "United Kingdom", "SG": "Singapore"}.get(region.upper(), "")
        query_str = f"{query_role} in {loc_hint}".strip() if loc_hint else query_role
        data = self._get_json(
            self.API_URL,
            params={"query": query_str, "page": "1", "num_pages": "2", "date_posted": "month"},
            headers={"X-RapidAPI-Key": api_key, "X-RapidAPI-Host": "jsearch.p.rapidapi.com"},
            timeout=20.0,
        )
        items = data.get("data", []) if isinstance(data, dict) else []
        for item in items[:limit]:
            if not isinstance(item, dict):
                continue
            url = (item.get("job_apply_link") or item.get("job_google_link") or "").strip()
            if not url:
                continue
            city = item.get("job_city") or ""
            country = item.get("job_country") or ""
            loc = ", ".join(part for part in (city, country) if part) or ("Remote" if item.get("job_is_remote") else "Unspecified")
            sal_min = item.get("job_min_salary")
            sal_max = item.get("job_max_salary")
            curr = item.get("job_salary_currency") or "USD"
            sal_raw = f"{int(sal_min)} - {int(sal_max)} {curr}" if sal_min and sal_max else None
            yield RawJobRecord(
                source=self.source_name,
                external_id=str(item.get("job_id") or url),
                title=(item.get("job_title") or "Engineer")[:255],
                company=(item.get("employer_name") or "Unknown")[:255],
                location=loc[:255],
                description=(item.get("job_description") or "")[:8000],
                salary_raw=sal_raw,
                job_type=(item.get("job_employment_type") or "").lower() or None,
                work_mode="remote" if item.get("job_is_remote") else "onsite",
                posted_at=_parse_iso_dt(item.get("job_posted_at_datetime_utc")),
                application_url=url[:1024],
                source_metadata={"publisher": item.get("job_publisher")},
            )


class SerpApiGoogleJobsConnector(BaseJobConnector):
    """SerpAPI Google Jobs structured feed (requires SERPAPI_API_KEY)."""

    source_name = "serpapi_jobs"
    source_type = "paid_api"

    API_URL = "https://serpapi.com/search.json"

    def fetch_jobs(self, keywords: list[str], region: str = "IN", limit: int = 25) -> Iterable[RawJobRecord]:
        api_key = (self.settings.serpapi_api_key or "").strip()
        if not api_key:
            return
        query_role = " ".join(keywords[:2]) if keywords else "AI Engineer"
        loc_hint = {"IN": "India", "US": "United States", "UK": "United Kingdom", "SG": "Singapore", "EU": "Germany"}.get(
            region.upper(), "India"
        )
        data = self._get_json(
            self.API_URL,
            params={"engine": "google_jobs", "q": query_role, "location": loc_hint, "api_key": api_key},
            timeout=20.0,
        )
        items = data.get("jobs_results", []) if isinstance(data, dict) else []
        for item in items[:limit]:
            if not isinstance(item, dict):
                continue
            apply_opts = item.get("apply_options") or []
            url = (apply_opts[0].get("link") if apply_opts and isinstance(apply_opts[0], dict) else None) or item.get("share_link") or ""
            if not url:
                continue
            ext = item.get("detected_extensions") or {}
            loc = (item.get("location") or loc_hint)[:255]
            yield RawJobRecord(
                source=self.source_name,
                external_id=str(item.get("job_id") or url),
                title=(item.get("title") or "Engineer")[:255],
                company=(item.get("company_name") or "Unknown")[:255],
                location=loc,
                description=(item.get("description") or "")[:8000],
                salary_raw=ext.get("salary"),
                job_type=(ext.get("schedule_type") or "").lower() or None,
                work_mode="remote" if ext.get("work_from_home") else _infer_work_mode(loc, default="onsite"),
                application_url=url[:1024],
                source_metadata={"via": item.get("via")},
            )


def build_sources_catalog(settings: Settings | None = None) -> list[dict[str, Any]]:
    """Return every supported free & paid job API connector with exact USD/INR pricing metadata."""
    cfg = settings or get_settings()
    adzuna_ready = bool((cfg.adzuna_app_id or "").strip() and (cfg.adzuna_app_key or "").strip())
    apify_ready = bool((cfg.apify_api_token or "").strip())
    rapidapi_ready = bool((cfg.rapidapi_key or "").strip())
    serpapi_ready = bool((cfg.serpapi_api_key or "").strip())

    return [
        {
            "id": "himalayas",
            "name": "Himalayas Remote",
            "category": "free_public",
            "is_free": True,
            "requires_key": False,
            "is_configured": True,
            "env_vars": [],
            "pricing_usd": "$0 / Forever Free",
            "pricing_inr": "₹0 / हमेशा मुफ़्त",
            "free_tier": "Public JSON feed, no API key needed",
            "coverage": "Global remote roles with salary & timezone tags",
            "signup_url": "https://himalayas.app/jobs/api",
        },
        {
            "id": "jobicy",
            "name": "Jobicy Remote Tech",
            "category": "free_public",
            "is_free": True,
            "requires_key": False,
            "is_configured": True,
            "env_vars": [],
            "pricing_usd": "$0 / Forever Free",
            "pricing_inr": "₹0 / हमेशा मुफ़्त",
            "free_tier": "Public API v2, no API key needed",
            "coverage": "Remote tech, DevOps, AI/ML & product engineering",
            "signup_url": "https://jobicy.com/api/v2/remote-jobs",
        },
        {
            "id": "remotive",
            "name": "Remotive",
            "category": "free_public",
            "is_free": True,
            "requires_key": False,
            "is_configured": True,
            "env_vars": [],
            "pricing_usd": "$0 / Forever Free",
            "pricing_inr": "₹0 / हमेशा मुफ़्त",
            "free_tier": "Public REST feed, no API key needed",
            "coverage": "Curated remote software & data roles",
            "signup_url": "https://remotive.com/api/remote-jobs",
        },
        {
            "id": "remoteok",
            "name": "RemoteOK",
            "category": "free_public",
            "is_free": True,
            "requires_key": False,
            "is_configured": True,
            "env_vars": [],
            "pricing_usd": "$0 / Forever Free",
            "pricing_inr": "₹0 / हमेशा मुफ़्त",
            "free_tier": "Public JSON feed, no API key needed",
            "coverage": "Worldwide remote startups & transparent salaries",
            "signup_url": "https://remoteok.com/api",
        },
        {
            "id": "arbeitnow",
            "name": "Arbeitnow",
            "category": "free_public",
            "is_free": True,
            "requires_key": False,
            "is_configured": True,
            "env_vars": [],
            "pricing_usd": "$0 / Forever Free",
            "pricing_inr": "₹0 / हमेशा मुफ़्त",
            "free_tier": "Public REST API, no API key needed",
            "coverage": "EU, Germany & global remote visa-sponsored engineering",
            "signup_url": "https://www.arbeitnow.com/api/job-board-api",
        },
        {
            "id": "hackernews",
            "name": "HN Who is Hiring",
            "category": "free_public",
            "is_free": True,
            "requires_key": False,
            "is_configured": True,
            "env_vars": [],
            "pricing_usd": "$0 / Forever Free",
            "pricing_inr": "₹0 / हमेशा मुफ़्त",
            "free_tier": "Official Algolia + Firebase HN API, no key needed",
            "coverage": "Direct Y Combinator startup & founding engineer threads",
            "signup_url": "https://news.ycombinator.com",
        },
        {
            "id": "themuse",
            "name": "The Muse Engineering",
            "category": "free_public",
            "is_free": True,
            "requires_key": False,
            "is_configured": True,
            "env_vars": [],
            "pricing_usd": "$0 / Forever Free",
            "pricing_inr": "₹0 / हमेशा मुफ़्त",
            "free_tier": "Public API (~500 req/hr unauthenticated)",
            "coverage": "Global & hybrid software engineering teams",
            "signup_url": "https://www.themuse.com/developers/api/v2",
        },
        {
            "id": "workingnomads",
            "name": "Working Nomads",
            "category": "free_public",
            "is_free": True,
            "requires_key": False,
            "is_configured": True,
            "env_vars": [],
            "pricing_usd": "$0 / Forever Free",
            "pricing_inr": "₹0 / हमेशा मुफ़्त",
            "free_tier": "Public exposed jobs feed, no API key needed",
            "coverage": "Worldwide remote engineering, cloud & design jobs",
            "signup_url": "https://www.workingnomads.com/jobs",
        },
        {
            "id": "greenhouse",
            "name": "Greenhouse ATS (Top AI/Tech)",
            "category": "free_public",
            "is_free": True,
            "requires_key": False,
            "is_configured": True,
            "env_vars": [],
            "pricing_usd": "$0 / Forever Free",
            "pricing_inr": "₹0 / हमेशा मुफ़्त",
            "free_tier": "Official public company ATS boards (Anthropic, Stripe, Figma, Databricks, Vercel, Discord)",
            "coverage": "Direct Tier-1 engineering company career boards (India, US, EU)",
            "signup_url": "https://developers.greenhouse.io/job-board.html",
        },
        {
            "id": "adzuna",
            "name": "Adzuna Jobs API",
            "category": "paid_api_key",
            "is_free": False,
            "requires_key": True,
            "is_configured": adzuna_ready,
            "env_vars": ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
            "pricing_usd": "$0 Free Tier (250 calls/day) · Custom commercial plans",
            "pricing_inr": "₹0 मुफ़्त टियर (250 calls/दिन) · पेड कमर्शियल प्लान",
            "free_tier": "250 API calls/day free for India (in), US, UK, SG",
            "coverage": "Direct regional India (IN), UK, US & SG salary-backed roles",
            "signup_url": "https://developer.adzuna.com",
        },
        {
            "id": "jsearch_rapidapi",
            "name": "JSearch (RapidAPI)",
            "category": "paid_api_key",
            "is_free": False,
            "requires_key": True,
            "is_configured": rapidapi_ready,
            "env_vars": ["RAPIDAPI_KEY"],
            "pricing_usd": "$0 Basic (200 req/mo) · $25/mo Pro (10k req) · $75/mo Ultra (50k req)",
            "pricing_inr": "₹0 बेसिक (200/माह) · ~₹2,100/माह Pro · ~₹6,300/माह Ultra",
            "free_tier": "200 requests/month free on RapidAPI Basic",
            "coverage": "Aggregates LinkedIn, Indeed, Glassdoor & ZipRecruiter in 1 call",
            "signup_url": "https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch/pricing",
        },
        {
            "id": "serpapi_jobs",
            "name": "SerpAPI Google Jobs",
            "category": "paid_api_key",
            "is_free": False,
            "requires_key": True,
            "is_configured": serpapi_ready,
            "env_vars": ["SERPAPI_API_KEY"],
            "pricing_usd": "$0 Free (100 searches/mo) · $75/mo Developer (5,000 searches)",
            "pricing_inr": "₹0 मुफ़्त (100/माह) · ~₹6,300/माह Developer (5,000 searches)",
            "free_tier": "100 live Google Jobs searches/month free",
            "coverage": "Exact Google Jobs index for Bengaluru, Hyderabad, Pune & Global",
            "signup_url": "https://serpapi.com/pricing",
        },
        {
            "id": "apify_linkedin",
            "name": "Apify LinkedIn Scraper",
            "category": "paid_api_key",
            "is_free": False,
            "requires_key": True,
            "is_configured": apify_ready,
            "env_vars": ["APIFY_API_TOKEN"],
            "pricing_usd": "$5/mo Free Starter credit · $49/mo Starter (~$0.002/job)",
            "pricing_inr": "~₹420/माह मुफ़्त क्रेडिट · ~₹4,150/माह Starter (~₹0.17/job)",
            "free_tier": "$5/month free platform credit (~1,500–2,000 LinkedIn jobs/mo)",
            "coverage": "Live LinkedIn job listings by exact role, city & seniority",
            "signup_url": "https://apify.com/pricing",
        },
    ]

