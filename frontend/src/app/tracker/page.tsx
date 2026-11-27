"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Briefcase, Check, CheckCircle2, ExternalLink, LayoutGrid, List, Pencil, Sparkles, X } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { Banner, EmptyState, StatTile } from "@/components/ui";
import { apiFetch, ApplicationItem, JobItem } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

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

const PIPELINE_COLUMNS = [
  {
    id: "saved",
    label: "Saved & Draft",
    labelHi: "सहेजे गए और ड्राफ्ट",
    dot: "bg-[#3b5bff]",
    statuses: ["draft", "shortlisted"],
  },
  {
    id: "applied",
    label: "Applied",
    labelHi: "आवेदन किया",
    dot: "bg-amber-500",
    statuses: ["applied"],
  },
  {
    id: "interview",
    label: "Interviewing",
    labelHi: "साक्षात्कार चरण",
    dot: "bg-indigo-600",
    statuses: ["phone_screen", "hr_interview", "hm_interview", "final_round"],
  },
  {
    id: "outcome",
    label: "Offers & Closed",
    labelHi: "ऑफ़र और बंद",
    dot: "bg-emerald-500",
    statuses: ["offer", "rejected", "archived", "withdrawn"],
  },
];

export default function TrackerPage() {
  const { tx } = useLanguage();
  const [apps, setApps] = useState<ApplicationItem[]>([]);
  const [jobMap, setJobMap] = useState<Record<string, JobItem>>({});
  const [viewMode, setViewMode] = useState<"board" | "table">("board");
  const [stageFilter, setStageFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [appRes, jobRes] = await Promise.all([
        apiFetch<{ items: ApplicationItem[] }>("/api/v1/applications?limit=50"),
        apiFetch<{ items: JobItem[] }>("/api/v1/jobs?limit=100").catch(() => ({ items: [] })),
      ]);
      setApps(appRes.items);
      const map: Record<string, JobItem> = {};
      for (const j of jobRes.items) map[j.id] = j;
      const missingIds = appRes.items.map((a) => a.job_id).filter((jid) => !map[jid]);
      if (missingIds.length > 0) {
        const fetched = await Promise.all(
          missingIds.slice(0, 10).map((jid) => apiFetch<JobItem>(`/api/v1/jobs/${jid}`).catch(() => null))
        );
        for (const item of fetched) {
          if (item) map[item.id] = item;
        }
      }
      setJobMap(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (appId: string, status: string) => {
    setError(null);
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

  const saveNotes = async (appId: string) => {
    setError(null);
    try {
      const updated = await apiFetch<ApplicationItem>(`/api/v1/applications/${appId}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: noteDraft }),
      });
      setApps((prev) => prev.map((a) => (a.id === appId ? updated : a)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    }
  };

  const counts = useMemo(() => {
    const c = { total: apps.length, draft: 0, active: 0, offer: 0 };
    for (const a of apps) {
      if (a.status === "draft" || a.status === "shortlisted") c.draft += 1;
      else if (a.status === "offer") c.offer += 1;
      else if (!["rejected", "archived", "withdrawn"].includes(a.status)) c.active += 1;
    }
    return c;
  }, [apps]);

  const visibleApps = stageFilter ? apps.filter((a) => a.status === stageFilter) : apps;

  return (
    <StudioShell
      title={tx("Pipeline Tracker", "आवेदन पाइपलाइन")}
      subtitle={tx(
        "Human-controlled application board and stage history across every interview milestone",
        "हर इंटरव्यू चरण के लिए नियंत्रित आवेदन बोर्ड और इतिहास"
      )}
      fullWidth
      actions={
        <Link
          href="/discover"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0f172a] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#1e293b]"
        >
          {tx("Browse Jobs", "नौकरियाँ देखें")}
        </Link>
      }
    >
      {/* Top 4 Telemetry Cards */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={tx("Total Tracked", "कुल ट्रैक")} value={counts.total} icon={Briefcase} accent="slate" loading={loading} />
        <StatTile label={tx("Saved & Draft", "सहेजे गए और ड्राफ्ट")} value={counts.draft} icon={Sparkles} accent="indigo" loading={loading} />
        <StatTile label={tx("Active & Interviewing", "सक्रिय और साक्षात्कार")} value={counts.active} icon={Briefcase} accent="amber" loading={loading} />
        <StatTile label={tx("Offers Received", "प्राप्त ऑफ़र")} value={counts.offer} icon={CheckCircle2} accent="emerald" loading={loading} />
      </div>

      {error && <Banner tone="error" message={error} onClose={() => setError(null)} className="mb-4" />}

      {/* View Switcher & Stage Filters */}
      <div className="atoms-card mb-5 flex flex-wrap items-center justify-between gap-3 p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStageFilter("")}
            className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition ${
              !stageFilter ? "bg-[#0f172a] text-white" : "bg-[#f8fafc] text-[#475569] ring-1 ring-[#e2e8f0]"
            }`}
          >
            {tx("All", "सभी")} ({apps.length})
          </button>
          {["draft", "shortlisted", "applied", "phone_screen", "offer"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStageFilter(st)}
              className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium capitalize transition ${
                stageFilter === st ? "bg-[#3b5bff] text-white" : "bg-[#f8fafc] text-[#475569] ring-1 ring-[#e2e8f0]"
              }`}
            >
              {st.replace("_", " ")}
            </button>
          ))}
        </div>

        <div className="atoms-segmented">
          <button
            type="button"
            data-active={viewMode === "board"}
            onClick={() => setViewMode("board")}
            className="atoms-segmented-btn inline-flex items-center gap-1.5 text-[12px]"
          >
            <LayoutGrid className="h-3.5 w-3.5" /> {tx("Board", "बोर्ड")}
          </button>
          <button
            type="button"
            data-active={viewMode === "table"}
            onClick={() => setViewMode("table")}
            className="atoms-segmented-btn inline-flex items-center gap-1.5 text-[12px]"
          >
            <List className="h-3.5 w-3.5" /> {tx("Table", "तालिका")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="skeleton h-64 w-full" />
          ))}
        </div>
      ) : visibleApps.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={tx("Your application pipeline is empty", "आपकी आवेदन पाइपलाइन खाली है")}
          description={tx(
            "Open any role in Job Discovery or ML Matches and click Track to start managing your stages here.",
            "नौकरी खोज या ML मैच में कोई भी पद खोलें और यहाँ ट्रैक करने के लिए 'ट्रैक करें' दबाएँ।"
          )}
          actionLabel={tx("Discover Opportunities", "अवसर खोजें")}
          actionHref="/discover"
        />
      ) : viewMode === "board" ? (
        /* 4-Column Kanban Pipeline View */
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PIPELINE_COLUMNS.map((col) => {
            const colApps = visibleApps.filter((a) => col.statuses.includes(a.status));
            return (
              <div key={col.id} className="flex flex-col rounded-2xl border border-[#e5e7eb] bg-[#f1f3f6]/75 p-3.5">
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                    <span className="text-[13px] font-semibold text-[#0f172a]">{tx(col.label, col.labelHi)}</span>
                  </div>
                  <span className="tnum rounded-md bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-[#475569] ring-1 ring-[#e2e8f0]">
                    {colApps.length}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {colApps.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#cbd5e1] px-3 py-6 text-center text-[11.5px] text-[#64748b]">
                      {tx("No items in stage", "इस चरण में कोई आवेदन नहीं")}
                    </div>
                  ) : (
                    colApps.map((app) => {
                      const job = jobMap[app.job_id];
                      const isEditing = editingId === app.id;
                      return (
                        <div key={app.id} className="atoms-card p-3.5">
                          <Link
                            href={`/jobs/${app.job_id}`}
                            className="block text-[13.5px] font-semibold leading-snug text-[#0f172a] hover:text-[#3b5bff]"
                          >
                            {job ? job.title : `Job ${app.job_id.slice(0, 8)}…`}
                          </Link>
                          <div className="mt-0.5 text-[12px] text-[#64748b]">
                            {job ? `${job.company} · ${job.region || "GLOBAL"}` : "Indexed role"}
                          </div>
                          {job?.salary_raw && (
                            <div className="mt-1.5 inline-block rounded bg-emerald-50 px-2 py-0.5 font-mono text-[10.5px] font-medium text-emerald-700">
                              {job.salary_raw}
                            </div>
                          )}

                          <div className="mt-3">
                            <select
                              value={app.status}
                              onChange={(e) => updateStatus(app.id, e.target.value)}
                              className="w-full rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1.5 text-[11.5px] font-medium text-[#0f172a] outline-none"
                            >
                              {STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st.replace("_", " ")}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="mt-2.5 border-t border-[#f1f5f9] pt-2.5">
                            {isEditing ? (
                              <div className="flex items-center gap-1">
                                <input
                                  value={noteDraft}
                                  onChange={(e) => setNoteDraft(e.target.value)}
                                  className="studio-input py-1 text-[11.5px]"
                                  placeholder={tx("Add interview note...", "इंटरव्यू नोट जोड़ें...")}
                                />
                                <button
                                  onClick={() => saveNotes(app.id)}
                                  className="rounded-lg bg-emerald-600 p-1.5 text-white"
                                >
                                  <Check className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="rounded-lg border border-[#e2e8f0] p-1.5 text-[#64748b]"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2 text-[11.5px] text-[#475569]">
                                <span className="truncate">{app.notes || tx("Add a note...", "नोट जोड़ें...")}</span>
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingId(app.id);
                                      setNoteDraft(app.notes || "");
                                    }}
                                    className="rounded p-1 text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                                    title="Edit note"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  {job?.application_url && (
                                    <a
                                      href={job.application_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="rounded p-1 text-[#3b5bff] hover:bg-[#3b5bff]/10"
                                      title="External apply link"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="atoms-card overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-[13px]">
            <thead className="border-b border-[#e5e7eb] bg-[#f8fafc] font-mono text-[11px] uppercase text-[#64748b]">
              <tr>
                <th className="px-4 py-3">{tx("Role & Company", "पद और कंपनी")}</th>
                <th className="px-4 py-3">{tx("Stage", "चरण")}</th>
                <th className="px-4 py-3">{tx("Applied", "आवेदन तिथि")}</th>
                <th className="px-4 py-3">{tx("Notes", "नोट्स")}</th>
                <th className="px-4 py-3 text-right">{tx("Action", "कार्रवाई")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {visibleApps.map((app) => {
                const job = jobMap[app.job_id];
                const isEditing = editingId === app.id;
                return (
                  <tr key={app.id} className="hover:bg-[#f8fafc]">
                    <td className="px-4 py-3">
                      <Link href={`/jobs/${app.job_id}`} className="font-semibold text-[#0f172a] hover:text-[#3b5bff]">
                        {job ? job.title : `Job ${app.job_id.slice(0, 8)}…`}
                      </Link>
                      {job && (
                        <div className="mt-0.5 text-[11.5px] text-[#64748b]">
                          {job.company} · {job.region || "GLOBAL"} {job.salary_raw ? `· ${job.salary_raw}` : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={app.status}
                        onChange={(e) => updateStatus(app.id, e.target.value)}
                        className="rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1 text-[12px] font-medium text-[#0f172a]"
                      >
                        {STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="tnum px-4 py-3 font-mono text-[11px] text-[#64748b]">
                      {app.applied_at ? new Date(app.applied_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-[#475569]">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            className="studio-input w-48 py-1 text-[12px]"
                          />
                          <button onClick={() => saveNotes(app.id)} className="rounded-lg bg-emerald-600 p-1 text-white">
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded-lg border border-[#e2e8f0] p-1 text-[#64748b]"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="max-w-[240px] truncate">{app.notes || "—"}</span>
                          <button
                            onClick={() => {
                              setEditingId(app.id);
                              setNoteDraft(app.notes || "");
                            }}
                            className="rounded p-1 text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {job?.application_url && (
                        <a
                          href={job.application_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1 text-[11.5px] font-medium text-[#0f172a] hover:border-[#cbd5e1]"
                        >
                          {tx("Apply", "आवेदन")} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </StudioShell>
  );
}
