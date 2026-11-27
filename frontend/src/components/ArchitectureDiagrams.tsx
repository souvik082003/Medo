"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, Search } from "lucide-react";

type FlowDiagramTab = "rag" | "orchestrator";

interface DiagramNodeMeta {
  id: string;
  label: string;
  sub: string;
  group: string;
  file: string;
  description: string;
  route?: string;
}

const SYSTEM_NODES: Record<string, DiagramNodeMeta> = {
  ui: {
    id: "ui",
    label: "Next.js 15 Studio UI",
    sub: "14 App Router Routes",
    group: "Client & Edge",
    file: "frontend/src/components/StudioShell.tsx",
    description:
      "Prompt-first landing studio, job discovery, ML compatibility inspector, resume intelligence, Agentic RAG chat, and privacy controls.",
    route: "/dashboard",
  },
  api: {
    id: "api",
    label: "FastAPI API v1",
    sub: "Observability + OTEL",
    group: "Gateway",
    file: "backend/app/main.py",
    description:
      "REST v1 router with rate limiting, OpenTelemetry stage tracing, security headers (nosniff, DENY, no-store), and PII/secret redaction.",
  },
  auth: {
    id: "auth",
    label: "Argon2id + JWT & RBAC",
    sub: "Strict Tenant Isolation",
    group: "Core Security",
    file: "backend/app/auth/dependencies.py",
    description:
      "Per-user isolation across profiles, resumes, private jobs, saved items, applications, RAG documents, memory, and audit logs.",
    route: "/auth",
  },
  retrieval: {
    id: "retrieval",
    label: "Hybrid Search Engine",
    sub: "pgvector + BM25 + RRF + Rerank",
    group: "Retrieval",
    file: "backend/app/retrieval/hybrid.py",
    description:
      "Dense Sentence Transformer cosine similarity + sparse BM25Okapi fused with RRF(k=60) and Cross-Encoder reranking, plus multi-currency INR/USD normalization.",
    route: "/discover",
  },
  ml: {
    id: "ml",
    label: "ML Compatibility & LTR",
    sub: "12 Features · PairwiseTorch",
    group: "Ranking Engine",
    file: "backend/app/ml/ranking.py",
    description:
      "Calibrated LogisticRegression / GBDT fit probabilities and PairwiseTorchRanker / Pointwise GBR ordering trained on GroupShuffleSplit zero-leakage splits.",
    route: "/recommendations",
  },
  rag: {
    id: "rag",
    label: "Iterative Agentic RAG",
    sub: "Grounding + Injection Filter",
    group: "AI Knowledge",
    file: "backend/app/rag/pipeline.py",
    description:
      "LangGraph RAG loop that classifies queries, rewrites on low relevance (max 2 retries), strips prompt-injection patterns, and verifies citation grounding.",
    route: "/assistant",
  },
  agents: {
    id: "agents",
    label: "LangGraph Orchestrator",
    sub: "6 Specialists · Bounded DAG",
    group: "Multi-Agent",
    file: "backend/app/agents/orchestrator.py",
    description:
      "Routes user intents across ProfileIntelligence, JobDiscovery, JobMatching, CareerAdvisor, ApplicationAssistant, and MemoryAgent.",
    route: "/assistant",
  },
  pg: {
    id: "pg",
    label: "PostgreSQL 16 + pgvector",
    sub: "Relational + Vector + Memory",
    group: "Persistence",
    file: "backend/app/models/__init__.py",
    description:
      "Stores normalized jobs, job_versions, embeddings, 3-tier user memory, applications, and audit trails (with SQLite dev fallback).",
  },
  redis: {
    id: "redis",
    label: "Redis 7 + Celery",
    sub: "Ingestion & Beat Workers",
    group: "Async Workers",
    file: "backend/app/ingestion/pipeline.py",
    description:
      "Executes scheduled multi-region ingestion, 3-layer deduplication, stale-job expiry, and job_sources health tracking.",
  },
  tools: {
    id: "tools",
    label: "14 Pydantic Tools",
    sub: "Zero Shell Execution",
    group: "Agent Runtime",
    file: "backend/app/agents/tools.py",
    description:
      "Typed, bounded tool execution (max_calls=8) covering search, ML ranking, resume parsing, skill gaps, market trends, and memory.",
  },
  hitl: {
    id: "hitl",
    label: "Human Approval Gate",
    sub: "approval_requests HITL",
    group: "Governance",
    file: "backend/app/api/v1/privacy.py",
    description:
      "External job submissions, emails, and external uploads are blocked until explicitly approved by the user.",
    route: "/privacy",
  },
};

