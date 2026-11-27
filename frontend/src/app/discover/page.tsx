"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Globe,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { apiFetch, JobSearchResult } from "@/lib/api";

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
};

function DiscoverInner() {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "Machine Learning Engineer AI Python");
  const [mode, setMode] = useState<"hybrid" | "dense" | "bm25">("hybrid");
  const [useReranker, setUseReranker] = useState(true);
  const [region, setRegion] = useState("");
  const [includeGlobal, setIncludeGlobal] = useState(true);
  const [workMode, setWorkMode] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [liveSource, setLiveSource] = useState<
    "all_free" | "himalayas" | "jobicy" | "remotive" | "remoteok" | "arbeitnow" | "hackernews" | "apify_linkedin"
  >("all_free");
  const [results, setResults] = useState<JobSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [ingestingLive, setIngestingLive] = useState(false);
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
            source_name: sourceFilter || null,
            limit: 30,
          }),
        });
        setResults(res.items);
        setTotal(res.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
      }
    },
    [query, mode, useReranker, region, includeGlobal, workMode, sourceFilter]
  );

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, useReranker, region, includeGlobal, workMode, sourceFilter]);

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

      if (res.inserted > 0) {
        setMsg(
          `Added ${res.inserted} new live ${res.inserted === 1 ? "job" : "jobs"} from ${sourceNames}` +
            (res.duplicates > 0 ? ` (${res.duplicates} already in workspace)` : "") +
            "."
        );
      } else {
        setMsg(`All fetched jobs from ${sourceNames} are already up to date in your workspace.`);
      }
      await runSearch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live ingestion failed");
    } finally {
      setIngestingLive(false);
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

  return (
    <StudioShell
      title="Job Discovery"
      subtitle="Live multi-region search with dense embeddings, BM25, RRF fusion, and Cross-Encoder reranking"
      actions={
        <div className="flex flex-wrap items-center gap-2">
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
            className="rounded-lg border border-black/10 bg-[#fafafa] px-2.5 py-1.5 text-[12px] font-medium text-[#171716]"
          >
            <option value="all_free">All Free Sources (6x)</option>
            <option value="himalayas">Himalayas (India + Global)</option>
            <option value="jobicy">Jobicy (India + Global)</option>
            <option value="remotive">Remotive</option>
            <option value="remoteok">RemoteOK</option>
            <option value="arbeitnow">Arbeitnow</option>
            <option value="hackernews">HackerNews</option>
            <option value="apify_linkedin">Apify LinkedIn</option>
          </select>
          <button
            onClick={handleIngestLive}
            disabled={ingestingLive}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#4267ff] px-3.5 py-1.5 text-[12px] font-medium text-white shadow-xs transition hover:bg-[#3456e8] disabled:opacity-60"
          >
            <Globe className="h-3.5 w-3.5" />
            {ingestingLive ? "Syncing Live Jobs..." : "Fetch Live Jobs"}
          </button>
        </div>
      }
    >
      {/* Search & Filter Studio Card */}
      <form onSubmit={runSearch} className="atoms-card p-5">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-[#71717a]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, skills, or domains (e.g., PyTorch, FastAPI, ML Engineer)..."
              className="w-full rounded-xl border border-black/10 bg-[#fafafa] py-2 pl-10 pr-4 text-[13px] outline-none transition focus:border-[#4267ff] focus:bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-[#171716] px-5 py-2 text-[13px] font-medium text-white transition hover:bg-[#272726] disabled:opacity-60"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {/* Region Pills */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] pt-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-[#71717a]">
              <MapPin className="h-3.5 w-3.5" /> Region:
            </span>
            {REGION_OPTIONS.map((opt) => {
              const active = region === opt.value;
              return (
                <button
                  key={opt.value || "all"}
                  type="button"
                  onClick={() => setRegion(opt.value)}
                  className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition ${
                    active
                      ? "bg-[#171716] text-white"
                      : "border border-black/[0.08] bg-[#fafafa] text-[#52525b] hover:border-black/20 hover:text-[#171716]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {region && region !== "GLOBAL" && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-[#52525b]">
              <input
                type="checkbox"
                checked={includeGlobal}
                onChange={(e) => setIncludeGlobal(e.target.checked)}
                className="accent-[#4267ff]"
              />
              Include Global Remote roles
            </label>
          )}
        </div>

        {/* Retrieval Mode & Secondary Filters */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] pt-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="atoms-segmented">
              {(["hybrid", "dense", "bm25"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  data-active={mode === m}
                  onClick={() => setMode(m)}
                  className="atoms-segmented-btn uppercase font-mono text-[11px]"
                >
                  {m}
                </button>
              ))}
            </div>

            <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-[#52525b]">
              <input
                type="checkbox"
                checked={useReranker}
                onChange={(e) => setUseReranker(e.target.checked)}
                className="accent-[#4267ff]"
              />
              Cross-Encoder Rerank
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-[#71717a]" />
            <select
              value={workMode}
              onChange={(e) => setWorkMode(e.target.value)}
              className="rounded-lg border border-black/10 bg-[#fafafa] px-2.5 py-1 text-[12px] text-[#171716]"
            >
              <option value="">Any Work Mode</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">Onsite</option>
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="rounded-lg border border-black/10 bg-[#fafafa] px-2.5 py-1 text-[12px] text-[#171716]"
            >
              <option value="">All Sources</option>
              <option value="himalayas">Himalayas</option>
              <option value="jobicy">Jobicy</option>
              <option value="remotive">Remotive</option>
              <option value="remoteok">RemoteOK</option>
              <option value="arbeitnow">Arbeitnow</option>
              <option value="hackernews">HackerNews</option>
            </select>
          </div>
        </div>
      </form>

      {msg && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[12.5px] text-emerald-800">
          <span>{msg}</span>
          <button
            type="button"
            onClick={() => setMsg(null)}
            className="rounded p-0.5 text-emerald-700 hover:bg-emerald-100"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12.5px] text-red-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="rounded p-0.5 text-red-700 hover:bg-red-100"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#71717a]">
        <span>
          Showing <strong className="text-[#171716]">{results.length}</strong> of{" "}
          <strong className="text-[#171716]">{total}</strong> live opportunities
        </span>
        {region && (
          <button
            type="button"
            onClick={() => {
              setRegion("");
              setWorkMode("");
              setSourceFilter("");
            }}
            className="font-medium text-[#4267ff] hover:underline"
          >
            Reset filters
          </button>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {results.length === 0 && !loading ? (
          <div className="atoms-card p-10 text-center text-[13px] text-[#71717a]">
            No matching live jobs found for these filters.
            {region ? " Try enabling Include Global Remote or clicking Reset filters, " : " "}
            or click <strong>Fetch Live Jobs</strong> above to pull fresh openings.
          </div>
        ) : (
          results.map((r) => {
            const isSaved = Boolean(savedIds[r.job.id]);
            const sourceLabel = SOURCE_LABELS[r.job.source_name] || r.job.source_name;
            return (
              <div key={r.job.id} className="atoms-card atoms-card-hover p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/jobs/${r.job.id}`}
                        className="text-[15px] font-semibold text-[#171716] transition hover:text-[#4267ff]"
                      >
                        {r.job.title}
                      </Link>
                      <span className="rounded-md bg-black/[0.05] px-2 py-0.5 font-mono text-[10px] font-medium text-[#171716]">
                        {r.job.region || "GLOBAL"}
                      </span>
                      {r.job.work_mode && r.job.work_mode !== "unspecified" && (
                        <span className="rounded-md bg-[#4267ff]/10 px-2 py-0.5 font-mono text-[10px] font-medium text-[#4267ff]">
                          {r.job.work_mode}
                        </span>
                      )}
                      <span className="rounded-md border border-black/[0.07] bg-[#fafafa] px-2 py-0.5 font-mono text-[10px] text-[#71717a]">
                        {sourceLabel}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[#52525b]">
                      <span className="font-medium text-[#171716]">{r.job.company}</span>
                      <span>·</span>
                      <span>{r.job.location || "Remote"}</span>
                      {r.job.salary_raw && (
                        <>
                          <span>·</span>
                          <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-700">
                            {r.job.salary_raw}
                          </span>
                        </>
                      )}
                    </div>

                    <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-[#71717a]">
                      {r.job.description}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end">
                    <div className="rounded-lg border border-black/[0.08] bg-[#fafafa] px-2.5 py-1 font-mono text-[11px] text-[#52525b]">
                      match <strong className="text-[#4267ff]">{r.final_score.toFixed(2)}</strong>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSave(r.job.id)}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition ${
                          isSaved
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-black/10 bg-white text-[#171716] hover:border-black/25"
                        }`}
                      >
                        {isSaved ? <Check className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
                        {isSaved ? "Saved" : "Save"}
                      </button>
                      <Link
                        href={`/jobs/${r.job.id}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#171716] px-2.5 py-1.5 text-[11.5px] font-medium text-white transition hover:bg-[#272726]"
                      >
                        Inspect <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 border-t border-black/[0.05] pt-2.5 font-mono text-[10px] text-[#71717a]">
                  <span>dense {r.dense_score.toFixed(2)}</span>
                  <span>bm25 {r.bm25_score.toFixed(2)}</span>
                  <span>rrf {r.rrf_score.toFixed(3)}</span>
                  {r.rerank_score !== null && r.rerank_score !== undefined && (
                    <span>rerank {r.rerank_score.toFixed(2)}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </StudioShell>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[#71717a]">Loading discovery...</div>}>
      <DiscoverInner />
    </Suspense>
  );
}
