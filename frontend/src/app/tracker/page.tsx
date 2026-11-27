"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { StudioShell } from "@/components/StudioShell";
import { apiFetch, ApplicationItem } from "@/lib/api";

const STATUSES = [
  "draft",
  "shortlisted",
  "applied",
  "phone_screen",
  "hr_interview",
  "hm_interview",
  "final_round",
  "offer",
  "rejected",
  "archived",
];

export default function TrackerPage() {
  const [apps, setApps] = useState<ApplicationItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    apiFetch<{ items: ApplicationItem[] }>("/api/v1/applications?limit=50")
      .then((res) => setApps(res.items))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load applications"));
  };

  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (appId: string, status: string) => {
    try {
      const updated = await apiFetch<ApplicationItem>(`/api/v1/applications/${appId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setApps((prev) => prev.map((a) => (a.id === appId ? updated : a)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <StudioShell
      title="Application Tracker"
      subtitle="Human-controlled application pipeline across every interview stage"
    >
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>}

      <div className="atoms-card overflow-hidden">
        {apps.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-[#71717a]">
            No applications tracked yet. Inspect any role in{" "}
            <Link href="/discover" className="text-[#4267ff] underline">
              Job Discovery
            </Link>{" "}
            and click <strong>Track Application</strong>.
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-black/[0.07] bg-[#fafafa] font-mono text-[11px] uppercase text-[#71717a]">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Applied At</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {apps.map((app) => (
                <tr key={app.id} className="hover:bg-black/[0.015]">
                  <td className="px-4 py-3">
                    <Link href={`/jobs/${app.job_id}`} className="font-mono text-[12px] text-[#4267ff] hover:underline">
                      {app.job_id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={app.status}
                      onChange={(e) => updateStatus(app.id, e.target.value)}
                      className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[12px] font-medium"
                    >
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-[#71717a]">
                    {app.applied_at ? new Date(app.applied_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[#52525b]">{app.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </StudioShell>
  );
}
