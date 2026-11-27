"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Search, Sparkles, Target } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { StatTile } from "@/components/ui";
import { apiFetch, JobItem, ProfileBundle, RecommendationItem } from "@/lib/api";

const BASELINE_DEMAND_SKILLS = [
  "Python",
  "PyTorch",
  "PostgreSQL",
  "pgvector",
  "FastAPI",
  "Kubernetes",
  "Docker",
  "React",
  "TypeScript",
  "LangGraph",
  "LightGBM",
  "Scikit-learn",
];

export default function SkillGapPage() {
  const [bundle, setBundle] = useState<ProfileBundle | null>(null);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [recs, setRecs] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<ProfileBundle>("/api/v1/profile"),
      apiFetch<{ items: JobItem[] }>("/api/v1/jobs?limit=50"),
      apiFetch<{ items: RecommendationItem[] }>("/api/v1/recommendations?refresh=false&limit=25").catch(() => ({ items: [] })),
    ])
      .then(([b, j, r]) => {
        setBundle(b);
        setJobs(j.items);
        setRecs(r.items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const ownedSet = new Set((bundle?.skills || []).map((s) => s.canonical_name.toLowerCase()));
  const dynamicGaps = Array.from(new Set(recs.flatMap((r) => r.missing_skills)));
  const dynamicMatched = Array.from(new Set(recs.flatMap((r) => r.strong_matching_skills)));
  const matched =
    dynamicMatched.length > 0
      ? dynamicMatched
      : BASELINE_DEMAND_SKILLS.filter((s) => ownedSet.has(s.toLowerCase()));
  const missing =
    dynamicGaps.length > 0
      ? dynamicGaps
      : BASELINE_DEMAND_SKILLS.filter((s) => !ownedSet.has(s.toLowerCase()));

  const totalSkills = matched.length + missing.length;
  const coveragePct = totalSkills > 0 ? Math.round((matched.length / totalSkills) * 100) : 0;

  return (
    <StudioShell
      title="Skill-Gap Analysis"
      subtitle="Verified candidate skills mapped against indexed job market requirements"
      actions={
        <Link
          href="/roadmap"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0f172a] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#1e293b]"
        >
          View Career Roadmap <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      }
    >
      {/* Top 3 Stat Tiles */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Market Skill Coverage"
          value={`${coveragePct}%`}
          hint={`Across ${jobs.length} indexed jobs`}
          icon={Sparkles}
          accent="indigo"
          loading={loading}
        />
        <StatTile
          label="Covered Core Skills"
          value={matched.length}
          hint="Verified overlap with market demand"
          icon={CheckCircle2}
          accent="emerald"
          loading={loading}
        />
        <StatTile
          label="Priority Gaps"
          value={missing.length}
          hint="High-leverage upskilling targets"
          icon={Target}
          accent="amber"
          loading={loading}
        />
      </div>

      {/* Visual Coverage Bar */}
      <div className="atoms-card mb-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[14.5px] font-semibold text-[#0f172a]">Skill Coverage Distribution</h2>
            <p className="text-[12px] text-[#64748b]">Click any skill badge below to discover open roles requiring it</p>
          </div>
          <span className="tnum font-mono text-lg font-semibold text-[#3b5bff]">{coveragePct}%</span>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[#e2e8f0]">
          <div className="h-full rounded-full bg-gradient-to-r from-[#3b5bff] to-emerald-500 transition-all" style={{ width: `${coveragePct}%` }} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="atoms-card p-6">
          <div className="mb-4 flex items-center justify-between border-b border-[#f1f5f9] pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <h2 className="text-[15px] font-semibold text-[#0f172a]">Covered Core Skills ({matched.length})</h2>
            </div>
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[10.5px] font-medium text-emerald-700">
              STRENGTHS
            </span>
          </div>
          {matched.length === 0 ? (
            <p className="text-[12.5px] text-[#64748b]">
              Upload your resume in <Link href="/resume" className="font-medium text-[#3b5bff] underline">Resume Studio</Link>{" "}
              to measure verified skill overlap.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {matched.map((s) => (
                <Link
                  key={s}
                  href={`/discover?q=${encodeURIComponent(s)}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-1.5 text-[12.5px] font-medium text-emerald-900 transition hover:border-emerald-400"
                >
                  <span>{s}</span>
                  <Search className="h-3 w-3 opacity-60" />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="atoms-card p-6">
          <div className="mb-4 flex items-center justify-between border-b border-[#f1f5f9] pb-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-amber-600" />
              <h2 className="text-[15px] font-semibold text-[#0f172a]">Priority Gaps to Address ({missing.length})</h2>
            </div>
            <Link href="/assistant" className="text-[12px] font-medium text-[#3b5bff] hover:underline">
              Study plan with AI →
            </Link>
          </div>
          {missing.length === 0 ? (
            <p className="text-[12.5px] text-emerald-700">No missing priority skills detected across current roles.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {missing.map((s) => (
                <Link
                  key={s}
                  href={`/discover?q=${encodeURIComponent(s)}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-[12.5px] font-medium text-amber-900 transition hover:border-amber-400"
                >
                  <span>{s}</span>
                  <Search className="h-3 w-3 opacity-60" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
