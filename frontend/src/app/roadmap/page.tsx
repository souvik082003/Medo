"use client";

import React, { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { apiFetch, ProfileBundle } from "@/lib/api";

export default function RoadmapPage() {
  const [bundle, setBundle] = useState<ProfileBundle | null>(null);

  useEffect(() => {
    apiFetch<ProfileBundle>("/api/v1/profile").then(setBundle).catch(() => {});
  }, []);

  const roles = bundle?.preferences?.preferred_roles || [];
  const skillNames = (bundle?.skills || []).slice(0, 6).map((s) => s.canonical_name);

  const milestones = [
    {
      phase: "Step 1 · Profile & Taxonomy Baseline",
      detail: `Verified ${bundle?.skills.length || 0} canonical skills${skillNames.length ? ` (${skillNames.join(", ")})` : ""}.`,
    },
    {
      phase: "Step 2 · Target Role Alignment",
      detail: roles.length ? `Focusing discovery on: ${roles.join(", ")}.` : "Configure preferred roles in Profile & Preferences.",
    },
    {
      phase: "Step 3 · Retrieval & Ranking Calibration",
      detail: "Save, shortlist, or dismiss opportunities in Recommendations to feed relevance signals.",
    },
    {
      phase: "Step 4 · Tailored Applications",
      detail: "Track applications through interviews and collect outcome feedback.",
    },
  ];

  return (
    <StudioShell
      title="Career Roadmap"
      subtitle="Actionable milestones grounded in your current profile state"
    >
      <div className="mx-auto max-w-3xl space-y-3">
        {milestones.map((m) => (
          <div key={m.phase} className="atoms-card flex items-start gap-3 p-5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#4267ff]/10 text-[#4267ff]">
              <GitBranch className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold">{m.phase}</h2>
              <p className="mt-1 text-[13px] text-[#52525b]">{m.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </StudioShell>
  );
}
