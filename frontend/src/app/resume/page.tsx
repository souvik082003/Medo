"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, FileText, FileUp, Sparkles } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { apiFetch, ProfileBundle, ResumeUploadResponse } from "@/lib/api";

export default function ResumeIntelligencePage() {
  const [bundle, setBundle] = useState<ProfileBundle | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    apiFetch<ProfileBundle>("/api/v1/profile")
      .then(setBundle)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load profile"));
  };

  useEffect(() => {
    load();
  }, []);

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch<ResumeUploadResponse>("/api/v1/profile/resume", {
        method: "POST",
        body: fd,
      });
      setMessage(
        `Processed ${res.resume.filename}: ${res.extracted_skills.length} canonical skills extracted (${res.embedding_model}, ${res.embedding_dim}d).`
      );
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <StudioShell
      title="Resume Intelligence"
      subtitle="Structured parsing, normalized skill taxonomy, confidence scores, and evidence spans"
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upload & Version History */}
        <div className="space-y-5">
          <label className="atoms-card flex cursor-pointer flex-col items-center justify-center border-dashed p-6 text-center transition hover:border-[#4267ff]">
            <FileUp className="h-6 w-6 text-[#4267ff]" />
            <span className="mt-2 text-[13px] font-semibold">
              {uploading ? "Parsing & Embedding..." : "Upload New Resume Version"}
            </span>
            <span className="mt-1 text-[11px] text-[#71717a]">PDF, DOCX, MD, or TXT up to 10 MB</span>
            <input
              type="file"
              accept=".pdf,.docx,.md,.txt"
              disabled={uploading}
              className="hidden"
              onChange={(e) => handleUpload(e.target.files?.[0])}
            />
          </label>

          {message && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{message}</span>
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>
          )}

          <div className="atoms-card p-5">
            <h2 className="mb-3 text-[14px] font-semibold">Resume Versions</h2>
            {!bundle || bundle.resumes.length === 0 ? (
              <p className="text-[12px] text-[#71717a]">No resumes uploaded yet.</p>
            ) : (
              <div className="space-y-2.5">
                {bundle.resumes.map((rv) => (
                  <div key={rv.id} className="rounded-lg border border-black/[0.07] bg-[#fafafa] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate text-[13px] font-medium">
                        <FileText className="h-3.5 w-3.5 text-[#4267ff]" />
                        <span className="truncate">{rv.filename}</span>
                      </div>
                      {rv.is_primary && (
                        <span className="rounded bg-[#4267ff]/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#4267ff]">
                          PRIMARY
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-[#71717a]">
                      v{rv.version_num} · {(rv.file_size_bytes / 1024).toFixed(1)} KB · sha256:{rv.sha256_hash.slice(0, 8)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Verified Skills + Evidence Spans */}
        <div className="atoms-card p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <Sparkles className="h-4 w-4 text-[#4267ff]" />
                Canonical Skills & Grounded Evidence Spans
              </h2>
              <p className="text-[12px] text-[#71717a]">
                Every extracted skill maps synonyms to canonical taxonomy entries with verbatim resume evidence
              </p>
            </div>
            <span className="rounded-md bg-black/[0.05] px-2.5 py-1 font-mono text-[11px]">
              {bundle?.skills.length || 0} verified
            </span>
          </div>

          {!bundle || bundle.skills.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 bg-[#fafafa] p-10 text-center text-[13px] text-[#71717a]">
              Upload a resume to inspect extracted skills, confidence scores, and evidence spans.
            </div>
          ) : (
            <div className="space-y-2.5">
              {bundle.skills.map((sk) => (
                <div key={sk.slug} className="rounded-xl border border-black/[0.07] bg-[#fafafa] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-[#171716]">{sk.canonical_name}</span>
                      <span className="rounded bg-white px-2 py-0.5 font-mono text-[10px] text-[#52525b] border border-black/[0.06]">
                        {sk.category}
                      </span>
                      <span className="rounded bg-[#4267ff]/10 px-2 py-0.5 font-mono text-[10px] text-[#4267ff]">
                        {sk.proficiency}
                      </span>
                    </div>
                    <span className="font-mono text-[12px] font-medium text-[#171716]">
                      {(sk.confidence * 100).toFixed(0)}% conf
                    </span>
                  </div>
                  <div className="mt-2 rounded-md border border-black/[0.05] bg-white px-3 py-1.5 font-mono text-[11px] text-[#52525b]">
                    “{sk.evidence_span}”
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
