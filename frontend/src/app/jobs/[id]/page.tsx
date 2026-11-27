"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Briefcase, CheckCircle2, ExternalLink } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { apiFetch, JobItem, ProfileBundle, RecommendationItem } from "@/lib/api";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<JobItem | null>(null);
  const [bundle, setBundle] = useState<ProfileBundle | null>(null);
  const [match, setMatch] = useState<RecommendationItem | null>(null);
  const [matchingBusy, setMatchingBusy] = useState(false);
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
        const found = recs.items.find((r) => r.job.id === j.id) || null;
        setMatch(found);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load job"));
  }, [id]);

  const handleComputeMatch = async () => {
    if (!job) return;
    setMatchingBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ items: RecommendationItem[] }>("/api/v1/jobs/match", {
        method: "POST",
        body: JSON.stringify({ job_ids: [job.id], explain_with_llm: false }),
      });
      if (res.items[0]) {
        setMatch(res.items[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ML match failed");
    } finally {
      setMatchingBusy(false);
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
      setMsg("Application draft created in Application Tracker (requires your manual submission).");
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
      subtitle={job ? `${job.company} · ${job.location || "Unspecified"}` : "Compatibility explanation & JD"}
      actions={
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-3 py-1.5 text-[12px] font-medium"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      }
    >
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>}
      {msg && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          <span>{msg}</span>
        </div>
      )}

      {job && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="atoms-card p-6 lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-black/[0.05] px-2 py-0.5 font-mono text-[11px]">{job.source_name}</span>
              <span className="rounded bg-[#4267ff]/10 px-2 py-0.5 font-mono text-[11px] text-[#4267ff]">
                {job.work_mode}
              </span>
              <span className="rounded bg-black/[0.05] px-2 py-0.5 font-mono text-[11px]">{job.job_type}</span>
              {job.salary_raw && (
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-700">
                  {job.salary_raw}
                </span>
              )}
            </div>

            <h2 className="mt-4 text-[16px] font-semibold">Job Description</h2>
            <div className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-[#52525b]">
              {job.description}
            </div>
          </div>

          <div className="space-y-4">
            <div className="atoms-card p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-semibold">ML Compatibility Explanation</h3>
                <button
                  type="button"
                  onClick={handleComputeMatch}
                  disabled={matchingBusy}
                  className="rounded-lg border border-black/15 px-2.5 py-1 text-[11px] font-medium hover:border-black/30 disabled:opacity-60"
                >
                  {matchingBusy ? "Scoring..." : match ? "Re-score" : "Compute Fit"}
                </button>
              </div>
              {match && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-xl font-semibold text-emerald-800">
                      {Math.round(match.compatibility_probability * 100)}% fit
                    </span>
                    <span className="font-mono text-[10px] text-[#52525b]">
                      LTR {match.ranking_score.toFixed(2)} · {match.training_data_provenance}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-[#52525b]">
                    {match.ranking_reasons.slice(0, 2).join(" · ")}
                  </div>
                </div>
              )}
              <div className="mt-3 space-y-2 text-[12px]">
                <div className="flex justify-between">
                  <span className="text-[#71717a]">Seniority</span>
                  <span className="font-mono">{job.seniority_level || "unspecified"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#71717a]">Min Education</span>
                  <span className="font-mono">{job.min_education || "unspecified"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#71717a]">Region</span>
                  <span className="font-mono">{job.region || "GLOBAL"}</span>
                </div>
              </div>

              <div className="mt-4 border-t border-black/[0.06] pt-3">
                <div className="text-[12px] font-medium text-[#171716]">Matched Candidate Skills</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(match?.strong_matching_skills || []).length > 0 ? (
                    match!.strong_matching_skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-800"
                      >
                        {skill}
                      </span>
                    ))
                  ) : matchingSkills.length === 0 ? (
                    <span className="text-[11px] text-[#71717a]">Upload resume to compute exact skill overlap</span>
                  ) : (
                    matchingSkills.map((s) => (
                      <span
                        key={s.slug}
                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-800"
                      >
                        {s.canonical_name}
                      </span>
                    ))
                  )}
                </div>
                {match && match.missing_skills.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[12px] font-medium text-[#171716]">Missing Skills</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {match.missing_skills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[11px] text-amber-800"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="atoms-card space-y-2.5 p-5">
              <button
                onClick={handleTrackApplication}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#171716] px-4 py-2.5 text-[13px] font-medium text-white hover:bg-[#272726]"
              >
                <Briefcase className="h-4 w-4" /> Track Application
              </button>
              <a
                href={job.application_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/10 px-4 py-2 text-[12px] font-medium text-[#171716] hover:border-black/20"
              >
                Open Original Posting <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </StudioShell>
  );
}
