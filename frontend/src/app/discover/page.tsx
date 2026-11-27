"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Bookmark,
  Briefcase,
  Check,
  ExternalLink,
  Globe,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { Banner, EmptyState } from "@/components/ui";
import { apiFetch, JobItem, JobSearchResult } from "@/lib/api";
import { parseStructuredJobDescription } from "@/lib/formatJob";
import { useLanguage } from "@/lib/i18n";

const REGION_OPTIONS = [
  { value: "", label: "All Regions", labelHi: "सभी क्षेत्र" },
  { value: "GLOBAL", label: "Global Remote", labelHi: "ग्लोबल रिमोट" },
  { value: "IN", label: "India", labelHi: "भारत" },
  { value: "US", label: "United States", labelHi: "अमेरिका" },
  { value: "EU", label: "Europe", labelHi: "यूरोप" },
  { value: "UK", label: "UK", labelHi: "यूके" },
  { value: "SG", label: "Singapore", labelHi: "सिंगापुर" },
] as const;

const SOURCE_LABELS: Record<string, string> = {
  himalayas: "Himalayas",
  jobicy: "Jobicy",
  remotive: "Remotive",
  remoteok: "RemoteOK",
  arbeitnow: "Arbeitnow",
  hackernews: "HackerNews",
  themuse: "The Muse",
  workingnomads: "Working Nomads",
  greenhouse: "Greenhouse ATS",
  adzuna: "Adzuna",
  jsearch_rapidapi: "JSearch (RapidAPI)",
  serpapi_jobs: "SerpAPI Google Jobs",
  apify_linkedin: "Apify LinkedIn",
  manual: "Custom",
};

type LiveSourceKey =
  | "all_free"
  | "himalayas"
  | "jobicy"
  | "remotive"
  | "remoteok"
  | "arbeitnow"
  | "hackernews"
  | "themuse"
  | "workingnomads"
  | "greenhouse"
  | "adzuna"
  | "jsearch_rapidapi"
  | "serpapi_jobs"
  | "apify_linkedin";

interface JobSourceHealth {
  name: string;
  source_type: string;
  is_enabled: boolean;
  health_status: string;
  consecutive_failures: number;
  last_run_at?: string | null;
  last_success_at?: string | null;
  last_error?: string | null;
}

interface JobSourceCatalogItem {
  id: string;
  name: string;
  category: "free_public" | "paid_api_key";
  is_free: boolean;
  requires_key: boolean;
  is_configured: boolean;
  env_vars: string[];
  pricing_usd: string;
  pricing_inr: string;
  free_tier: string;
  coverage: string;
  signup_url: string;
}

