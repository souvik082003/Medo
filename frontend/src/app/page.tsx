"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Bot,
  Briefcase,
  Check,
  ChevronDown,
  Database,
  FileText,
  GitBranch,
  Layers,
  Lock,
  Menu,
  Search,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { SystemArchitectureMermaid, WorkflowMermaidSection } from "@/components/ArchitectureDiagrams";
import { MedoShowcase } from "@/components/MedoShowcase";
import { apiFetch, setAuthSession, TokenResponse } from "@/lib/api";

type ComposerMode = "discover" | "analyze" | "assistant" | "roadmap";

const MODE_META: Record<
  ComposerMode,
  { label: string; route: string; pipeline: string; placeholder: string }
> = {
  discover: {
    label: "Hybrid Search",
    route: "/discover",
    pipeline: "pgvector · BM25Okapi · RRF(k=60) · CrossEncoder",
    placeholder: "Find remote & Bengaluru ML Systems roles paying ₹35+ LPA with PyTorch and CUDA...",
  },
  analyze: {
    label: "Resume Intelligence",
    route: "/resume",
    pipeline: "PDF/DOCX Parser · Canonical Taxonomy · Evidence Spans",
    placeholder: "Analyze my resume skill gaps and extract verified evidence spans...",
  },
  assistant: {
    label: "Agentic RAG Chat",
    route: "/assistant",
    pipeline: "LangGraph Orchestrator · 6 Specialists · Cited RAG",
    placeholder: "Ask the career orchestrator to compare roles, plan prep, or explain fit...",
  },
  roadmap: {
    label: "Career Roadmap",
    route: "/roadmap",
    pipeline: "Skill-Gap Graph · Market Signals · Learning Plan",
    placeholder: "Build a 12-week transition roadmap for Staff AI Retrieval Engineer...",
  },
};

const QUICK_BRIEFS = [
  "Find remote & Bengaluru ML Systems roles paying ₹35+ LPA with PyTorch and CUDA",
  "Analyze my resume skill gaps for Staff AI Retrieval Engineer roles",
  "Compare my profile against hybrid search + LangGraph job descriptions",
];

const SYSTEM_PILLARS = [
  { value: "6", label: "Specialist Agents", detail: "LangGraph conditional DAG" },
  { value: "14", label: "Validated Tools", detail: "Pydantic schemas · zero shell" },
  { value: "12", label: "ML/LTR Features", detail: "Calibrated + Pairwise Torch" },
  { value: "3-Tier", label: "Isolated Memory", detail: "HITL approval_requests gate" },
];

const WORKSPACE_MODULES = [
  {
    href: "/discover",
    title: "Hybrid Job Discovery",
    tag: "pgvector + BM25",
    description: "Semantic + lexical search with RRF fusion, Cross-Encoder rerank, and normalized INR/USD salaries.",
    icon: Search,
  },
  {
    href: "/recommendations",
    title: "Calibrated ML & LTR",
    tag: "12 Features",
    description: "Inspect calibrated fit probabilities, pairwise LTR ordering, and exact per-feature drivers.",
    icon: Sparkles,
  },
  {
    href: "/resume",
    title: "Resume Intelligence",
    tag: "Evidence Spans",
    description: "Upload PDF/DOCX/MD resumes for SHA-256 versioning, canonical skill mapping, and gap analysis.",
    icon: FileText,
  },
  {
    href: "/assistant",
    title: "LangGraph & Cited RAG",
    tag: "6 Specialists",
    description: "Multi-agent career orchestration with bounded tool execution, traceable steps, and citations.",
    icon: Bot,
  },
  {
    href: "/tracker",
    title: "Application Pipeline",
    tag: "HITL Controlled",
    description: "Stage-by-stage tracking from Draft to Offer with explicit approval gates before external actions.",
    icon: Briefcase,
  },
  {
    href: "/privacy",
    title: "Privacy, Memory & Audit",
    tag: "Zero-Trust",
    description: "Manage LLM consent, review pending approvals, inspect 3-tier memory, or wipe account data.",
    icon: Lock,
  },
];

