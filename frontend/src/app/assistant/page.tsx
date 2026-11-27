"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  Bot,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  MessageSquare,
  Plus,
  Search,
  Send,
  Sparkles,
  Target,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import { MedoMark } from "@/components/MedoLogo";
import { StudioShell } from "@/components/StudioShell";
import { Banner } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

interface ToolSummary {
  tool: string;
  ok: boolean;
  latency_ms: number;
  error?: string;
  data?: Record<string, unknown> | null;
}

interface AgentChatResponse {
  conversation_id: string;
  thread_id: string;
  intent: string;
  plan: string[];
  execution_updates: string[];
  tool_results_summary: ToolSummary[];
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
  plan?: string[];
  steps?: string[];
  tools?: ToolSummary[];
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

const AGENT_LABELS: Record<string, string> = {
  profile_intelligence_agent: "Profile Intelligence",
  job_discovery_agent: "Hybrid Job Discovery",
  job_matching_agent: "ML Compatibility",
  career_advisor_agent: "Career Advisor",
  application_assistant_agent: "Application Prep",
  memory_agent: "Memory Sync",
};

const INTENT_LABELS: Record<string, string> = {
  job_discovery: "Job Discovery",
  job_matching: "ML Ranking",
  profile_analysis: "Profile Audit",
  career_advice: "Career Advice",
  application_prep: "Application Prep",
  preference_memory: "Memory Sync",
};

const QUICK_LAUNCHERS = [
  {
    title: "Discover & Rank Remote AI Roles",
    subtitle: "Hybrid search + 12-feature compatibility scoring",
    prompt: "Find remote ML Engineer jobs matching my resume and rank top compatibility",
    mode: "orchestrator" as const,
    icon: Search,
  },
  {
    title: "Audit Skill Gaps & Market Demand",
    subtitle: "Compare verified skills vs live job trends",
    prompt: "Analyze my skill gaps and top skills in demand right now",
    mode: "orchestrator" as const,
    icon: Target,
  },
  {
    title: "Tailor Resume & Interview Prep",
    subtitle: "Targeted highlights + prep plan for top fit role",
    prompt: "Tailor my resume pitch and prepare interview topics for my top matched role",
    mode: "orchestrator" as const,
    icon: FileText,
  },
  {
    title: "Query Private RAG Documents",
    subtitle: "Strict grounded answers with source citations",
    prompt: "What system design and interview preparation notes do I have indexed?",
    mode: "rag" as const,
    icon: BookOpen,
  },
];

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((tok, i) => {
    if (tok.startsWith("**") && tok.endsWith("**") && tok.length > 4) {
      return (
        <strong key={i} className="font-semibold text-[#0f172a]">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith("`") && tok.endsWith("`") && tok.length > 2) {
      return (
        <code
          key={i}
          className="rounded bg-[#f1f5f9] px-1.5 py-0.5 font-mono text-[11.5px] font-medium text-[#2948eb]"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{tok}</React.Fragment>;
  });
}

function FormattedReply({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2.5 text-[13.5px] leading-relaxed text-[#1e293b]">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim().length > 0);
        if (lines.length === 0) return null;

        const first = lines[0].trim();
        let heading: string | null = null;
        let bodyLines = lines;

        if (first.startsWith("### ") || first.startsWith("## ")) {
          heading = first.replace(/^#{2,3}\s+/, "");
          bodyLines = lines.slice(1);
        }

        return (
          <div key={bi} className="space-y-1.5">
            {heading && (
              <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#3b5bff]">
                {heading}
              </div>
            )}
            <div className="space-y-1">
              {bodyLines.map((l, li) => {
                const bulletMatch = l.match(/^\s*[-*•]\s+(.*)$/);
                const numMatch = l.match(/^\s*(\d+)\.\s+(.*)$/);
                if (bulletMatch) {
                  return (
                    <div key={li} className="flex items-start gap-2 pl-1">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3b5bff]" />
                      <span>{renderInlineMarkdown(bulletMatch[1])}</span>
                    </div>
                  );
                }
                if (numMatch) {
                  return (
                    <div key={li} className="flex items-start gap-2 pl-1">
                      <span className="mt-0.5 shrink-0 font-mono text-[11px] font-semibold text-[#3b5bff]">
                        {numMatch[1]}.
                      </span>
                      <span>{renderInlineMarkdown(numMatch[2])}</span>
                    </div>
                  );
                }
                return <p key={li}>{renderInlineMarkdown(l)}</p>;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AssistantInner() {
  const params = useSearchParams();
  const { lang, tx } = useLanguage();
  const [input, setInput] = useState(params.get("q") || "");
  const [chatMode, setChatMode] = useState<"orchestrator" | "rag">("orchestrator");
  const [sideTab, setSideTab] = useState<"sessions" | "corpus">("sessions");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [ragDocs, setRagDocs] = useState<RagDocumentItem[]>([]);
  const [openTrace, setOpenTrace] = useState<Record<number, boolean>>({});
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [savedJobs, setSavedJobs] = useState<Record<string, boolean>>({});
  const [trackedJobs, setTrackedJobs] = useState<Record<string, boolean>>({});
  const [showDocModal, setShowDocModal] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState<"candidate_doc" | "interview_prep" | "career_guidance">("candidate_doc");
  const [docContent, setDocContent] = useState("");
  const [indexingDoc, setIndexingDoc] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadSidebarData = () => {
    apiFetch<{ items: ConversationSummary[] }>("/api/v1/conversations?limit=25")
      .then((res) => setConversations(res.items))
      .catch(() => {});
    apiFetch<RagDocumentItem[]>("/api/v1/rag/documents")
      .then(setRagDocs)
      .catch(() => {});
  };

  useEffect(() => {
    loadSidebarData();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

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
          body: JSON.stringify({ query: q, conversation_id: conversationId, language: lang }),
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
          body: JSON.stringify({ message: q, conversation_id: conversationId, language: lang }),
        });
        setConversationId(res.conversation_id);
        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            content: res.reply,
            intent: res.intent,
            plan: res.plan,
            steps: res.execution_updates,
            tools: res.tool_results_summary,
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

  const handleQuickSave = async (jobId: string) => {
    try {
      await apiFetch("/api/v1/feedback", {
        method: "POST",
        body: JSON.stringify({ job_id: jobId, signal_type: "save", is_implicit: false }),
      });
      setSavedJobs((p) => ({ ...p, [jobId]: true }));
      setStatusMsg("Saved job to workspace.");
    } catch {
      /* handled cleanly */
    }
  };

  const handleQuickTrack = async (jobId: string, title: string) => {
    try {
      await apiFetch("/api/v1/applications", {
        method: "POST",
        body: JSON.stringify({ job_id: jobId, notes: "Created from AI Orchestrator" }),
      });
      setTrackedJobs((p) => ({ ...p, [jobId]: true }));
      setStatusMsg(`Added "${title}" to Pipeline Tracker.`);
    } catch {
      /* handled cleanly */
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

  const handleCopy = (idx: number, content: string) => {
    navigator.clipboard?.writeText(content).catch(() => {});
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const handleDeleteConversation = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await apiFetch(`/api/v1/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) {
        setConversationId(null);
        setOpenTrace({});
        setTurns([]);
      }
      setStatusMsg("Deleted conversation thread.");
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Failed to delete conversation");
    }
  };

  const handleIndexDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setIndexingDoc(true);
    setStatusMsg(null);
    try {
      const created = await apiFetch<RagDocumentItem>("/api/v1/rag/documents", {
        method: "POST",
        body: JSON.stringify({
          title: docTitle.trim(),
          source_type: docType,
          content: docContent.trim(),
        }),
      });
      setStatusMsg(`Indexed "${created.title}" into private RAG corpus.`);
      setDocTitle("");
      setDocContent("");
      setShowDocModal(false);
      setSideTab("corpus");
      loadSidebarData();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Indexing failed");
    } finally {
      setIndexingDoc(false);
    }
  };

  return (
    <StudioShell
      title={tx("AI Orchestrator", "AI ऑर्केस्ट्रेटर")}
      subtitle={tx(
        "Multi-agent LangGraph career copilot with structured tool cards and Cited RAG",
        "हिंदी और अंग्रेजी में AI करियर सलाह, जॉब मिलान और प्रमाणित RAG"
      )}
      fullWidth
      noPadding
      actions={
        <div className="flex items-center gap-2">
          {conversationId && (
            <button
              type="button"
              onClick={() => handleDeleteConversation(conversationId)}
              title={tx("Delete active conversation", "चैट हटाएँ")}
              className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> {tx("Delete Chat", "चैट हटाएँ")}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setConversationId(null);
              setOpenTrace({});
              setTurns([]);
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-[#e2e8f0] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0f172a] hover:bg-[#f8fafc]"
          >
            <Plus className="h-3.5 w-3.5" /> {tx("New Thread", "नई चैट")}
          </button>
          <button
            type="button"
            onClick={() => setShowDocModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#3b5bff] px-3.5 py-1.5 text-[12px] font-medium text-white shadow-xs hover:bg-[#2948eb]"
          >
            <BookOpen className="h-3.5 w-3.5" /> {tx("Index RAG Doc", "RAG दस्तावेज़ जोड़ें")} ({ragDocs.length})
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
                  <BookOpen className="h-4 w-4 text-[#3b5bff]" /> Index Private Knowledge Document
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
                {tx("Threads", "चैट")} ({conversations.length})
              </button>
              <button
                type="button"
                data-active={sideTab === "corpus"}
                onClick={() => setSideTab("corpus")}
                className="atoms-segmented-btn flex-1 text-[12px]"
              >
                {tx("RAG Docs", "दस्तावेज़")} ({ragDocs.length})
              </button>
            </div>
          </div>

          <div className="thin-scroll flex-1 overflow-y-auto p-3">
            {sideTab === "sessions" ? (
              conversations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#e2e8f0] p-4 text-center text-[12px] text-[#64748b]">
                  Start a conversation to persist multi-agent threads here.
                </div>
              ) : (
                <div className="space-y-1">
                  {conversations.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => openConversation(c.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void openConversation(c.id);
                        }
                      }}
                      className={`group flex w-full cursor-pointer items-start justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition ${
                        conversationId === c.id
                          ? "bg-[#3b5bff]/10 text-[#2948eb] ring-1 ring-[#3b5bff]/20"
                          : "text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-2.5">
                        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12.5px] font-medium">{c.title}</div>
                          <div className="mt-0.5 truncate font-mono text-[10px] opacity-70">
                            {new Date(c.updated_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteConversation(c.id, e)}
                        title="Delete chat"
                        aria-label={`Delete conversation ${c.title}`}
                        className="rounded-lg p-1 text-[#64748b] opacity-75 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : ragDocs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#e2e8f0] p-4 text-center text-[12px] text-[#64748b]">
                No RAG documents indexed yet. Click <strong>Index RAG Doc</strong> above to upload notes.
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
          {statusMsg && (
            <div className="px-5 pt-3">
              <Banner tone="success" message={statusMsg} onClose={() => setStatusMsg(null)} />
            </div>
          )}

          <div className="thin-scroll flex-1 overflow-y-auto px-5 py-6 lg:px-8">
            <div className="mx-auto max-w-3xl space-y-5">
              {/* Executive Welcome Stage when thread is empty */}
              {turns.length === 0 ? (
                <div className="py-8">
                  <div className="flex flex-col items-center text-center">
                    <MedoMark size={48} className="shadow-md" />
                    <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#0f172a]">
                      {tx("Medo Multi-Agent Career Orchestrator", "मेडो मल्टी-एजेंट AI करियर ऑर्केस्ट्रेटर")}
                    </h2>
                    <p className="mt-1.5 max-w-lg text-[13.5px] text-[#64748b]">
                      {tx(
                        "Six specialized LangGraph agents grounded in your verified resume, 6 live job connectors, ML compatibility models, and cited personal documents.",
                        "आप अपने करियर, कौशल, इंटरव्यू या जॉब खोज से जुड़ा कोई भी प्रश्न हिंदी या अंग्रेजी में पूछ सकते हैं।"
                      )}
                    </p>
                  </div>

                  <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    {QUICK_LAUNCHERS.map((q) => {
                      const Icon = q.icon;
                      return (
                        <button
                          key={q.title}
                          type="button"
                          onClick={() => sendMessage(q.prompt, q.mode)}
                          className="atoms-card atoms-card-hover group flex items-start gap-3.5 p-4 text-left"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#3b5bff]/10 text-[#3b5bff] transition group-hover:bg-[#3b5bff] group-hover:text-white">
                            <Icon className="h-4.5 w-4.5" />
                          </div>
                          <div>
                            <div className="text-[13.5px] font-semibold text-[#0f172a] group-hover:text-[#3b5bff]">
                              {q.title}
                            </div>
                            <div className="mt-0.5 text-[12px] text-[#64748b]">{q.subtitle}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                turns.map((t, idx) => {
                  const rankTool = t.tools?.find((tl) => tl.ok && tl.tool === "rank_jobs");
                  const searchTool = t.tools?.find((tl) => tl.ok && tl.tool === "search_jobs");
                  const coverTool = t.tools?.find((tl) => tl.ok && tl.tool === "generate_cover_letter");
                  const rankedJobs = (rankTool?.data?.ranked_jobs as Array<{
                    job_id: string;
                    title: string;
                    company: string;
                    compatibility_probability: number;
                    ranking_score: number;
                    strong_matching_skills?: string[];
                    missing_skills?: string[];
                  }>) || [];
                  const discoveredJobs = !rankedJobs.length
                    ? ((searchTool?.data?.jobs as Array<{
                        id: string;
                        title: string;
                        company: string;
                        location?: string;
                        region?: string;
                        work_mode?: string;
                        salary_raw?: string;
                        score?: number;
                      }>) || [])
                    : [];
                  const draftCoverLetter = coverTool?.data?.draft_cover_letter as string | undefined;

                  return (
                    <div key={idx} className={`flex gap-3 ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                      {t.role === "assistant" && (
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0f172a] to-[#3b5bff] text-white shadow-xs">
                          <Bot className="h-4 w-4" />
                        </div>
                      )}

                      <div
                        className={`w-full max-w-2xl rounded-2xl px-5 py-4 ${
                          t.role === "user"
                            ? "max-w-lg bg-[#0f172a] text-[13.5px] leading-relaxed text-white shadow-sm"
                            : "atoms-card bg-white"
                        }`}
                      >
                        {t.role === "assistant" && (
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#f1f5f9] pb-2.5">
                            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                              <span className="font-semibold text-[#3b5bff]">ORCHESTRATOR</span>
                              {t.intent && (
                                <span className="rounded-md bg-[#3b5bff]/10 px-1.5 py-0.5 font-medium text-[#3b5bff]">
                                  {INTENT_LABELS[t.intent] || t.intent}
                                </span>
                              )}
                              {t.plan &&
                                t.plan.map((p) => (
                                  <span key={p} className="rounded-md bg-[#f1f5f9] px-1.5 py-0.5 text-[#475569]">
                                    {AGENT_LABELS[p] || p}
                                  </span>
                                ))}
                              {t.ragMeta && (
                                <span
                                  className={`rounded-md px-1.5 py-0.5 font-semibold ${
                                    t.ragMeta.grounded
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-amber-50 text-amber-800"
                                  }`}
                                >
                                  {t.ragMeta.grounded ? "grounded" : "unverified"} ·{" "}
                                  {Math.round(t.ragMeta.confidence * 100)}%
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopy(idx, t.content)}
                              title="Copy response"
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                            >
                              {copiedIdx === idx ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-600" /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" /> Copy
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        {t.role === "user" ? (
                          <p className="whitespace-pre-line">{t.content}</p>
                        ) : (
                          <FormattedReply text={t.content} />
                        )}

                        {/* Interactive ML Ranked Job Result Cards */}
                        {rankedJobs.length > 0 && (
                          <div className="mt-4 space-y-2 border-t border-[#f1f5f9] pt-3.5">
                            <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">
                              Interactive Match Results ({rankedJobs.length})
                            </div>
                            {rankedJobs.slice(0, 4).map((rj) => {
                              const pct = Math.round(rj.compatibility_probability * 100);
                              return (
                                <div
                                  key={rj.job_id}
                                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3"
                                >
                                  <div className="min-w-0 flex-1">
                                    <Link
                                      href={`/jobs/${rj.job_id}`}
                                      className="truncate text-[13px] font-semibold text-[#0f172a] hover:text-[#3b5bff]"
                                    >
                                      {rj.title}
                                    </Link>
                                    <div className="text-[11.5px] text-[#64748b]">
                                      {rj.company} ·{" "}
                                      <span className="font-mono font-semibold text-emerald-700">{pct}% fit</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleQuickSave(rj.job_id)}
                                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium ${
                                        savedJobs[rj.job_id]
                                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                          : "border-[#e2e8f0] bg-white text-[#475569] hover:text-[#0f172a]"
                                      }`}
                                    >
                                      <Bookmark className="h-3 w-3" /> {savedJobs[rj.job_id] ? "Saved" : "Save"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleQuickTrack(rj.job_id, rj.title)}
                                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium ${
                                        trackedJobs[rj.job_id]
                                          ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                          : "border-[#e2e8f0] bg-white text-[#475569] hover:text-[#0f172a]"
                                      }`}
                                    >
                                      <Briefcase className="h-3 w-3" /> {trackedJobs[rj.job_id] ? "Tracked" : "Track"}
                                    </button>
                                    <Link
                                      href={`/jobs/${rj.job_id}`}
                                      className="inline-flex items-center gap-1 rounded-lg bg-[#0f172a] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#1e293b]"
                                    >
                                      Open <ArrowUpRight className="h-3 w-3" />
                                    </Link>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Interactive Discovered Job Cards (when ranking wasn't run) */}
                        {discoveredJobs.length > 0 && (
                          <div className="mt-4 space-y-2 border-t border-[#f1f5f9] pt-3.5">
                            <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">
                              Discovered Openings ({discoveredJobs.length})
                            </div>
                            {discoveredJobs.slice(0, 4).map((dj) => (
                              <div
                                key={dj.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3"
                              >
                                <div className="min-w-0 flex-1">
                                  <Link
                                    href={`/jobs/${dj.id}`}
                                    className="truncate text-[13px] font-semibold text-[#0f172a] hover:text-[#3b5bff]"
                                  >
                                    {dj.title}
                                  </Link>
                                  <div className="text-[11.5px] text-[#64748b]">
                                    {dj.company} · {dj.location || "Remote"}{" "}
                                    {dj.salary_raw ? `· ${dj.salary_raw}` : ""}
                                  </div>
                                </div>
                                <Link
                                  href={`/jobs/${dj.id}`}
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#0f172a] px-2.5 py-1 text-[11px] font-medium text-white"
                                >
                                  Inspect <ArrowUpRight className="h-3 w-3" />
                                </Link>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Copyable Cover Letter Artifact */}
                        {draftCoverLetter && (
                          <div className="mt-4 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3.5">
                            <div className="mb-1.5 flex items-center justify-between">
                              <span className="font-mono text-[10px] font-semibold uppercase text-[#3b5bff]">
                                Copyable Draft Artifact
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(idx + 1000, draftCoverLetter)}
                                className="inline-flex items-center gap-1 rounded-md border border-[#e2e8f0] bg-white px-2 py-0.5 text-[11px] font-medium text-[#0f172a]"
                              >
                                <Copy className="h-3 w-3" /> Copy Draft
                              </button>
                            </div>
                            <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-[#334155]">
                              {draftCoverLetter}
                            </pre>
                          </div>
                        )}

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
                                  {cit.title}{" "}
                                  <span className="font-mono text-[10px] text-[#3b5bff]">[{cit.source_type}]</span>
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
                              {openTrace[idx] ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                              Execution Trace &amp; Tool Calls ({(t.tools?.length || 0)} tools)
                            </button>
                            {openTrace[idx] && (
                              <div className="mt-2 space-y-1.5 rounded-xl bg-[#f8fafc] p-3">
                                {t.steps?.map((s) => (
                                  <div key={s} className="flex items-center gap-1.5 font-mono text-[10.5px] text-[#475569]">
                                    <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />
                                    <span>{s}</span>
                                  </div>
                                ))}
                                {t.tools && t.tools.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 pt-1 font-mono text-[10px] text-[#64748b]">
                                    {t.tools.map((tl, ti) => (
                                      <span
                                        key={ti}
                                        className={`rounded px-2 py-0.5 ring-1 ${
                                          tl.ok
                                            ? "bg-white text-[#0f172a] ring-[#e2e8f0]"
                                            : "bg-red-50 text-red-700 ring-red-200"
                                        }`}
                                      >
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
                  );
                })
              )}

              {busy && (
                <div className="flex items-center gap-2.5 rounded-2xl border border-[#3b5bff]/25 bg-white px-4 py-3 font-mono text-[11.5px] text-[#3b5bff] shadow-xs">
                  <Sparkles className="h-4 w-4 animate-spin" />
                  <span>Running LangGraph specialists, hybrid retrieval &amp; calibrated ML ranking...</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Sticky Bottom Multi-Line Composer */}
          <div className="border-t border-[#e5e7eb] bg-white px-5 py-3.5 lg:px-8">
            <form onSubmit={handleSend} className="mx-auto flex max-w-3xl items-end gap-2.5">
              <div className="atoms-segmented shrink-0 self-center">
                <button
                  type="button"
                  data-active={chatMode === "orchestrator"}
                  onClick={() => setChatMode("orchestrator")}
                  className="atoms-segmented-btn text-[11.5px]"
                >
                  {tx("Agents", "AI एजेंट")}
                </button>
                <button
                  type="button"
                  data-active={chatMode === "rag"}
                  onClick={() => setChatMode("rag")}
                  className="atoms-segmented-btn text-[11.5px]"
                >
                  {tx("Cited RAG", "संदर्भ RAG")}
                </button>
              </div>
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage(input);
                  }
                }}
                placeholder={
                  chatMode === "rag"
                    ? tx("Ask a grounded question across your private knowledge documents...", "अपने दस्तावेज़ों से प्रमाणित प्रश्न पूछें...")
                    : tx("Ask Medo Orchestrator (Enter to send, Shift+Enter for new line)...", "मेडो AI से हिंदी या अंग्रेजी में कुछ भी पूछें (Enter भेजने के लिए)...")
                }
                className="studio-input min-h-[40px] max-h-28 flex-1 resize-none py-2"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#3b5bff] px-4 text-[12.5px] font-medium text-white shadow-xs transition hover:bg-[#2948eb] disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> {tx("Send", "भेजें")}
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
