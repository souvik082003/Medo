"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  User as UserIcon,
  X,
} from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { Banner } from "@/components/ui";
import { apiFetch } from "@/lib/api";

interface AgentChatResponse {
  conversation_id: string;
  thread_id: string;
  intent: string;
  plan: string[];
  execution_updates: string[];
  tool_results_summary: Array<{ tool: string; ok: boolean; latency_ms: number; error?: string; data?: unknown }>;
  follow_up_questions: string[];
  pending_approval?: { approval_request_id: string; action_type: string; message: string } | null;
  reply: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  summary?: string | null;
  updated_at: string;
}

interface RagDocumentItem {
  id: string;
  title: string;
  source_type: string;
  created_at: string;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  intent?: string;
  steps?: string[];
  tools?: Array<{ tool: string; ok: boolean; latency_ms: number }>;
  followUps?: string[];
  pendingApproval?: { approval_request_id: string; action_type: string; message: string } | null;
  approvalDone?: string;
  citations?: Array<{ document_id: string; title: string; source_type: string; snippet: string }>;
  ragMeta?: { grounded: boolean; confidence: number; retries_used: number };
}

interface RagQueryResponse {
  query: string;
  query_class: string;
  answer: string;
  citations: Array<{ document_id: string; title: string; source_type: string; snippet: string }>;
  grounded: boolean;
  confidence: number;
  retries_used: number;
}

const STARTER_PROMPTS = [
  "Find ML Engineer remote jobs matching my resume",
  "Rank my best compatible jobs and explain gaps",
  "Analyze my resume skills and suggest next steps",
  "What are the top skills in demand right now?",
];

