"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Save } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { apiFetch, ProfileBundle } from "@/lib/api";

export default function ProfilePreferencesPage() {
  const [roles, setRoles] = useState("");
  const [locations, setLocations] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [minSalary, setMinSalary] = useState("");
  const [careerGoals, setCareerGoals] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ProfileBundle>("/api/v1/profile")
      .then((b) => {
        if (b.preferences) {
          setRoles(b.preferences.preferred_roles.join(", "));
          setLocations(b.preferences.preferred_locations.join(", "));
          setCurrency(b.preferences.preferred_currency || "USD");
          setMinSalary(b.preferences.min_salary ? String(b.preferences.min_salary) : "");
          setCareerGoals(b.preferences.career_goals || "");
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    await apiFetch("/api/v1/profile/preferences", {
      method: "PUT",
      body: JSON.stringify({
        preferred_roles: roles.split(",").map((s) => s.trim()).filter(Boolean),
        preferred_locations: locations.split(",").map((s) => s.trim()).filter(Boolean),
        preferred_regions: ["IN", "US"],
        preferred_currency: currency,
        min_salary: minSalary ? Number(minSalary) : null,
        career_goals: careerGoals || null,
      }),
    });
    setMsg("Preferences updated in PostgreSQL.");
  };

  return (
    <StudioShell
      title="Profile & Preferences"
      subtitle="Manage durable search roles, locations, currency, and career objectives"
    >
      <form onSubmit={handleSave} className="atoms-card mx-auto max-w-2xl space-y-4 p-6">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-[#52525b]">Preferred Roles</label>
          <input
            value={roles}
            onChange={(e) => setRoles(e.target.value)}
            className="w-full rounded-lg border border-black/10 bg-[#fafafa] px-3 py-2 text-[13px]"
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-[#52525b]">Preferred Locations</label>
          <input
            value={locations}
            onChange={(e) => setLocations(e.target.value)}
            className="w-full rounded-lg border border-black/10 bg-[#fafafa] px-3 py-2 text-[13px]"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-[#52525b]">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border border-black/10 bg-[#fafafa] px-3 py-2 text-[13px]"
            >
              <option value="USD">USD</option>
              <option value="INR">INR</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-[#52525b]">Min Salary</label>
            <input
              type="number"
              value={minSalary}
              onChange={(e) => setMinSalary(e.target.value)}
              className="w-full rounded-lg border border-black/10 bg-[#fafafa] px-3 py-2 font-mono text-[13px]"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-[#52525b]">Career Goals</label>
          <textarea
            rows={3}
            value={careerGoals}
            onChange={(e) => setCareerGoals(e.target.value)}
            className="w-full rounded-lg border border-black/10 bg-[#fafafa] px-3 py-2 text-[13px]"
          />
        </div>

        {msg && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            <span>{msg}</span>
          </div>
        )}

        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#171716] px-4 py-2 text-[13px] font-medium text-white"
        >
          <Save className="h-3.5 w-3.5" /> Save Preferences
        </button>
      </form>
    </StudioShell>
  );
}
