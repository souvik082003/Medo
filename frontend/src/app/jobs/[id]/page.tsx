"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Bookmark, Bot, Briefcase, ExternalLink, Sparkles } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { Banner } from "@/components/ui";
import { apiFetch, JobItem, ProfileBundle, RecommendationItem } from "@/lib/api";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<JobItem | null>(null);
  const [bundle, setBundle] = useState<ProfileBundle | null>(null);
  const [match, setMatch] = useState<RecommendationItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [matchingBusy, setMatchingBusy] = useState(false);
  const [explainingBusy, setExplainingBusy] = useState(false);
  const [saved, setSaved] = useState(false);
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
        body: JSON.stringify({ job_id: job.id, notes: "Created from Job Detail" }),
      });
      setMsg("Application draft created in Pipeline Tracker.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create application");
    }
  };

  const candidateSkills = bundle?.skills || [];
  const jdLower = (job?.description || "").toLowerCase();
  const matchingSkills = candidateSkills.filter((s) => jdLower.includes(s.canonical_name.toLowerCase()));

  return (
    <StudioShell
      title={job ? job.title : "Job Detail"}
      subtitle={job ? `${job.company} · ${job.location || "Remote"}` : "Compatibility explanation & JD"}
      actions={
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#0f172a] hover:border-[#cbd5e1]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      }
    >
      {error && <Banner tone="error" message={error} onClose={() => setError(null)} className="mb-4" />}
      {msg && <Banner tone="success" message={msg} onClose={() => setMsg(null)} className="mb-4" />}

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="skeleton h-96 lg:col-span-8" />
          <div className="skeleton h-96 lg:col-span-4" />
        </div>
      ) : (
        job && (
          <div className="space-y-5">
            {/* Top Role Header Summary */}
            <div className="atoms-card flex flex-col justify-between gap-4 p-6 md:flex-row md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 font-mono text-[10.5px] font-medium text-[#475569]">
                    {job.source_name}
                  </span>
                  <span className="rounded-md bg-[#3b5bff]/10 px-2 py-0.5 font-mono text-[10.5px] font-medium text-[#3b5bff]">
                    {job.work_mode}
                  </span>
                  <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 font-mono text-[10.5px] text-[#475569]">
                    {job.region || "GLOBAL"}
                  </span>
                  {job.salary_raw && (
                    <span className="rounded-md bg-emerald-50 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-700">
                      {job.salary_raw}
                    </span>
                  )}
                </div>
                <h2 className="mt-2.5 text-xl font-semibold tracking-tight text-[#0f172a]">{job.title}</h2>
                <p className="mt-0.5 text-[13.5px] text-[#475569]">
                  <strong className="font-medium text-[#0f172a]">{job.company}</strong> · {job.location || "Remote"} ·{" "}
                  <span className="capitalize">{job.job_type}</span>
                </p>
              </div>

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
                  <Bookmark className="h-3.5 w-3.5" /> {saved ? "Saved" : "Save Role"}
                </button>
                <button
                  type="button"
                  onClick={handleTrackApplication}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0f172a] px-4 py-2 text-[12.5px] font-medium text-white hover:bg-[#1e293b]"
                >
                  <Briefcase className="h-3.5 w-3.5" /> Track Draft
                </button>
                <Link
                  href={`/assistant?q=${encodeURIComponent(`Prepare interview questions and tailor my resume pitch for ${job.title} at ${job.company}`)}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#3b5bff]/30 bg-[#3b5bff]/[0.08] px-3.5 py-2 text-[12.5px] font-medium text-[#2948eb] hover:bg-[#3b5bff]/[0.14]"
                >
                  <Bot className="h-3.5 w-3.5" /> Prep &amp; Tailor Pitch
                </Link>
                {job.application_url && (
                  <a
                    href={job.application_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-2 text-[12.5px] font-medium text-[#0f172a] hover:border-[#cbd5e1]"
                  >
                    Apply <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Balanced 8/4 Split */}
            <div className="grid items-start gap-6 lg:grid-cols-12">
              <div className="atoms-card p-6 lg:col-span-8">
                <h3 className="mb-3 border-b border-[#f1f5f9] pb-3 text-[15px] font-semibold text-[#0f172a]">
                  Role Description &amp; Requirements
                </h3>
                <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#334155]">
                  {job.description}
                </div>
              </div>

              <div className="space-y-4 lg:col-span-4">
                <div className="atoms-card sticky top-20 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[14.5px] font-semibold text-[#0f172a]">ML Compatibility</h3>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleComputeMatch(false)}
                        disabled={matchingBusy || explainingBusy}
                        className="rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#0f172a] hover:bg-[#f8fafc] disabled:opacity-60"
                      >
                        {matchingBusy ? "..." : match ? "Re-score" : "Compute Fit"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleComputeMatch(true)}
                        disabled={matchingBusy || explainingBusy}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#3b5bff] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#2948eb] disabled:opacity-60"
                      >
                        <Sparkles className="h-3 w-3" />
                        {explainingBusy ? "..." : "AI Explain"}
                      </button>
                    </div>
                  </div>

                  {match ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5">
                        <div className="flex items-baseline justify-between">
                          <span className="tnum font-mono text-2xl font-semibold text-emerald-800">
                            {Math.round(match.compatibility_probability * 100)}% fit
                          </span>
                          <span className="font-mono text-[10px] text-[#475569]">LTR {match.ranking_score.toFixed(2)}</span>
                        </div>
                        <div className="mt-1.5 text-[11.5px] text-[#334155]">
                          {match.ranking_reasons.slice(0, 3).join(" · ")}
                        </div>
                      </div>

                      <div className="space-y-2 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3.5 text-[11.5px]">
                        <div>
                          <div className="flex justify-between">
                            <span className="text-[#64748b]">Semantic Similarity</span>
                            <span className="tnum font-mono font-semibold text-[#0f172a]">
                              {Math.round(match.semantic_similarity * 100)}%
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#e2e8f0]">
                            <div
                              className="h-full rounded-full bg-[#3b5bff]"
                              style={{ width: `${Math.min(100, Math.round(match.semantic_similarity * 100))}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex justify-between pt-1">
                          <span className="text-[#64748b]">Model Confidence</span>
                          <span className="tnum font-mono font-semibold text-[#0f172a]">
                            {Math.round(match.confidence * 100)}%
                          </span>
                        </div>
                      </div>

                      {match.llm_explanation && (
                        <div className="rounded-xl border border-[#3b5bff]/25 bg-[#3b5bff]/[0.05] p-3.5 text-[12px] leading-relaxed text-[#0f172a]">
                          <div className="mb-1 flex items-center gap-1 font-mono text-[10px] font-semibold text-[#3b5bff]">
                            <Sparkles className="h-3 w-3" /> CONSENT-GATED AI EXPLANATION
                          </div>
                          {match.llm_explanation}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-[12px] text-[#64748b]">
                      Click <strong>Compute Fit</strong> to score against your resume or <strong>AI Explain</strong> for tailored advice.
                    </p>
                  )}

                  <div className="mt-4 space-y-2 border-t border-[#f1f5f9] pt-4 text-[12px]">
                    <div className="flex justify-between">
                      <span className="text-[#64748b]">Seniority</span>
                      <span className="font-mono text-[#0f172a]">{job.seniority_level || "unspecified"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748b]">Min Education</span>
                      <span className="font-mono text-[#0f172a]">{job.min_education || "unspecified"}</span>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-[#f1f5f9] pt-4">
                    <div className="text-[12px] font-semibold text-[#0f172a]">Matched Candidate Skills</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(match?.strong_matching_skills || []).length > 0 ? (
                        match!.strong_matching_skills.map((skill) => (
                          <span
                            key={skill}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10.5px] text-emerald-800"
                          >
                            {skill}
                          </span>
                        ))
                      ) : matchingSkills.length === 0 ? (
                        <span className="text-[11.5px] text-[#64748b]">Upload resume for exact skill match</span>
                      ) : (
                        matchingSkills.map((s) => (
                          <span
                            key={s.slug}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10.5px] text-emerald-800"
                          >
                            {s.canonical_name}
                          </span>
                        ))
                      )}
                    </div>

                    {match && match.missing_skills.length > 0 && (
                      <div className="mt-3">
                        <div className="text-[12px] font-semibold text-[#0f172a]">Missing Skills</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {match.missing_skills.map((skill) => (
                            <span
                              key={skill}
                              className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[10.5px] text-amber-800"
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
          </div>
        )
      )}
    </StudioShell>
  );
}
