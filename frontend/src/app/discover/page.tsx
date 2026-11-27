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

const REGION_OPTIONS = [
  { value: "", label: "All Regions" },
  { value: "GLOBAL", label: "Global Remote" },
  { value: "IN", label: "India" },
  { value: "US", label: "United States" },
  { value: "EU", label: "Europe" },
  { value: "UK", label: "UK" },
  { value: "SG", label: "Singapore" },
] as const;

const SOURCE_LABELS: Record<string, string> = {
  himalayas: "Himalayas",
  jobicy: "Jobicy",
  remotive: "Remotive",
  remoteok: "RemoteOK",
  arbeitnow: "Arbeitnow",
  hackernews: "HackerNews",
  apify_linkedin: "Apify LinkedIn",
  adzuna: "Adzuna",
  manual: "Custom",
};

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

function DiscoverInner() {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "Machine Learning Engineer AI Python");
  const [mode, setMode] = useState<"hybrid" | "dense" | "bm25">("hybrid");
  const [useReranker, setUseReranker] = useState(true);
  const [region, setRegion] = useState("");
  const [includeGlobal, setIncludeGlobal] = useState(true);
  const [workMode, setWorkMode] = useState("");
  const [jobType, setJobType] = useState("");
  const [minSalaryUsd, setMinSalaryUsd] = useState(0);
  const [sourceFilter, setSourceFilter] = useState("");
  const [sourceHealth, setSourceHealth] = useState<JobSourceHealth[]>([]);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [liveSource, setLiveSource] = useState<
    "all_free" | "himalayas" | "jobicy" | "remotive" | "remoteok" | "arbeitnow" | "hackernews" | "apify_linkedin"
  >("all_free");
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
        const res = await apiFetch<{ items: JobSearchResult[]; total: number }>("/api/v1/jobs/search", {
          method: "POST",
          body: JSON.stringify({
            query: query.trim() || "engineer",
            mode,
            use_reranker: useReranker,
            region: region || null,
            include_global: Boolean(region && region !== "GLOBAL" && includeGlobal),
            work_mode: workMode || null,
            job_type: jobType || null,
            min_salary_usd_eq: minSalaryUsd > 0 ? minSalaryUsd : null,
            source_name: sourceFilter || null,
            limit: 30,
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
    [query, mode, useReranker, region, includeGlobal, workMode, jobType, minSalaryUsd, sourceFilter]
  );

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, useReranker, region, includeGlobal, workMode, jobType, minSalaryUsd, sourceFilter]);

  const openHealthMonitor = async () => {
    setShowHealthModal(true);
    try {
      const res = await apiFetch<JobSourceHealth[]>("/api/v1/jobs/sources/health");
      setSourceHealth(res);
    } catch {
      setSourceHealth([]);
    }
  };

  const handleLoadDemoJobs = async () => {
    setIngestingLive(true);
    setError(null);
    try {
      const res = await apiFetch<{ inserted?: number }>("/api/v1/jobs/ingest/demo", { method: "POST" });
      setMsg(`Loaded curated workspace roles (${res.inserted ?? 0} added).`);
      await runSearch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load demo jobs");
    } finally {
      setIngestingLive(false);
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
      title="Job Discovery"
      subtitle="Hybrid retrieval across live free sources with master-detail role inspection"
      fullWidth
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openHealthMonitor}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0f172a] transition hover:border-[#cbd5e1]"
          >
            Source Health
          </button>
          <button
            type="button"
            onClick={() => setShowCustomForm(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0f172a] transition hover:border-[#cbd5e1]"
          >
            <Plus className="h-3.5 w-3.5 text-[#3b5bff]" /> Custom Job
          </button>
          <div className="flex items-center overflow-hidden rounded-xl border border-[#e2e8f0] bg-white shadow-2xs">
            <select
              value={liveSource}
              onChange={(e) =>
                setLiveSource(
                  e.target.value as
                    | "all_free"
                    | "himalayas"
                    | "jobicy"
                    | "remotive"
                    | "remoteok"
                    | "arbeitnow"
                    | "hackernews"
                    | "apify_linkedin"
                )
              }
              className="border-r border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1.5 text-[12px] font-medium text-[#0f172a] outline-none"
            >
              <option value="all_free">All Free (6x)</option>
              <option value="himalayas">Himalayas</option>
              <option value="jobicy">Jobicy</option>
              <option value="remotive">Remotive</option>
              <option value="remoteok">RemoteOK</option>
              <option value="arbeitnow">Arbeitnow</option>
              <option value="hackernews">HackerNews</option>
              <option value="apify_linkedin">Apify LinkedIn</option>
            </select>
            <button
              onClick={handleIngestLive}
              disabled={ingestingLive}
              className="inline-flex items-center gap-1.5 bg-[#3b5bff] px-3.5 py-1.5 text-[12px] font-medium text-white transition hover:bg-[#2948eb] disabled:opacity-60"
            >
              <Globe className="h-3.5 w-3.5" />
              {ingestingLive ? "Syncing..." : "Fetch Live"}
            </button>
          </div>
        </div>
      }
    >
      {/* Connector Health Modal */}
      {showHealthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="atoms-card w-full max-w-lg p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[15.5px] font-semibold text-[#0f172a]">Job Connector Health</h2>
                <p className="text-[12px] text-[#64748b]">Live telemetry across ingestion adapters</p>
              </div>
              <button
                type="button"
                onClick={() => setShowHealthModal(false)}
                className="rounded-lg p-1.5 text-[#64748b] hover:bg-[#f1f5f9]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {sourceHealth.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#cbd5e1] p-6 text-center text-[12.5px] text-[#64748b]">
                No connector runs recorded yet. Click <strong>Fetch Live</strong> or{" "}
                <button type="button" onClick={handleLoadDemoJobs} className="font-semibold text-[#3b5bff] underline">
                  Load Demo Roles
                </button>{" "}
                to initialize connectors.
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
                <h2 className="text-[15.5px] font-semibold text-[#0f172a]">Add Custom Private Job</h2>
                <p className="text-[12px] text-[#64748b]">Saved privately to your workspace and indexed for vector matching</p>
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
                placeholder="Job Title (e.g., Senior AI Engineer)"
                className="studio-input"
              />
              <input
                required
                value={customCompany}
                onChange={(e) => setCustomCompany(e.target.value)}
                placeholder="Company"
                className="studio-input"
              />
              <input
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                placeholder="Location (e.g., Bengaluru / Remote)"
                className="studio-input"
              />
              <input
                value={customSalary}
                onChange={(e) => setCustomSalary(e.target.value)}
                placeholder="Compensation (e.g., ₹35-45 LPA)"
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
              placeholder="Paste role responsibilities and required stack (min 20 characters)..."
              className="studio-input"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCustomForm(false)}
                className="rounded-xl border border-[#e2e8f0] px-4 py-2 text-[12.5px] font-medium text-[#475569] hover:bg-[#f8fafc]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingCustom}
                className="rounded-xl bg-[#0f172a] px-4 py-2 text-[12.5px] font-medium text-white hover:bg-[#1e293b] disabled:opacity-60"
              >
                {creatingCustom ? "Indexing..." : "Save & Index Job"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Compact Unified Search Bar */}
      <form onSubmit={runSearch} className="atoms-card mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-[#64748b]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, skills, or domains (e.g., PyTorch, FastAPI, ML Engineer)..."
              className="studio-input pl-10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="atoms-segmented">
              {(["hybrid", "dense", "bm25"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  data-active={mode === m}
                  onClick={() => setMode(m)}
                  className="atoms-segmented-btn font-mono text-[11px] uppercase"
                >
                  {m}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-[#0f172a] px-4 py-2 text-[12.5px] font-medium text-white transition hover:bg-[#1e293b] disabled:opacity-60"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {/* Single Clean Filter Row */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#f1f5f9] pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-[#64748b]">
              <MapPin className="h-3.5 w-3.5" />
            </span>
            {REGION_OPTIONS.map((opt) => {
              const active = region === opt.value;
              return (
                <button
                  key={opt.value || "all"}
                  type="button"
                  onClick={() => setRegion(opt.value)}
                  className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition ${
                    active
                      ? "bg-[#3b5bff] text-white shadow-2xs"
                      : "bg-[#f8fafc] text-[#475569] ring-1 ring-[#e2e8f0] hover:text-[#0f172a]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
            {region && region !== "GLOBAL" && (
              <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-[11.5px] text-[#475569]">
                <input
                  type="checkbox"
                  checked={includeGlobal}
                  onChange={(e) => setIncludeGlobal(e.target.checked)}
                  className="accent-[#3b5bff]"
                />
                + Global Remote
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-[#64748b]" />
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-[11.5px] text-[#475569]">
              <input
                type="checkbox"
                checked={useReranker}
                onChange={(e) => setUseReranker(e.target.checked)}
                className="accent-[#3b5bff]"
              />
              Reranker
            </label>
            <select
              value={workMode}
              onChange={(e) => setWorkMode(e.target.value)}
              className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-[11.5px] text-[#0f172a] outline-none"
            >
              <option value="">Any Work Mode</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">Onsite</option>
            </select>
            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-[11.5px] text-[#0f172a] outline-none"
            >
              <option value="">Any Type</option>
              <option value="full-time">Full-time</option>
              <option value="contract">Contract</option>
              <option value="internship">Internship</option>
            </select>
            <select
              value={minSalaryUsd}
              onChange={(e) => setMinSalaryUsd(Number(e.target.value))}
              className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-[11.5px] text-[#0f172a] outline-none"
            >
              <option value={0}>Any Salary</option>
              <option value={60000}>$60k+ Eq</option>
              <option value={100000}>$100k+ Eq</option>
              <option value={150000}>$150k+ Eq</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-[11.5px] text-[#0f172a] outline-none"
            >
              <option value="">All Sources</option>
              <option value="himalayas">Himalayas</option>
              <option value="jobicy">Jobicy</option>
              <option value="remotive">Remotive</option>
              <option value="remoteok">RemoteOK</option>
              <option value="arbeitnow">Arbeitnow</option>
              <option value="hackernews">HackerNews</option>
              <option value="manual">Custom Jobs</option>
            </select>
          </div>
        </div>
      </form>

      {msg && <Banner tone="success" message={msg} onClose={() => setMsg(null)} className="mb-4" />}
      {error && <Banner tone="error" message={error} onClose={() => setError(null)} className="mb-4" />}

      <div className="mb-3 flex items-center justify-between text-[12px] text-[#64748b]">
        <span>
          Showing <strong className="tnum text-[#0f172a]">{results.length}</strong> of{" "}
          <strong className="tnum text-[#0f172a]">{total}</strong> opportunities
        </span>
        {(region || workMode || jobType || minSalaryUsd > 0 || sourceFilter) && (
          <button
            type="button"
            onClick={() => {
              setRegion("");
              setWorkMode("");
              setJobType("");
              setMinSalaryUsd(0);
              setSourceFilter("");
            }}
            className="font-medium text-[#3b5bff] hover:underline"
          >
            Reset active filters
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
          title="No matching jobs found"
          description="Try broadening your keywords, enabling Global Remote, or clicking Fetch Live to ingest fresh openings."
          actionLabel="Fetch Live Jobs"
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
                      <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-[#64748b]">{r.job.description}</p>
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
                        {isSaved ? "Saved" : "Save"}
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
                  <Sparkles className="h-3.5 w-3.5" /> Full Match &amp; AI Explain
                </Link>
                <button
                  type="button"
                  onClick={() => handleTrack(activeResult.job)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-[12.5px] font-medium text-[#0f172a] hover:bg-[#f8fafc]"
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  {trackedIds[activeResult.job.id] ? "Tracked" : "Track"}
                </button>
                {activeResult.job.application_url && (
                  <a
                    href={activeResult.job.application_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-[12.5px] font-medium text-[#475569] hover:text-[#0f172a]"
                  >
                    Apply <ExternalLink className="h-3.5 w-3.5" />
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

              {/* Scrollable Description Preview */}
              <div className="thin-scroll mt-4 max-h-[340px] overflow-y-auto pr-1">
                <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[#64748b]">
                  Role Description
                </h3>
                <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#334155]">
                  {activeResult.job.description}
                </p>
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