function DiagramNodeBox({
  x,
  y,
  w,
  h,
  title,
  sub,
  selected,
  accent = "default",
  onClick,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
  selected?: boolean;
  accent?: "default" | "cobalt" | "dark" | "emerald" | "amber";
  onClick?: () => void;
}) {
  const styles = {
    default: {
      fill: selected ? "#eef2ff" : "#ffffff",
      stroke: selected ? "#4267ff" : "#d4d4d8",
      titleColor: "#171716",
      subColor: "#71717a",
    },
    cobalt: {
      fill: selected ? "#3456e8" : "#4267ff",
      stroke: "#2b4eff",
      titleColor: "#ffffff",
      subColor: "#dbeafe",
    },
    dark: {
      fill: selected ? "#27272a" : "#171716",
      stroke: selected ? "#4267ff" : "#171716",
      titleColor: "#ffffff",
      subColor: "#a1a1aa",
    },
    emerald: {
      fill: selected ? "#d1fae5" : "#ecfdf5",
      stroke: selected ? "#059669" : "#6ee7b7",
      titleColor: "#065f46",
      subColor: "#047857",
    },
    amber: {
      fill: selected ? "#fef3c7" : "#fffbeb",
      stroke: selected ? "#d97706" : "#fcd34d",
      titleColor: "#92400e",
      subColor: "#b45309",
    },
  }[accent];

  return (
    <g
      onClick={onClick}
      className={onClick ? "cursor-pointer transition-opacity hover:opacity-95" : undefined}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={10}
        fill={styles.fill}
        stroke={styles.stroke}
        strokeWidth={selected ? 2 : 1.25}
      />
      <text
        x={x + w / 2}
        y={y + h / 2 - 4}
        textAnchor="middle"
        fill={styles.titleColor}
        fontSize={12.5}
        fontWeight={600}
        fontFamily="var(--font-sans), system-ui, sans-serif"
      >
        {title}
      </text>
      <text
        x={x + w / 2}
        y={y + h / 2 + 13}
        textAnchor="middle"
        fill={styles.subColor}
        fontSize={10}
        fontFamily="var(--font-mono), ui-monospace, monospace"
      >
        {sub}
      </text>
    </g>
  );
}

