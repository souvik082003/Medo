"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  Bookmark,
  Bot,
  Briefcase,
  Check,
  CheckCircle2,
  Database,
  FileUp,
  Globe,
  RefreshCw,
  Send,
  Sparkles,
  Target,
} from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { Banner, EmptyState, StatTile } from "@/components/ui";
import { AnalyticsData, apiFetch, getStoredUser, JobItem, ProfileBundle, RecommendationItem } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

function ReadinessRing({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - (clamped / 100) * circ;
  return (
    <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
      <svg className="h-20 w-20 -rotate-90" viewBox="0 0 68 68">
        <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="5.5" />
        <circle
          cx="34"
          cy="34"
          r={r}
          fill="none"
          stroke="#60a5fa"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="tnum font-mono text-[15px] font-bold text-white">{clamped}%</span>
        <span className="text-[8.5px] font-medium uppercase tracking-wider text-slate-300">Ready</span>
      </div>
    </div>
  );
}

const SOURCE_DOTS: Record<string, string> = {
  hackernews: "bg-orange-500",
  arbeitnow: "bg-indigo-500",
  remoteok: "bg-rose-500",
  remotive: "bg-emerald-500",
  himalayas: "bg-sky-500",
  jobicy: "bg-amber-500",
  manual: "bg-slate-600",
};

export default function DashboardPage() {
  const router = useRouter();
  const { tx } = useLanguage();
  const [userName, setUserName] = useState("Candidate");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [bundle, setBundle] = useState<ProfileBundle | null>(null);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [recs, setRecs] = useState<RecommendationItem[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<number>(0);
  const [feedFilter, setFeedFilter] = useState<"all" | "remote" | "arbeitnow" | "hackernews" | "himalayas">("all");
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [quickPrompt, setQuickPrompt] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const [a, p, j, r, ap] = await Promise.all([
        apiFetch<AnalyticsData>("/api/v1/analytics"),
        apiFetch<ProfileBundle>("/api/v1/profile"),
        apiFetch<{ items: JobItem[] }>("/api/v1/jobs?limit=20"),
        apiFetch<{ items: RecommendationItem[] }>("/api/v1/recommendations?refresh=false&limit=5").catch(() => ({
          items: [],
        })),
        apiFetch<Array<{ id: string }>>("/api/v1/approvals?status=pending").catch(() => []),
      ]);
      setAnalytics(a);
      setBundle(p);
      setJobs(j.items);
      setRecs(r.items);
      setPendingApprovals(ap.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const u = getStoredUser();
    if (u?.full_name) {
      setUserName(u.full_name.split(" ")[0]);
    }
    void loadDashboard();
  }, [loadDashboard]);

  const handleSyncLive = async () => {
    setSyncing(true);
    setMsg(null);
    setError(null);
    try {
      const targetRegion = bundle?.preferences?.preferred_regions?.[0] || "IN";
      const roles = bundle?.preferences?.preferred_roles?.slice(0, 2) || ["Software Engineer", "AI Engineer"];
      const res = await apiFetch<{ inserted: number; duplicates: number }>("/api/v1/jobs/ingest/live", {
        method: "POST",
        body: JSON.stringify({
          source: "all_free",
          keywords: roles,
          region: targetRegion,
          limit: 20,
        }),
      });
      setMsg(
        res.inserted > 0
          ? `Synced ${res.inserted} fresh live jobs across 6 connectors.`
          : "Live job feed is already up to date."
      );
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleQuickSave = async (e: React.MouseEvent, jobId: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await apiFetch("/api/v1/feedback", {
        method: "POST",
        body: JSON.stringify({ job_id: jobId, signal_type: "save", is_implicit: false }),
      });
      setSavedIds((prev) => ({ ...prev, [jobId]: true }));
    } catch {
      /* ignore silent save error */
    }
  };

  const handleQuickAsk = (e: React.FormEvent) => {
    e.preventDefault();
    const q = quickPrompt.trim();
    if (!q) return;
    router.push(`/assistant?q=${encodeURIComponent(q)}`);
  };

  const completenessPct = Math.round((bundle?.profile?.completeness_score || 0) * 100);
  const avgFitPct = analytics?.avg_compatibility_probability
    ? Math.round(analytics.avg_compatibility_probability * 100)
    : recs.length > 0
      ? Math.round((recs.reduce((s, x) => s + x.compatibility_probability, 0) / recs.length) * 100)
      : 0;

  const sourceEntries = Object.entries(analytics?.jobs_by_source || {}).sort((a, b) => b[1] - a[1]);
  const totalSourceJobs = sourceEntries.reduce((s, [, cnt]) => s + cnt, 0) || 1;
  const funnelEntries = Object.entries(analytics?.applications_by_status || {});

  const visibleJobs = useMemo(() => {
    return jobs
      .filter((j) => {
        if (feedFilter === "remote") return j.work_mode === "remote";
        if (feedFilter !== "all") return j.source_name === feedFilter;
        return true;
      })
      .slice(0, 8);
  }, [jobs, feedFilter]);

  const targetRoles = bundle?.preferences?.preferred_roles || [];
  const targetRegions = bundle?.preferences?.preferred_regions || [];

  return (
    <StudioShell
      title={tx("Dashboard", "डैशबोर्ड")}
      subtitle={tx(
        "Live command center for job discovery, ML fit ranking, and AI career orchestration",
        "लाइव नौकरियों, ML फिट रैंकिंग और AI करियर असिस्टेंट का कमांड सेंटर"
      )}
      fullWidth
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncLive}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#0f172a] transition hover:border-[#cbd5e1] disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[#3b5bff] ${syncing ? "animate-spin" : ""}`} />
            {syncing ? tx("Syncing...", "सिंक हो रहा है...") : tx("Sync Live Jobs", "लाइव नौकरियाँ सिंक करें")}
          </button>
          <Link
            href="/discover"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#3b5bff] to-[#4f46e5] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-xs transition hover:brightness-110"
          >
            <Sparkles className="h-3.5 w-3.5" /> {tx("Explore Jobs", "नौकरियाँ खोजें")}
          </Link>
        </div>
      }
    >
      {msg && <Banner tone="success" message={msg} onClose={() => setMsg(null)} className="mb-4" />}
      {error && <Banner tone="error" message={error} onClose={() => setError(null)} className="mb-4" />}

      {pendingApprovals > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-950">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
            <span>
              <strong>{pendingApprovals}</strong> pending human-in-the-loop approval request(s) awaiting review.
            </span>
          </div>
          <Link href="/privacy" className="font-semibold text-amber-900 underline">
            Review Approvals →
          </Link>
        </div>
      )}

      {/* Executive Command Center Hero Card */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-[#1e293b]/15 bg-gradient-to-br from-[#0f172a] via-[#16213d] to-[#1e2d5c] p-6 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#3b5bff]/25 blur-3xl" />
        <div className="relative z-10 flex flex-col justify-between gap-6 xl:flex-row xl:items-center">
          <div className="flex items-center gap-5">
            <ReadinessRing pct={completenessPct} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 font-mono text-[10px] font-medium text-indigo-200">
                  STUDIO TELEMETRY
                </span>
                {targetRegions.length > 0 && (
                  <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-0.5 font-mono text-[10px] text-emerald-300">
                    Regions: {targetRegions.join(", ")}
                  </span>
                )}
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {tx(`Welcome back, ${userName}`, `स्वागत है, ${userName}`)}
              </h2>
              <p className="mt-1 text-[13px] text-slate-300">
                {targetRoles.length > 0
                  ? tx(
                      `Targeting ${targetRoles.slice(0, 2).join(" & ")} · ${bundle?.skills.length || 0} verified skills indexed`,
                      `लक्ष्य: ${targetRoles.slice(0, 2).join(" व ")} · ${bundle?.skills.length || 0} सत्यापित कौशल इंडेक्स किए गए`
                    )
                  : tx(
                      `${bundle?.skills.length || 0} verified skills indexed · Configure target roles in Preferences`,
                      `${bundle?.skills.length || 0} सत्यापित कौशल · प्राथमिकताओं में लक्षित पद सेट करें`
                    )}
              </p>
            </div>
          </div>

          {/* Inline AI Quick Prompt + Studio Shortcuts */}
          <div className="flex w-full flex-col gap-3 xl:max-w-lg">
            <form onSubmit={handleQuickAsk} className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 p-1.5 backdrop-blur-md">
              <Bot className="ml-2 h-4 w-4 shrink-0 text-indigo-300" />
              <input
                value={quickPrompt}
                onChange={(e) => setQuickPrompt(e.target.value)}
                placeholder={tx(
                  "Ask Medo AI Orchestrator (e.g., skill gaps, interview prep, top jobs)...",
                  "मेडो AI से पूछें (जैसे: जॉब अवसर, कौशल अंतर, इंटरव्यू तैयारी)..."
                )}
                className="flex-1 bg-transparent px-1.5 py-1 text-[12.5px] text-white placeholder:text-slate-300 outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg bg-[#3b5bff] px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-[#2948eb]"
              >
                {tx("Ask", "पूछें")} <Send className="h-3 w-3" />
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
              <Link
                href="/resume"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1 text-slate-200 transition hover:bg-white/15"
              >
                <FileUp className="h-3 w-3 text-emerald-400" /> {tx("Resume Studio", "रेज़्यूमे स्टूडियो")}
              </Link>
              <Link
                href="/recommendations"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1 text-slate-200 transition hover:bg-white/15"
              >
                <Sparkles className="h-3 w-3 text-amber-300" /> {tx("ML Ranking", "ML मिलान")}
              </Link>
              <Link
                href="/tracker"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1 text-slate-200 transition hover:bg-white/15"
              >
                <Briefcase className="h-3 w-3 text-indigo-300" /> {tx("Pipeline Board", "पाइपलाइन बोर्ड")}
              </Link>
              <Link
                href="/skills"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1 text-slate-200 transition hover:bg-white/15"
              >
                <Target className="h-3 w-3 text-sky-300" /> {tx("Skill Gaps", "कौशल अंतर")}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Telemetry Stat Tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={tx("Live Indexed Jobs", "कुल लाइव नौकरियाँ")}
          value={analytics ? analytics.total_jobs : "—"}
          hint={tx(`${sourceEntries.length} active free sources`, `${sourceEntries.length} सक्रिय स्रोत`)}
          icon={Globe}
          accent="indigo"
          href="/discover"
          loading={loading}
        />
        <StatTile
          label={tx("Saved Shortlist", "सहेजी गई नौकरियाँ")}
          value={analytics ? analytics.total_saved : "—"}
          hint={tx("Bookmarked opportunities", "बुकमार्क किए गए अवसर")}
          icon={CheckCircle2}
          accent="emerald"
          href="/recommendations"
          loading={loading}
        />
        <StatTile
          label={tx("Pipeline Applications", "पाइपलाइन आवेदन")}
          value={analytics ? analytics.total_applications : "—"}
          hint={tx("Tracked across all stages", "सभी चरणों में ट्रैक किए गए")}
          icon={Briefcase}
          accent="amber"
          href="/tracker"
          loading={loading}
        />
        <StatTile
          label={tx("Average ML Fit", "औसत ML फिट")}
          value={avgFitPct > 0 ? `${avgFitPct}%` : "—"}
          hint={tx(`${bundle?.skills.length || 0} verified canonical skills`, `${bundle?.skills.length || 0} सत्यापित कौशल`)}
          icon={Target}
          accent="indigo"
          href="/recommendations"
          loading={loading}
        />
      </div>

      {/* Main Executive Split */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-12">
        {/* Left Feed: Live Opportunities with Interactive Filter Tabs (7 cols) */}
        <div className="atoms-card p-5 lg:col-span-7">
          <div className="mb-4 flex flex-col justify-between gap-3 border-b border-[#f1f5f9] pb-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-[15.5px] font-semibold text-[#0f172a]">
                {tx("Live Opportunity Feed", "लाइव जॉब फ़ीड")}
              </h2>
              <p className="text-[12px] text-[#64748b]">
                {tx("Real-time indexed openings across global boards", "ग्लोबल और क्षेत्रीय स्रोतों से रियल-टाइम नौकरियाँ")}
              </p>
            </div>

            <div className="atoms-segmented flex-wrap">
              {(
                [
                  { id: "all", label: tx("All", "सभी") },
                  { id: "remote", label: tx("Remote", "रिमोट") },
                  { id: "himalayas", label: "Himalayas" },
                  { id: "arbeitnow", label: "Arbeitnow" },
                  { id: "hackernews", label: "HN" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  data-active={feedFilter === tab.id}
                  onClick={() => setFeedFilter(tab.id)}
                  className="atoms-segmented-btn px-2.5 py-1 text-[11.5px]"
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="skeleton h-16 w-full" />
              ))}
            </div>
          ) : visibleJobs.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title={tx("No matching live openings for this tab", "इस टैब के लिए कोई लाइव नौकरी नहीं मिली")}
              description={tx("Switch tabs or click Sync Live Jobs to fetch fresh roles.", "टैब बदलें या नई नौकरियाँ लाने के लिए लाइव सिंक दबाएँ।")}
              actionLabel={tx("Open Discovery", "डिस्कवरी खोलें")}
              actionHref="/discover"
            />
          ) : (
            <div className="space-y-2">
              {visibleJobs.map((job) => {
                const isSaved = Boolean(savedIds[job.id]);
                const dotClass = SOURCE_DOTS[job.source_name] || "bg-slate-400";
                return (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="group flex items-center justify-between gap-4 rounded-xl border border-[#f1f5f9] bg-[#f8fafc]/70 p-3.5 transition hover:border-[#cbd5e1] hover:bg-white hover:shadow-xs"
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white font-mono text-[13px] font-bold text-[#0f172a] ring-1 ring-[#e2e8f0]">
                        {(job.company || "M").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[13.5px] font-semibold text-[#0f172a] group-hover:text-[#3b5bff]">
                            {job.title}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#475569] ring-1 ring-[#e2e8f0]">
                            <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                            {job.source_name}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[12px] text-[#64748b]">
                          <span className="font-medium text-[#334155]">{job.company}</span> · {job.location || "Remote"} ·{" "}
                          <span className="font-mono text-[11px]">{job.region || "GLOBAL"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {job.salary_raw && (
                        <span className="hidden rounded-lg bg-emerald-50 px-2.5 py-1 font-mono text-[11px] font-semibold text-emerald-700 sm:inline-block">
                          {job.salary_raw}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleQuickSave(e, job.id)}
                        title="Save role"
                        className={`rounded-lg p-1.5 transition ${
                          isSaved
                            ? "bg-emerald-50 text-emerald-700"
                            : "text-[#64748b] hover:bg-[#e2e8f0]/60 hover:text-[#0f172a]"
                        }`}
                      >
                        {isSaved ? <Check className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                      </button>
                      <ArrowUpRight className="h-4 w-4 text-[#94a3b8] transition group-hover:translate-x-0.5 group-hover:text-[#3b5bff]" />
                    </div>
                  </Link>
                );
              })}

              <div className="pt-2 text-center">
                <Link
                  href="/discover"
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#3b5bff] hover:underline"
                >
                  {tx(
                    `Explore all ${analytics?.total_jobs || jobs.length} live jobs with Area & Description search →`,
                    `एरिया और विवरण खोज के साथ सभी ${analytics?.total_jobs || jobs.length} लाइव नौकरियाँ देखें →`
                  )}
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Right Intelligence Column (5 cols) */}
        <div className="space-y-5 lg:col-span-5">
          {/* Top ML Matches */}
          <div className="atoms-card p-5">
            <div className="mb-3.5 flex items-center justify-between">
              <div>
                <h2 className="text-[14.5px] font-semibold text-[#0f172a]">
                  {tx("Top Compatible Matches", "शीर्ष उपयुक्त मैच")}
                </h2>
                <p className="text-[11.5px] text-[#64748b]">
                  {tx("Ranked by 12-feature compatibility + LTR", "12-फ़ीचर संगतता और LTR द्वारा रैंक")}
                </p>
              </div>
              <Link href="/recommendations" className="text-[12px] font-medium text-[#3b5bff] hover:underline">
                {tx("Full ranking →", "पूरी रैंकिंग →")}
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2.5">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="skeleton h-14 w-full" />
                ))}
              </div>
            ) : recs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#cbd5e1] p-4 text-center text-[12.5px] text-[#64748b]">
                {tx("Click", "खोलें")}{" "}
                <Link href="/recommendations" className="font-semibold text-[#3b5bff] underline">
                  {tx("ML Matches", "ML मैच")}
                </Link>{" "}
                {tx("to rank live roles against your resume.", "अपने रिज्यूमे के अनुसार लाइव नौकरियों को रैंक करने के लिए।")}
              </p>
            ) : (
              <div className="space-y-2.5">
                {recs.slice(0, 4).map((rec) => {
                  const pct = Math.round(rec.compatibility_probability * 100);
                  return (
                    <Link
                      key={rec.job.id}
                      href={`/jobs/${rec.job.id}`}
                      className="block rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3.5 transition hover:border-[#3b5bff]/40 hover:bg-white"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-semibold text-[#0f172a]">{rec.job.title}</span>
                        <span
                          className={`tnum shrink-0 rounded-lg px-2 py-0.5 font-mono text-[11px] font-semibold ${
                            pct >= 70 ? "bg-emerald-50 text-emerald-700" : "bg-[#3b5bff]/10 text-[#3b5bff]"
                          }`}
                        >
                          {pct}% {tx("fit", "फिट")}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11.5px] text-[#64748b]">
                        <span className="truncate">{rec.job.company}</span>
                        <span className="font-mono text-[10px]">LTR {rec.ranking_score.toFixed(2)}</span>
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e2e8f0]">
                        <div
                          className={`h-full rounded-full ${pct >= 70 ? "bg-emerald-500" : "bg-[#3b5bff]"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Live Source Mix Visualization + Pipeline Summary */}
          <div className="atoms-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-[14.5px] font-semibold text-[#0f172a]">
                <Database className="h-4 w-4 text-[#3b5bff]" /> {tx("Live Connector Distribution", "लाइव स्रोत वितरण")}
              </h2>
              <span className="tnum font-mono text-[11px] font-semibold text-[#64748b]">
                {analytics?.total_jobs || 0} {tx("total", "कुल")}
              </span>
            </div>

            {sourceEntries.length === 0 ? (
              <p className="text-[12px] text-[#64748b]">{tx("No live connectors synced yet.", "अभी तक कोई लाइव स्रोत सिंक नहीं हुआ।")}</p>
            ) : (
              <>
                {/* Stacked Multi-Color Segmented Bar */}
                <div className="mb-4 flex h-2.5 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
                  {sourceEntries.map(([src, cnt]) => {
                    const dotClass = SOURCE_DOTS[src] || "bg-slate-400";
                    return (
                      <div
                        key={src}
                        title={`${src}: ${cnt}`}
                        className={`h-full ${dotClass} border-r border-white last:border-r-0`}
                        style={{ width: `${Math.max(4, Math.round((cnt / totalSourceJobs) * 100))}%` }}
                      />
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {sourceEntries.map(([src, cnt]) => {
                    const dotClass = SOURCE_DOTS[src] || "bg-slate-400";
                    return (
                      <div
                        key={src}
                        className="flex items-center justify-between rounded-xl bg-[#f8fafc] px-3 py-2 text-[12px]"
                      >
                        <span className="flex items-center gap-2 font-mono text-[#334155]">
                          <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                          {src}
                        </span>
                        <span className="tnum font-mono font-semibold text-[#0f172a]">{cnt}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Pipeline Funnel Strip inside same telemetry card */}
            <div className="mt-5 border-t border-[#f1f5f9] pt-4">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[#0f172a]">{tx("Pipeline Stages", "आवेदन चरण")}</span>
                <Link href="/tracker" className="text-[11.5px] font-medium text-[#3b5bff] hover:underline">
                  {tx("Open Kanban →", "कैनबन खोलें →")}
                </Link>
              </div>
              {funnelEntries.length === 0 ? (
                <p className="text-[12px] text-[#64748b]">{tx("No applications tracked yet.", "अभी तक कोई आवेदन ट्रैक नहीं हुआ।")}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {funnelEntries.map(([st, cnt]) => (
                    <div
                      key={st}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3 py-1.5 text-[11.5px]"
                    >
                      <span className="capitalize text-[#475569]">{st.replace("_", " ")}</span>
                      <span className="tnum rounded-md bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#0f172a] ring-1 ring-[#e2e8f0]">
                        {cnt}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Verified Skills Cloud */}
          <div className="atoms-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-[#0f172a]">
                {tx("Verified Skill Strengths", "सत्यापित कौशल")}
              </h2>
              <Link href="/resume" className="text-[12px] font-medium text-[#3b5bff] hover:underline">
                {tx("Manage →", "प्रबंधित करें →")}
              </Link>
            </div>
            {!analytics || analytics.top_candidate_skills.length === 0 ? (
              <p className="text-[12.5px] text-[#64748b]">
                {tx("Upload a resume in", "अपना रिज्यूमे अपलोड करें:")}{" "}
                <Link href="/resume" className="font-medium text-[#3b5bff] underline">
                  {tx("Resume Studio", "रिज्यूमे स्टूडियो")}
                </Link>{" "}
                {tx("to extract verified skills.", "सत्यापित कौशल निकालने के लिए।")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {analytics.top_candidate_skills.map((sk) => (
                  <Link
                    key={sk.name}
                    href={`/discover?q=${encodeURIComponent(sk.name)}`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-[11.5px] font-medium text-[#0f172a] transition hover:border-[#3b5bff]/40 hover:bg-white"
                  >
                    <span>{sk.name}</span>
                    <span className="font-mono text-[10px] font-semibold text-[#3b5bff]">
                      {Math.round(sk.confidence * 100)}%
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </StudioShell>
  );
}
