"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, GitBranch, Sparkles, Target } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { apiFetch, ApplicationItem, ProfileBundle, RecommendationItem } from "@/lib/api";

export default function RoadmapPage() {
  const [bundle, setBundle] = useState<ProfileBundle | null>(null);
  const [recs, setRecs] = useState<RecommendationItem[]>([]);
  const [apps, setApps] = useState<ApplicationItem[]>([]);

  useEffect(() => {
    Promise.all([
      apiFetch<ProfileBundle>("/api/v1/profile"),
      apiFetch<{ items: RecommendationItem[] }>("/api/v1/recommendations?refresh=false&limit=15").catch(() => ({ items: [] })),
      apiFetch<{ items: ApplicationItem[] }>("/api/v1/applications?limit=20").catch(() => ({ items: [] })),
    ])
      .then(([b, r, a]) => {
        setBundle(b);
        setRecs(r.items);
        setApps(a.items);
      })
      .catch(() => {});
  }, []);

  const roles = bundle?.preferences?.preferred_roles || [];
  const skillNames = (bundle?.skills || []).slice(0, 6).map((s) => s.canonical_name);
  const missingTop = Array.from(new Set(recs.flatMap((r) => r.missing_skills))).slice(0, 6);

  const milestones = [
    {
      phase: "Step 1 · Profile & Taxonomy Baseline",
      done: (bundle?.skills.length || 0) > 0,
      detail: `Verified ${bundle?.skills.length || 0} canonical skills${skillNames.length ? ` (${skillNames.join(", ")})` : ""}.`,
      href: "/resume",
      cta: "Manage Resume",
    },
    {
      phase: "Step 2 · Target Role & Region Preferences",
      done: roles.length > 0,
      detail: roles.length
        ? `Targeting ${roles.join(", ")} across ${(bundle?.preferences?.preferred_regions || []).join(", ") || "All Regions"}.`
        : "Configure preferred roles, regions, and currency in Preferences.",
      href: "/profile",
      cta: "Edit Preferences",
    },
    {
      phase: "Step 3 · Close Priority Skill Gaps",
      done: recs.length > 0 && missingTop.length === 0,
      detail: missingTop.length
        ? `Top missing skills across matched roles: ${missingTop.join(", ")}. Ask AI Orchestrator for a focused study schedule.`
        : "Compute ML Matches to surface high-leverage skill gaps across open roles.",
      href: "/assistant",
      cta: "Plan with AI",
    },
    {
      phase: "Step 4 · Calibrated Discovery & Applications",
      done: apps.length > 0,
      detail:
        apps.length > 0
          ? `Tracking ${apps.length} active application(s) in Pipeline Tracker.`
          : "Shortlist high-fit roles in ML Matches and track interview stages in Pipeline Tracker.",
      href: apps.length > 0 ? "/tracker" : "/recommendations",
      cta: apps.length > 0 ? "Open Tracker" : "View Matches",
    },
  ];

  const completedCount = milestones.filter((m) => m.done).length;
  const pct = Math.round((completedCount / milestones.length) * 100);

  return (
    <StudioShell
      title="Career Roadmap"
      subtitle="Live execution milestones grounded in your resume, target preferences, skill gaps, and pipeline"
      actions={
        <Link
          href="/assistant"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#3b5bff] px-3.5 py-1.5 text-[12px] font-medium text-white shadow-xs hover:bg-[#2948eb]"
        >
          <Sparkles className="h-3.5 w-3.5" /> Generate AI Prep Plan
        </Link>
      }
    >
      <div className="grid items-start gap-6 lg:grid-cols-12">
        {/* Left Connected Stepper Timeline (8 cols) */}
        <div className="space-y-4 lg:col-span-8">
          {milestones.map((m, i) => (
            <div key={m.phase} className="atoms-card flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3.5">
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-[12px] font-semibold ${
                    m.done ? "bg-emerald-500/15 text-emerald-700" : "bg-[#3b5bff]/10 text-[#3b5bff]"
                  }`}
                >
                  {m.done ? <CheckCircle2 className="h-4.5 w-4.5" /> : `0${i + 1}`}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[14.5px] font-semibold text-[#0f172a]">{m.phase}</h2>
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold ${
                        m.done ? "bg-emerald-50 text-emerald-700" : "bg-[#f1f5f9] text-[#475569]"
                      }`}
                    >
                      {m.done ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Circle className="h-2.5 w-2.5" />}
                      {m.done ? "DONE" : "IN PROGRESS"}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[#475569]">{m.detail}</p>
                </div>
              </div>

              <Link
                href={m.href}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3.5 py-2 text-[12px] font-medium text-[#0f172a] transition hover:border-[#3b5bff]/40 hover:bg-white"
              >
                {m.cta} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>

        {/* Right Sticky Progress & Gap Focus Panel (4 cols) */}
        <div className="space-y-4 lg:col-span-4">
          <div className="atoms-card sticky top-20 space-y-5 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#3b5bff]">
                  Milestone Progress
                </div>
                <h3 className="mt-1 text-[16px] font-semibold text-[#0f172a]">
                  {completedCount} of {milestones.length} Complete
                </h3>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#3b5bff]/10 font-mono text-[14px] font-semibold text-[#3b5bff]">
                {pct}%
              </div>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-[#e2e8f0]">
              <div className="h-full rounded-full bg-[#3b5bff] transition-all" style={{ width: `${pct}%` }} />
            </div>

            <div className="border-t border-[#f1f5f9] pt-4">
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#0f172a]">
                <Target className="h-3.5 w-3.5 text-amber-600" /> Focus Skills Next
              </div>
              {missingTop.length === 0 ? (
                <p className="mt-2 text-[12px] text-[#64748b]">
                  No missing skills flagged yet. Score roles in ML Matches to generate recommendations.
                </p>
              ) : (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {missingTop.map((sk) => (
                    <Link
                      key={sk}
                      href={`/discover?q=${encodeURIComponent(sk)}`}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 font-mono text-[11px] font-medium text-amber-900 hover:border-amber-400"
                    >
                      {sk}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-[#f1f5f9] pt-4">
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#0f172a]">
                <GitBranch className="h-3.5 w-3.5 text-[#3b5bff]" /> Next Quick Action
              </div>
              <Link
                href="/discover"
                className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#0f172a] px-4 py-2.5 text-[12.5px] font-medium text-white hover:bg-[#1e293b]"
              >
                Sync &amp; Match New Roles <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </StudioShell>
  );
}