export function SystemArchitectureMermaid() {
  const [selectedId, setSelectedId] = useState<string>("api");
  const activeNode = SYSTEM_NODES[selectedId] ?? SYSTEM_NODES.api;

  return (
    <div className="space-y-4">
      {/* Mermaid-style Flowchart Canvas */}
      <div className="atoms-card overflow-hidden bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.07] bg-[#fafafa] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#4267ff]" />
            <span className="font-mono text-[11px] font-semibold text-[#171716]">
              flowchart LR · System Architecture
            </span>
          </div>
          <span className="font-mono text-[11px] text-[#71717a]">Click any node to inspect source &amp; contract</span>
        </div>

        <div className="atoms-grid-bg overflow-x-auto p-4">
          <svg
            viewBox="0 0 1040 420"
            className="mx-auto h-auto min-w-[880px] w-full select-none"
            role="img"
            aria-label="Medo System Architecture Mermaid Flowchart"
          >
            <defs>
              <marker id="arrow-muted" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#71717a" />
              </marker>
              <marker id="arrow-cobalt" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#4267ff" />
              </marker>
              <marker id="arrow-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#d97706" />
              </marker>
            </defs>

            {/* Subgraph Containers */}
            <rect x="14" y="18" width="186" height="384" rx="14" fill="#ffffff" fillOpacity="0.72" stroke="#e4e4e7" strokeDasharray="5 4" />
            <text x="28" y="38" fill="#71717a" fontSize="10" fontWeight="600" fontFamily="var(--font-mono), monospace">
              CLIENT STUDIO
            </text>

            <rect x="218" y="18" width="194" height="384" rx="14" fill="#ffffff" fillOpacity="0.72" stroke="#e4e4e7" strokeDasharray="5 4" />
            <text x="232" y="38" fill="#71717a" fontSize="10" fontWeight="600" fontFamily="var(--font-mono), monospace">
              API GATEWAY
            </text>

            <rect x="442" y="18" width="302" height="384" rx="14" fill="#ffffff" fillOpacity="0.82" stroke="#c7d2fe" strokeDasharray="5 4" />
            <text x="456" y="38" fill="#4267ff" fontSize="10" fontWeight="600" fontFamily="var(--font-mono), monospace">
              INTELLIGENCE &amp; ORCHESTRATION
            </text>

            <rect x="774" y="18" width="252" height="384" rx="14" fill="#ffffff" fillOpacity="0.72" stroke="#e4e4e7" strokeDasharray="5 4" />
            <text x="788" y="38" fill="#71717a" fontSize="10" fontWeight="600" fontFamily="var(--font-mono), monospace">
              DATA, TOOLS &amp; HITL
            </text>

            {/* Edges: UI -> API */}
            <path d="M 182 210 L 233 210" fill="none" stroke="#4267ff" strokeWidth="1.75" markerEnd="url(#arrow-cobalt)" />
            <text x="208" y="201" textAnchor="middle" fill="#4267ff" fontSize="9" fontFamily="var(--font-mono), monospace">
              HTTP/JWT
            </text>

            {/* Edges: API -> Core Subsystems */}
            <path d="M 396 210 L 424 210 L 424 78 L 463 78" fill="none" stroke="#71717a" strokeWidth="1.4" markerEnd="url(#arrow-muted)" />
            <path d="M 424 148 L 463 148" fill="none" stroke="#71717a" strokeWidth="1.4" markerEnd="url(#arrow-muted)" />
            <path d="M 396 218 L 463 218" fill="none" stroke="#4267ff" strokeWidth="1.75" markerEnd="url(#arrow-cobalt)" />
            <path d="M 424 210 L 424 288 L 463 288" fill="none" stroke="#71717a" strokeWidth="1.4" markerEnd="url(#arrow-muted)" />
            <path d="M 424 288 L 424 358 L 463 358" fill="none" stroke="#4267ff" strokeWidth="1.6" markerEnd="url(#arrow-cobalt)" />

            {/* Edges: Subsystems -> Data, Tools & HITL (Zero Crossing) */}
            <path d="M 724 78 L 789 78" fill="none" stroke="#71717a" strokeWidth="1.4" markerEnd="url(#arrow-muted)" />
            <path d="M 724 142 C 756 142, 756 90, 789 90" fill="none" stroke="#71717a" strokeWidth="1.4" markerEnd="url(#arrow-muted)" />
            <path d="M 724 156 C 756 156, 756 168, 789 168" fill="none" stroke="#71717a" strokeWidth="1.4" markerEnd="url(#arrow-muted)" />
            <path d="M 724 218 C 760 218, 760 102, 789 102" fill="none" stroke="#71717a" strokeWidth="1.4" markerEnd="url(#arrow-muted)" />
            <path d="M 724 288 C 764 288, 764 114, 789 114" fill="none" stroke="#71717a" strokeWidth="1.4" strokeDasharray="4 3" markerEnd="url(#arrow-muted)" />
            <path d="M 724 350 C 756 350, 756 266, 789 266" fill="none" stroke="#4267ff" strokeWidth="1.6" markerEnd="url(#arrow-cobalt)" />
            <path d="M 724 364 L 789 354" fill="none" stroke="#d97706" strokeWidth="1.6" markerEnd="url(#arrow-amber)" />

            {/* Nodes: Subgraph 1 & 2 */}
            <DiagramNodeBox
              x={30}
              y={176}
              w={152}
              h={68}
              title="Next.js 15 Studio"
              sub="14 App Router Routes"
              accent="dark"
              selected={selectedId === "ui"}
              onClick={() => setSelectedId("ui")}
            />
            <DiagramNodeBox
              x={236}
              y={176}
              w={160}
              h={68}
              title="FastAPI API v1"
              sub="OTEL + PII Redaction"
              accent="cobalt"
              selected={selectedId === "api"}
              onClick={() => setSelectedId("api")}
            />

            {/* Nodes: Subgraph 3 */}
            <DiagramNodeBox
              x={468}
              y={50}
              w={256}
              h={56}
              title="Argon2id + JWT & RBAC"
              sub="Strict Tenant Isolation"
              selected={selectedId === "auth"}
              onClick={() => setSelectedId("auth")}
            />
            <DiagramNodeBox
              x={468}
              y={120}
              w={256}
              h={56}
              title="Hybrid Search Engine"
              sub="pgvector + BM25 + RRF + Rerank"
              selected={selectedId === "retrieval"}
              onClick={() => setSelectedId("retrieval")}
            />
            <DiagramNodeBox
              x={468}
              y={190}
              w={256}
              h={56}
              title="ML Compatibility & LTR"
              sub="12 Features · PairwiseTorch"
              selected={selectedId === "ml"}
              onClick={() => setSelectedId("ml")}
            />
            <DiagramNodeBox
              x={468}
              y={260}
              w={256}
              h={56}
              title="Iterative Agentic RAG"
              sub="Grounding + Injection Filter"
              selected={selectedId === "rag"}
              onClick={() => setSelectedId("rag")}
            />
            <DiagramNodeBox
              x={468}
              y={330}
              w={256}
              h={56}
              title="LangGraph Orchestrator"
              sub="6 Specialists · Bounded Loops"
              accent="emerald"
              selected={selectedId === "agents"}
              onClick={() => setSelectedId("agents")}
            />

            {/* Nodes: Subgraph 4 */}
            <DiagramNodeBox
              x={794}
              y={54}
              w={214}
              h={66}
              title="PostgreSQL 16 + pgvector"
              sub="Jobs · Vectors · 3-Tier Memory"
              selected={selectedId === "pg"}
              onClick={() => setSelectedId("pg")}
            />
            <DiagramNodeBox
              x={794}
              y={138}
              w={214}
              h={60}
              title="Redis 7 + Celery"
              sub="Ingestion · Dedup · Beat"
              selected={selectedId === "redis"}
              onClick={() => setSelectedId("redis")}
            />
            <DiagramNodeBox
              x={794}
              y={234}
              w={214}
              h={60}
              title="14 Pydantic Tools"
              sub="Zero Shell Execution"
              selected={selectedId === "tools"}
              onClick={() => setSelectedId("tools")}
            />
            <DiagramNodeBox
              x={794}
              y={322}
              w={214}
              h={60}
              title="Human Approval Gate"
              sub="approval_requests HITL"
              accent="amber"
              selected={selectedId === "hitl"}
              onClick={() => setSelectedId("hitl")}
            />
          </svg>
        </div>
      </div>

      {/* Interactive Node Inspector Bar */}
      <div className="atoms-card flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-[#4267ff]/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-[#4267ff]">
              {activeNode.group}
            </span>
            <h3 className="text-[14px] font-semibold text-[#171716]">{activeNode.label}</h3>
            <code className="rounded border border-black/[0.08] bg-[#fafafa] px-2 py-0.5 font-mono text-[11px] text-[#52525b]">
              {activeNode.file}
            </code>
          </div>
          <p className="mt-1.5 text-[13px] text-[#52525b]">{activeNode.description}</p>
        </div>

        {activeNode.route && (
          <Link
            href={activeNode.route}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-black/10 bg-[#fafafa] px-3 py-1.5 text-[12.5px] font-medium text-[#171716] transition hover:border-black/25"
          >
            Open {activeNode.route} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

export function WorkflowMermaidSection() {
  const [tab, setTab] = useState<FlowDiagramTab>("rag");

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-[#4267ff]">
            LangGraph StateGraphs · Mermaid Flows
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            Execution Graphs: Iterative RAG &amp; Multi-Agent Routing
          </h2>
        </div>

        <div className="atoms-segmented">
          <button
            type="button"
            data-active={tab === "rag"}
            onClick={() => setTab("rag")}
            className="atoms-segmented-btn"
          >
            Iterative Agentic RAG
          </button>
          <button
            type="button"
            data-active={tab === "orchestrator"}
            onClick={() => setTab("orchestrator")}
            className="atoms-segmented-btn"
          >
            Career Orchestrator DAG
          </button>
        </div>
      </div>

      {tab === "rag" ? (
        <div className="atoms-card overflow-hidden bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.07] bg-[#fafafa] px-4 py-2.5">
            <div className="flex items-center gap-2 font-mono text-[11px] font-semibold text-[#171716]">
              <Search className="h-3.5 w-3.5 text-[#4267ff]" />
              <span>flowchart LR · backend/app/rag/pipeline.py (recursion_limit=16, max_retries=2)</span>
            </div>
            <Link href="/assistant" className="font-mono text-[11px] font-medium text-[#4267ff] hover:underline">
              Test in /assistant →
            </Link>
          </div>

          <div className="atoms-grid-bg overflow-x-auto p-4">
            <svg
              viewBox="0 0 1040 300"
              className="mx-auto h-auto min-w-[880px] w-full select-none"
              role="img"
              aria-label="Iterative Agentic RAG Mermaid Flowchart"
            >
              <defs>
                <marker id="rag-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#4267ff" />
                </marker>
                <marker id="rag-arrow-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#d97706" />
                </marker>
                <marker id="rag-arrow-emerald" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#059669" />
                </marker>
              </defs>

              {/* Main forward arrows */}
              <path d="M 88 94 L 116 94" fill="none" stroke="#4267ff" strokeWidth="1.6" markerEnd="url(#rag-arrow)" />
              <path d="M 270 94 L 298 94" fill="none" stroke="#4267ff" strokeWidth="1.6" markerEnd="url(#rag-arrow)" />
              <path d="M 452 94 L 480 94" fill="none" stroke="#4267ff" strokeWidth="1.6" markerEnd="url(#rag-arrow)" />
              <path d="M 634 94 L 664 94" fill="none" stroke="#4267ff" strokeWidth="1.6" markerEnd="url(#rag-arrow)" />

              {/* Grade -> Generate (Pass / Max Retries) */}
              <path d="M 816 84 C 842 84, 842 56, 868 56" fill="none" stroke="#059669" strokeWidth="1.7" markerEnd="url(#rag-arrow-emerald)" />
              <rect x="786" y="30" width="76" height="18" rx="4" fill="#ecfdf5" stroke="#a7f3d0" />
              <text x="824" y="42" textAnchor="middle" fill="#065f46" fontSize="9" fontFamily="var(--font-mono), monospace">
                relevant
              </text>

              {/* Generate -> Verify -> END */}
              <path d="M 944 88 L 944 118" fill="none" stroke="#059669" strokeWidth="1.6" markerEnd="url(#rag-arrow-emerald)" />
              <path d="M 944 184 L 944 214" fill="none" stroke="#059669" strokeWidth="1.6" markerEnd="url(#rag-arrow-emerald)" />

              {/* Grade -> Refine Query -> Rewrite Query (Retry Loop) */}
              <path
                d="M 742 130 L 742 228 L 642 228"
                fill="none"
                stroke="#d97706"
                strokeWidth="1.7"
                strokeDasharray="5 4"
                markerEnd="url(#rag-arrow-amber)"
              />
              <rect x="646" y="166" width="174" height="20" rx="4" fill="#fffbeb" stroke="#fde68a" />
              <text x="733" y="179" textAnchor="middle" fill="#92400e" fontSize="9.5" fontFamily="var(--font-mono), monospace">
                low relevance &amp; retries &lt; 2
              </text>

              <path
                d="M 486 228 L 378 228 L 378 132"
                fill="none"
                stroke="#d97706"
                strokeWidth="1.7"
                strokeDasharray="5 4"
                markerEnd="url(#rag-arrow-amber)"
              />

              {/* Nodes */}
              <rect x="20" y="72" width="68" height="44" rx="22" fill="#171716" />
              <text x="54" y="98" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="600" fontFamily="var(--font-mono), monospace">
                START
              </text>

              <DiagramNodeBox x={122} y={62} w={148} h={64} title="Understand Query" sub="Classify &amp; source filter" />
              <DiagramNodeBox x={304} y={62} w={148} h={64} title="Rewrite Query" sub="Decompose &amp; broaden" />
              <DiagramNodeBox x={486} y={62} w={148} h={64} title="Hybrid Retrieve" sub="pgvector + BM25 + RRF" />
              <DiagramNodeBox x={670} y={58} w={146} h={72} title="Grade Relevance" sub="Stem overlap / score" accent="cobalt" />

              <DiagramNodeBox x={486} y={198} w={148} h={60} title="Refine Query" sub="retries += 1 (max 2)" accent="amber" />

              <DiagramNodeBox x={872} y={24} w={148} h={64} title="Generate Answer" sub="Citations + strip inject" accent="emerald" />
              <DiagramNodeBox x={872} y={124} w={148} h={60} title="Verify Grounding" sub="Cite check or refuse" accent="emerald" />

              <rect x="904" y="220" width="84" height="40" rx="20" fill="#171716" />
              <text x="946" y="244" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="600" fontFamily="var(--font-mono), monospace">
                END
              </text>
            </svg>
          </div>
        </div>
      ) : (
        <div className="atoms-card overflow-hidden bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.07] bg-[#fafafa] px-4 py-2.5">
            <div className="flex items-center gap-2 font-mono text-[11px] font-semibold text-[#171716]">
              <Bot className="h-3.5 w-3.5 text-[#4267ff]" />
              <span>flowchart LR · backend/app/agents/orchestrator.py (6 Specialists · 14 Tools)</span>
            </div>
            <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-700">
              curated_benchmark: 100% Task &amp; Approval Accuracy
            </span>
          </div>

          <div className="atoms-grid-bg overflow-x-auto p-4">
            <svg
              viewBox="0 0 1040 370"
              className="mx-auto h-auto min-w-[880px] w-full select-none"
              role="img"
              aria-label="LangGraph Main Career Orchestrator Mermaid Flowchart"
            >
              <defs>
                <marker id="orch-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#4267ff" />
                </marker>
                <marker id="orch-muted" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#71717a" />
                </marker>
                <marker id="orch-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#d97706" />
                </marker>
              </defs>

              {/* START -> Classify Intent */}
              <path d="M 88 185 L 116 185" fill="none" stroke="#4267ff" strokeWidth="1.6" markerEnd="url(#orch-arrow)" />

              {/* Classify Intent -> 6 Specialists */}
              {[42, 100, 158, 216, 274, 332].map((targetY) => (
                <path
                  key={targetY}
                  d={`M 288 185 C 322 185, 322 ${targetY}, 352 ${targetY}`}
                  fill="none"
                  stroke={targetY === 274 ? "#d97706" : "#4267ff"}
                  strokeWidth="1.4"
                  markerEnd={targetY === 274 ? "url(#orch-amber)" : "url(#orch-arrow)"}
                />
              ))}

              {/* Specialists -> ToolExecutor / Approval Gate */}
              {[42, 100, 158, 216, 332].map((srcY) => (
                <path
                  key={`t-${srcY}`}
                  d={`M 596 ${srcY} C 628 ${srcY}, 628 118, 654 118`}
                  fill="none"
                  stroke="#71717a"
                  strokeWidth="1.35"
                  markerEnd="url(#orch-muted)"
                />
              ))}
              <path d="M 596 274 L 654 274" fill="none" stroke="#d97706" strokeWidth="1.6" markerEnd="url(#orch-amber)" />

              {/* ToolExecutor & Approval -> Final Response -> END */}
              <path d="M 844 118 C 874 118, 874 176, 898 176" fill="none" stroke="#4267ff" strokeWidth="1.5" markerEnd="url(#orch-arrow)" />
              <path d="M 844 274 C 874 274, 874 196, 898 196" fill="none" stroke="#d97706" strokeWidth="1.5" markerEnd="url(#orch-amber)" />

              {/* Nodes */}
              <rect x="20" y="163" width="68" height="44" rx="22" fill="#171716" />
              <text x="54" y="189" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="600" fontFamily="var(--font-mono), monospace">
                START
              </text>

              <DiagramNodeBox x={122} y={149} w={166} h={72} title="Classify Intent &amp; Plan" sub="6 Intents · Ordered DAG" accent="cobalt" />

              <DiagramNodeBox x={358} y={20} w={238} h={44} title="ProfileIntelligence" sub="profile_analysis" />
              <DiagramNodeBox x={358} y={78} w={238} h={44} title="JobDiscovery" sub="job_discovery" />
              <DiagramNodeBox x={358} y={136} w={238} h={44} title="JobMatching" sub="job_matching" />
              <DiagramNodeBox x={358} y={194} w={238} h={44} title="CareerAdvisor" sub="career_advice" />
              <DiagramNodeBox x={358} y={252} w={238} h={44} title="ApplicationAssistant" sub="application_prep (HITL)" accent="amber" />
              <DiagramNodeBox x={358} y={310} w={238} h={44} title="MemoryAgent" sub="preference_memory" />

              <DiagramNodeBox x={660} y={82} w={184} h={72} title="ToolExecutor (14 Tools)" sub="Pydantic · max_calls=8" accent="emerald" />
              <DiagramNodeBox x={660} y={238} w={184} h={72} title="Human Approval Gate" sub="approval_requests" accent="amber" />

              <DiagramNodeBox x={904} y={149} w={120} h={72} title="Synthesize &amp; END" sub="Trace + Follow-ups" accent="dark" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