function AssistantInner() {
  const params = useSearchParams();
  const [input, setInput] = useState(params.get("q") || "");
  const [chatMode, setChatMode] = useState<"orchestrator" | "rag">("orchestrator");
  const [sideTab, setSideTab] = useState<"sessions" | "corpus">("sessions");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [ragDocs, setRagDocs] = useState<RagDocumentItem[]>([]);
  const [openTrace, setOpenTrace] = useState<Record<number, boolean>>({});
  const [showDocModal, setShowDocModal] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState<"candidate_doc" | "interview_prep" | "career_guidance">("candidate_doc");
  const [docContent, setDocContent] = useState("");
  const [indexingDoc, setIndexingDoc] = useState(false);
  const [docMsg, setDocMsg] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "assistant",
      content:
        "Medo Career Orchestrator ready. Ask me to discover jobs, rank your compatibility scores, explain skill gaps, or search your private RAG knowledge documents.",
      followUps: STARTER_PROMPTS,
    },
  ]);
  const [busy, setBusy] = useState(false);

  const loadSidebarData = () => {
    apiFetch<{ items: ConversationSummary[] }>("/api/v1/conversations?limit=20")
      .then((res) => setConversations(res.items))
      .catch(() => {});
    apiFetch<RagDocumentItem[]>("/api/v1/rag/documents")
      .then(setRagDocs)
      .catch(() => {});
  };

  useEffect(() => {
    loadSidebarData();
  }, []);

  const openConversation = async (id: string) => {
    const detail = await apiFetch<{
      id: string;
      messages: Array<{ role: "user" | "assistant"; content: string; execution_steps_json: string[] }>;
    }>(`/api/v1/conversations/${id}`);
    setConversationId(detail.id);
    setOpenTrace({});
    setTurns(
      detail.messages.map((m) => ({
        role: m.role,
        content: m.content,
        steps: m.execution_steps_json,
      }))
    );
  };

  const sendMessage = async (text: string, modeOverride?: "orchestrator" | "rag") => {
    const q = text.trim();
    if (!q || busy) return;
    const activeMode = modeOverride || chatMode;
    setInput("");
    setTurns((prev) => [...prev, { role: "user", content: activeMode === "rag" ? `[RAG QA] ${q}` : q }]);
    setBusy(true);

    try {
      if (activeMode === "rag") {
        const res = await apiFetch<RagQueryResponse>("/api/v1/rag/query", {
          method: "POST",
          body: JSON.stringify({ query: q, conversation_id: conversationId }),
        });
        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            content: res.answer,
            intent: `rag:${res.query_class}`,
            citations: res.citations,
            ragMeta: { grounded: res.grounded, confidence: res.confidence, retries_used: res.retries_used },
          },
        ]);
      } else {
        const res = await apiFetch<AgentChatResponse>("/api/v1/agent/chat", {
          method: "POST",
          body: JSON.stringify({ message: q, conversation_id: conversationId }),
        });
        setConversationId(res.conversation_id);
        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            content: res.reply,
            intent: res.intent,
            steps: res.execution_updates,
            tools: res.tool_results_summary.map((t) => ({
              tool: t.tool,
              ok: t.ok,
              latency_ms: t.latency_ms,
            })),
            followUps: res.follow_up_questions,
            pendingApproval: res.pending_approval,
          },
        ]);
        loadSidebarData();
      }
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: err instanceof Error ? err.message : "Assistant error" },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(input);
  };

  const handleApprovalDecision = async (turnIdx: number, approvalId: string, decision: "approved" | "rejected") => {
    await apiFetch(`/api/v1/approvals/${approvalId}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    setTurns((prev) =>
      prev.map((t, i) => (i === turnIdx ? { ...t, approvalDone: decision.toUpperCase() } : t))
    );
  };

  const handleIndexDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setIndexingDoc(true);
    setDocMsg(null);
    try {
      const created = await apiFetch<RagDocumentItem>("/api/v1/rag/documents", {
        method: "POST",
        body: JSON.stringify({
          title: docTitle.trim(),
          source_type: docType,
          content: docContent.trim(),
        }),
      });
      setDocMsg(`Indexed "${created.title}" into your private RAG corpus.`);
      setDocTitle("");
      setDocContent("");
      setShowDocModal(false);
      setSideTab("corpus");
      loadSidebarData();
    } catch (err) {
      setDocMsg(err instanceof Error ? err.message : "Indexing failed");
    } finally {
      setIndexingDoc(false);
    }
  };

  return (
    <StudioShell
      title="AI Orchestrator"
      subtitle="Multi-agent LangGraph assistant with traceable tool calls and Cited RAG"
      fullWidth
      noPadding
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setConversationId(null);
              setOpenTrace({});
              setTurns([
                {
                  role: "assistant",
                  content: "Started a fresh Medo Orchestrator thread.",
                  followUps: STARTER_PROMPTS,
                },
              ]);
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-[#e2e8f0] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0f172a] hover:bg-[#f8fafc]"
          >
            <Plus className="h-3.5 w-3.5" /> New Thread
          </button>
          <button
            type="button"
            onClick={() => setShowDocModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#3b5bff] px-3.5 py-1.5 text-[12px] font-medium text-white shadow-xs hover:bg-[#2948eb]"
          >
            <BookOpen className="h-3.5 w-3.5" /> Index RAG Doc ({ragDocs.length})
          </button>
        </div>
      }
    >
      {/* Modal for Indexing Private Knowledge Doc */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <form onSubmit={handleIndexDocument} className="atoms-card w-full max-w-lg space-y-3.5 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[#0f172a]">
                  <BookOpen className="h-4 w-4 text-[#3b5bff]" /> Index Knowledge Document
                </h2>
                <p className="text-[12px] text-[#64748b]">Isolated per-user vector chunks for Cited RAG QA</p>
              </div>
              <button type="button" onClick={() => setShowDocModal(false)} className="rounded-lg p-1 text-[#64748b] hover:bg-[#f1f5f9]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                required
                minLength={2}
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="Title (e.g., System Design Notes)"
                className="studio-input sm:col-span-2"
              />
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as "candidate_doc" | "interview_prep" | "career_guidance")}
                className="studio-input"
              >
                <option value="candidate_doc">Candidate Notes</option>
                <option value="interview_prep">Interview Prep</option>
                <option value="career_guidance">Career Guidance</option>
              </select>
            </div>
            <textarea
              required
              minLength={10}
              rows={4}
              value={docContent}
              onChange={(e) => setDocContent(e.target.value)}
              placeholder="Paste STAR stories, interview prep notes, architecture briefs..."
              className="studio-input"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                className="rounded-xl border border-[#e2e8f0] px-4 py-2 text-[12px] font-medium text-[#475569]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={indexingDoc}
                className="rounded-xl bg-[#0f172a] px-4 py-2 text-[12px] font-medium text-white hover:bg-[#1e293b] disabled:opacity-60"
              >
                {indexingDoc ? "Embedding..." : "Save & Embed"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Docked Full-Viewport Chat Split */}
      <div className="grid h-[calc(100vh-76px)] overflow-hidden lg:grid-cols-12">
        {/* Left Thread & Corpus Panel (3 cols) */}
        <aside className="hidden flex-col border-r border-[#e5e7eb] bg-white lg:col-span-3 lg:flex">
          <div className="border-b border-[#f1f5f9] p-3">
            <div className="atoms-segmented w-full">
              <button
                type="button"
                data-active={sideTab === "sessions"}
                onClick={() => setSideTab("sessions")}
                className="atoms-segmented-btn flex-1 text-[12px]"
              >
                Threads ({conversations.length})
              </button>
              <button
                type="button"
                data-active={sideTab === "corpus"}
                onClick={() => setSideTab("corpus")}
                className="atoms-segmented-btn flex-1 text-[12px]"
              >
                RAG Docs ({ragDocs.length})
              </button>
            </div>
          </div>

          <div className="thin-scroll flex-1 overflow-y-auto p-3">
            {sideTab === "sessions" ? (
              conversations.length === 0 ? (
                <p className="px-2 py-4 text-center text-[12px] text-[#64748b]">No saved conversation threads yet.</p>
              ) : (
                <div className="space-y-1">
                  {conversations.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => openConversation(c.id)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12.5px] font-medium transition ${
                        conversationId === c.id
                          ? "bg-[#3b5bff]/10 text-[#2948eb] ring-1 ring-[#3b5bff]/20"
                          : "text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                      }`}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{c.title}</span>
                    </button>
                  ))}
                </div>
              )
            ) : ragDocs.length === 0 ? (
              <div className="px-2 py-4 text-center text-[12px] text-[#64748b]">
                No RAG docs indexed yet. Click <strong>Index RAG Doc</strong> above to add notes.
              </div>
            ) : (
              <div className="space-y-2">
                {ragDocs.map((d) => (
                  <div key={d.id} className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3">
                    <div className="truncate text-[12.5px] font-semibold text-[#0f172a]">{d.title}</div>
                    <div className="mt-1 font-mono text-[10px] uppercase text-[#3b5bff]">{d.source_type}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Main Chat Viewport (9 cols) */}
        <div className="flex min-h-0 flex-col bg-[#f6f7f9] lg:col-span-9">
          {docMsg && (
            <div className="px-5 pt-3">
              <Banner tone="success" message={docMsg} onClose={() => setDocMsg(null)} />
            </div>
          )}

          <div className="thin-scroll flex-1 space-y-5 overflow-y-auto px-5 py-6 lg:px-8">
            <div className="mx-auto max-w-3xl space-y-5">
              {turns.map((t, idx) => (
                <div key={idx} className={`flex gap-3 ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                  {t.role === "assistant" && (
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0f172a] to-[#3b5bff] text-white shadow-xs">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-2xl rounded-2xl px-4 py-3.5 text-[13.5px] leading-relaxed ${
                      t.role === "user"
                        ? "bg-[#0f172a] text-white shadow-sm"
                        : "atoms-card bg-white text-[#0f172a]"
                    }`}
                  >
                    {t.role === "assistant" && (t.intent || t.ragMeta) && (
                      <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[10px]">
                        <span className="font-semibold text-[#3b5bff]">MEDO ORCHESTRATOR</span>
                        {t.intent && (
                          <span className="rounded-md bg-[#3b5bff]/10 px-1.5 py-0.5 text-[#3b5bff]">{t.intent}</span>
                        )}
                        {t.ragMeta && (
                          <span
                            className={`rounded-md px-1.5 py-0.5 font-semibold ${
                              t.ragMeta.grounded
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-800"
                            }`}
                          >
                            {t.ragMeta.grounded ? "grounded" : "unverified"} · {Math.round(t.ragMeta.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    )}

                    <p className="whitespace-pre-line">{t.content}</p>

                    {t.pendingApproval && (
                      <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-[12px] text-amber-950">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                          <div className="flex-1">
                            <div className="font-semibold">Human Approval Required</div>
                            <div className="mt-0.5">{t.pendingApproval.message}</div>
                            {t.approvalDone ? (
                              <div className="mt-2 font-mono text-[11px] font-semibold text-emerald-800">
                                Decision recorded: {t.approvalDone}
                              </div>
                            ) : (
                              <div className="mt-2.5 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleApprovalDecision(idx, t.pendingApproval!.approval_request_id, "approved")}
                                  className="rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
                                >
                                  Approve Action
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleApprovalDecision(idx, t.pendingApproval!.approval_request_id, "rejected")}
                                  className="rounded-lg border border-red-300 bg-white px-3 py-1 text-[11px] font-medium text-red-700"
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {t.citations && t.citations.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-[#f1f5f9] pt-3">
                        <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">
                          Verified Citations
                        </div>
                        {t.citations.map((cit, ci) => (
                          <div key={`${cit.document_id}-${ci}`} className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-2.5 text-[11.5px]">
                            <div className="font-semibold text-[#0f172a]">
                              {cit.title} <span className="font-mono text-[10px] text-[#3b5bff]">[{cit.source_type}]</span>
                            </div>
                            <div className="mt-0.5 line-clamp-2 text-[#475569]">{cit.snippet}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Collapsible Execution Trace */}
                    {((t.steps && t.steps.length > 0) || (t.tools && t.tools.length > 0)) && (
                      <div className="mt-3 border-t border-[#f1f5f9] pt-2.5">
                        <button
                          type="button"
                          onClick={() => setOpenTrace((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                          className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-[#64748b] hover:text-[#0f172a]"
                        >
                          {openTrace[idx] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          Execution Trace ({(t.steps?.length || 0) + (t.tools?.length || 0)})
                        </button>
                        {openTrace[idx] && (
                          <div className="mt-2 space-y-1.5 rounded-xl bg-[#f8fafc] p-2.5">
                            {t.steps?.map((s) => (
                              <div key={s} className="flex items-center gap-1.5 font-mono text-[10.5px] text-[#475569]">
                                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />
                                <span>{s}</span>
                              </div>
                            ))}
                            {t.tools && t.tools.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1 font-mono text-[10px] text-[#64748b]">
                                {t.tools.map((tl, ti) => (
                                  <span key={ti} className="rounded bg-white px-2 py-0.5 ring-1 ring-[#e2e8f0]">
                                    {tl.tool} · {tl.ok ? `${tl.latency_ms}ms` : "err"}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {t.followUps && t.followUps.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#f1f5f9] pt-3">
                        {t.followUps.map((fq) => (
                          <button
                            key={fq}
                            type="button"
                            onClick={() => sendMessage(fq, "orchestrator")}
                            disabled={busy}
                            className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-left text-[11.5px] font-medium text-[#475569] transition hover:border-[#3b5bff] hover:text-[#3b5bff]"
                          >
                            {fq}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {t.role === "user" && (
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#e2e8f0] bg-white text-[#0f172a]">
                      <UserIcon className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}

              {busy && (
                <div className="flex items-center gap-2 rounded-2xl border border-[#3b5bff]/20 bg-white px-4 py-3 font-mono text-[11.5px] text-[#3b5bff] shadow-2xs">
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  <span>Executing specialist agents &amp; grounding citations...</span>
                </div>
              )}
            </div>
          </div>

          {/* Sticky Bottom Composer */}
          <div className="border-t border-[#e5e7eb] bg-white px-5 py-3.5 lg:px-8">
            <form onSubmit={handleSend} className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
              <div className="atoms-segmented shrink-0">
                <button
                  type="button"
                  data-active={chatMode === "orchestrator"}
                  onClick={() => setChatMode("orchestrator")}
                  className="atoms-segmented-btn text-[11.5px]"
                >
                  Agents
                </button>
                <button
                  type="button"
                  data-active={chatMode === "rag"}
                  onClick={() => setChatMode("rag")}
                  className="atoms-segmented-btn text-[11.5px]"
                >
                  Cited RAG
                </button>
              </div>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  chatMode === "rag"
                    ? "Ask a grounded question across your indexed documents..."
                    : "Ask Medo Orchestrator (e.g., 'Find Bengaluru ML jobs' or 'Rank my matches')..."
                }
                className="studio-input min-w-[200px] flex-1"
              />
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#3b5bff] px-4 py-2 text-[12.5px] font-medium text-white shadow-xs transition hover:bg-[#2948eb] disabled:opacity-60"
              >
                <Send className="h-3.5 w-3.5" /> Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </StudioShell>
  );
}

export default function AssistantPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[#64748b]">Loading orchestrator...</div>}>
      <AssistantInner />
    </Suspense>
  );
}
