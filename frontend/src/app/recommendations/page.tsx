"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bookmark, Briefcase, RefreshCw, Search, Sparkles, Target, ThumbsDown } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { Banner, EmptyState, StatTile } from "@/components/ui";
import { apiFetch, RecommendationItem } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

export default function RecommendationsPage() {
  const { tx } = useLanguage();
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [textFilter, setTextFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [minFit, setMinFit] = useState(0);
  const [sortBy, setSortBy] = useState<"compatibility" | "ltr">("compatibility");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRecommendations = async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ items: RecommendationItem[]; total: number }>(
        `/api/v1/recommendations?refresh=${refresh ? "true" : "false"}&limit=40`
      );
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ML recommendations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecommendations(true);
  }, []);

  const sendSignal = async (jobId: string, signal_type: "shortlist" | "dismiss") => {
    setError(null);
    try {
      await apiFetch("/api/v1/feedback", {
        method: "POST",
        body: JSON.stringify({ job_id: jobId, signal_type, is_implicit: false }),
      });
      setMsg(
        signal_type === "shortlist"
          ? tx("Shortlisted job and recorded explicit ranking feedback.", "नौकरी शॉर्टलिस्ट की गई और रैंकिंग फ़ीडबैक सहेजा गया।")
          : tx("Dismissed job from recommendations.", "सिफ़ारिशों से नौकरी हटाई गई।")
      );
      if (signal_type === "dismiss") {
        setItems((prev) => prev.filter((r) => r.job.id !== jobId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record feedback");
    }
  };

  const trackDraft = async (jobId: string, title: string) => {
    setError(null);
    try {
      await apiFetch("/api/v1/applications", {
        method: "POST",
        body: JSON.stringify({ job_id: jobId, notes: "Drafted from ML Recommendations" }),
      });
      setMsg(`Created application draft for "${title}" in Pipeline Tracker.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create draft");
    }
  };

  const visibleItems = useMemo(() => {
    const q = textFilter.trim().toLowerCase();
    return items
      .filter((r) => {
        if (regionFilter && (r.job.region || "GLOBAL") !== regionFilter) return false;
        if (Math.round(r.compatibility_probability * 100) < minFit) return false;
        if (q) {
          const hay = `${r.job.title} ${r.job.company} ${r.strong_matching_skills.join(" ")}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) =>
        sortBy === "compatibility"
          ? b.compatibility_probability - a.compatibility_probability
          : b.ranking_score - a.ranking_score
      );
  }, [items, textFilter, regionFilter, minFit, sortBy]);

  const avgFit =
    items.length > 0
      ? Math.round((items.reduce((acc, r) => acc + r.compatibility_probability, 0) / items.length) * 100)
      : 0;
  const strongCount = items.filter((r) => r.compatibility_probability >= 0.7).length;

  return (
    <StudioShell
      title={tx("ML Matches", "ML मैच")}
      subtitle={tx(
        "Calibrated compatibility probabilities, pairwise Learning-to-Rank scores, and skill-overlap proof",
        "कैलिब्रेटेड संगतता स्कोर, पेयरवाइज़ LTR रैंकिंग और कौशल मिलान प्रमाण"
      )}
      actions={
        <button
          onClick={() => loadRecommendations(true)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0f172a] px-3.5 py-1.5 text-[12.5px] font-medium text-white shadow-xs transition hover:bg-[#1e293b] disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {tx("Recompute Ranking", "रैंकिंग फिर से निकालें")}
        </button>
      }
    >
      {/* Top 3 Telemetry Cards */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatTile
          label={tx("Ranked Opportunities", "रैंक किए गए अवसर")}
          value={items.length}
          hint={tx("Scored by 12-feature compatibility", "12-फ़ीचर संगतता द्वारा स्कोर")}
          icon={Sparkles}
          accent="indigo"
          loading={loading}
        />
        <StatTile
          label={tx("Strong Matches (70%+)", "मजबूत मैच (70%+)")}
          value={strongCount}
          hint={tx("High skill & semantic overlap", "उच्च कौशल और सिमेंटिक मिलान")}
          icon={Target}
          accent="emerald"
          loading={loading}
        />
        <StatTile
          label={tx("Average Fit Score", "औसत फिट स्कोर")}
          value={`${avgFit}%`}
          hint={tx("Calibrated probability across results", "परिणामों में कैलिब्रेटेड संगतता")}
          icon={Briefcase}
          accent="amber"
          loading={loading}
        />
      </div>

      {/* Filter Toolbar */}
      <div className="atoms-card mb-4 flex flex-wrap items-center justify-between gap-3 p-3.5">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#64748b]" />
          <input
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            placeholder={tx("Filter by role, company, or matched skill...", "रोल, कंपनी या कौशल से फ़िल्टर करें...")}
            className="studio-input pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-[12px] text-[#0f172a] outline-none"
          >
            <option value="">{tx("All Regions", "सभी क्षेत्र")}</option>
            <option value="IN">{tx("India", "भारत")}</option>
            <option value="GLOBAL">{tx("Global Remote", "ग्लोबल रिमोट")}</option>
            <option value="US">{tx("US", "अमेरिका")}</option>
            <option value="EU">{tx("Europe", "यूरोप")}</option>
            <option value="UK">{tx("UK", "यूके")}</option>
          </select>
          <select
            value={minFit}
            onChange={(e) => setMinFit(Number(e.target.value))}
            className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-[12px] text-[#0f172a] outline-none"
          >
            <option value={0}>{tx("Any Fit %", "कोई भी फिट %")}</option>
            <option value={50}>{tx("50%+ Fit", "50%+ फिट")}</option>
            <option value={70}>{tx("70%+ Fit", "70%+ फिट")}</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "compatibility" | "ltr")}
            className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-[12px] text-[#0f172a] outline-none"
          >
            <option value="compatibility">{tx("Sort: Compatibility %", "क्रम: संगतता %")}</option>
            <option value="ltr">{tx("Sort: LTR Score", "क्रम: LTR स्कोर")}</option>
          </select>
        </div>
      </div>

      {msg && <Banner tone="success" message={msg} onClose={() => setMsg(null)} className="mb-4" />}
      {error && <Banner tone="error" message={error} onClose={() => setError(null)} className="mb-4" />}

      {loading && items.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="skeleton h-36 w-full" />
          ))}
        </div>
      ) : visibleItems.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={tx("No matching recommendations", "कोई मिलान वाली सिफ़ारिश नहीं मिली")}
          description={tx(
            "Sync live jobs in Discovery and upload a resume in Resume Studio to compute calibrated compatibility scores.",
            "डिस्कवरी में लाइव नौकरियाँ सिंक करें और संगतता स्कोर निकालने के लिए रिज्यूमे स्टूडियो में रिज्यूमे अपलोड करें।"
          )}
          actionLabel={tx("Discover Live Jobs", "लाइव नौकरियाँ खोजें")}
          actionHref="/discover"
        />
      ) : (
        <div className="space-y-3.5">
          {visibleItems.map((r, idx) => {
            const pct = Math.round(r.compatibility_probability * 100);
            return (
              <div key={r.job.id} className="atoms-card atoms-card-hover p-5">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-[#3b5bff]/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#3b5bff]">
                        #{idx + 1}
                      </span>
                      <Link href={`/jobs/${r.job.id}`} className="text-[15.5px] font-semibold text-[#0f172a] hover:text-[#3b5bff]">
                        {r.job.title}
                      </Link>
                      <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 font-mono text-[10px] font-medium text-[#475569]">
                        {r.job.region || "GLOBAL"}
                      </span>
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-800">
                        {r.training_data_provenance}
                      </span>
                    </div>

                    <div className="mt-1 text-[12.5px] text-[#64748b]">
                      <span className="font-medium text-[#334155]">{r.job.company}</span> · {r.job.location || "Remote"} ·{" "}
                      <span className="capitalize">{r.job.work_mode}</span>
                      {r.job.salary_raw ? ` · ${r.job.salary_raw}` : ""}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {r.strong_matching_skills.slice(0, 6).map((sk) => (
                        <span
                          key={sk}
                          className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10.5px] font-medium text-emerald-800"
                        >
                          + {sk}
                        </span>
                      ))}
                      {r.missing_skills.slice(0, 4).map((sk) => (
                        <span
                          key={sk}
                          className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[10.5px] font-medium text-red-700"
                        >
                          - {sk}
                        </span>
                      ))}
                    </div>

                    <ul className="mt-3 space-y-1 text-[12px] text-[#475569]">
                      {r.ranking_reasons.map((reason, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <Sparkles className="h-3 w-3 shrink-0 text-[#3b5bff]" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Right Compatibility Score & Quick Actions */}
                  <div className="flex shrink-0 flex-col justify-between gap-3 rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-4 lg:w-64">
                    <div>
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-[10.5px] font-semibold uppercase text-[#64748b]">
                          {tx("Fit Probability", "फिट संभावना")}
                        </span>
                        <span className="tnum font-mono text-2xl font-semibold text-[#3b5bff]">{pct}%</span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#e2e8f0]">
                        <div
                          className={`h-full rounded-full ${pct >= 70 ? "bg-emerald-500" : "bg-[#3b5bff]"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-[#64748b]">
                        <span>LTR {r.ranking_score.toFixed(2)}</span>
                        <span>Sim {Math.round(r.semantic_similarity * 100)}%</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => sendSignal(r.job.id, "shortlist")}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#0f172a] hover:border-[#cbd5e1]"
                      >
                        <Bookmark className="h-3 w-3" /> {tx("Save", "सहेजें")}
                      </button>
                      <button
                        onClick={() => trackDraft(r.job.id, r.job.title)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#0f172a] hover:border-[#cbd5e1]"
                      >
                        <Briefcase className="h-3 w-3" /> {tx("Track", "ट्रैक करें")}
                      </button>
                      <button
                        onClick={() => sendSignal(r.job.id, "dismiss")}
                        title={tx("Dismiss", "हटाएँ")}
                        className="rounded-lg border border-[#e2e8f0] bg-white p-1.5 text-[#64748b] hover:border-red-200 hover:text-red-600"
                      >
                        <ThumbsDown className="h-3 w-3" />
                      </button>
                      <Link
                        href={`/jobs/${r.job.id}`}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#0f172a] px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#1e293b]"
                      >
                        {tx("Inspect", "विवरण")} <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </StudioShell>
  );
}
