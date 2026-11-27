"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Compass, Globe, Save, SlidersHorizontal } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { Banner } from "@/components/ui";
import { apiFetch, ProfileBundle } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

const REGION_CODES = ["IN", "GLOBAL", "US", "EU", "UK", "SG"] as const;
const WORK_MODE_OPTIONS = ["remote", "hybrid", "onsite"] as const;
const JOB_TYPE_OPTIONS = ["full-time", "contract", "internship", "part-time"] as const;

export default function ProfilePreferencesPage() {
  const { tx } = useLanguage();
  const [roles, setRoles] = useState("");
  const [locations, setLocations] = useState("");
  const [regions, setRegions] = useState<string[]>(["IN", "GLOBAL"]);
  const [workModes, setWorkModes] = useState<string[]>(["remote", "hybrid", "onsite"]);
  const [jobTypes, setJobTypes] = useState<string[]>(["full-time"]);
  const [excludeKeywords, setExcludeKeywords] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [minSalary, setMinSalary] = useState("");
  const [careerGoals, setCareerGoals] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ProfileBundle>("/api/v1/profile")
      .then((b) => {
        if (b.preferences) {
          setRoles(b.preferences.preferred_roles.join(", "));
          setLocations(b.preferences.preferred_locations.join(", "));
          setRegions(b.preferences.preferred_regions?.length ? b.preferences.preferred_regions : ["IN", "GLOBAL"]);
          setWorkModes(b.preferences.work_modes?.length ? b.preferences.work_modes : ["remote", "hybrid", "onsite"]);
          setJobTypes(b.preferences.job_types?.length ? b.preferences.job_types : ["full-time"]);
          setExcludeKeywords((b.preferences.exclude_keywords || []).join(", "));
          setCurrency(b.preferences.preferred_currency || "INR");
          setMinSalary(b.preferences.min_salary ? String(b.preferences.min_salary) : "");
          setCareerGoals(b.preferences.career_goals || "");
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load preferences"));
  }, []);

  const toggleItem = (list: string[], setList: (v: string[]) => void, item: string) => {
    if (list.includes(item)) {
      if (list.length > 1) setList(list.filter((x) => x !== item));
    } else {
      setList([...list, item]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      await apiFetch("/api/v1/profile/preferences", {
        method: "PUT",
        body: JSON.stringify({
          preferred_roles: roles.split(",").map((s) => s.trim()).filter(Boolean),
          preferred_locations: locations.split(",").map((s) => s.trim()).filter(Boolean),
          preferred_regions: regions,
          work_modes: workModes,
          job_types: jobTypes,
          exclude_keywords: excludeKeywords.split(",").map((s) => s.trim()).filter(Boolean),
          preferred_currency: currency,
          min_salary: minSalary ? Number(minSalary) : null,
          career_goals: careerGoals || null,
        }),
      });
      setMsg(tx("Preferences saved and applied to ML compatibility scoring.", "प्राथमिकताएँ सहेजी गईं और ML स्कोरिंग में लागू कर दी गईं।"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  return (
    <StudioShell
      title={tx("Preferences", "प्राथमिकताएँ")}
      subtitle={tx(
        "Configure durable roles, target regions, work modes, compensation thresholds, and objectives",
        "पसंदीदा पद, लक्षित क्षेत्र, कार्य मोड, वेतन सीमा और करियर लक्ष्य सेट करें"
      )}
      actions={
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#0f172a] hover:border-[#cbd5e1]"
        >
          <Compass className="h-3.5 w-3.5 text-[#3b5bff]" /> {tx("Guided Setup", "त्वरित सेटअप")}
        </Link>
      }
    >
      {error && <Banner tone="error" message={error} onClose={() => setError(null)} className="mb-4" />}
      {msg && <Banner tone="success" message={msg} onClose={() => setMsg(null)} className="mb-4" />}

      <form onSubmit={handleSave} className="grid items-start gap-6 lg:grid-cols-12">
        {/* Left Structured Form Cards (8 cols) */}
        <div className="space-y-5 lg:col-span-8">
          <div className="atoms-card space-y-4 p-6">
            <div className="flex items-center gap-2 border-b border-[#f1f5f9] pb-3">
              <SlidersHorizontal className="h-4 w-4 text-[#3b5bff]" />
              <h2 className="text-[15px] font-semibold text-[#0f172a]">{tx("Role & Location Targeting", "पद और स्थान लक्ष्य")}</h2>
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {tx("Preferred Roles (comma-separated)", "पसंदीदा पद (कॉमा से अलग)")}
              </label>
              <input
                value={roles}
                onChange={(e) => setRoles(e.target.value)}
                placeholder="Machine Learning Engineer, AI Systems Engineer, Backend Engineer"
                className="studio-input"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {tx("Preferred Locations (comma-separated)", "पसंदीदा शहर (कॉमा से अलग)")}
              </label>
              <input
                value={locations}
                onChange={(e) => setLocations(e.target.value)}
                placeholder="Bengaluru, Hyderabad, Remote"
                className="studio-input"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">{tx("Target Regions", "लक्षित क्षेत्र")}</label>
              <div className="flex flex-wrap gap-1.5">
                {REGION_CODES.map((code) => {
                  const active = regions.includes(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => toggleItem(regions, setRegions, code)}
                      className={`rounded-lg px-3 py-1 font-mono text-[11.5px] font-medium transition ${
                        active
                          ? "bg-[#3b5bff] text-white shadow-2xs"
                          : "border border-[#e2e8f0] bg-[#f8fafc] text-[#475569] hover:text-[#0f172a]"
                      }`}
                    >
                      {code}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="atoms-card space-y-4 p-6">
            <div className="flex items-center gap-2 border-b border-[#f1f5f9] pb-3">
              <Globe className="h-4 w-4 text-[#3b5bff]" />
              <h2 className="text-[15px] font-semibold text-[#0f172a]">{tx("Work Style & Compensation", "कार्य शैली और वेतन")}</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">{tx("Work Modes", "कार्य मोड")}</label>
                <div className="flex flex-wrap gap-1.5">
                  {WORK_MODE_OPTIONS.map((wm) => {
                    const active = workModes.includes(wm);
                    return (
                      <button
                        key={wm}
                        type="button"
                        onClick={() => toggleItem(workModes, setWorkModes, wm)}
                        className={`rounded-lg px-2.5 py-1 text-[12px] font-medium capitalize transition ${
                          active
                            ? "bg-[#3b5bff] text-white"
                            : "border border-[#e2e8f0] bg-[#f8fafc] text-[#475569]"
                        }`}
                      >
                        {wm}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">{tx("Job Types", "नौकरी प्रकार")}</label>
                <div className="flex flex-wrap gap-1.5">
                  {JOB_TYPE_OPTIONS.map((jt) => {
                    const active = jobTypes.includes(jt);
                    return (
                      <button
                        key={jt}
                        type="button"
                        onClick={() => toggleItem(jobTypes, setJobTypes, jt)}
                        className={`rounded-lg px-2.5 py-1 text-[12px] font-medium capitalize transition ${
                          active
                            ? "bg-[#0f172a] text-white"
                            : "border border-[#e2e8f0] bg-[#f8fafc] text-[#475569]"
                        }`}
                      >
                        {jt}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">{tx("Currency", "मुद्रा")}</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="studio-input">
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="SGD">SGD (S$)</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">{tx("Min Annual Salary", "न्यूनतम वार्षिक वेतन")}</label>
                <input
                  type="number"
                  value={minSalary}
                  onChange={(e) => setMinSalary(e.target.value)}
                  placeholder="2500000"
                  className="studio-input font-mono"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {tx("Exclude Keywords (comma-separated)", "छोड़ने वाले शब्द (कॉमा से अलग)")}
              </label>
              <input
                value={excludeKeywords}
                onChange={(e) => setExcludeKeywords(e.target.value)}
                placeholder="Senior Director, VP, Unpaid"
                className="studio-input"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">{tx("Career Goals", "करियर लक्ष्य")}</label>
              <textarea
                rows={3}
                value={careerGoals}
                onChange={(e) => setCareerGoals(e.target.value)}
                className="studio-input"
                placeholder={tx(
                  "Describe target scope, engineering impact, or team stage...",
                  "लक्षित कार्यक्षेत्र, टीम चरण या तकनीकी प्रभाव लिखें..."
                )}
              />
            </div>
          </div>
        </div>

        {/* Right Sticky Summary & Save Panel (4 cols) */}
        <div className="lg:col-span-4">
          <div className="atoms-card sticky top-20 space-y-4 p-6">
            <div>
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#3b5bff]">
                {tx("Active Configuration", "सक्रिय कॉन्फ़िगरेशन")}
              </span>
              <h3 className="mt-1 text-[15px] font-semibold text-[#0f172a]">{tx("Targeting Snapshot", "लक्ष्य सारांश")}</h3>
            </div>

            <div className="space-y-2.5 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3.5 text-[12px]">
              <div className="flex justify-between gap-2">
                <span className="text-[#64748b]">{tx("Regions", "क्षेत्र")}</span>
                <span className="font-mono font-semibold text-[#0f172a]">{regions.join(", ")}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#64748b]">{tx("Work Modes", "कार्य मोड")}</span>
                <span className="font-mono font-medium capitalize text-[#0f172a]">{workModes.join(", ")}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#64748b]">{tx("Floor", "न्यूनतम सीमा")}</span>
                <span className="tnum font-mono font-semibold text-emerald-700">
                  {minSalary ? `${currency} ${Number(minSalary).toLocaleString()}` : tx("Any", "कोई भी")}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b5bff] px-4 py-2.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-[#2948eb] disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" /> {saving ? tx("Saving...", "सहेज रहा है...") : tx("Save & Apply Scoring", "सहेजें और स्कोरिंग में लागू करें")}
            </button>
          </div>
        </div>
      </form>
    </StudioShell>
  );
}
