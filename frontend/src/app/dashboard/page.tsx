"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Briefcase,
  CheckCircle2,
  Database,
  FileText,
  FileUp,
  Globe,
  Sparkles,
  Target,
} from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { Banner, EmptyState, StatTile } from "@/components/ui";
import { AnalyticsData, apiFetch, JobItem, ProfileBundle, RecommendationItem } from "@/lib/api";

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [bundle, setBundle] = useState<ProfileBundle | null>(null);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [recs, setRecs] = useState<RecommendationItem[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<AnalyticsData>("/api/v1/analytics"),
      apiFetch<ProfileBundle>("/api/v1/profile"),
      apiFetch<{ items: JobItem[] }>("/api/v1/jobs?limit=9"),
      apiFetch<{ items: RecommendationItem[] }>("/api/v1/recommendations?refresh=false&limit=4").catch(() => ({ items: [] })),
      apiFetch<Array<{ id: string }>>("/api/v1/approvals?status=pending").catch(() => []),
    ])
      .then(([a, p, j, r, ap]) => {
        setAnalytics(a);
        setBundle(p);
        setJobs(j.items);
        setRecs(r.items);
        setPendingApprovals(ap.length);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  const completenessPct = Math.round((bundle?.profile?.completeness_score || 0) * 100);
  const sourceEntries = Object.entries(analytics?.jobs_by_source || {}).sort((a, b) => b[1] - a[1]);
  const maxSourceCount = sourceEntries.length > 0 ? Math.max(...sourceEntries.map(([, c]) => c)) : 1;
  const funnelEntries = Object.entries(analytics?.applications_by_status || {});

  return (
    <StudioShell
      title="Dashboard"
      subtitle="Workspace telemetry across live jobs, verified skills, ML fit, and pipeline stages"
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/assistant"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-[#0f172a] transition hover:border-[#cbd5e1]"
          >
            <Bot className="h-3.5 w-3.5 text-[#3b5bff]" /> Ask AI
          </Link>
          <Link
            href="/discover"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#3b5bff] px-3.5 py-1.5 text-[12.5px] font-medium text-white shadow-xs transition hover:bg-[#2948eb]"
          >
            <Sparkles className="h-3.5 w-3.5" /> Discover Jobs
          </Link>
        </div>
      }
    >
      {error && <Banner tone="error" message={error} onClose={() => setError(null)} className="mb-5" />}

      {pendingApprovals > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-950">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
            <span>
              <strong>{pendingApprovals}</strong> pending human-in-the-loop approval request(s) awaiting sign-off.
            </span>
          </div>
          <Link href="/privacy" className="font-semibold text-amber-900 underline">
            Review in Privacy &amp; Memory →
          </Link>
        </div>
      )}

      {/* Single Unified 4-Tile Telemetry Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Indexed Jobs"
          value={analytics ? analytics.total_jobs : "—"}
          hint="Active normalized opportunities"
          icon={Briefcase}
          accent="indigo"
          href="/discover"
          loading={loading}
        />
        <StatTile
          label="Saved Roles"
          value={analytics ? analytics.total_saved : "—"}
          hint={
            analytics?.avg_compatibility_probability
              ? `Avg compatibility ${Math.round(analytics.avg_compatibility_probability * 100)}%`
              : "Shortlisted & bookmarked"
          }
          icon={CheckCircle2}
          accent="emerald"
          href="/recommendations"
          loading={loading}
        />
        <StatTile
          label="Tracked Pipeline"
          value={analytics ? analytics.total_applications : "—"}
          hint="Across draft to offer"
          icon={FileText}
          accent="amber"
          href="/tracker"
          loading={loading}
        />
        <StatTile
          label="Profile Readiness"
          value={`${completenessPct}%`}
          hint={`${bundle?.skills.length || 0} verified canonical skills`}
          icon={Target}
          accent="indigo"
          href="/resume"
          loading={loading}
        />
      </div>

      {/* Main Balanced 12-Col Studio Split */}
      <div className="mt-6 grid gap-5 lg:grid-cols-12">
        {/* Left Primary Feed (7 cols) */}
        <div className="space-y-5 lg:col-span-7">
          {/* Quick Workflows Strip */}
          <div className="atoms-card flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider text-[#64748b]">Quick Workflows</span>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/discover"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#f8fafc] px-2.5 py-1.5 text-[12px] font-medium text-[#0f172a] ring-1 ring-[#e2e8f0] transition hover:ring-[#3b5bff]/40"
              >
                <Globe className="h-3.5 w-3.5 text-[#3b5bff]" /> Sync 6 Sources
              </Link>
              <Link
                href="/resume"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#f8fafc] px-2.5 py-1.5 text-[12px] font-medium text-[#0f172a] ring-1 ring-[#e2e8f0] transition hover:ring-emerald-400"
              >
                <FileUp className="h-3.5 w-3.5 text-emerald-600" /> Upload Resume
              </Link>
              <Link
                href="/recommendations"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#f8fafc] px-2.5 py-1.5 text-[12px] font-medium text-[#0f172a] ring-1 ring-[#e2e8f0] transition hover:ring-amber-400"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-600" /> Run ML Ranker
              </Link>
            </div>
          </div>

          <div className="atoms-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-[#0f172a]">Recent Opportunities</h2>
                <p className="text-[12px] text-[#64748b]">Normalized live openings ready for scoring &amp; retrieval</p>
              </div>
              <Link href="/discover" className="text-[12.5px] font-medium text-[#3b5bff] hover:underline">
                View all →
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="skeleton h-16 w-full" />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="No jobs indexed yet"
                description="Pull live roles from 6 free job sources or add a custom opportunity to start matching."
                actionLabel="Open Job Discovery"
                actionHref="/discover"
              />
            ) : (
              <div className="divide-y divide-[#f1f5f9]">
                {jobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="group flex items-center justify-between gap-4 rounded-xl px-2 py-3 transition hover:bg-[#f8fafc]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[13.5px] font-semibold text-[#0f172a] group-hover:text-[#3b5bff]">
                          {job.title}
                        </span>
                        <span className="rounded-md bg-[#f1f5f9] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#475569]">
                          {job.region || "GLOBAL"}
                        </span>
                        <span className="rounded-md bg-[#3b5bff]/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#3b5bff]">
                          {job.source_name}
                        </span>
                      </div>
                      <div className="mt-1 text-[12px] text-[#64748b]">
                        <span className="font-medium text-[#334155]">{job.company}</span> · {job.location || "Remote"} ·{" "}
                        <span className="capitalize">{job.work_mode}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {job.salary_raw && (
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-700">
                          {job.salary_raw}
                        </span>
                      )}
                      <ArrowUpRight className="h-4 w-4 text-[#94a3b8] transition group-hover:translate-x-0.5 group-hover:text-[#3b5bff]" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Intelligence Sidebar (5 cols) */}
        <div className="space-y-5 lg:col-span-5">
          {/* Top ML Matches */}
          <div className="atoms-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14.5px] font-semibold text-[#0f172a]">Top ML Matches</h2>
              <Link href="/recommendations" className="text-[12px] font-medium text-[#3b5bff] hover:underline">
                See ranking →
              </Link>
            </div>
            {loading ? (
              <div className="space-y-2.5">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="skeleton h-14 w-full" />
                ))}
              </div>
            ) : recs.length === 0 ? (
              <p className="text-[12.5px] text-[#64748b]">
                Run scoring in <Link href="/recommendations" className="font-medium text-[#3b5bff] underline">ML Matches</Link> to
                inspect top compatible roles.
              </p>
            ) : (
              <div className="space-y-2.5">
                {recs.map((rec) => {
                  const pct = Math.round(rec.compatibility_probability * 100);
                  return (
                    <Link
                      key={rec.job.id}
                      href={`/jobs/${rec.job.id}`}
                      className="block rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3 transition hover:border-[#3b5bff]/40 hover:bg-white"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-semibold text-[#0f172a]">{rec.job.title}</span>
                        <span className="tnum shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-700">
                          {pct}% fit
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11.5px] text-[#64748b]">
                        <span className="truncate">{rec.job.company}</span>
                        <span className="font-mono text-[10px]">LTR {rec.ranking_score.toFixed(2)}</span>
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e2e8f0]">
                        <div className="h-full rounded-full bg-[#3b5bff]" style={{ width: `${pct}%` }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Extracted Skills & Source Mix */}
          <div className="atoms-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14.5px] font-semibold text-[#0f172a]">Verified Skills Profile</h2>
              <Link href="/resume" className="text-[12px] font-medium text-[#3b5bff] hover:underline">
                Manage →
              </Link>
            </div>
            {!analytics || analytics.top_candidate_skills.length === 0 ? (
              <p className="text-[12.5px] text-[#64748b]">
                Upload your resume in <Link href="/resume" className="font-medium text-[#3b5bff] underline">Resume Studio</Link> to extract skills.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {analytics.top_candidate_skills.map((sk) => (
                  <Link
                    key={sk.name}
                    href={`/discover?q=${encodeURIComponent(sk.name)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-[11.5px] font-medium text-[#0f172a] transition hover:border-[#3b5bff]/40"
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

          {/* Sources + Pipeline Compact Card */}
          <div className="atoms-card grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0f172a]">
                  <Database className="h-3.5 w-3.5 text-[#3b5bff]" /> Sources
                </h3>
                <Link href="/discover" className="text-[11px] font-medium text-[#3b5bff] hover:underline">
                  Sync
                </Link>
              </div>
              {sourceEntries.length === 0 ? (
                <p className="text-[12px] text-[#64748b]">No sources yet.</p>
              ) : (
                <div className="space-y-2">
                  {sourceEntries.slice(0, 5).map(([src, cnt]) => (
                    <div key={src} className="space-y-1">
                      <div className="flex items-center justify-between text-[11.5px]">
                        <span className="font-mono text-[#475569]">{src}</span>
                        <span className="tnum font-mono font-semibold text-[#0f172a]">{cnt}</span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-[#e2e8f0]">
                        <div
                          className="h-full rounded-full bg-[#3b5bff]/80"
                          style={{ width: `${Math.max(8, Math.round((cnt / maxSourceCount) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-[#0f172a]">Funnel</h3>
                <Link href="/tracker" className="text-[11px] font-medium text-[#3b5bff] hover:underline">
                  Board →
                </Link>
              </div>
              {funnelEntries.length === 0 ? (
                <p className="text-[12px] text-[#64748b]">No tracked roles yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {funnelEntries.map(([st, cnt]) => (
                    <div key={st} className="flex items-center justify-between rounded-lg bg-[#f8fafc] px-2.5 py-1.5 text-[11.5px]">
                      <span className="capitalize text-[#475569]">{st.replace("_", " ")}</span>
                      <span className="tnum rounded bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#0f172a] ring-1 ring-[#e2e8f0]">
                        {cnt}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </StudioShell>
  );
}
