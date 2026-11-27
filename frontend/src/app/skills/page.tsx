"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Search, Sparkles, Target } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { StatTile } from "@/components/ui";
import { apiFetch, JobItem, ProfileBundle, RecommendationItem } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

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
  const { tx } = useLanguage();
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
      title={tx("Skill-Gap Analysis", "कौशल-अंतर विश्लेषण")}
      subtitle={tx(
        "Verified candidate skills mapped against indexed job market requirements",
        "इंडेक्स की गई बाज़ार माँग के विरुद्ध सत्यापित उम्मीदवार कौशल"
      )}
      actions={
        <Link
          href="/roadmap"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0f172a] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#1e293b]"
        >
          {tx("View Career Roadmap", "करियर रोडमैप देखें")} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      }
    >
      {/* Top 3 Stat Tiles */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatTile
          label={tx("Market Skill Coverage", "बाज़ार कौशल कवरेज")}
          value={`${coveragePct}%`}
          hint={tx(`Across ${jobs.length} indexed jobs`, `${jobs.length} इंडेक्स नौकरियों में`)}
          icon={Sparkles}
          accent="indigo"
          loading={loading}
        />
        <StatTile
          label={tx("Covered Core Skills", "कवर मुख्य कौशल")}
          value={matched.length}
          hint={tx("Verified overlap with market demand", "बाज़ार माँग से सत्यापित मिलान")}
          icon={CheckCircle2}
          accent="emerald"
          loading={loading}
        />
        <StatTile
          label={tx("Priority Gaps", "प्राथमिकता कमियाँ")}
          value={missing.length}
          hint={tx("High-leverage upskilling targets", "सीखने के प्रमुख लक्ष्य")}
          icon={Target}
          accent="amber"
          loading={loading}
        />
      </div>

      {/* Visual Coverage Bar */}
      <div className="atoms-card mb-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[14.5px] font-semibold text-[#0f172a]">{tx("Skill Coverage Distribution", "कौशल कवरेज वितरण")}</h2>
            <p className="text-[12px] text-[#64748b]">{tx("Click any skill badge below to discover open roles requiring it", "संबंधित नौकरियाँ देखने के लिए नीचे किसी भी कौशल पर क्लिक करें")}</p>
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
              <h2 className="text-[15px] font-semibold text-[#0f172a]">{tx("Covered Core Skills", "कवर मुख्य कौशल")} ({matched.length})</h2>
            </div>
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[10.5px] font-medium text-emerald-700">
              {tx("STRENGTHS", "मजबूत पक्ष")}
            </span>
          </div>
          {matched.length === 0 ? (
            <p className="text-[12.5px] text-[#64748b]">
              {tx("Upload your resume in", "रिज्यूमे अपलोड करें:")}{" "}
              <Link href="/resume" className="font-medium text-[#3b5bff] underline">
                {tx("Resume Studio", "रिज्यूमे स्टूडियो")}
              </Link>{" "}
              {tx("to measure verified skill overlap.", "सत्यापित कौशल मिलान मापने के लिए।")}
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
              <h2 className="text-[15px] font-semibold text-[#0f172a]">{tx("Priority Gaps to Address", "सुधार हेतु प्राथमिकता कमियाँ")} ({missing.length})</h2>
            </div>
            <Link href="/assistant" className="text-[12px] font-medium text-[#3b5bff] hover:underline">
              {tx("Study plan with AI →", "AI से अध्ययन योजना →")}
            </Link>
          </div>
          {missing.length === 0 ? (
            <p className="text-[12.5px] text-emerald-700">
              {tx("No missing priority skills detected across current roles.", "मौजूदा पदों में कोई बड़ी कौशल कमी नहीं मिली।")}
            </p>
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
