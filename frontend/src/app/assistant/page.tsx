"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, MessageSquare, Send, Sparkles } from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
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

interface Turn {
  role: "user" | "assistant";
  content: string;
  intent?: string;
  steps?: string[];
  tools?: Array<{ tool: string; ok: boolean; latency_ms: number }>;
  pendingApproval?: { approval_request_id: string; action_type: string; message: string } | null;
  approvalDone?: string;
  citations?: Array<{ document_id: string; title: string; source_type: string; snippet: string }>;
}

interface RagQueryResponse {
  query: string;
  query_class: string;
  answer: string;
  citations: Array<{ document_id: string; title: string; source_type: string; snippet: string }>;
  grounded: boolean;
  confidence: number;
}

export default function AssistantPage() {
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "assistant",
      content:
        "Medo Career Orchestrator ready. Ask me to discover jobs, rank your matches, analyze skill gaps, tailor a resume, or update your preferences.",
    },
  ]);
  const [busy, setBusy] = useState(false);

  const loadConversations = () => {
    apiFetch<{ items: ConversationSummary[] }>("/api/v1/conversations?limit=15")
      .then((res) => setConversations(res.items))
      .catch(() => {});
  };

  useEffect(() => {
    loadConversations();
  }, []);

  const openConversation = async (id: string) => {
    const detail = await apiFetch<{
      id: string;
      messages: Array<{ role: "user" | "assistant"; content: string; execution_steps_json: string[] }>;
    }>(`/api/v1/conversations/${id}`);
    setConversationId(detail.id);
    setTurns(
      detail.messages.map((m) => ({
        role: m.role,
        content: m.content,
        steps: m.execution_steps_json,
      }))
    );
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setTurns((prev) => [...prev, { role: "user", content: q }]);
    setBusy(true);

    try {
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
          pendingApproval: res.pending_approval,
        },
      ]);
      loadConversations();
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: err instanceof Error ? err.message : "Orchestrator error" },
      ]);
    } finally {
      setBusy(false);
    }
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

  const handleAskRag = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setTurns((prev) => [...prev, { role: "user", content: `[RAG QA] ${q}` }]);
    setBusy(true);
    try {
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
        },
      ]);
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: err instanceof Error ? err.message : "RAG query failed" },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <StudioShell
      title="AI Career Assistant"
      subtitle="Dynamic LangGraph Career Orchestrator with validated tools and concise execution updates"
    >
      <div className="grid gap-5 lg:grid-cols-4">
        {/* Conversations Sidebar */}
        <div className="atoms-card p-4 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[11px] font-medium uppercase text-[#71717a]">Sessions</span>
            <button
              onClick={() => {
                setConversationId(null);
                setTurns([
                  {
                    role: "assistant",
                    content: "Started a new Career Orchestrator session.",
                  },
                ]);
              }}
              className="rounded border border-black/10 px-2 py-0.5 text-[11px] font-medium hover:border-black/20"
            >
              + New
            </button>
          </div>
          <div className="space-y-1.5">
            {conversations.length === 0 ? (
              <p className="text-[12px] text-[#71717a]">No prior sessions yet.</p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openConversation(c.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] transition ${
                    conversationId === c.id ? "bg-[#171716] text-white" : "hover:bg-black/[0.04]"
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{c.title}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat Workspace */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          <div className="atoms-card min-h-[440px] space-y-4 p-5">
            {turns.map((t, idx) => (
              <div key={idx} className={`flex flex-col ${t.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-2xl rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                    t.role === "user"
                      ? "bg-[#171716] text-white"
                      : "border border-black/[0.08] bg-[#fafafa] text-[#171716]"
                  }`}
                >
                  {t.role === "assistant" && (
                    <div className="mb-1.5 flex items-center gap-2 font-mono text-[10px] font-medium text-[#4267ff]">
                      <Bot className="h-3.5 w-3.5" />
                      <span>CAREER ORCHESTRATOR</span>
                      {t.intent && (
                        <span className="rounded bg-[#4267ff]/10 px-1.5 py-0.5 text-[10px]">{t.intent}</span>
                      )}
                    </div>
                  )}
                  <p className="whitespace-pre-line">{t.content}</p>

                  {t.pendingApproval && (
                    <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="flex-1">
                          <div className="font-semibold">Human Approval Required</div>
                          <div>{t.pendingApproval.message}</div>
                          {t.approvalDone ? (
                            <div className="mt-2 font-mono text-[11px] font-semibold text-emerald-800">
                              Decision recorded: {t.approvalDone}
                            </div>
                          ) : (
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleApprovalDecision(idx, t.pendingApproval!.approval_request_id, "approved")}
                                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white"
                              >
                                Approve Action
                              </button>
                              <button
                                type="button"
                                onClick={() => handleApprovalDecision(idx, t.pendingApproval!.approval_request_id, "rejected")}
                                className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-[11px] font-medium text-red-700"
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
                    <div className="mt-3 space-y-1.5 border-t border-black/[0.06] pt-2.5">
                      <div className="font-mono text-[10px] font-semibold uppercase text-[#71717a]">Verified Citations</div>
                      {t.citations.map((cit) => (
                        <div key={cit.document_id} className="rounded-lg border border-black/[0.06] bg-white p-2 text-[11px]">
                          <div className="font-medium text-[#171716]">
                            {cit.title} <span className="font-mono text-[10px] text-[#4267ff]">[{cit.source_type}]</span>
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-[#52525b]">{cit.snippet}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {t.steps && t.steps.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-black/[0.06] pt-2.5">
                      {t.steps.map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center gap-1 rounded border border-black/[0.06] bg-white px-2 py-0.5 font-mono text-[10px] text-[#52525b]"
                        >
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {t.tools && t.tools.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px] text-[#71717a]">
                      {t.tools.map((tl, ti) => (
                        <span key={ti} className="rounded bg-black/[0.04] px-1.5 py-0.5">
                          {tl.tool} ({tl.ok ? `${tl.latency_ms}ms` : "err"})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex items-center gap-2 rounded-xl border border-[#4267ff]/20 bg-[#4267ff]/[0.05] px-4 py-2.5 font-mono text-[11px] text-[#4267ff]">
                <Sparkles className="h-4 w-4 animate-pulse" />
                <span>Understanding request → Executing specialist agents…</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="atoms-card flex items-center gap-2 p-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Medo AI (e.g. 'Find Bengaluru ML jobs', 'Analyze my skill gaps', 'Rank my best matches')..."
              className="flex-1 bg-transparent px-3 py-2 text-[13px] outline-none"
            />
            <button
              type="button"
              onClick={handleAskRag}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-xl border border-black/15 px-3 py-2 text-[12px] font-medium text-[#171716] hover:border-black/30 disabled:opacity-60"
            >
              Cited RAG QA
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#4267ff] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#3456e8] disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" /> Send
            </button>
          </form>
        </div>
      </div>
    </StudioShell>
  );
}
