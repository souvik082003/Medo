"use client";

import React, { useEffect, useState } from "react";
import { Check, CheckCircle2, ShieldCheck, Trash2, X } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { apiFetch, User } from "@/lib/api";

interface MemoryItem {
  id: string;
  memory_type: string;
  key: string;
  value_text: string;
  confirmation_status: string;
  confidence: number;
  updated_at: string;
}

interface ApprovalItem {
  id: string;
  action_type: string;
  payload_json: Record<string, unknown>;
  status: string;
  created_at: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  resource_type: string;
  created_at: string;
}

interface EvalRunItem {
  id: string;
  suite: string;
  dataset_name: string;
  dataset_provenance: string;
  metrics: Record<string, unknown>;
  created_at: string;
}

export default function PrivacyMemoryPage() {
  const [user, setUser] = useState<User | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [audits, setAudits] = useState<AuditLogEntry[]>([]);
  const [evalRuns, setEvalRuns] = useState<EvalRunItem[]>([]);
  const [metricsSnap, setMetricsSnap] = useState<{ request_count: number; error_rate: number; token_usage?: { total_tokens?: number } } | null>(null);
  const [runningEval, setRunningEval] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadAll = () => {
    apiFetch<User>("/api/v1/auth/me").then(setUser).catch(() => {});
    apiFetch<MemoryItem[]>("/api/v1/memory").then(setMemories).catch(() => {});
    apiFetch<ApprovalItem[]>("/api/v1/approvals").then(setApprovals).catch(() => {});
    apiFetch<{ items: AuditLogEntry[] }>("/api/v1/observability/audit-logs?limit=8")
      .then((r) => setAudits(r.items))
      .catch(() => {});
    apiFetch<{ items: EvalRunItem[] }>("/api/v1/evaluation/runs?limit=6")
      .then((r) => setEvalRuns(r.items))
      .catch(() => {});
    apiFetch<{ metrics: { request_count: number; error_rate: number; token_usage?: { total_tokens?: number } } }>(
      "/api/v1/observability/metrics"
    )
      .then((r) => setMetricsSnap(r.metrics))
      .catch(() => {});
  };

  const triggerEvaluation = async () => {
    setRunningEval(true);
    try {
      await apiFetch("/api/v1/evaluation/run", {
        method: "POST",
        body: JSON.stringify({ suite: "rag" }),
      });
      setMsg("Completed reproducible RAG benchmark run.");
      loadAll();
    } finally {
      setRunningEval(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const toggleConsent = async (granted: boolean) => {
    const updated = await apiFetch<User>("/api/v1/auth/consent", {
      method: "POST",
      body: JSON.stringify({ granted }),
    });
    setUser(updated);
    setMsg(`External LLM data consent ${granted ? "enabled" : "revoked"} and audited.`);
  };

  const confirmMemory = async (id: string) => {
    await apiFetch(`/api/v1/memory/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ confirmation_status: "confirmed" }),
    });
    loadAll();
  };

  const deleteMemory = async (id: string) => {
    await apiFetch(`/api/v1/memory/${id}`, { method: "DELETE" });
    setMemories((prev) => prev.filter((m) => m.id !== id));
    setMsg("Deleted memory entry permanently.");
  };

  const decideApproval = async (id: string, decision: "approved" | "rejected") => {
    await apiFetch(`/api/v1/approvals/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    loadAll();
  };

  return (
    <StudioShell
      title="Privacy & Memory Settings"
      subtitle="Manage LLM consent, confirm/delete persistent memory, and review pending human approvals"
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="atoms-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[15px] font-semibold">
                <ShieldCheck className="h-4 w-4 text-[#4267ff]" />
                External LLM Resume Processing Consent
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-[#52525b]">
                Resumes and private documents are never transmitted to external LLM APIs without your explicit opt-in.
              </p>
            </div>
            <button
              onClick={() => toggleConsent(!(user?.llm_consent_granted ?? false))}
              className={`shrink-0 rounded-lg px-3.5 py-1.5 text-[12px] font-medium ${
                user?.llm_consent_granted
                  ? "bg-emerald-600 text-white"
                  : "border border-black/15 bg-white text-[#171716]"
              }`}
            >
              {user?.llm_consent_granted ? "Consent Granted" : "Enable Consent"}
            </button>
          </div>
          {msg && <p className="mt-3 text-[12px] text-emerald-700">{msg}</p>}
        </div>

        {/* Pending Human Approvals */}
        <div className="atoms-card p-6">
          <h2 className="text-[14px] font-semibold">Human-in-the-Loop Approvals ({approvals.length})</h2>
          {approvals.length === 0 ? (
            <p className="mt-2 text-[12px] text-[#71717a]">No pending or historical approval requests.</p>
          ) : (
            <div className="mt-3 space-y-2.5">
              {approvals.map((ap) => (
                <div key={ap.id} className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.07] bg-[#fafafa] p-3">
                  <div>
                    <div className="font-mono text-[12px] font-semibold">{ap.action_type}</div>
                    <div className="text-[11px] text-[#52525b]">
                      {String(ap.payload_json?.title || "")} {ap.payload_json?.company ? `@ ${String(ap.payload_json.company)}` : ""}
                    </div>
                  </div>
                  {ap.status === "pending" ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => decideApproval(ap.id, "approved")}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white"
                      >
                        <Check className="h-3 w-3" /> Approve
                      </button>
                      <button
                        onClick={() => decideApproval(ap.id, "rejected")}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-[11px] text-red-700"
                      >
                        <X className="h-3 w-3" /> Reject
                      </button>
                    </div>
                  ) : (
                    <span className="rounded bg-black/[0.05] px-2 py-0.5 font-mono text-[10px] uppercase">
                      {ap.status}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User-Controlled Persistent Memory */}
        <div className="atoms-card p-6">
          <h2 className="text-[14px] font-semibold">Long-Term Semantic & Preference Memory ({memories.length})</h2>
          <p className="mt-0.5 text-[11px] text-[#71717a]">
            LLM inferences remain marked <code className="font-mono">inferred</code> until you confirm them.
          </p>
          {memories.length === 0 ? (
            <p className="mt-3 text-[12px] text-[#71717a]">No stored memory items yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {memories.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.07] bg-[#fafafa] p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] font-semibold">{m.key}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                          m.confirmation_status === "confirmed"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {m.confirmation_status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-[#52525b]">{m.value_text}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {m.confirmation_status !== "confirmed" && (
                      <button
                        onClick={() => confirmMemory(m.id)}
                        title="Confirm preference"
                        className="rounded-lg border border-black/10 p-1.5 text-emerald-700 hover:bg-emerald-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteMemory(m.id)}
                      title="Delete memory"
                      className="rounded-lg border border-black/10 p-1.5 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security Audit Trail */}
        <div className="atoms-card p-6">
          <h2 className="text-[14px] font-semibold">Security & Privacy Audit Trail ({audits.length})</h2>
          <p className="mt-0.5 text-[11px] text-[#71717a]">
            Scoped strictly to your account; raw resume text, passwords, and tokens are never logged.
          </p>
          {audits.length === 0 ? (
            <p className="mt-2 text-[12px] text-[#71717a]">No audit events recorded yet.</p>
          ) : (
            <div className="mt-3 divide-y divide-black/[0.06] text-[12px]">
              {audits.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2">
                  <span className="font-mono font-medium text-[#171716]">{a.action}</span>
                  <span className="font-mono text-[11px] text-[#71717a]">
                    {a.resource_type} · {new Date(a.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Observability & Provenance-Separated Evaluation Telemetry */}
        <div className="atoms-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold">Observability & Evaluation Provenance</h2>
              <p className="mt-0.5 text-[11px] text-[#71717a]">
                Live latency/token telemetry and benchmark runs (synthetic & curated suites kept separate from real metrics).
              </p>
            </div>
            <button
              onClick={triggerEvaluation}
              disabled={runningEval}
              className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-[11px] font-medium hover:border-black/30 disabled:opacity-60"
            >
              {runningEval ? "Running Eval..." : "Run RAG Eval"}
            </button>
          </div>
          {metricsSnap && (
            <div className="mt-3 grid grid-cols-3 gap-3 rounded-xl border border-black/[0.07] bg-[#fafafa] p-3 font-mono text-[11px]">
              <div>Requests: <strong>{metricsSnap.request_count}</strong></div>
              <div>Error Rate: <strong>{(metricsSnap.error_rate * 100).toFixed(1)}%</strong></div>
              <div>LLM Tokens: <strong>{metricsSnap.token_usage?.total_tokens ?? 0}</strong></div>
            </div>
          )}
          {evalRuns.length > 0 && (
            <div className="mt-3 space-y-2">
              {evalRuns.map((er) => (
                <div key={er.id} className="flex items-center justify-between rounded-lg border border-black/[0.06] bg-[#fafafa] px-3 py-2 text-[11px]">
                  <div>
                    <span className="font-mono font-semibold text-[#171716]">{er.suite}</span>
                    <span className="ml-2 text-[#71717a]">{er.dataset_name}</span>
                  </div>
                  <span className="rounded bg-[#4267ff]/10 px-2 py-0.5 font-mono text-[10px] text-[#4267ff]">
                    {er.dataset_provenance}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
