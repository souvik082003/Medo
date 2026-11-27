"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Circle, FileUp, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { Banner } from "@/components/ui";
import { apiFetch, ResumeUploadResponse } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

export default function OnboardingPage() {
  const router = useRouter();
  const { tx } = useLanguage();
  const [roles, setRoles] = useState("Machine Learning Engineer, AI Systems Engineer");
  const [locations, setLocations] = useState("Bengaluru, Remote, San Francisco");
  const [regions, setRegions] = useState<string[]>(["IN", "GLOBAL"]);
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
          tx(
            `Onboarding saved! Extracted ${up.extracted_skills.length} canonical skills and generated ${up.embedding_dim}-dim embedding.`,
            `सेटअप सेव हुआ! ${up.extracted_skills.length} कौशल और ${up.embedding_dim}-dim वेक्टर तैयार हो गए हैं।`
          )
        );
      } else {
        setStatusMsg(tx("Preferences and consent saved.", "प्राथमिकताएं और सहमति सेव की गईं।"));
      }
      setTimeout(() => router.push("/dashboard"), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onboarding failed");
    } finally {
      setSaving(false);
    }
  };

  const roleList = roles.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <StudioShell
      title={tx("Guided Setup", "गाइडेड सेटअप")}
      subtitle={tx(
        "Configure target roles, regions, compensation currency, LLM privacy consent, and primary resume",
        "लक्षित पद, क्षेत्र, मुद्रा, AI गोपनीयता सहमति और प्राथमिक रेज़्यूमे सेट करें"
      )}
    >
      {error && <Banner tone="error" message={error} onClose={() => setError(null)} className="mb-5" />}
      {statusMsg && <Banner tone="success" message={statusMsg} onClose={() => setStatusMsg(null)} className="mb-5" />}

      <form onSubmit={handleComplete} className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-8">
          <div className="atoms-card p-6">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3b5bff]/10 text-[#3b5bff]">
                <SlidersHorizontal className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-[#0f172a]">
                  {tx("1. Target Roles, Regions & Compensation", "1. लक्षित पद, क्षेत्र और वेतन")}
                </h2>
                <p className="text-[12px] text-[#64748b]">
                  {tx("Feeds directly into candidate filtering and 12-feature ranking", "जॉब फ़िल्टरिंग और ML रैंकिंग में उपयोग होता है")}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                  {tx("Preferred Roles (comma-separated)", "पसंदीदा पद (कॉमा से अलग)")}
                </label>
                <input value={roles} onChange={(e) => setRoles(e.target.value)} className="studio-input" />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                  {tx("Preferred Locations", "पसंदीदा शहर / स्थान")}
                </label>
                <input value={locations} onChange={(e) => setLocations(e.target.value)} className="studio-input" />
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                  {tx("Target Regions", "लक्षित क्षेत्र")}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {["IN", "GLOBAL", "US", "UK", "SG", "EU"].map((reg) => {
                    const active = regions.includes(reg);
                    return (
                      <button
                        key={reg}
                        type="button"
                        onClick={() => toggleRegion(reg)}
                        className={`rounded-lg px-2.5 py-1 font-mono text-[11px] font-medium transition ${
                          active
                            ? "bg-[#3b5bff] text-white shadow-2xs"
                            : "border border-[#e2e8f0] bg-[#f8fafc] text-[#475569] hover:border-[#cbd5e1]"
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
                  <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                    {tx("Currency", "मुद्रा")}
                  </label>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="studio-input">
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="SGD">SGD (S$)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                    {tx("Min Salary", "न्यूनतम वेतन")}
                  </label>
                  <input
                    type="number"
                    value={minSalary}
                    onChange={(e) => setMinSalary(e.target.value)}
                    className="studio-input font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="atoms-card p-6">
            <h2 className="text-[15px] font-semibold text-[#0f172a]">
              {tx("2. Primary Resume Upload", "2. मुख्य रेज़्यूमे अपलोड")}
            </h2>
            <p className="mt-0.5 text-[12px] text-[#64748b]">
              {tx("Supports PDF, DOCX, Markdown, and plain text up to 10 MB", "PDF, DOCX, Markdown और TXT (अधिकतम 10 MB)")}
            </p>
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#cbd5e1] bg-[#f8fafc] p-7 text-center transition hover:border-[#3b5bff] hover:bg-[#3b5bff]/[0.03]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3b5bff]/10 text-[#3b5bff]">
                <FileUp className="h-5 w-5" />
              </div>
              <span className="mt-3 text-[13.5px] font-semibold text-[#0f172a]">
                {file ? file.name : tx("Drop or browse resume file", "रेज़्यूमे फ़ाइल चुनें या ड्रॉप करें")}
              </span>
              <span className="mt-1 text-[11.5px] text-[#64748b]">
                {tx(
                  "Parsed locally; extracts canonical skills, evidence spans, and semantic vectors",
                  "लोकल स्तर पर पार्स होता है और कौशल तथा वेक्टर निकालता है"
                )}
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
            <label className="flex cursor-pointer items-start gap-3.5">
              <input
                type="checkbox"
                checked={llmConsent}
                onChange={(e) => setLlmConsent(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[#cbd5e1] accent-[#3b5bff]"
              />
              <div>
                <div className="flex items-center gap-1.5 text-[14px] font-semibold text-[#0f172a]">
                  <ShieldCheck className="h-4 w-4 text-[#3b5bff]" />
                  {tx("3. External LLM Processing Consent", "3. बाहरी LLM प्रोसेसिंग सहमति")}
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[#64748b]">
                  {tx(
                    "Allow Medo AI to send relevant resume excerpts to configured LLM providers for tailored explanations. You can revoke consent anytime in Privacy & Memory.",
                    "व्यक्तिगत व्याख्या और सुझावों के लिए LLM प्रदाताओं को रेज़्यूमे अंश भेजने की अनुमति दें। आप इसे कभी भी रद्द कर सकते हैं।"
                  )}
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="atoms-card sticky top-24 space-y-5 p-6">
            <div>
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#3b5bff]">
                {tx("Setup Checklist", "सेटअप सूची")}
              </span>
              <h3 className="mt-1 text-[15px] font-semibold text-[#0f172a]">
                {tx("Workspace Readiness", "वर्कस्पेस तैयारी")}
              </h3>
            </div>

            <div className="space-y-3 text-[12.5px]">
              <div className="flex items-start gap-2.5">
                {roleList.length > 0 ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[#cbd5e1]" />
                )}
                <div>
                  <div className="font-medium text-[#0f172a]">
                    {tx("Target Roles", "लक्षित पद")} ({roleList.length})
                  </div>
                  <div className="text-[11.5px] text-[#64748b]">
                    {roleList.slice(0, 2).join(", ") || tx("None specified", "कोई नहीं")}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                {regions.length > 0 ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[#cbd5e1]" />
                )}
                <div>
                  <div className="font-medium text-[#0f172a]">
                    {tx("Active Regions", "सक्रिय क्षेत्र")} ({regions.join(", ")})
                  </div>
                  <div className="text-[11.5px] text-[#64748b]">
                    {currency} {minSalary ? `${Number(minSalary).toLocaleString()}+` : tx("Any salary", "कोई भी वेतन")}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                {file ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[#cbd5e1]" />
                )}
                <div>
                  <div className="font-medium text-[#0f172a]">{tx("Primary Resume", "मुख्य रेज़्यूमे")}</div>
                  <div className="text-[11.5px] text-[#64748b]">
                    {file ? file.name : tx("Optional — can upload later", "वैकल्पिक — बाद में अपलोड करें")}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b5bff] px-5 py-2.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-[#2948eb] disabled:opacity-60"
            >
              {saving ? tx("Saving & Indexing...", "सेव हो रहा है...") : tx("Complete Studio Setup", "सेटअप पूरा करें")}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </form>
    </StudioShell>
  );
}
