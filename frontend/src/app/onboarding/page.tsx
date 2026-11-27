"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, FileUp, ShieldCheck } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { apiFetch, ResumeUploadResponse } from "@/lib/api";

export default function OnboardingPage() {
  const router = useRouter();
  const [roles, setRoles] = useState("Machine Learning Engineer, AI Systems Engineer");
  const [locations, setLocations] = useState("Bengaluru, Remote, San Francisco");
  const [regions, setRegions] = useState<string[]>(["IN", "US"]);
  const [currency, setCurrency] = useState("INR");
  const [minSalary, setMinSalary] = useState("3000000");
  const [llmConsent, setLlmConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleRegion = (reg: string) => {
    setRegions((prev) => (prev.includes(reg) ? prev.filter((r) => r !== reg) : [...prev, reg]));
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setStatusMsg(null);
    try {
      await apiFetch("/api/v1/auth/consent", {
        method: "POST",
        body: JSON.stringify({ granted: llmConsent }),
      });

      await apiFetch("/api/v1/profile/preferences", {
        method: "PUT",
        body: JSON.stringify({
          preferred_roles: roles.split(",").map((s) => s.trim()).filter(Boolean),
          preferred_locations: locations.split(",").map((s) => s.trim()).filter(Boolean),
          preferred_regions: regions.length ? regions : ["GLOBAL"],
          preferred_currency: currency,
          min_salary: minSalary ? Number(minSalary) : null,
          work_modes: ["remote", "hybrid", "onsite"],
          job_types: ["full-time"],
        }),
      });

      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const up = await apiFetch<ResumeUploadResponse>("/api/v1/profile/resume", {
          method: "POST",
          body: fd,
        });
        setStatusMsg(
          `Onboarding saved! Extracted ${up.extracted_skills.length} canonical skills and generated ${up.embedding_dim}-dim embedding.`
        );
      } else {
        setStatusMsg("Preferences and consent saved.");
      }
      setTimeout(() => router.push("/dashboard"), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onboarding failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <StudioShell
      title="Candidate Onboarding"
      subtitle="Configure target regions, compensation currency, LLM consent, and primary resume"
    >
      <form onSubmit={handleComplete} className="mx-auto max-w-3xl space-y-5">
        <div className="atoms-card p-6">
          <h2 className="text-[15px] font-semibold">1. Target Roles & Regions</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[12px] font-medium text-[#52525b]">
                Preferred Roles (comma-separated)
              </label>
              <input
                value={roles}
                onChange={(e) => setRoles(e.target.value)}
                className="w-full rounded-lg border border-black/10 bg-[#fafafa] px-3 py-2 text-[13px] outline-none focus:border-[#4267ff] focus:bg-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-[12px] font-medium text-[#52525b]">
                Preferred Locations
              </label>
              <input
                value={locations}
                onChange={(e) => setLocations(e.target.value)}
                className="w-full rounded-lg border border-black/10 bg-[#fafafa] px-3 py-2 text-[13px] outline-none focus:border-[#4267ff] focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#52525b]">Target Regions</label>
              <div className="flex flex-wrap gap-1.5">
                {["IN", "US", "UK", "SG", "EU", "GLOBAL"].map((reg) => {
                  const active = regions.includes(reg);
                  return (
                    <button
                      key={reg}
                      type="button"
                      onClick={() => toggleRegion(reg)}
                      className={`rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium transition ${
                        active
                          ? "border-[#4267ff] bg-[#4267ff]/10 text-[#4267ff]"
                          : "border-black/10 bg-white text-[#52525b]"
                      }`}
                    >
                      {reg}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[#52525b]">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-black/10 bg-[#fafafa] px-3 py-2 text-[13px]"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="SGD">SGD (S$)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[#52525b]">Min Annual Salary</label>
                <input
                  type="number"
                  value={minSalary}
                  onChange={(e) => setMinSalary(e.target.value)}
                  className="w-full rounded-lg border border-black/10 bg-[#fafafa] px-3 py-2 font-mono text-[13px]"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="atoms-card p-6">
          <h2 className="text-[15px] font-semibold">2. Upload Resume (PDF, DOCX, MD, TXT)</h2>
          <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-black/20 bg-[#fafafa] p-6 text-center transition hover:border-[#4267ff]">
            <FileUp className="h-6 w-6 text-[#4267ff]" />
            <span className="mt-2 text-[13px] font-medium text-[#171716]">
              {file ? file.name : "Choose resume file (max 10 MB)"}
            </span>
            <span className="mt-1 text-[11px] text-[#71717a]">
              Parsed locally; extracts canonical skills + evidence spans + vector embedding
            </span>
            <input
              type="file"
              accept=".pdf,.docx,.md,.txt"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        <div className="atoms-card p-6">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={llmConsent}
              onChange={(e) => setLlmConsent(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-black/20 accent-[#4267ff]"
            />
            <div>
              <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                <ShieldCheck className="h-4 w-4 text-[#4267ff]" />
                External LLM Processing Consent
              </div>
              <p className="mt-0.5 text-[12px] text-[#52525b]">
                Allow Medo AI to send relevant resume excerpts to configured LLM providers for explanations and
                tailoring. You can revoke this anytime in Privacy & Memory settings.
              </p>
            </div>
          </label>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>}
        {statusMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            <span>{statusMsg}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-[#171716] px-5 py-2.5 text-[13px] font-medium text-white hover:bg-[#272726] disabled:opacity-60"
        >
          {saving ? "Saving & Indexing..." : "Complete Onboarding"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </StudioShell>
  );
}