function DiscoverInner() {
  const { tx } = useLanguage();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [mode, setMode] = useState<"hybrid" | "dense" | "bm25">("hybrid");
  const [matchDescriptionOnly, setMatchDescriptionOnly] = useState(false);
  const [useReranker, setUseReranker] = useState(true);
  const [region, setRegion] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [includeGlobal, setIncludeGlobal] = useState(true);
  const [workMode, setWorkMode] = useState("");
  const [jobType, setJobType] = useState("");
  const [minSalaryUsd, setMinSalaryUsd] = useState(0);
  const [sourceFilter, setSourceFilter] = useState("");
  const [sourceHealth, setSourceHealth] = useState<JobSourceHealth[]>([]);
  const [sourceCatalog, setSourceCatalog] = useState<JobSourceCatalogItem[]>([]);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [liveSource, setLiveSource] = useState<LiveSourceKey>("all_free");
  const [results, setResults] = useState<JobSearchResult[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [trackedIds, setTrackedIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [ingestingLive, setIngestingLive] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customCompany, setCustomCompany] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [customSalary, setCustomSalary] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      setLoading(true);
      setError(null);
      try {
        const cleanedQuery = query.trim();
        const res = await apiFetch<{ items: JobSearchResult[]; total: number }>("/api/v1/jobs/search", {
          method: "POST",
          body: JSON.stringify({
            query: cleanedQuery,
            mode: matchDescriptionOnly && cleanedQuery ? "bm25" : mode,
            use_reranker: matchDescriptionOnly ? false : useReranker,
            region: region || null,
            include_global: Boolean(region && region !== "GLOBAL" && includeGlobal),
            work_mode: workMode || null,
            job_type: jobType || null,
            min_salary_usd_eq: minSalaryUsd > 0 ? minSalaryUsd : null,
            location_contains: areaFilter || null,
            description_contains: matchDescriptionOnly && cleanedQuery ? cleanedQuery : null,
            source_name: sourceFilter || null,
            limit: 40,
          }),
        });
        setResults(res.items);
        setTotal(res.total);
        setSelectedJobId((prev) =>
          prev && res.items.some((r) => r.job.id === prev) ? prev : res.items[0]?.job.id || null
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
      }
    },
    [query, mode, matchDescriptionOnly, useReranker, region, areaFilter, includeGlobal, workMode, jobType, minSalaryUsd, sourceFilter]
  );

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, matchDescriptionOnly, useReranker, region, areaFilter, includeGlobal, workMode, jobType, minSalaryUsd, sourceFilter]);

  const openHealthMonitor = async () => {
    setShowHealthModal(true);
    try {
      const [healthRes, catalogRes] = await Promise.all([
        apiFetch<JobSourceHealth[]>("/api/v1/jobs/sources/health").catch(() => []),
        apiFetch<JobSourceCatalogItem[]>("/api/v1/jobs/sources/catalog").catch(() => []),
      ]);
      setSourceHealth(healthRes);
      setSourceCatalog(catalogRes);
    } catch {
      setSourceHealth([]);
      setSourceCatalog([]);
    }
  };

  const handleIngestLive = async () => {
    setIngestingLive(true);
    setMsg(null);
    setError(null);
    try {
      const keywords = query
        .split(/[,|]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3);
      const res = await apiFetch<{
        source: string;
        fetched: number;
        inserted: number;
        updated: number;
        duplicates: number;
        sources_succeeded?: string[];
      }>("/api/v1/jobs/ingest/live", {
        method: "POST",
        body: JSON.stringify({
          source: liveSource,
          keywords: keywords.length > 0 ? keywords : ["Machine Learning Engineer", "AI Engineer"],
          region: region || "IN",
          limit: 24,
        }),
      });
      const sourceNames = (res.sources_succeeded?.length ? res.sources_succeeded : [res.source])
        .map((s) => SOURCE_LABELS[s] || s)
        .join(", ");

      setMsg(
        res.inserted > 0
          ? `Added ${res.inserted} new live ${res.inserted === 1 ? "job" : "jobs"} from ${sourceNames}${
              res.duplicates > 0 ? ` (${res.duplicates} duplicates skipped)` : ""
            }.`
          : `All fetched jobs from ${sourceNames} are already indexed in your workspace.`
      );
      await runSearch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live ingestion failed");
    } finally {
      setIngestingLive(false);
    }
  };

  const handleCreateCustomJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingCustom(true);
    setError(null);
    setMsg(null);
    try {
      const created = await apiFetch<JobItem>("/api/v1/jobs", {
        method: "POST",
        body: JSON.stringify({
          title: customTitle.trim(),
          company: customCompany.trim(),
          location: customLocation.trim() || null,
          region: region || null,
          salary_raw: customSalary.trim() || null,
          application_url: customUrl.trim(),
          description: customDesc.trim(),
          work_mode: workMode || "unspecified",
        }),
      });
      setMsg(`Added private job "${created.title}" at ${created.company}.`);
      setCustomTitle("");
      setCustomCompany("");
      setCustomLocation("");
      setCustomSalary("");
      setCustomUrl("");
      setCustomDesc("");
      setShowCustomForm(false);
      await runSearch();
      setSelectedJobId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create custom job");
    } finally {
      setCreatingCustom(false);
    }
  };

  const handleSave = async (jobId: string) => {
    try {
      await apiFetch("/api/v1/feedback", {
        method: "POST",
        body: JSON.stringify({ job_id: jobId, signal_type: "save", is_implicit: false }),
      });
      setSavedIds((prev) => ({ ...prev, [jobId]: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const handleTrack = async (job: JobItem) => {
    try {
      await apiFetch("/api/v1/applications", {
        method: "POST",
        body: JSON.stringify({ job_id: job.id, notes: "Tracked from Job Discovery" }),
      });
      setTrackedIds((prev) => ({ ...prev, [job.id]: true }));
      setMsg(`Added "${job.title}" to Application Tracker.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to track job");
    }
  };

  const activeResult = results.find((r) => r.job.id === selectedJobId) || results[0] || null;

  return (
    <StudioShell
      title={tx("Job Discovery", "नौकरी खोज")}
      subtitle={tx(
        "Hybrid retrieval across live free sources with master-detail role inspection",
        "लाइव स्रोतों से हाइब्रिड खोज और विस्तृत भूमिका निरीक्षण"
      )}
      fullWidth
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openHealthMonitor}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0f172a] transition hover:border-[#cbd5e1]"
          >
            {tx("API Sources & Pricing", "API स्रोत और कीमतें")}
          </button>
          <button
            type="button"
            onClick={() => setShowCustomForm(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0f172a] transition hover:border-[#cbd5e1]"
          >
            <Plus className="h-3.5 w-3.5 text-[#3b5bff]" /> {tx("Custom Job", "कस्टम नौकरी")}
          </button>
          <div className="flex items-center overflow-hidden rounded-xl border border-[#e2e8f0] bg-white shadow-2xs">
            <select
              value={liveSource}
              onChange={(e) => setLiveSource(e.target.value as LiveSourceKey)}
              className="border-r border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1.5 text-[12px] font-medium text-[#0f172a] outline-none"
            >
              <option value="all_free">{tx("All Free (9x)", "सभी मुफ़्त (9x)")}</option>
              <optgroup label={tx("Free Public APIs (₹0)", "मुफ़्त पब्लिक API (₹0)")}>
                <option value="himalayas">Himalayas</option>
                <option value="jobicy">Jobicy</option>
                <option value="remotive">Remotive</option>
                <option value="remoteok">RemoteOK</option>
                <option value="arbeitnow">Arbeitnow</option>
                <option value="hackernews">HackerNews</option>
                <option value="themuse">The Muse</option>
                <option value="workingnomads">Working Nomads</option>
                <option value="greenhouse">Greenhouse ATS</option>
              </optgroup>
              <optgroup label={tx("Paid / Keyed APIs", "पेड / API-कुंजी स्रोत")}>
                <option value="adzuna">Adzuna (IN/Global)</option>
                <option value="jsearch_rapidapi">JSearch (RapidAPI)</option>
                <option value="serpapi_jobs">SerpAPI Google Jobs</option>
                <option value="apify_linkedin">Apify LinkedIn</option>
              </optgroup>
            </select>
            <button
              onClick={handleIngestLive}
              disabled={ingestingLive}
              className="inline-flex items-center gap-1.5 bg-[#3b5bff] px-3.5 py-1.5 text-[12px] font-medium text-white transition hover:bg-[#2948eb] disabled:opacity-60"
            >
              <Globe className="h-3.5 w-3.5" />
              {ingestingLive ? tx("Syncing...", "सिंक हो रहा है...") : tx("Fetch Live", "लाइव लाएँ")}
            </button>
          </div>
        </div>
      }
    >
      {/* API Sources, Pricing & Health Modal */}
      {showHealthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="atoms-card max-h-[86vh] w-full max-w-3xl overflow-y-auto p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[16px] font-semibold text-[#0f172a]">
                  {tx("Job API Sources, Pricing & Connector Health", "जॉब API स्रोत, कीमतें और कनेक्टर स्थिति")}
                </h2>
                <p className="text-[12px] text-[#64748b]">
                  {tx(
                    "9 completely free live APIs (₹0 forever) + 4 optional paid aggregators with transparent INR/USD tiers",
                    "9 पूरी तरह मुफ़्त लाइव API (₹0 हमेशा) + 4 वैकल्पिक पेड एग्रीगेटर पारदर्शी INR/USD कीमतों के साथ"
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHealthModal(false)}
                className="rounded-lg p-1.5 text-[#64748b] hover:bg-[#f1f5f9]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {sourceCatalog.length > 0 && (
              <div className="mb-5 space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                      {tx("Free Public Job APIs · No API Key Needed", "मुफ़्त पब्लिक जॉब API · कोई API कुंजी नहीं चाहिए")}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-emerald-700">
                      {tx("9x Active · ₹0 / $0", "9x सक्रिय · ₹0 / $0")}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {sourceCatalog
                      .filter((c) => c.is_free)
                      .map((c) => (
                        <div key={c.id} className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3 text-[12px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#0f172a]">{c.name}</span>
                            <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700">
                              ₹0 FREE
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-[#475569]">{c.coverage}</p>
                        </div>
                      ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#3b5bff]">
                      {tx("Paid / Key-Based APIs · Exact Costs & Free Tiers", "पेड / API-कुंजी स्रोत · सटीक कीमत और मुफ़्त टियर")}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {sourceCatalog
                      .filter((c) => !c.is_free)
                      .map((c) => (
                        <div key={c.id} className="rounded-xl border border-[#e2e8f0] bg-white p-3.5 text-[12px]">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[#0f172a]">{c.name}</span>
                              <span
                                className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold ${
                                  c.is_configured ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-[#64748b]"
                                }`}
                              >
                                {c.is_configured ? tx("CONFIGURED", "कॉन्फ़िगर किया गया") : tx("KEY NOT SET", "कुंजी सेट नहीं")}
                              </span>
                            </div>
                            <a
                              href={c.signup_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#3b5bff] hover:underline"
                            >
                              {tx("Pricing", "कीमत देखें")} <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                          <p className="mt-1 text-[11.5px] text-[#475569]">{c.coverage}</p>
                          <div className="mt-2 grid gap-1.5 rounded-lg bg-[#f8fafc] p-2.5 text-[11px] sm:grid-cols-2">
                            <div>
                              <span className="font-semibold text-[#0f172a]">INR: </span>
                              <span className="text-[#334155]">{c.pricing_inr}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-[#0f172a]">USD: </span>
                              <span className="text-[#334155]">{c.pricing_usd}</span>
                            </div>
                          </div>
                          {c.env_vars.length > 0 && (
                            <div className="mt-1.5 font-mono text-[10.5px] text-[#64748b]">
                              .env: {c.env_vars.join(", ")}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">
              {tx("Live Ingestion Run Telemetry", "लाइव डेटा सिंक टेलीमेट्री")}
            </div>
            {sourceHealth.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#cbd5e1] p-5 text-center text-[12.5px] text-[#64748b]">
                {tx(
                  "No connector runs recorded yet. Click Fetch Live above to pull real openings across all 9 free sources.",
                  "अभी कोई कनेक्टर रिकॉर्ड नहीं है। सभी 9 मुफ़्त स्रोतों से लाइव नौकरियाँ लाने के लिए ऊपर 'लाइव लाएँ' दबाएँ।"
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {sourceHealth.map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center justify-between rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3.5 py-2.5 text-[12px]"
                  >
                    <div>
                      <div className="font-semibold text-[#0f172a]">{SOURCE_LABELS[s.name] || s.name}</div>
                      <div className="font-mono text-[10.5px] text-[#64748b]">
                        {s.source_type} · failures: {s.consecutive_failures}
                      </div>
                    </div>
                    <span
                      className={`rounded-md px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase ${
                        s.health_status === "healthy"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {s.health_status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom Job Modal */}
      {showCustomForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <form onSubmit={handleCreateCustomJob} className="atoms-card w-full max-w-xl space-y-3.5 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[15.5px] font-semibold text-[#0f172a]">{tx("Add Custom Private Job", "कस्टम प्राइवेट नौकरी जोड़ें")}</h2>
                <p className="text-[12px] text-[#64748b]">
                  {tx("Saved privately to your workspace and indexed for vector matching", "आपके कार्यक्षेत्र में निजी रूप से सहेजा और मिलान के लिए इंडेक्स किया जाता है")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomForm(false)}
                className="rounded-lg p-1.5 text-[#64748b] hover:bg-[#f1f5f9]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                required
                minLength={2}
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder={tx("Job Title (e.g., Senior AI Engineer)", "नौकरी का शीर्षक (जैसे, Senior AI Engineer)")}
                className="studio-input"
              />
              <input
                required
                value={customCompany}
                onChange={(e) => setCustomCompany(e.target.value)}
                placeholder={tx("Company", "कंपनी")}
                className="studio-input"
              />
              <input
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                placeholder={tx("Location (e.g., Bengaluru / Remote)", "स्थान (जैसे, बेंगलुरु / रिमोट)")}
                className="studio-input"
              />
              <input
                value={customSalary}
                onChange={(e) => setCustomSalary(e.target.value)}
                placeholder={tx("Compensation (e.g., ₹35-45 LPA)", "वेतन (जैसे, ₹35-45 LPA)")}
                className="studio-input"
              />
            </div>
            <input
              required
              type="url"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://company.com/careers/role"
              className="studio-input"
            />
            <textarea
              required
              minLength={20}
              rows={4}
              value={customDesc}
              onChange={(e) => setCustomDesc(e.target.value)}
              placeholder={tx("Paste role responsibilities and required stack (min 20 characters)...", "भूमिका की ज़िम्मेदारियाँ और आवश्यक कौशल पेस्ट करें (कम से कम 20 अक्षर)...")}
              className="studio-input"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCustomForm(false)}
                className="rounded-xl border border-[#e2e8f0] px-4 py-2 text-[12.5px] font-medium text-[#475569] hover:bg-[#f8fafc]"
              >
                {tx("Cancel", "रद्द करें")}
              </button>
              <button
                type="submit"
                disabled={creatingCustom}
                className="rounded-xl bg-[#0f172a] px-4 py-2 text-[12.5px] font-medium text-white hover:bg-[#1e293b] disabled:opacity-60"
              >
                {creatingCustom ? tx("Indexing...", "इंडेक्स हो रहा है...") : tx("Save & Index Job", "सहेजें और इंडेक्स करें")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Professional Search & Area Dropdown Toolbar */}
      <form onSubmit={runSearch} className="atoms-card mb-4 space-y-3.5 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tx("Search titles, companies, skills, or keywords in job descriptions...", "शीर्षक, कंपनी, कौशल या नौकरी विवरण के कीवर्ड से खोजें...")}
              className="studio-input pl-10 pr-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                title={tx("Clear query", "खोज साफ़ करें")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#94a3b8] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="atoms-segmented">
              <button
                type="button"
                data-active={!matchDescriptionOnly && mode === "hybrid"}
                onClick={() => {
                  setMatchDescriptionOnly(false);
                  setMode("hybrid");
                }}
                className="atoms-segmented-btn text-[11.5px]"
              >
                {tx("Smart Hybrid", "स्मार्ट हाइब्रिड")}
              </button>
              <button
                type="button"
                data-active={matchDescriptionOnly}
                onClick={() => {
                  setMatchDescriptionOnly(true);
                  setMode("bm25");
                }}
                className="atoms-segmented-btn text-[11.5px]"
              >
                {tx("Exact in JD", "JD में सटीक")}
              </button>
              <button
                type="button"
                data-active={!matchDescriptionOnly && mode === "dense"}
                onClick={() => {
                  setMatchDescriptionOnly(false);
                  setMode("dense");
                }}
                className="atoms-segmented-btn text-[11.5px]"
              >
                {tx("Semantic", "सिमेंटिक")}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-[#0f172a] px-4 py-2 text-[12.5px] font-medium text-white shadow-2xs transition hover:bg-[#1e293b] disabled:opacity-60"
            >
              {loading ? tx("Searching...", "खोज रहा है...") : tx("Search Jobs", "नौकरी खोजें")}
            </button>
          </div>
        </div>

        {/* Dropdown Filter Grid */}
        <div className="grid gap-2.5 border-t border-[#f1f5f9] pt-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {/* Region Dropdown */}
          <div>
            <label className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-[#64748b]">
              <Globe className="h-3 w-3" /> {tx("Region", "क्षेत्र")}
            </label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="studio-input py-1.5 text-[12px]"
            >
              {REGION_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {tx(opt.label, opt.labelHi)}
                </option>
              ))}
            </select>
          </div>

          {/* Area / City Dropdown */}
          <div>
            <label className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-[#64748b]">
              <MapPin className="h-3 w-3" /> {tx("Area / City", "एरिया / शहर")}
            </label>
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="studio-input py-1.5 text-[12px]"
            >
              <option value="">{tx("All Areas (Anywhere)", "सभी क्षेत्र (कहीं भी)")}</option>
              <optgroup label="Remote">
                <option value="Remote">Remote Only</option>
                <option value="Worldwide">Worldwide</option>
              </optgroup>
              <optgroup label="India Hubs">
                <option value="Bengaluru">Bengaluru / Bangalore</option>
                <option value="Hyderabad">Hyderabad</option>
                <option value="Pune">Pune</option>
                <option value="Mumbai">Mumbai</option>
                <option value="Delhi NCR">Delhi NCR / Gurugram</option>
                <option value="Chennai">Chennai</option>
              </optgroup>
              <optgroup label="Europe & UK">
                <option value="London">London / UK</option>
                <option value="Berlin">Berlin</option>
                <option value="Munich">Munich</option>
                <option value="Amsterdam">Amsterdam</option>
                <option value="Europe">Europe</option>
              </optgroup>
              <optgroup label="Americas & APAC">
                <option value="San Francisco">San Francisco</option>
                <option value="New York">New York</option>
                <option value="USA">United States</option>
                <option value="Canada">Canada</option>
                <option value="Singapore">Singapore</option>
                <option value="Tokyo">Tokyo</option>
              </optgroup>
            </select>
          </div>

          {/* Work Mode Dropdown */}
          <div>
            <label className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-[#64748b]">
              <SlidersHorizontal className="h-3 w-3" /> {tx("Work Mode", "कार्य मोड")}
            </label>
            <select
              value={workMode}
              onChange={(e) => setWorkMode(e.target.value)}
              className="studio-input py-1.5 text-[12px]"
            >
              <option value="">{tx("Any Work Mode", "कोई भी मोड")}</option>
              <option value="remote">{tx("Remote", "रिमोट")}</option>
              <option value="hybrid">{tx("Hybrid", "हाइब्रिड")}</option>
              <option value="onsite">{tx("Onsite", "ऑनसाइट")}</option>
            </select>
          </div>

          {/* Job Type Dropdown */}
          <div>
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-[#64748b]">
              {tx("Job Type", "नौकरी प्रकार")}
            </label>
            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              className="studio-input py-1.5 text-[12px]"
            >
              <option value="">{tx("Any Type", "कोई भी प्रकार")}</option>
              <option value="full-time">{tx("Full-time", "फुल-टाइम")}</option>
              <option value="contract">{tx("Contract", "कॉन्ट्रैक्ट")}</option>
              <option value="internship">{tx("Internship", "इंटर्नशिप")}</option>
            </select>
          </div>

          {/* Min Salary Dropdown */}
          <div>
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-[#64748b]">
              {tx("Min Salary", "न्यूनतम वेतन")}
            </label>
            <select
              value={minSalaryUsd}
              onChange={(e) => setMinSalaryUsd(Number(e.target.value))}
              className="studio-input py-1.5 text-[12px]"
            >
              <option value={0}>{tx("Any Salary", "कोई भी वेतन")}</option>
              <option value={60000}>$60k+ Eq</option>
              <option value={100000}>$100k+ Eq</option>
              <option value={150000}>$150k+ Eq</option>
            </select>
          </div>

          {/* Source Dropdown */}
          <div>
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-[#64748b]">
              {tx("Live Source", "लाइव स्रोत")}
            </label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="studio-input py-1.5 text-[12px]"
            >
              <option value="">{tx("All Live Sources", "सभी लाइव स्रोत")}</option>
              <optgroup label={tx("Free Public APIs", "मुफ़्त पब्लिक API")}>
                <option value="himalayas">Himalayas</option>
                <option value="jobicy">Jobicy</option>
                <option value="remotive">Remotive</option>
                <option value="remoteok">RemoteOK</option>
                <option value="arbeitnow">Arbeitnow</option>
                <option value="hackernews">HackerNews</option>
                <option value="themuse">The Muse</option>
                <option value="workingnomads">Working Nomads</option>
                <option value="greenhouse">Greenhouse ATS</option>
              </optgroup>
              <optgroup label={tx("Paid / Keyed APIs", "पेड / API-कुंजी स्रोत")}>
                <option value="adzuna">Adzuna</option>
                <option value="jsearch_rapidapi">JSearch (RapidAPI)</option>
                <option value="serpapi_jobs">SerpAPI Google Jobs</option>
                <option value="apify_linkedin">Apify LinkedIn</option>
              </optgroup>
              <option value="manual">{tx("Custom Jobs", "कस्टम नौकरियाँ")}</option>
            </select>
          </div>
        </div>

        {(region && region !== "GLOBAL") || !matchDescriptionOnly ? (
          <div className="flex flex-wrap items-center gap-5 pt-1 text-[11.5px] text-[#475569]">
            {region && region !== "GLOBAL" && (
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={includeGlobal}
                  onChange={(e) => setIncludeGlobal(e.target.checked)}
                  className="accent-[#3b5bff]"
                />
                {tx(`Include Global Remote openings alongside ${region}`, `${region} के साथ ग्लोबल रिमोट नौकरियाँ भी शामिल करें`)}
              </label>
            )}
            {!matchDescriptionOnly && (
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={useReranker}
                  onChange={(e) => setUseReranker(e.target.checked)}
                  className="accent-[#3b5bff]"
                />
                {tx("Enable Cross-Encoder Neural Reranking", "क्रॉस-एनकोडर न्यूरल रीरैंकिंग चालू करें")}
              </label>
            )}
          </div>
        ) : null}
      </form>

      {msg && <Banner tone="success" message={msg} onClose={() => setMsg(null)} className="mb-4" />}
      {error && <Banner tone="error" message={error} onClose={() => setError(null)} className="mb-4" />}

      <div className="mb-3 flex items-center justify-between text-[12px] text-[#64748b]">
        <span>
          {tx("Showing", "दिखाए जा रहे हैं")} <strong className="tnum text-[#0f172a]">{results.length}</strong>{" "}
          {tx("of", "/")} <strong className="tnum text-[#0f172a]">{total}</strong>{" "}
          {tx("live opportunities", "लाइव अवसर")}
        </span>
        {(query || region || areaFilter || workMode || jobType || minSalaryUsd > 0 || sourceFilter || matchDescriptionOnly) && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setMatchDescriptionOnly(false);
              setRegion("");
              setAreaFilter("");
              setWorkMode("");
              setJobType("");
              setMinSalaryUsd(0);
              setSourceFilter("");
            }}
            className="font-medium text-[#3b5bff] hover:underline"
          >
            {tx("Reset all filters", "सभी फ़िल्टर रीसेट करें")}
          </button>
        )}
      </div>

      {/* Master-Detail Split Grid */}
      {loading && results.length === 0 ? (
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-7">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="skeleton h-28 w-full" />
            ))}
          </div>
          <div className="skeleton hidden h-96 lg:col-span-5 lg:block" />
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          icon={Search}
          title={tx("No matching jobs found", "कोई मिलती-जुलती नौकरी नहीं मिली")}
          description={tx(
            "Try broadening your keywords, enabling Global Remote, or clicking Fetch Live to ingest fresh openings.",
            "अपने कीवर्ड बदलें, ग्लोबल रिमोट चालू करें या नई नौकरियाँ लाने के लिए 'लाइव लाएँ' दबाएँ।"
          )}
          actionLabel={tx("Fetch Live Jobs", "लाइव नौकरियाँ लाएँ")}
          onAction={handleIngestLive}
        />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-12">
          {/* Left Master List (7 cols) */}
          <div className="space-y-2.5 lg:col-span-7">
            {results.map((r) => {
              const selected = activeResult?.job.id === r.job.id;
              const isSaved = Boolean(savedIds[r.job.id]);
              const sourceLabel = SOURCE_LABELS[r.job.source_name] || r.job.source_name;
              return (
                <div
                  key={r.job.id}
                  onClick={() => setSelectedJobId(r.job.id)}
                  className={`atoms-card cursor-pointer p-4 transition-all ${
                    selected
                      ? "border-[#3b5bff] bg-white ring-2 ring-[#3b5bff]/15"
                      : "atoms-card-hover bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[14.5px] font-semibold text-[#0f172a]">{r.job.title}</span>
                        <span className="rounded-md bg-[#f1f5f9] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#475569]">
                          {r.job.region || "GLOBAL"}
                        </span>
                        <span className="rounded-md bg-[#3b5bff]/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#3b5bff]">
                          {sourceLabel}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-[#64748b]">
                        <span className="font-medium text-[#334155]">{r.job.company}</span>
                        <span>·</span>
                        <span>{r.job.location || "Remote"}</span>
                        {r.job.salary_raw && (
                          <>
                            <span>·</span>
                            <span className="font-mono text-[11.5px] font-medium text-emerald-700">{r.job.salary_raw}</span>
                          </>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-[#64748b]">
                        {parseStructuredJobDescription(r.job.description, r.job.title).cleanFullText}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="tnum rounded-lg bg-[#f8fafc] px-2 py-1 font-mono text-[11px] font-semibold text-[#3b5bff] ring-1 ring-[#e2e8f0]">
                        {r.final_score.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSave(r.job.id);
                        }}
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                          isSaved
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                            : "text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                        }`}
                      >
                        {isSaved ? <Check className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
                        {isSaved ? tx("Saved", "सहेजा गया") : tx("Save", "सहेजें")}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Sticky Inspector Pane (5 cols) */}
          {activeResult && (
            <div className="atoms-card sticky top-20 p-5 lg:col-span-5">
              <div className="flex items-start justify-between gap-3 border-b border-[#f1f5f9] pb-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-[#3b5bff]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#3b5bff]">
                      {SOURCE_LABELS[activeResult.job.source_name] || activeResult.job.source_name}
                    </span>
                    <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 font-mono text-[10px] text-[#475569]">
                      {activeResult.job.work_mode}
                    </span>
                    <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 font-mono text-[10px] text-[#475569]">
                      {activeResult.job.region || "GLOBAL"}
                    </span>
                  </div>
                  <h2 className="mt-2 text-[17px] font-semibold leading-snug text-[#0f172a]">{activeResult.job.title}</h2>
                  <div className="mt-0.5 text-[13px] text-[#475569]">
                    <span className="font-medium text-[#0f172a]">{activeResult.job.company}</span> ·{" "}
                    {activeResult.job.location || "Remote"}
                  </div>
                  {activeResult.job.salary_raw && (
                    <div className="mt-2 inline-block rounded-lg bg-emerald-50 px-2.5 py-1 font-mono text-[12px] font-semibold text-emerald-700">
                      {activeResult.job.salary_raw}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Row */}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/jobs/${activeResult.job.id}`}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#3b5bff] px-3.5 py-2 text-[12.5px] font-medium text-white shadow-xs transition hover:bg-[#2948eb]"
                >
                  <Sparkles className="h-3.5 w-3.5" /> {tx("Full Match & AI Explain", "पूर्ण मिलान और AI व्याख्या")}
                </Link>
                <button
                  type="button"
                  onClick={() => handleTrack(activeResult.job)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-[12.5px] font-medium text-[#0f172a] hover:bg-[#f8fafc]"
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  {trackedIds[activeResult.job.id] ? tx("Tracked", "ट्रैक किया गया") : tx("Track", "ट्रैक करें")}
                </button>
                {activeResult.job.application_url && (
                  <a
                    href={activeResult.job.application_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-[12.5px] font-medium text-[#475569] hover:text-[#0f172a]"
                  >
                    {tx("Apply", "आवेदन")} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>

              {/* Retrieval Score Telemetry */}
              <div className="mt-4 grid grid-cols-4 gap-2 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3 text-center font-mono text-[10.5px]">
                <div>
                  <div className="text-[#64748b]">DENSE</div>
                  <div className="tnum mt-0.5 font-semibold text-[#0f172a]">{activeResult.dense_score.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[#64748b]">BM25</div>
                  <div className="tnum mt-0.5 font-semibold text-[#0f172a]">{activeResult.bm25_score.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[#64748b]">RRF</div>
                  <div className="tnum mt-0.5 font-semibold text-[#0f172a]">{activeResult.rrf_score.toFixed(3)}</div>
                </div>
                <div>
                  <div className="text-[#64748b]">FINAL</div>
                  <div className="tnum mt-0.5 font-semibold text-[#3b5bff]">{activeResult.final_score.toFixed(2)}</div>
                </div>
              </div>

              {/* Scrollable Structured Preview */}
              <div className="thin-scroll mt-4 max-h-[360px] space-y-3 overflow-y-auto pr-1">
                {(() => {
                  const parsed = parseStructuredJobDescription(activeResult.job.description, activeResult.job.title);
                  return (
                    <>
                      {parsed.facts.length > 0 && (
                        <div className="grid grid-cols-2 gap-1.5">
                          {parsed.facts.slice(0, 4).map((f) => (
                            <div key={f.label} className="rounded-lg bg-[#f8fafc] px-2.5 py-1.5 text-[11px]">
                              <span className="font-semibold text-[#64748b]">{f.label}: </span>
                              <span className="text-[#0f172a]">{f.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {parsed.sections.slice(0, 3).map((sec, si) => (
                        <div key={`${sec.title}-${si}`} className="space-y-1.5">
                          <div className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#3b5bff]">
                            {sec.title}
                          </div>
                          {sec.paragraphs.slice(0, 2).map((p, pi) => (
                            <p key={pi} className="text-[12.5px] leading-relaxed text-[#334155]">
                              {p}
                            </p>
                          ))}
                          {sec.bullets.slice(0, 3).map((b, bi) => (
                            <div key={bi} className="flex items-start gap-2 text-[12px] text-[#334155]">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3b5bff]" />
                              <span>{b}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </StudioShell>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[#64748b]">Loading discovery...</div>}>
      <DiscoverInner />
    </Suspense>
  );
}
