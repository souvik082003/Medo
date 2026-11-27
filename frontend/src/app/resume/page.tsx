"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, FileUp, Sparkles } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { Banner, EmptyState } from "@/components/ui";
import { apiFetch, ProfileBundle, ResumeUploadResponse } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

export default function ResumeIntelligencePage() {
  const { tx } = useLanguage();
  const [bundle, setBundle] = useState<ProfileBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    apiFetch<ProfileBundle>("/api/v1/profile")
      .then(setBundle)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load profile"))
      .finally(() => setLoading(false));
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

  const categories = useMemo(() => {
    const set = new Set((bundle?.skills || []).map((s) => s.category));
    return ["all", ...Array.from(set)];
  }, [bundle]);

  const visibleSkills = useMemo(() => {
    const list = bundle?.skills || [];
    return categoryFilter === "all" ? list : list.filter((s) => s.category === categoryFilter);
  }, [bundle, categoryFilter]);

  const primaryResume = bundle?.resumes.find((r) => r.is_primary) || bundle?.resumes[0];
  const parsedSections = Object.entries(primaryResume?.parsed_sections_json || {}).filter(
    ([, val]) => typeof val === "string" && val.trim().length > 0
  );

  return (
    <StudioShell
      title={tx("Resume Studio", "रिज्यूमे स्टूडियो")}
      subtitle={tx(
        "SHA-256 versioned ingestion, canonical skill normalization, and verbatim evidence spans",
        "SHA-256 वर्जन नियंत्रण, कौशल मानकीकरण और रिज्यूमे से सीधे साक्ष्य उद्धरण"
      )}
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/skills"
            className="rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#0f172a] hover:border-[#cbd5e1]"
          >
            {tx("Skill Gaps", "कौशल अंतर")}
          </Link>
          <Link
            href="/recommendations"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0f172a] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#1e293b]"
          >
            {tx("Match Jobs", "नौकरियाँ मिलाएँ")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      }
    >
      {message && <Banner tone="success" message={message} onClose={() => setMessage(null)} className="mb-4" />}
      {error && <Banner tone="error" message={error} onClose={() => setError(null)} className="mb-4" />}

      <div className="grid items-start gap-6 lg:grid-cols-12">
        {/* Left Upload + Versions + Sections (4 cols) */}
        <div className="space-y-5 lg:col-span-4">
          <label className="atoms-card flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-[#cbd5e1] bg-white p-6 text-center transition hover:border-[#3b5bff] hover:bg-[#3b5bff]/[0.02]">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3b5bff]/10 text-[#3b5bff]">
              <FileUp className="h-5 w-5" />
            </div>
            <span className="mt-3 text-[13.5px] font-semibold text-[#0f172a]">
              {uploading ? tx("Parsing & Embedding...", "पार्स और एम्बेड हो रहा है...") : tx("Upload New Resume Version", "नया रिज्यूमे वर्जन अपलोड करें")}
            </span>
            <span className="mt-1 text-[11.5px] text-[#64748b]">{tx("PDF, DOCX, MD, or TXT up to 10 MB", "PDF, DOCX, MD, या TXT (10 MB तक)")}</span>
            <input
              type="file"
              accept=".pdf,.docx,.md,.txt"
              disabled={uploading}
              className="hidden"
              onChange={(e) => handleUpload(e.target.files?.[0])}
            />
          </label>

          <div className="atoms-card p-5">
            <h2 className="mb-3 text-[14px] font-semibold text-[#0f172a]">{tx("Version History", "वर्जन इतिहास")}</h2>
            {loading ? (
              <div className="skeleton h-20 w-full" />
            ) : !bundle || bundle.resumes.length === 0 ? (
              <p className="text-[12px] text-[#64748b]">{tx("No resumes uploaded yet.", "अभी तक कोई रिज्यूमे अपलोड नहीं हुआ।")}</p>
            ) : (
              <div className="space-y-2.5">
                {bundle.resumes.map((rv) => (
                  <div key={rv.id} className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-[#0f172a]">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-[#3b5bff]" />
                        <span className="truncate">{rv.filename}</span>
                      </div>
                      {rv.is_primary && (
                        <span className="rounded-md bg-[#3b5bff]/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#3b5bff]">
                          {tx("PRIMARY", "मुख्य")}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-[10.5px] text-[#64748b]">
                      v{rv.version_num} · {(rv.file_size_bytes / 1024).toFixed(1)} KB · sha256:{rv.sha256_hash.slice(0, 8)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {parsedSections.length > 0 && (
            <div className="atoms-card p-5">
              <h2 className="mb-3 text-[14px] font-semibold text-[#0f172a]">{tx("Parsed Sections", "पार्स किए गए अनुभाग")}</h2>
              <div className="space-y-2.5">
                {parsedSections.map(([sectionName, sectionVal]) => (
                  <div key={sectionName} className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3">
                    <div className="font-mono text-[10.5px] font-semibold uppercase text-[#3b5bff]">{sectionName}</div>
                    <p className="mt-1 line-clamp-2 text-[11.5px] text-[#475569]">{String(sectionVal)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Canonical Skills Grid (8 cols) */}
        <div className="atoms-card p-6 lg:col-span-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#f1f5f9] pb-4">
            <div>
              <h2 className="flex items-center gap-2 text-[15.5px] font-semibold text-[#0f172a]">
                <Sparkles className="h-4 w-4 text-[#3b5bff]" />
                {tx("Verified Skills & Verbatim Evidence Spans", "सत्यापित कौशल और साक्ष्य अंश")}
              </h2>
              <p className="mt-0.5 text-[12px] text-[#64748b]">
                {tx(
                  "Synonyms normalize into canonical skills backed directly by lines parsed from your resume",
                  "समानार्थी शब्द आपके रिज्यूमे की पंक्तियों से सीधे जुड़े मानक कौशलों में बदलते हैं"
                )}
              </p>
            </div>
            <span className="tnum rounded-lg bg-[#f1f5f9] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#0f172a]">
              {bundle?.skills.length || 0} {tx("verified", "सत्यापित")}
            </span>
          </div>

          {categories.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded-lg px-2.5 py-1 font-mono text-[11px] capitalize transition ${
                    categoryFilter === cat
                      ? "bg-[#3b5bff] text-white shadow-2xs"
                      : "bg-[#f8fafc] text-[#475569] ring-1 ring-[#e2e8f0] hover:text-[#0f172a]"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="skeleton h-28 w-full" />
              ))}
            </div>
          ) : visibleSkills.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={tx("No verified skills extracted yet", "अभी तक कोई सत्यापित कौशल नहीं निकाला गया")}
              description={tx(
                "Upload a PDF, DOCX, Markdown, or TXT resume on the left to extract canonical skills and generate vector embeddings.",
                "मानक कौशल निकालने और वेक्टर एम्बेडिंग बनाने के लिए बाईं ओर PDF, DOCX, Markdown, या TXT रिज्यूमे अपलोड करें।"
              )}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {visibleSkills.map((sk) => {
                const confPct = Math.round(sk.confidence * 100);
                return (
                  <div key={sk.slug} className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[14px] font-semibold text-[#0f172a]">{sk.canonical_name}</div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="rounded bg-white px-2 py-0.5 font-mono text-[10px] text-[#475569] ring-1 ring-[#e2e8f0]">
                            {sk.category}
                          </span>
                          <span className="rounded bg-[#3b5bff]/10 px-2 py-0.5 font-mono text-[10px] font-medium text-[#3b5bff]">
                            {sk.proficiency}
                          </span>
                        </div>
                      </div>
                      <span className="tnum font-mono text-[12px] font-semibold text-[#0f172a]">{confPct}%</span>
                    </div>

                    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[#e2e8f0]">
                      <div className="h-full rounded-full bg-[#3b5bff]" style={{ width: `${confPct}%` }} />
                    </div>

                    <div className="mt-2.5 line-clamp-2 rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-1.5 font-mono text-[10.5px] text-[#475569]">
                      “{sk.evidence_span}”
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
