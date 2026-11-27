"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Target } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
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

  useEffect(() => {
    Promise.all([
      apiFetch<ProfileBundle>("/api/v1/profile"),
      apiFetch<{ items: JobItem[] }>("/api/v1/jobs?limit=25"),
      apiFetch<{ items: RecommendationItem[] }>("/api/v1/recommendations?refresh=false&limit=15").catch(() => ({ items: [] })),
    ])
      .then(([b, j, r]) => {
        setBundle(b);
        setJobs(j.items);
        setRecs(r.items);
      })
      .catch(() => {});
  }, []);

  const ownedSet = new Set((bundle?.skills || []).map((s) => s.canonical_name.toLowerCase()));
  const dynamicGaps = Array.from(new Set(recs.flatMap((r) => r.missing_skills)));
  const dynamicMatched = Array.from(new Set(recs.flatMap((r) => r.strong_matching_skills)));
  const matched = dynamicMatched.length > 0
    ? dynamicMatched
    : BASELINE_DEMAND_SKILLS.filter((s) => ownedSet.has(s.toLowerCase()));
  const missing = dynamicGaps.length > 0
    ? dynamicGaps
    : BASELINE_DEMAND_SKILLS.filter((s) => !ownedSet.has(s.toLowerCase()));

  return (
    <StudioShell
      title="Skill-Gap Analysis"
      subtitle="Verified candidate skills compared against market & ingested job demand"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="atoms-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <h2 className="text-[15px] font-semibold">Covered Core Skills ({matched.length})</h2>
          </div>
          {matched.length === 0 ? (
            <p className="text-[12px] text-[#71717a]">
              Upload your resume in <Link href="/resume" className="text-[#4267ff] underline">Resume Intelligence</Link>{" "}
              to measure skill coverage.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {matched.map((s) => (
                <span key={s} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[12px] font-medium text-emerald-800">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="atoms-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-amber-600" />
            <h2 className="text-[15px] font-semibold">Priority Gaps to Address ({missing.length})</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {missing.map((s) => (
              <span key={s} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[12px] font-medium text-amber-800">
                {s}
              </span>
            ))}
          </div>
          <p className="mt-4 text-[12px] text-[#71717a]">
            Evaluated across {jobs.length} indexed jobs in your workspace.
          </p>
        </div>
      </div>
    </StudioShell>
  );
}
