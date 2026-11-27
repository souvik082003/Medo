"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bookmark,
  Bot,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  DollarSign,
  ExternalLink,
  GitCommitHorizontal,
  Globe,
  GraduationCap,
  Layers,
  MapPin,
  Sparkles,
} from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { Banner } from "@/components/ui";
import { apiFetch, JobItem, ProfileBundle, RecommendationItem } from "@/lib/api";
import {
  formatExplanationPoints,
  formatRankingReason,
  ParsedJobSection,
  parseStructuredJobDescription,
} from "@/lib/formatJob";
import { useLanguage } from "@/lib/i18n";

function FitRadialGauge({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const r = 34;
  const circ = 2 * Math.PI * r;
  const offset = circ - (clamped / 100) * circ;
  const strokeColor = clamped >= 75 ? "#10b981" : clamped >= 50 ? "#3b5bff" : "#f59e0b";

  return (
    <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
      <svg className="h-24 w-24 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e2e8f0" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center text-center">
        <span className="tnum font-mono text-xl font-bold leading-none text-[#0f172a]">{clamped}%</span>
        <span className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-[#64748b]">{label}</span>
      </div>
    </div>
  );
}

const SECTION_STYLE: Record<
  ParsedJobSection["kind"],
  { icon: React.ComponentType<{ className?: string }>; badge: string }
> = {
  overview: { icon: Layers, badge: "bg-[#3b5bff]/10 text-[#3b5bff]" },
  work: { icon: Cpu, badge: "bg-indigo-50 text-indigo-700" },
  requirements: { icon: GraduationCap, badge: "bg-emerald-50 text-emerald-700" },
  process: { icon: GitCommitHorizontal, badge: "bg-amber-50 text-amber-700" },
  compensation: { icon: DollarSign, badge: "bg-emerald-50 text-emerald-700" },
  timeline: { icon: Clock, badge: "bg-slate-100 text-slate-700" },
};

export default function JobDetailPage() {
  const { tx } = useLanguage();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<JobItem | null>(null);
  const [bundle, setBundle] = useState<ProfileBundle | null>(null);
  const [match, setMatch] = useState<RecommendationItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [matchingBusy, setMatchingBusy] = useState(false);
  const [explainingBusy, setExplainingBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tracked, setTracked] = useState(false);
  const [copiedJd, setCopiedJd] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<JobItem>(`/api/v1/jobs/${id}`),
      apiFetch<ProfileBundle>("/api/v1/profile"),
      apiFetch<{ items: RecommendationItem[] }>("/api/v1/recommendations?refresh=false&limit=50").catch(() => ({
        items: [],
      })),
    ])
      .then(([j, b, recs]) => {
        setJob(j);
        setBundle(b);
        setMatch(recs.items.find((r) => r.job.id === j.id) || null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load job"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleComputeMatch = async (withLlm = false) => {
    if (!job) return;
    if (withLlm) setExplainingBusy(true);
    else setMatchingBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ items: RecommendationItem[] }>("/api/v1/jobs/match", {
        method: "POST",
        body: JSON.stringify({ job_ids: [job.id], explain_with_llm: withLlm }),
      });
      if (res.items[0]) setMatch(res.items[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ML match failed");
    } finally {
      setMatchingBusy(false);
      setExplainingBusy(false);
    }
  };

  const handleSave = async () => {
    if (!job) return;
    setError(null);
    try {
      await apiFetch("/api/v1/feedback", {
        method: "POST",
        body: JSON.stringify({ job_id: job.id, signal_type: "save", is_implicit: false }),
      });
      setSaved(true);
      setMsg("Saved opportunity to your workspace.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save job");
    }
  };

  const handleTrackApplication = async () => {
    if (!job) return;
    setError(null);
    try {
      await apiFetch("/api/v1/applications", {
        method: "POST",
        body: JSON.stringify({ job_id: job.id, notes: "Created from Opportunity Brief" }),
      });
      setTracked(true);
      setMsg("Added to Pipeline Tracker.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create application");
    }
  };

  const candidateSkills = bundle?.skills || [];
  const jdLower = (job?.description || "").toLowerCase();
  const matchingSkills = candidateSkills.filter((s) => jdLower.includes(s.canonical_name.toLowerCase()));

  const structured = useMemo(
    () =>
      job
        ? parseStructuredJobDescription(job.description, job.title)
        : { facts: [], sections: [], estimatedMinutes: 1, cleanFullText: "" },
    [job]
  );

  const handleCopyJd = () => {
    if (!structured.cleanFullText) return;
    navigator.clipboard?.writeText(structured.cleanFullText).catch(() => {});
    setCopiedJd(true);
    setTimeout(() => setCopiedJd(false), 1800);
  };

  const explanation = useMemo(
    () => (match?.llm_explanation ? formatExplanationPoints(match.llm_explanation) : null),
    [match?.llm_explanation]
  );

  const payFact =
    job?.salary_raw ||
    structured.facts.find((f) => ["pay", "salary", "compensation"].includes(f.label.toLowerCase()))?.value;
  const scheduleFact = structured.facts.find((f) =>
    ["schedule", "duration"].includes(f.label.toLowerCase())
  )?.value;
  const fitPct = match ? Math.round(match.compatibility_probability * 100) : 0;

  return (
    <StudioShell
      title={tx("Opportunity Brief", "नौकरी विवरण")}
      subtitle={
        job
          ? `${job.company} · ${job.title}`
          : tx("Structured role breakdown and compatibility intelligence", "संरचित भूमिका विवरण और संगतता विश्लेषण")
      }
      actions={
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#0f172a] hover:border-[#cbd5e1]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {tx("Back", "वापस")}
        </button>
      }
    >
      {error && <Banner tone="error" message={error} onClose={() => setError(null)} className="mb-4" />}
      {msg && <Banner tone="success" message={msg} onClose={() => setMsg(null)} className="mb-4" />}

      {loading ? (
        <div className="space-y-5">
          <div className="skeleton h-52 w-full" />
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="skeleton h-96 lg:col-span-8" />
            <div className="skeleton h-96 lg:col-span-4" />
          </div>
        </div>
      ) : (
        job && (
          <div className="space-y-6">
            {/* Executive Atmospheric Cover Hero Card */}
            <div className="atoms-card overflow-hidden">
              <div className="relative z-0 flex h-20 items-start justify-between bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#2e3267] px-6 pt-4">
                <div className="flex items-center gap-2 font-mono text-[10.5px] text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span>{tx("LIVE INDEXED ROLE", "लाइव इंडेक्स नौकरी")}</span>
                  <span className="text-slate-500">·</span>
                  <span className="uppercase">{job.source_name}</span>
                </div>
                <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 font-mono text-[10.5px] text-slate-200 backdrop-blur-xs">
                  ~{structured.estimatedMinutes} {tx("min read", "मिनट पठन")} · {structured.sections.length}{" "}
                  {tx("sections", "खंड")}
                </span>
              </div>

              <div className="relative z-10 px-6 pb-6">
                <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
                  <div className="flex items-start gap-4">
                    <div className="-mt-7 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3b5bff] to-[#0f172a] font-mono text-2xl font-bold text-white shadow-lg ring-4 ring-white">
                      {(job.company || "M").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="pt-3">
                      <h2 className="text-2xl font-semibold tracking-tight text-[#0f172a]">{job.title}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-[#475569]">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[#0f172a]">
                          <Building2 className="h-3.5 w-3.5 text-[#3b5bff]" />
                          {job.company}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-[#64748b]" />
                          {job.location || "Worldwide / Remote"}
                        </span>
                        <span className="rounded-md bg-[#3b5bff]/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase text-[#3b5bff]">
                          {job.work_mode}
                        </span>
                        <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 font-mono text-[10.5px] capitalize text-[#475569]">
                          {job.job_type}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Primary Action Bar */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12.5px] font-medium transition ${
                        saved
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-[#e2e8f0] bg-white text-[#0f172a] hover:bg-[#f8fafc]"
                      }`}
                    >
                      {saved ? <Check className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                      {saved ? tx("Saved", "सहेजा गया") : tx("Save", "सहेजें")}
                    </button>
                    <button
                      type="button"
                      onClick={handleTrackApplication}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12.5px] font-medium transition ${
                        tracked
                          ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                          : "border-[#e2e8f0] bg-white text-[#0f172a] hover:bg-[#f8fafc]"
                      }`}
                    >
                      <Briefcase className="h-3.5 w-3.5" /> {tracked ? tx("Tracked", "ट्रैक किया गया") : tx("Track Draft", "ड्राफ्ट ट्रैक करें")}
                    </button>
                    <Link
                      href={`/assistant?q=${encodeURIComponent(
                        `Prepare interview questions and tailor my resume pitch for ${job.title} at ${job.company}`
                      )}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#3b5bff]/30 bg-[#3b5bff]/[0.08] px-3.5 py-2 text-[12.5px] font-medium text-[#2948eb] hover:bg-[#3b5bff]/[0.14]"
                    >
                      <Bot className="h-3.5 w-3.5" /> {tx("AI Prep", "AI तैयारी")}
                    </Link>
                    {job.application_url && (
                      <a
                        href={job.application_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#3b5bff] to-[#4f46e5] px-4 py-2 text-[12.5px] font-semibold text-white shadow-sm transition hover:brightness-110"
                      >
                        {tx("Apply Externally", "आवेदन करें")} <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Crisp Spec Cards Strip */}
                <div className="mt-5 grid gap-3 border-t border-[#f1f5f9] pt-5 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3.5 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-700">
                      <DollarSign className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#64748b]">
                        {tx("Compensation", "वेतन / पैकेज")}
                      </div>
                      <div className="truncate font-mono text-[12.5px] font-semibold text-[#0f172a]">
                        {payFact || tx("Competitive / Unlisted", "अनिश्चित / प्रतिस्पर्धी")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3.5 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#3b5bff]/10 text-[#3b5bff]">
                      <Clock className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#64748b]">
                        {tx("Schedule & Scope", "समय और प्रकार")}
                      </div>
                      <div className="truncate text-[12.5px] font-semibold capitalize text-[#0f172a]">
                        {scheduleFact || `${job.job_type} · ${job.work_mode}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3.5 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/12 text-amber-700">
                      <GraduationCap className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#64748b]">
                        {tx("Education", "शिक्षा")}
                      </div>
                      <div className="truncate text-[12.5px] font-semibold capitalize text-[#0f172a]">
                        {job.min_education || tx("Bachelor's / Equivalent", "स्नातक / समकक्ष")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3.5 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900/8 text-slate-700">
                      <Globe className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#64748b]">
                        {tx("Region & Level", "क्षेत्र और स्तर")}
                      </div>
                      <div className="truncate text-[12.5px] font-semibold capitalize text-[#0f172a]">
                        {job.seniority_level && job.seniority_level !== "unspecified"
                          ? `${job.seniority_level} · ${job.region || "GLOBAL"}`
                          : job.region || "Global Remote"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 8/4 Asymmetric Role Brief + Visual ML Compatibility */}
            <div className="grid items-start gap-6 lg:grid-cols-12">
              {/* Left Scannable Structured Sections (8 cols) */}
              <div className="space-y-4 lg:col-span-8">
                <div className="flex items-center justify-between px-1">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">
                    {tx("Full Job Specification", "पूर्ण नौकरी विवरण")} ({structured.sections.length} {tx("Sections", "खंड")})
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyJd}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0f172a] shadow-2xs transition hover:border-[#cbd5e1]"
                  >
                    {copiedJd ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" /> {tx("Copied Full Description", "पूरा विवरण कॉपी हो गया")}
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-[#3b5bff]" /> {tx("Copy Full Description", "पूरा विवरण कॉपी करें")}
                      </>
                    )}
                  </button>
                </div>
                {structured.sections.map((sec, idx) => {
                  const style = SECTION_STYLE[sec.kind];
                  const Icon = style.icon;
                  return (
                    <div key={`${sec.title}-${idx}`} className="atoms-card atoms-card-hover p-6">
                      <div className="mb-3.5 flex items-center justify-between border-b border-[#f1f5f9] pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${style.badge}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <h3 className="text-[15.5px] font-semibold tracking-tight text-[#0f172a]">{sec.title}</h3>
                        </div>
                        <span className="font-mono text-[10.5px] text-[#94a3b8]">0{idx + 1}</span>
                      </div>

                      <div className="space-y-3 text-[13.5px] leading-[1.7] text-[#334155]">
                        {sec.paragraphs.map((p, pi) => (
                          <p key={pi}>{p}</p>
                        ))}
                        {sec.bullets.length > 0 && (
                          <ul className="space-y-2.5 pt-1">
                            {sec.bullets.map((b, bi) => (
                              <li
                                key={bi}
                                className="flex items-start gap-2.5 rounded-xl bg-[#f8fafc] px-3.5 py-2.5 ring-1 ring-[#f1f5f9]"
                              >
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#3b5bff]" />
                                <span className="text-[13px] leading-relaxed text-[#1e293b]">{b}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Visual ML Compatibility & Skill Matrix (4 cols) */}
              <div className="space-y-4 lg:col-span-4 lg:sticky lg:top-20">
                <div className="atoms-card p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[14.5px] font-semibold text-[#0f172a]">
                      {tx("ML Fit Intelligence", "ML संगतता विश्लेषण")}
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleComputeMatch(false)}
                        disabled={matchingBusy || explainingBusy}
                        className="rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#0f172a] hover:bg-[#f8fafc] disabled:opacity-60"
                      >
                        {matchingBusy ? "..." : match ? tx("Re-score", "पुनः स्कोर") : tx("Score", "स्कोर करें")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleComputeMatch(true)}
                        disabled={matchingBusy || explainingBusy}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#3b5bff] px-2.5 py-1 text-[11px] font-medium text-white shadow-2xs hover:bg-[#2948eb] disabled:opacity-60"
                      >
                        <Sparkles className="h-3 w-3" />
                        {explainingBusy ? "..." : tx("AI Explain", "AI व्याख्या")}
                      </button>
                    </div>
                  </div>

                  {match ? (
                    <div className="mt-4 space-y-4">
                      {/* Circular Gauge Hero */}
                      <div className="flex items-center gap-4 rounded-2xl border border-[#e5e7eb] bg-gradient-to-br from-[#f8fafc] to-white p-4">
                        <FitRadialGauge pct={fitPct} label={tx("Match", "मैच")} />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-semibold text-[#0f172a]">
                              {tx("Calibrated Fit", "कैलिब्रेटेड फिट")}
                            </span>
                            <span className="rounded-md bg-[#3b5bff]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#3b5bff]">
                              LTR {match.ranking_score.toFixed(2)}
                            </span>
                          </div>
                          {match.ranking_reasons.slice(0, 2).map((r, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-[#475569]">
                              <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                              <span>{formatRankingReason(r)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Signal Telemetry Bars */}
                      <div className="space-y-2.5 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3.5 text-[12px]">
                        <div>
                          <div className="flex justify-between">
                            <span className="text-[#64748b]">{tx("Semantic Vector Similarity", "सिमेंटिक वेक्टर समानता")}</span>
                            <span className="tnum font-mono font-semibold text-[#0f172a]">
                              {Math.round(match.semantic_similarity * 100)}%
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#e2e8f0]">
                            <div
                              className="h-full rounded-full bg-[#3b5bff]"
                              style={{ width: `${Math.min(100, Math.round(match.semantic_similarity * 100))}%` }}
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between">
                            <span className="text-[#64748b]">{tx("Model Calibration Confidence", "मॉडल विश्वास स्तर")}</span>
                            <span className="tnum font-mono font-semibold text-[#0f172a]">
                              {Math.round(match.confidence * 100)}%
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#e2e8f0]">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${Math.min(100, Math.round(match.confidence * 100))}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Formatted AI Match Brief */}
                      {explanation && (
                        <div className="rounded-2xl border border-[#c7d2fe] bg-gradient-to-br from-[#eef2ff] to-white p-4 text-[12px] leading-relaxed text-[#0f172a]">
                          <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#3b5bff]">
                            <Sparkles className="h-3.5 w-3.5" /> {tx("AI Compatibility Brief", "AI संगतता सारांश")}
                          </div>
                          {explanation.intro && <p className="font-medium text-[#1e293b]">{explanation.intro}</p>}
                          {explanation.points.length > 0 && (
                            <ul className="mt-2 space-y-1.5">
                              {explanation.points.map((pt, pi) => (
                                <li key={pi} className="flex items-start gap-2 text-[#334155]">
                                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3b5bff]" />
                                  <span>{pt}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-[12.5px] text-[#64748b]">
                      {tx(
                        "Click Score to evaluate compatibility against your resume or AI Explain for tailored insights.",
                        "अपने रिज्यूमे के साथ मिलान देखने के लिए स्कोर करें या विस्तृत विश्लेषण के लिए AI व्याख्या दबाएँ।"
                      )}
                    </p>
                  )}
                </div>

                {/* Dedicated Skill Alignment Card */}
                <div className="atoms-card p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[14px] font-semibold text-[#0f172a]">
                      {tx("Skill Alignment", "कौशल मिलान")}
                    </h3>
                    <Link
                      href={`/assistant?q=${encodeURIComponent(`Analyze my skill gaps for ${job.title} at ${job.company}`)}`}
                      className="text-[11.5px] font-medium text-[#3b5bff] hover:underline"
                    >
                      {tx("Ask AI →", "AI से पूछें →")}
                    </Link>
                  </div>

                  <div className="mt-3.5">
                    <div className="text-[10.5px] font-semibold uppercase tracking-wider text-emerald-700">
                      {tx("Verified Matches", "सत्यापित मिलान")}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(match?.strong_matching_skills || []).length > 0 ? (
                        match!.strong_matching_skills.map((skill) => (
                          <span
                            key={skill}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-[11px] font-medium text-emerald-800"
                          >
                            <Check className="h-3 w-3" /> {skill}
                          </span>
                        ))
                      ) : matchingSkills.length === 0 ? (
                        <span className="text-[12px] text-[#64748b]">
                          {tx("Upload resume to detect skill overlap", "कौशल मिलान देखने के लिए रिज्यूमे अपलोड करें")}
                        </span>
                      ) : (
                        matchingSkills.map((s) => (
                          <span
                            key={s.slug}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-[11px] font-medium text-emerald-800"
                          >
                            <Check className="h-3 w-3" /> {s.canonical_name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {match && match.missing_skills.length > 0 && (
                    <div className="mt-4 border-t border-[#f1f5f9] pt-3.5">
                      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-amber-700">
                        {tx("Priority Gaps", "मुख्य कमियाँ")}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {match.missing_skills.map((skill) => (
                          <span
                            key={skill}
                            className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 font-mono text-[11px] font-medium text-amber-800"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </StudioShell>
  );
}
