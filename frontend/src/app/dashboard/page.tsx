"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Briefcase, CheckCircle2, FileText, Sparkles, Target } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { AnalyticsData, apiFetch, JobItem, ProfileBundle, RecommendationItem } from "@/lib/api";

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [bundle, setBundle] = useState<ProfileBundle | null>(null);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [recs, setRecs] = useState<RecommendationItem[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<AnalyticsData>("/api/v1/analytics"),
      apiFetch<ProfileBundle>("/api/v1/profile"),
      apiFetch<{ items: JobItem[] }>("/api/v1/jobs?limit=6"),
      apiFetch<{ items: RecommendationItem[] }>("/api/v1/recommendations?refresh=false&limit=3").catch(() => ({ items: [] })),
      apiFetch<Array<{ id: string }>>("/api/v1/approvals?status=pending").catch(() => []),
    ])
      .then(([a, p, j, r, ap]) => {
        setAnalytics(a);
        setBundle(p);
        setJobs(j.items);
        setRecs(r.items);
        setPendingApprovals(ap.length);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"));
  }, []);

  const completenessPct = Math.round((bundle?.profile?.completeness_score || 0) * 100);

  return (
    <StudioShell
      title="Career Dashboard"
      subtitle="Live database metrics across jobs, extracted skills, and applications"
      actions={
        <Link
          href="/discover"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#171716] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#272726]"
        >
          <Sparkles className="h-3.5 w-3.5" /> Discover Jobs
        </Link>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {pendingApprovals > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <span>
              <strong>{pendingApprovals}</strong> pending human-in-the-loop approval request(s) awaiting your sign-off.
            </span>
          </div>
          <Link href="/privacy" className="font-medium underline">
            Review in Privacy & Approvals →
          </Link>
        </div>
      )}

      {/* KPI Bento Row (Real DB counts only) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="atoms-card p-4">
          <div className="flex items-center justify-between text-[12px] text-[#71717a]">
            <span>Indexed Jobs</span>
            <Briefcase className="h-4 w-4 text-[#4267ff]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-[#171716]">
            {analytics ? analytics.total_jobs : "—"}
          </div>
          <div className="mt-1 text-[11px] text-[#71717a]">Visible non-expired listings</div>
        </div>

        <div className="atoms-card p-4">
          <div className="flex items-center justify-between text-[12px] text-[#71717a]">
            <span>Saved Opportunities</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-[#171716]">
            {analytics ? analytics.total_saved : "—"}
          </div>
          <div className="mt-1 text-[11px] text-[#71717a]">Shortlisted & bookmarked</div>
        </div>

        <div className="atoms-card p-4">
          <div className="flex items-center justify-between text-[12px] text-[#71717a]">
            <span>Applications</span>
            <FileText className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-[#171716]">
            {analytics ? analytics.total_applications : "—"}
          </div>
          <div className="mt-1 text-[11px] text-[#71717a]">Tracked across all stages</div>
        </div>

        <div className="atoms-card p-4">
          <div className="flex items-center justify-between text-[12px] text-[#71717a]">
            <span>Profile Completeness</span>
            <Target className="h-4 w-4 text-[#4267ff]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-[#171716]">{completenessPct}%</div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
            <div className="h-full rounded-full bg-[#4267ff]" style={{ width: `${completenessPct}%` }} />
          </div>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {/* Recent Opportunities */}
        <div className="atoms-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold">Recent Opportunities</h2>
              <p className="text-[12px] text-[#71717a]">Normalized jobs available for matching and retrieval</p>
            </div>
            <Link href="/discover" className="text-[12px] font-medium text-[#4267ff] hover:underline">
              Search all →
            </Link>
          </div>

          {jobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 bg-[#fafafa] p-8 text-center">
              <p className="text-[13px] text-[#52525b]">No jobs ingested yet.</p>
              <Link
                href="/discover"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#171716] px-3 py-1.5 text-[12px] font-medium text-white"
              >
                Go to Job Discovery
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-black/[0.06]">
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="flex items-center justify-between gap-4 py-3 transition hover:bg-black/[0.015]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium text-[#171716]">{job.title}</span>
                      <span className="rounded bg-black/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-[#52525b]">
                        {job.region || "GLOBAL"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-[#71717a]">
                      {job.company} · {job.location || "Unspecified"} · {job.work_mode}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {job.salary_raw && (
                      <span className="font-mono text-[12px] text-emerald-700">{job.salary_raw}</span>
                    )}
                    <ArrowUpRight className="h-4 w-4 text-[#71717a]" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Skills & Pipeline Breakdown */}
        <div className="space-y-5">
          <div className="atoms-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold">Extracted Skills Profile</h2>
              <Link href="/resume" className="text-[12px] font-medium text-[#4267ff] hover:underline">
                Manage
              </Link>
            </div>
            {!analytics || analytics.top_candidate_skills.length === 0 ? (
              <p className="text-[12px] text-[#71717a]">
                Upload a resume in <Link href="/resume" className="text-[#4267ff] underline">Resume Intelligence</Link> to
                extract verified skills.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {analytics.top_candidate_skills.map((sk) => (
                  <span
                    key={sk.name}
                    className="inline-flex items-center gap-1 rounded-md border border-black/[0.08] bg-[#fafafa] px-2 py-1 text-[11px] font-medium"
                  >
                    <span>{sk.name}</span>
                    <span className="font-mono text-[10px] text-[#4267ff]">
                      {Math.round(sk.confidence * 100)}%
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="atoms-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold">Top ML Matches</h2>
              <Link href="/recommendations" className="text-[12px] font-medium text-[#4267ff] hover:underline">
                View all
              </Link>
            </div>
            {recs.length === 0 ? (
              <p className="text-[12px] text-[#71717a]">
                Run matching in <Link href="/recommendations" className="text-[#4267ff] underline">Recommendations</Link>{" "}
                to rank jobs by compatibility.
              </p>
            ) : (
              <div className="space-y-2.5">
                {recs.map((rec) => (
                  <Link
                    key={rec.job.id}
                    href={`/jobs/${rec.job.id}`}
                    className="block rounded-lg border border-black/[0.06] bg-[#fafafa] p-2.5 transition hover:border-black/20"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] font-medium text-[#171716]">{rec.job.title}</span>
                      <span className="shrink-0 font-mono text-[11px] font-semibold text-emerald-700">
                        {Math.round(rec.compatibility_probability * 100)}% fit
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-[#71717a]">{rec.job.company}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="atoms-card p-5">
            <h2 className="mb-3 text-[14px] font-semibold">Application Funnel</h2>
            {!analytics || Object.keys(analytics.applications_by_status).length === 0 ? (
              <p className="text-[12px] text-[#71717a]">No tracked applications yet.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(analytics.applications_by_status).map(([st, cnt]) => (
                  <div key={st} className="flex items-center justify-between text-[12px]">
                    <span className="capitalize text-[#52525b]">{st.replace("_", " ")}</span>
                    <span className="rounded bg-black/[0.05] px-2 py-0.5 font-mono font-medium text-[#171716]">
                      {cnt}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </StudioShell>
  );
}