const COMPARISON_ROWS = [
  {
    capability: "Job Retrieval Engine",
    wrapper: "Single keyword or raw prompt dump",
    medo: "pgvector + BM25Okapi + RRF(k=60) + Cross-Encoder Rerank",
  },
  {
    capability: "Compatibility Scoring",
    wrapper: "Opaque hallucinated % guess",
    medo: "12-feature calibrated ML + PairwiseTorch LTR ranking",
  },
  {
    capability: "Resume Skill Extraction",
    wrapper: "Prompted tag guessing",
    medo: "Deterministic canonical taxonomy + verbatim resume spans",
  },
  {
    capability: "External Actions & Privacy",
    wrapper: "Unbounded auto-send risk",
    medo: "Consent opt-in + approval_requests HITL gate + tenant isolation",
  },
  {
    capability: "Grounded Career Q&A",
    wrapper: "No document verification",
    medo: "Iterative Agentic RAG with strict citations & injection guard",
  },
];

const FAQS = [
  {
    q: "How does Medo fetch live roles across regions?",
    a: "Medo aggregates free live connectors (Himalayas, Jobicy, Remotive, RemoteOK, Arbeitnow, HackerNews) plus optional Adzuna/Apify adapters, deduplicates listings, normalizes INR/USD salaries, and indexes embeddings for instant hybrid search.",
  },
  {
    q: "Do my resumes leave my workspace without permission?",
    a: "No. Resume parsing, canonical skill extraction, and ML compatibility scoring run strictly locally inside your isolated workspace. External LLM calls only happen if you explicitly enable Consent in Privacy & Memory.",
  },
  {
    q: "What is the Human-in-the-Loop (HITL) approval gate?",
    a: "Before any external application or privileged action proceeds, the agent writes an explicit approval_requests record that pauses execution until you Approve or Reject it inside AI Orchestrator or Privacy & Memory.",
  },
  {
    q: "How are ML compatibility probabilities verified?",
    a: "Ranking models are trained on GroupShuffleSplit zero-leakage candidate-job splits and evaluated with ROC-AUC, ECE, NDCG@10, and MRR metrics logged cleanly in Evaluation Provenance.",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [activeMode, setActiveMode] = useState<ComposerMode>("discover");
  const [promptText, setPromptText] = useState(QUICK_BRIEFS[0]);
  const [demoLoading, setDemoLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const currentMode = MODE_META[activeMode];

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    try {
      const res = await apiFetch<TokenResponse>("/api/v1/auth/demo", { method: "POST" });
      setAuthSession(res);
      router.push("/dashboard");
    } catch {
      router.push("/auth");
    } finally {
      setDemoLoading(false);
    }
  };

  const handleLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`${currentMode.route}?q=${encodeURIComponent(promptText)}`);
  };

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-[#0f172a]">
      {/* Sticky Studio Navbar */}
      <header className="sticky top-0 z-40 border-b border-[#e5e7eb] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#0f172a] to-[#3b5bff] text-white shadow-xs">
              <Layers className="h-4 w-4" />
            </div>
            <span className="text-[16px] font-semibold tracking-tight text-[#0f172a]">Medo</span>
            <span className="rounded-md border border-[#3b5bff]/25 bg-[#3b5bff]/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-[#3b5bff]">
              CAREER STUDIO
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-[13px] font-medium text-[#475569] md:flex">
            <Link href="/" className="font-semibold text-[#0f172a] transition hover:text-[#3b5bff]">
              Home
            </Link>
            <a href="#architecture" className="transition hover:text-[#0f172a]">
              Architecture
            </a>
            <Link href="/discover" className="transition hover:text-[#0f172a]">
              Discovery
            </Link>
            <Link href="/dashboard" className="transition hover:text-[#0f172a]">
              Dashboard
            </Link>
          </nav>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={demoLoading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#3b5bff]/30 bg-[#3b5bff]/[0.07] px-3.5 py-1.5 text-[13px] font-medium text-[#2948eb] transition hover:bg-[#3b5bff]/[0.13] disabled:opacity-60"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {demoLoading ? "Starting Demo..." : "Try Demo"}
            </button>
            <Link
              href="/auth"
              className="rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[#0f172a] transition hover:border-[#cbd5e1]"
            >
              Sign in
            </Link>
            <Link
              href="/auth?mode=register"
              className="hidden items-center gap-1.5 rounded-xl bg-[#0f172a] px-3.5 py-1.5 text-[13px] font-medium text-white transition hover:bg-[#1e293b] sm:inline-flex"
            >
              Start free
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((p) => !p)}
              aria-label="Toggle menu"
              className="inline-flex rounded-xl border border-[#e2e8f0] p-1.5 text-[#0f172a] md:hidden"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="border-t border-[#e5e7eb] bg-white px-6 py-3 md:hidden">
            <div className="grid grid-cols-2 gap-2 text-[13px] font-medium text-[#475569]">
              <Link href="/" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-2 py-1.5 text-[#0f172a] hover:bg-[#f1f5f9]">
                Home
              </Link>
              <a href="#architecture" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-2 py-1.5 hover:bg-[#f1f5f9]">
                Architecture
              </a>
              <Link href="/discover" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-2 py-1.5 hover:bg-[#f1f5f9]">
                Discovery
              </Link>
              <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-2 py-1.5 hover:bg-[#f1f5f9]">
                Dashboard
              </Link>
              <Link href="/auth?mode=register" onClick={() => setMobileMenuOpen(false)} className="col-span-2 rounded-lg px-2 py-1.5 font-semibold text-[#3b5bff] hover:bg-[#f1f5f9]">
                Start Free
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section + Studio Command Composer */}
      <section className="atoms-grid-bg relative border-b border-black/[0.07] px-6 pb-16 pt-14">
        <div className="mx-auto max-w-5xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white px-3.5 py-1 text-[12px] font-medium text-[#52525b] shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-[#4267ff]" />
            <span>ML Compatibility · Hybrid BM25 + pgvector · LangGraph Agents</span>
          </div>

          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-[#171716] sm:text-5xl sm:leading-[1.1]">
            Turn your career profile into{" "}
            <span className="bg-gradient-to-r from-[#4267ff] to-[#171716] bg-clip-text text-transparent">
              evidence-backed job intelligence
            </span>
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-[#52525b]">
            Engineered as a verifiable AI system rather than an opaque wrapper—uniting canonical skill extraction,
            hybrid RRF retrieval, calibrated ML/LTR ranking, and specialist LangGraph orchestration with tenant
            isolation.
          </p>

          {/* Centered Studio Command Composer */}
          <form
            onSubmit={handleLaunch}
            className="atoms-card mx-auto mt-8 max-w-3xl p-4 text-left shadow-lg shadow-black/[0.04]"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="atoms-segmented flex-wrap">
                {(Object.keys(MODE_META) as ComposerMode[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    data-active={activeMode === key}
                    onClick={() => setActiveMode(key)}
                    className="atoms-segmented-btn"
                  >
                    {MODE_META[key].label}
                  </button>
                ))}
              </div>
              <span className="font-mono text-[11px] text-[#71717a]">{currentMode.pipeline}</span>
            </div>

            <textarea
              rows={3}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={currentMode.placeholder}
              className="w-full resize-none rounded-xl border border-black/[0.08] bg-[#fafafa] px-4 py-3 text-[14px] text-[#171716] outline-none transition focus:border-[#4267ff] focus:bg-white"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_BRIEFS.map((brief, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPromptText(brief)}
                    className="rounded-md border border-black/[0.07] bg-[#fafafa] px-2.5 py-1 text-[11px] text-[#52525b] transition hover:border-black/20 hover:text-[#171716]"
                  >
                    Example {idx + 1}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-[#4267ff] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[#3456e8]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Launch Workspace
              </button>
            </div>
          </form>

          {/* Compact System Pillars */}
          <div className="mx-auto mt-8 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
            {SYSTEM_PILLARS.map((item) => (
              <div key={item.label} className="atoms-card px-4 py-3 text-left">
                <div className="font-mono text-xl font-semibold text-[#171716]">{item.value}</div>
                <div className="mt-0.5 text-[12px] font-semibold text-[#171716]">{item.label}</div>
                <div className="font-mono text-[10px] text-[#71717a]">{item.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Elip-Style Guided Conversation Showcase */}
      <MedoShowcase />

      {/* Mermaid-Style System Architecture Flowchart */}
      <section id="architecture" className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-7 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-[#4267ff]">
              System Architecture · Interactive Mermaid Diagram
            </div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              End-to-End Platform Topology &amp; Data Flow
            </h2>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[#4267ff] hover:underline"
          >
            Open Career Dashboard <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <SystemArchitectureMermaid />
      </section>

      {/* Mermaid-Style LangGraph & Agentic RAG Flowcharts + Verified Benchmarks */}
      <section id="pipeline" className="border-y border-black/[0.07] bg-white px-6 py-16">
        <div className="mx-auto max-w-6xl space-y-6">
          <WorkflowMermaidSection />

          {/* Verified Evaluation Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="atoms-card bg-[#fafafa] p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[14px] font-semibold text-[#171716]">
                  <Target className="h-4 w-4 text-[#4267ff]" />
                  <span>Calibrated ML Compatibility</span>
                </div>
                <span className="rounded border border-amber-500/30 bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-800">
                  synthetic_dev (1,500 grouped pairs)
                </span>
              </div>
              <div className="space-y-2 text-[12.5px]">
                <div className="flex items-center justify-between rounded-lg border border-black/[0.06] bg-white px-3 py-2">
                  <span className="font-medium">Calibrated LogisticRegression</span>
                  <span className="font-mono text-[#4267ff]">ROC-AUC 0.979 · ECE 0.034</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-black/[0.06] bg-white px-3 py-2">
                  <span className="font-medium">GradientBoostingClassifier</span>
                  <span className="font-mono text-[#52525b]">ROC-AUC 0.962 · ECE 0.035</span>
                </div>
              </div>
            </div>

            <div className="atoms-card bg-[#fafafa] p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[14px] font-semibold text-[#171716]">
                  <GitBranch className="h-4 w-4 text-[#4267ff]" />
                  <span>Learning-to-Rank (LTR) Models</span>
                </div>
                <span className="rounded border border-amber-500/30 bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-800">
                  GroupShuffleSplit zero-leakage
                </span>
              </div>
              <div className="space-y-2 text-[12.5px]">
                <div className="flex items-center justify-between rounded-lg border border-black/[0.06] bg-white px-3 py-2">
                  <span className="font-medium">Pointwise GBR Ranker</span>
                  <span className="font-mono text-[#4267ff]">NDCG@10 0.986 · MRR 1.000</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-black/[0.06] bg-white px-3 py-2">
                  <span className="font-medium">PairwiseTorchRanker</span>
                  <span className="font-mono text-[#52525b]">NDCG@10 0.985 · MAP 0.993</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Studio Workspace Bento */}
      <section id="workspace" className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-[#4267ff]">
              Studio Modules
            </div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Built for Every Stage of Job Intelligence</h2>
          </div>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[#4267ff] hover:underline"
          >
            Start Guided Onboarding <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WORKSPACE_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link key={mod.href} href={mod.href} className="atoms-card atoms-card-hover group flex flex-col justify-between p-5">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4267ff]/10 text-[#4267ff]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="rounded-md border border-black/[0.07] bg-[#fafafa] px-2 py-0.5 font-mono text-[10px] font-medium text-[#52525b]">
                      {mod.tag}
                    </span>
                  </div>
                  <h3 className="text-[15px] font-semibold text-[#171716] group-hover:text-[#4267ff]">{mod.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[#52525b]">{mod.description}</p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-black/[0.06] pt-3 font-mono text-[11px] font-medium text-[#4267ff]">
                  <span>{mod.href}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Why Medo Comparison Matrix */}
        <div className="mt-14 atoms-card overflow-hidden">
          <div className="border-b border-[#e5e7eb] bg-[#f8fafc] px-6 py-4">
            <div className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#3b5bff]">
              Engineering Standard
            </div>
            <h3 className="mt-0.5 text-[18px] font-semibold text-[#0f172a]">
              Why Medo AI Beats Generic ChatGPT Job Wrappers
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="border-b border-[#e5e7eb] bg-white font-mono text-[11px] uppercase text-[#64748b]">
                <tr>
                  <th className="px-6 py-3">Capability</th>
                  <th className="px-6 py-3">Generic Wrapper</th>
                  <th className="px-6 py-3 text-[#3b5bff]">Medo Career Studio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9] bg-white">
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.capability}>
                    <td className="px-6 py-3.5 font-semibold text-[#0f172a]">{row.capability}</td>
                    <td className="px-6 py-3.5 text-[#64748b]">{row.wrapper}</td>
                    <td className="px-6 py-3.5 font-medium text-[#0f172a]">
                      <span className="inline-flex items-center gap-1.5">
                        <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                        {row.medo}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Interactive FAQ Accordion */}
        <div className="mt-12 grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#3b5bff]">
              Frequently Asked
            </div>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[#0f172a]">
              Architecture, Privacy &amp; Control
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-[#64748b]">
              Everything from hybrid vector retrieval to consent-gated explanations is inspectable and verifiable.
            </p>
          </div>
          <div className="space-y-2.5 lg:col-span-8">
            {FAQS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.q} className="atoms-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[14px] font-semibold text-[#0f172a] transition hover:bg-[#f8fafc]"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-[#64748b] transition-transform ${
                        isOpen ? "rotate-180 text-[#3b5bff]" : ""
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="border-t border-[#f1f5f9] bg-[#f8fafc] px-5 py-3.5 text-[13px] leading-relaxed text-[#475569]">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Governance & Demo Banner */}
        <div className="mt-8 flex flex-col justify-between gap-5 rounded-2xl border border-black/[0.08] bg-white p-6 md:flex-row md:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#171716] text-white">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold text-[#171716]">
                  Human-Controlled &amp; Zero Fabricated Metrics
                </h3>
                <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-700">
                  HITL Ready
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-[13px] text-[#52525b]">
                Every dashboard metric reflects persisted PostgreSQL/SQLite rows. External job submissions require
                explicit <code className="font-mono text-[12px]">approval_requests</code> sign-off, and resumes stay
                local unless <code className="font-mono text-[12px]">llm_consent_granted</code> is enabled.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={demoLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#4267ff] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[#3456e8] disabled:opacity-60"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {demoLoading ? "Loading..." : "Launch Demo Workspace"}
            </button>
            <Link
              href="/auth"
              className="rounded-xl border border-black/10 bg-[#fafafa] px-4 py-2 text-[13px] font-medium text-[#171716] transition hover:border-black/25"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Studio Footer */}
      <footer className="border-t border-black/[0.07] bg-white px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#171716] text-white">
              <Database className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[#171716]">Medo AI Career Intelligence</div>
              <div className="font-mono text-[11px] text-[#71717a]">
                FastAPI · PostgreSQL 16 + pgvector · LangGraph · Next.js 15
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-[12.5px] font-medium text-[#52525b]">
            <Link href="/dashboard" className="hover:text-[#171716]">
              Dashboard
            </Link>
            <Link href="/discover" className="hover:text-[#171716]">
              Discovery
            </Link>
            <Link href="/recommendations" className="hover:text-[#171716]">
              ML Matching
            </Link>
            <Link href="/assistant" className="hover:text-[#171716]">
              AI Assistant
            </Link>
            <Link href="/privacy" className="hover:text-[#171716]">
              Privacy &amp; Approvals
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
