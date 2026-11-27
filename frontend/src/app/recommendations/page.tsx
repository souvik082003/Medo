"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bookmark, RefreshCw, Sparkles, ThumbsDown } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { apiFetch, RecommendationItem } from "@/lib/api";

export default function RecommendationsPage() {
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRecommendations = async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ items: RecommendationItem[]; total: number }>(
        `/api/v1/recommendations?refresh=${refresh ? "true" : "false"}&limit=25`
      );
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ML recommendations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecommendations(true);
  }, []);

  const sendSignal = async (jobId: string, signal_type: "shortlist" | "dismiss") => {
    await apiFetch("/api/v1/feedback", {
      method: "POST",
      body: JSON.stringify({ job_id: jobId, signal_type, is_implicit: false }),
    });
    setMsg(`Recorded '${signal_type}' feedback signal for ranking evaluation.`);
    if (signal_type === "dismiss") {
      setItems((prev) => prev.filter((r) => r.job.id !== jobId));
    }
  };

  return (
    <StudioShell
      title="Job Recommendation Results"
      subtitle="Calibrated ML compatibility probabilities, Learning-to-Rank scores, and verified match evidence"
      actions={
        <button
          onClick={() => loadRecommendations(true)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[12px] font-medium hover:border-black/20"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Recompute ML Ranking
        </button>
      }
    >
      {msg && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[12px] text-emerald-800">
          {msg}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3.5">
        {items.length === 0 && !loading ? (
          <div className="atoms-card p-10 text-center text-[13px] text-[#71717a]">
            No recommendations available yet. Load demo or ingested jobs in{" "}
            <Link href="/discover" className="text-[#4267ff] underline">
              Job Discovery
            </Link>{" "}
            and upload your resume in{" "}
            <Link href="/resume" className="text-[#4267ff] underline">
              Resume Intelligence
            </Link>
            .
          </div>
        ) : (
          items.map((r, idx) => (
            <div key={r.job.id} className="atoms-card atoms-card-hover p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] font-semibold text-[#4267ff]">#{idx + 1}</span>
                    <Link href={`/jobs/${r.job.id}`} className="text-[15px] font-semibold hover:text-[#4267ff]">
                      {r.job.title}
                    </Link>
                    <span className="rounded bg-black/[0.05] px-2 py-0.5 font-mono text-[10px]">
                      {r.job.region || "GLOBAL"}
                    </span>
                    <span className="rounded bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-800">
                      {r.training_data_provenance}
                    </span>
                  </div>
                  <div className="mt-1 text-[12px] text-[#52525b]">
                    {r.job.company} · {r.job.location || "Unspecified"} · {r.job.work_mode}
                    {r.job.salary_raw ? ` · ${r.job.salary_raw}` : ""}
                  </div>

                  {/* Strong & Missing Skills */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {r.strong_matching_skills.slice(0, 6).map((sk) => (
                      <span
                        key={sk}
                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] text-emerald-800"
                      >
                        + {sk}
                      </span>
                    ))}
                    {r.missing_skills.slice(0, 4).map((sk) => (
                      <span
                        key={sk}
                        className="rounded border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[10px] text-red-700"
                      >
                        - {sk}
                      </span>
                    ))}
                  </div>

                  {/* Deterministic ML Ranking Reasons */}
                  <ul className="mt-2.5 space-y-1 text-[12px] text-[#52525b]">
                    {r.ranking_reasons.map((reason, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 shrink-0 text-[#4267ff]" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Calibrated Compatibility & Actions */}
                <div className="flex shrink-0 flex-col items-end gap-2.5">
                  <div className="rounded-xl border border-black/[0.08] bg-[#fafafa] px-3.5 py-2 text-right">
                    <div className="font-mono text-[10px] uppercase text-[#71717a]">Compatibility</div>
                    <div className="font-mono text-xl font-semibold text-[#4267ff]">
                      {Math.round(r.compatibility_probability * 100)}%
                    </div>
                    <div className="font-mono text-[10px] text-[#71717a]">
                      conf {Math.round(r.confidence * 100)}% · sim {r.semantic_similarity.toFixed(2)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => sendSignal(r.job.id, "shortlist")}
                      className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-[11px] font-medium hover:border-black/20"
                    >
                      <Bookmark className="h-3 w-3" /> Shortlist
                    </button>
                    <button
                      onClick={() => sendSignal(r.job.id, "dismiss")}
                      className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-[11px] text-[#71717a] hover:border-red-200 hover:text-red-600"
                    >
                      <ThumbsDown className="h-3 w-3" /> Dismiss
                    </button>
                    <Link
                      href={`/jobs/${r.job.id}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#171716] px-2.5 py-1.5 text-[11px] font-medium text-white"
                    >
                      Details <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </StudioShell>
  );
}
