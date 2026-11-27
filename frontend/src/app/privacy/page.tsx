"use client";

import React, { useEffect, useState } from "react";
import { Activity, Check, CheckCircle2, Cpu, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { Banner, StatTile } from "@/components/ui";
import { apiFetch, User } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

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
  const { tx } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [audits, setAudits] = useState<AuditLogEntry[]>([]);
  const [evalRuns, setEvalRuns] = useState<EvalRunItem[]>([]);
  const [metricsSnap, setMetricsSnap] = useState<{
    request_count: number;
    error_rate: number;
    token_usage?: { total_tokens?: number };
  } | null>(null);
  const [recentSpans, setRecentSpans] = useState<Array<{ stage: string; duration_ms: number; status: string }>>([]);
  const [readiness, setReadiness] = useState<{ status: string; database: string; redis: string; details?: { db_dialect?: string } } | null>(null);
  const [evalSuite, setEvalSuite] = useState<"rag" | "ranking" | "agent" | "all">("rag");
  const [activeTab, setActiveTab] = useState<"governance" | "memory" | "telemetry">("governance");
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [newType, setNewType] = useState<"preference" | "career_decision" | "learned_context">("preference");
  const [addingMem, setAddingMem] = useState(false);
  const [runningEval, setRunningEval] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadAll = () => {
    apiFetch<User>("/api/v1/auth/me").then(setUser).catch(() => {});
    apiFetch<MemoryItem[]>("/api/v1/memory").then(setMemories).catch(() => {});
    apiFetch<ApprovalItem[]>("/api/v1/approvals").then(setApprovals).catch(() => {});
    apiFetch<{ items: AuditLogEntry[] }>("/api/v1/observability/audit-logs?limit=12")
      .then((r) => setAudits(r.items))
      .catch(() => {});
    apiFetch<{ items: EvalRunItem[] }>("/api/v1/evaluation/runs?limit=8")
      .then((r) => setEvalRuns(r.items))
      .catch(() => {});
    apiFetch<{
      metrics: { request_count: number; error_rate: number; token_usage?: { total_tokens?: number } };
      recent_spans?: Array<{ stage: string; duration_ms: number; status: string }>;
    }>("/api/v1/observability/metrics")
      .then((r) => {
        setMetricsSnap(r.metrics);
        setRecentSpans(r.recent_spans || []);
      })
      .catch(() => {});
    apiFetch<{ status: string; database: string; redis: string; details?: { db_dialect?: string } }>("/ready")
      .then(setReadiness)
      .catch(() => {});
  };

  useEffect(() => {
    loadAll();
  }, []);

  const triggerEvaluation = async () => {
    setRunningEval(true);
    try {
      await apiFetch("/api/v1/evaluation/run", {
        method: "POST",
        body: JSON.stringify({ suite: evalSuite }),
      });
      setMsg(tx(`Completed reproducible ${evalSuite.toUpperCase()} evaluation benchmark.`, `${evalSuite.toUpperCase()} मूल्यांकन बेंचमार्क पूरा हुआ।`));
      loadAll();
    } finally {
      setRunningEval(false);
    }
  };

  const toggleConsent = async (granted: boolean) => {
    const updated = await apiFetch<User>("/api/v1/auth/consent", {
      method: "POST",
      body: JSON.stringify({ granted }),
    });
    setUser(updated);
    setMsg(
      granted
        ? tx("External LLM data consent enabled and logged.", "बाहरी LLM डेटा सहमति चालू और लॉग की गई।")
        : tx("External LLM data consent revoked and logged.", "बाहरी LLM डेटा सहमति रद्द और लॉग की गई।")
    );
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newVal.trim()) return;
    setAddingMem(true);
    try {
      await apiFetch("/api/v1/memory", {
        method: "POST",
        body: JSON.stringify({
          memory_type: newType,
          key: newKey.trim(),
          value_text: newVal.trim(),
          confirmed_by_user: true,
        }),
      });
      setNewKey("");
      setNewVal("");
      setMsg(tx("Saved confirmed memory rule.", "पुष्ट मेमोरी नियम सहेजा गया।"));
      loadAll();
    } finally {
      setAddingMem(false);
    }
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
    setMsg(tx("Deleted memory rule permanently.", "मेमोरी नियम स्थायी रूप से हटाया गया।"));
  };

  const decideApproval = async (id: string, decision: "approved" | "rejected") => {
    await apiFetch(`/api/v1/approvals/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    loadAll();
  };

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  return (
    <StudioShell
      title={tx("Privacy & Memory", "गोपनीयता और मेमोरी")}
      subtitle={tx(
        "Zero-trust governance for LLM consent, HITL approvals, 3-tier memory, and evaluation provenance",
        "LLM सहमति, मानव अनुमोदन (HITL), 3-स्तरीय मेमोरी और ऑडिट नियंत्रण"
      )}
      actions={
        <div className="atoms-segmented">
          <button
            type="button"
            data-active={activeTab === "governance"}
            onClick={() => setActiveTab("governance")}
            className="atoms-segmented-btn text-[12px]"
          >
            {tx("Consent & HITL", "सहमति व अनुमोदन")} ({pendingCount})
          </button>
          <button
            type="button"
            data-active={activeTab === "memory"}
            onClick={() => setActiveTab("memory")}
            className="atoms-segmented-btn text-[12px]"
          >
            {tx("Memory", "मेमोरी")} ({memories.length})
          </button>
          <button
            type="button"
            data-active={activeTab === "telemetry"}
            onClick={() => setActiveTab("telemetry")}
            className="atoms-segmented-btn text-[12px]"
          >
            {tx("Audit & Eval", "ऑडिट व मूल्यांकन")}
          </button>
        </div>
      }
    >
      {msg && <Banner tone="success" message={msg} onClose={() => setMsg(null)} className="mb-4" />}

      {/* Top 3 Governance Tiles */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatTile
          label={tx("External LLM Consent", "बाहरी LLM सहमति")}
          value={user?.llm_consent_granted ? tx("Enabled", "सक्रिय") : tx("Local-Only", "केवल लोकल")}
          hint={tx("Controls resume & JD transmission", "रिज्यूमे और JD डेटा साझाकरण नियंत्रण")}
          icon={ShieldCheck}
          accent={user?.llm_consent_granted ? "emerald" : "slate"}
        />
        <StatTile
          label={tx("Pending Approvals", "लंबित अनुमोदन")}
          value={pendingCount}
          hint={tx(`${approvals.length} total gated actions`, `कुल ${approvals.length} नियंत्रित क्रियाएँ`)}
          icon={CheckCircle2}
          accent={pendingCount > 0 ? "amber" : "indigo"}
        />
        <StatTile
          label={tx("API Telemetry", "API टेलीमेट्री")}
          value={metricsSnap ? metricsSnap.request_count : "—"}
          hint={
            metricsSnap
              ? tx(`${(metricsSnap.error_rate * 100).toFixed(1)}% error rate`, `${(metricsSnap.error_rate * 100).toFixed(1)}% त्रुटि दर`)
              : tx("Loading telemetry", "लोड हो रहा है")
          }
          icon={Activity}
          accent="indigo"
        />
      </div>

      {activeTab === "governance" && (
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="atoms-card p-6 lg:col-span-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[15px] font-semibold text-[#0f172a]">
                  <ShieldCheck className="h-4.5 w-4.5 text-[#3b5bff]" />
                  {tx("LLM Processing Consent", "LLM प्रोसेसिंग सहमति")}
                </div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#64748b]">
                  {tx(
                    "Resumes and private workspace documents remain strictly local unless you opt into external LLM reasoning.",
                    "जब तक आप अनुमति नहीं देते, आपके रिज्यूमे और निजी दस्तावेज़ पूरी तरह लोकल रहते हैं।"
                  )}
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-4">
              <div>
                <div className="text-[13px] font-semibold text-[#0f172a]">{tx("Current Policy", "वर्तमान नीति")}</div>
                <div className="text-[11.5px] text-[#64748b]">
                  {user?.llm_consent_granted
                    ? tx("AI Explain & Tailoring active", "AI व्याख्या और विश्लेषण सक्रिय")
                    : tx("Strict local scoring only", "केवल लोकल स्कोरिंग सक्रिय")}
                </div>
              </div>
              <button
                onClick={() => toggleConsent(!(user?.llm_consent_granted ?? false))}
                className={`rounded-xl px-4 py-2 text-[12.5px] font-medium transition ${
                  user?.llm_consent_granted
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-[#3b5bff] text-white hover:bg-[#2948eb]"
                }`}
              >
                {user?.llm_consent_granted ? tx("Revoke Consent", "सहमति हटाएँ") : tx("Enable Consent", "सहमति दें")}
              </button>
            </div>
          </div>

          <div className="atoms-card p-6 lg:col-span-7">
            <h2 className="text-[15px] font-semibold text-[#0f172a]">
              {tx("Human-in-the-Loop Approval Gate", "मानव अनुमोदन द्वार")} ({approvals.length})
            </h2>
            <p className="mt-0.5 text-[12px] text-[#64748b]">
              {tx("External agent submissions pause here until you approve or reject.", "बाहरी सबमिशन आपकी मंज़ूरी या अस्वीकृति तक यहाँ रुके रहते हैं।")}
            </p>
            {approvals.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-[#cbd5e1] p-6 text-center text-[12.5px] text-[#64748b]">
                {tx("No pending or historical approval requests.", "कोई लंबित या पिछला अनुमोदन अनुरोध नहीं है।")}
              </p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {approvals.map((ap) => (
                  <div
                    key={ap.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3.5"
                  >
                    <div>
                      <div className="font-mono text-[12px] font-semibold text-[#0f172a]">{ap.action_type}</div>
                      <div className="mt-0.5 text-[12px] text-[#475569]">
                        {String(ap.payload_json?.title || "")}{" "}
                        {ap.payload_json?.company ? `@ ${String(ap.payload_json.company)}` : ""}
                      </div>
                    </div>
                    {ap.status === "pending" ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => decideApproval(ap.id, "approved")}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11.5px] font-medium text-white"
                        >
                          <Check className="h-3.5 w-3.5" /> {tx("Approve", "स्वीकार करें")}
                        </button>
                        <button
                          onClick={() => decideApproval(ap.id, "rejected")}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[11.5px] text-red-700"
                        >
                          <X className="h-3.5 w-3.5" /> {tx("Reject", "अस्वीकार करें")}
                        </button>
                      </div>
                    ) : (
                      <span className="rounded-md bg-white px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase text-[#475569] ring-1 ring-[#e2e8f0]">
                        {ap.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "memory" && (
        <div className="grid gap-5 lg:grid-cols-12">
          <form onSubmit={handleAddMemory} className="atoms-card space-y-3.5 p-6 lg:col-span-5">
            <h2 className="text-[15px] font-semibold text-[#0f172a]">{tx("Add Confirmed Memory Rule", "पुष्ट मेमोरी नियम जोड़ें")}</h2>
            <p className="text-[12px] text-[#64748b]">
              {tx("LLM inferences stay marked", "LLM के अनुमान")}{" "}
              <code className="font-mono">inferred</code>{" "}
              {tx("until you confirm them.", "तब तक रहते हैं जब तक आप उनकी पुष्टि न करें।")}
            </p>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#475569]">{tx("Tier Type", "मेमोरी प्रकार")}</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as "preference" | "career_decision" | "learned_context")}
                className="studio-input"
              >
                <option value="preference">preference</option>
                <option value="career_decision">career_decision</option>
                <option value="learned_context">learned_context</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#475569]">{tx("Key", "कुंजी (Key)")}</label>
              <input
                required
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="target_city"
                className="studio-input font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#475569]">{tx("Rule Value", "नियम मान")}</label>
              <textarea
                required
                rows={3}
                value={newVal}
                onChange={(e) => setNewVal(e.target.value)}
                placeholder={tx("Prefer Bengaluru hybrid or remote AI Systems roles", "बेंगलुरु हाइब्रिड या रिमोट AI सिस्टम पद प्राथमिकता")}
                className="studio-input"
              />
            </div>
            <button
              type="submit"
              disabled={addingMem}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#0f172a] px-4 py-2.5 text-[12.5px] font-medium text-white hover:bg-[#1e293b] disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" /> {tx("Save Memory Rule", "मेमोरी नियम सहेजें")}
            </button>
          </form>

          <div className="atoms-card p-6 lg:col-span-7">
            <h2 className="mb-3 text-[15px] font-semibold text-[#0f172a]">
              {tx("Stored Semantic Memories", "सहेजी गई सिमेंटिक मेमोरी")} ({memories.length})
            </h2>
            {memories.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#cbd5e1] p-6 text-center text-[12.5px] text-[#64748b]">
                {tx("No memory rules stored yet.", "अभी तक कोई मेमोरी नियम सहेजा नहीं गया।")}
              </p>
            ) : (
              <div className="space-y-2.5">
                {memories.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3.5"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] font-semibold text-[#0f172a]">{m.key}</span>
                        <span
                          className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                            m.confirmation_status === "confirmed"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {m.confirmation_status}
                        </span>
                        <span className="font-mono text-[10px] text-[#64748b]">{m.memory_type}</span>
                      </div>
                      <div className="mt-1 text-[12.5px] text-[#475569]">{m.value_text}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {m.confirmation_status !== "confirmed" && (
                        <button
                          onClick={() => confirmMemory(m.id)}
                          title="Confirm"
                          className="rounded-lg border border-[#e2e8f0] bg-white p-1.5 text-emerald-700 hover:bg-emerald-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteMemory(m.id)}
                        title="Delete"
                        className="rounded-lg border border-[#e2e8f0] bg-white p-1.5 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "telemetry" && (
        <div className="space-y-5">
          {readiness && (
            <div className="atoms-card flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-2.5">
                <Cpu className="h-4.5 w-4.5 text-[#3b5bff]" />
                <div>
                  <div className="text-[14px] font-semibold text-[#0f172a]">{tx("Runtime Infrastructure Readiness", "रनटाइम सिस्टम स्थिति")}</div>
                  <div className="text-[12px] text-[#64748b]">{tx("Live probe via /ready endpoint", "/ready एंडपॉइंट द्वारा लाइव जाँच")}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                  DB: {readiness.database} ({readiness.details?.db_dialect || "sql"})
                </span>
                <span className="rounded-lg bg-[#f1f5f9] px-2.5 py-1 font-semibold text-[#475569]">
                  Redis: {readiness.redis}
                </span>
                <span className="rounded-lg bg-[#3b5bff]/10 px-2.5 py-1 font-semibold text-[#3b5bff]">
                  {tx("Tokens", "टोकन")}: {metricsSnap?.token_usage?.total_tokens ?? 0}
                </span>
              </div>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="atoms-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#0f172a]">{tx("Evaluation & Provenance", "मूल्यांकन और प्रमाण")}</h2>
                  <p className="mt-0.5 text-[12px] text-[#64748b]">{tx("Benchmark runs strictly separated from user telemetry", "बेंचमार्क परिणाम उपयोगकर्ता टेलीमेट्री से अलग रखे जाते हैं")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={evalSuite}
                    onChange={(e) => setEvalSuite(e.target.value as "rag" | "ranking" | "agent" | "all")}
                    className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1.5 text-[12px] font-medium text-[#0f172a]"
                  >
                    <option value="rag">RAG Suite</option>
                    <option value="ranking">Ranking Suite</option>
                    <option value="agent">Agent Suite</option>
                    <option value="all">{tx("Full Suite", "पूर्ण सूट")}</option>
                  </select>
                  <button
                    onClick={triggerEvaluation}
                    disabled={runningEval}
                    className="rounded-xl bg-[#3b5bff] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#2948eb] disabled:opacity-60"
                  >
                    {runningEval ? tx("Running...", "चल रहा है...") : tx("Run Eval", "मूल्यांकन चलाएँ")}
                  </button>
                </div>
              </div>
              {evalRuns.length === 0 ? (
                <p className="mt-4 text-[12px] text-[#64748b]">{tx("No evaluation runs logged yet.", "अभी कोई मूल्यांकन रन लॉग नहीं हुआ।")}</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {evalRuns.map((er) => (
                    <div
                      key={er.id}
                      className="flex items-center justify-between rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3.5 py-2.5 text-[12px]"
                    >
                      <div>
                        <span className="font-mono font-semibold text-[#0f172a]">{er.suite}</span>
                        <span className="ml-2 text-[#64748b]">{er.dataset_name}</span>
                      </div>
                      <span className="rounded-md bg-[#3b5bff]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#3b5bff]">
                        {er.dataset_provenance}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {recentSpans.length > 0 && (
                <div className="mt-5 border-t border-[#f1f5f9] pt-4">
                  <div className="mb-2 font-mono text-[11px] font-semibold uppercase text-[#64748b]">
                    Recent OTel Trace Spans ({recentSpans.length})
                  </div>
                  <div className="space-y-1.5">
                    {recentSpans.slice(0, 5).map((sp, si) => (
                      <div key={si} className="flex items-center justify-between rounded-lg bg-[#f8fafc] px-3 py-1.5 font-mono text-[11px]">
                        <span className="text-[#0f172a]">{sp.stage}</span>
                        <span className="text-[#64748b]">{sp.duration_ms.toFixed(1)} ms</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="atoms-card p-6">
              <h2 className="text-[15px] font-semibold text-[#0f172a]">
                {tx("Security & Privacy Audit Log", "सुरक्षा और गोपनीयता ऑडिट लॉग")} ({audits.length})
              </h2>
              <p className="mt-0.5 text-[12px] text-[#64748b]">
                {tx(
                  "Raw resume content, tokens, and credentials are never stored in audit streams.",
                  "कच्चा रिज्यूमे टेक्स्ट, टोकन या पासवर्ड ऑडिट लॉग में कभी संग्रहीत नहीं होते।"
                )}
              </p>
              {audits.length === 0 ? (
                <p className="mt-4 text-[12px] text-[#64748b]">{tx("No audit events recorded yet.", "अभी कोई ऑडिट गतिविधि दर्ज नहीं है।")}</p>
              ) : (
                <div className="mt-4 divide-y divide-[#f1f5f9] text-[12px]">
                  {audits.map((a) => (
                    <div key={a.id} className="flex items-center justify-between py-2.5">
                      <span className="font-mono font-medium text-[#0f172a]">{a.action}</span>
                      <span className="font-mono text-[11px] text-[#64748b]">
                        {a.resource_type} · {new Date(a.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </StudioShell>
  );
}
