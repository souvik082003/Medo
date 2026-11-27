"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Bot,
  Briefcase,
  Database,
  FileText,
  GitBranch,
  Layers,
  Lock,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import { SystemArchitectureMermaid, WorkflowMermaidSection } from "@/components/ArchitectureDiagrams";
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

export default function LandingPage() {
  const router = useRouter();
  const [activeMode, setActiveMode] = useState<ComposerMode>("discover");
  const [promptText, setPromptText] = useState(QUICK_BRIEFS[0]);
  const [demoLoading, setDemoLoading] = useState(false);

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
    <div className="min-h-screen bg-[#fafafa] text-[#171716]">
      {/* Sticky Studio Navbar */}
      <header className="sticky top-0 z-40 border-b border-black/[0.07] bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#171716] text-white">
              <Layers className="h-4 w-4" />
            </div>
            <span className="text-[16px] font-semibold tracking-tight">Medo</span>
            <span className="rounded-md border border-[#4267ff]/25 bg-[#4267ff]/10 px-2 py-0.5 font-mono text-[11px] font-medium text-[#4267ff]">
              CAREER STUDIO
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-[13px] font-medium text-[#52525b] md:flex">
            <a href="#architecture" className="transition hover:text-[#171716]">
              Architecture
            </a>
            <a href="#pipeline" className="transition hover:text-[#171716]">
              RAG &amp; Agents
            </a>
            <a href="#workspace" className="transition hover:text-[#171716]">
              Workspace
            </a>
            <Link href="/discover" className="transition hover:text-[#171716]">
              Discovery
            </Link>
            <Link href="/dashboard" className="transition hover:text-[#171716]">
              Dashboard
            </Link>
          </nav>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={demoLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#4267ff]/30 bg-[#4267ff]/[0.07] px-3 py-1.5 text-[13px] font-medium text-[#2b4eff] transition hover:bg-[#4267ff]/[0.13] disabled:opacity-60"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {demoLoading ? "Starting Demo..." : "Try Demo"}
            </button>
            <Link
              href="/auth"
              className="rounded-lg border border-black/10 bg-white px-3.5 py-1.5 text-[13px] font-medium text-[#171716] transition hover:border-black/20"
            >
              Sign in
            </Link>
            <Link
              href="/auth?mode=register"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#171716] px-3.5 py-1.5 text-[13px] font-medium text-white transition hover:bg-[#272726]"
            >
              Start free
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
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
