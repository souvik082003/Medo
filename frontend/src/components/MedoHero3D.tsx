"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bot,
  Briefcase,
  CheckCircle2,
  Compass,
  GitBranch,
  Layers,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";
import { MedoMark } from "@/components/MedoLogo";
import { useLanguage } from "@/lib/i18n";

type PhoneTab = "ai" | "jobs" | "roadmap" | "tracker";

const DEMO_MOBILE_JOBS = [
  {
    id: "j1",
    title: "Senior AI / RAG Engineer",
    company: "VectorLabs",
    city: "Bengaluru",
    fit: 94,
    mode: "Hybrid",
    salary: "₹42L",
  },
  {
    id: "j2",
    title: "Staff Backend Engineer",
    company: "CloudScale",
    city: "Remote",
    fit: 91,
    mode: "Remote",
    salary: "$165k",
  },
  {
    id: "j3",
    title: "Full-Stack TypeScript Dev",
    company: "Deliveroo",
    city: "London",
    fit: 86,
    mode: "Hybrid",
    salary: "£95k",
  },
];

export function MedoHero3D() {
  const { tx } = useLanguage();
  const stageRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 6, ry: -12 });
  const [hovering, setHovering] = useState(false);
  const [phoneTab, setPhoneTab] = useState<PhoneTab>("jobs");
  const [cityFilter, setCityFilter] = useState<string>("All");
  const [selectedNode, setSelectedNode] = useState<string>("rag");

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({
      rx: Math.max(-14, Math.min(14, -py * 22)),
      ry: Math.max(-18, Math.min(18, px * 26)),
    });
  };

  const resetTilt = () => {
    setHovering(false);
    setTilt({ rx: 6, ry: -12 });
  };

  const visibleJobs =
    cityFilter === "All"
      ? DEMO_MOBILE_JOBS
      : DEMO_MOBILE_JOBS.filter((j) => j.city.toLowerCase() === cityFilter.toLowerCase());

  return (
    <div
      ref={stageRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={resetTilt}
      className="relative flex min-h-[560px] w-full items-center justify-center py-6 select-none"
      style={{ perspective: "1400px" }}
    >
      {/* Ambient Radial Aura under 3D Phone */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute h-[420px] w-[420px] rounded-full bg-gradient-to-tr from-[#3b5bff]/25 via-indigo-400/20 to-amber-300/20 blur-3xl transition-transform duration-700"
        style={{
          transform: `translate3d(${tilt.ry * -1.4}px, ${tilt.rx * 1.4}px, 0px)`,
        }}
      />

      {/* Interactive 3D Transform Group */}
      <div
        className="relative transition-transform duration-300 ease-out"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        }}
      >
        {/* Top-Left 3D Floating Satellite Card: 30 Roadmaps */}
        <Link
          href="/roadmaps"
          className="group absolute -left-16 top-10 z-30 hidden w-48 rounded-2xl border border-[#0f172a]/15 bg-white/95 p-3 shadow-[0_20px_40px_-12px_rgba(15,23,42,0.22)] backdrop-blur-md transition hover:scale-105 sm:block"
          style={{ transform: "translateZ(46px)" }}
        >
          <div className="flex items-center justify-between">
            <span className="rounded-md bg-[#fde047] px-2 py-0.5 font-mono text-[9.5px] font-bold text-[#0f172a] ring-1 ring-[#0f172a]">
              {tx("30 ROADMAPS", "30 रोडमैप्स")}
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-[#3b5bff] transition group-hover:translate-x-0.5" />
          </div>
          <div className="mt-2 text-[12px] font-semibold text-[#0f172a]">
            {tx("AI, Backend, Cloud & UX", "AI, बैकएंड, क्लाउड व UX")}
          </div>
          <div className="mt-1 flex gap-1">
            <span className="rounded bg-[#ffedd5] px-1.5 py-0.5 text-[9.5px] font-medium text-[#0f172a]">RAG</span>
            <span className="rounded bg-[#ffedd5] px-1.5 py-0.5 text-[9.5px] font-medium text-[#0f172a]">K8s</span>
            <span className="rounded bg-[#ffedd5] px-1.5 py-0.5 text-[9.5px] font-medium text-[#0f172a]">SQL</span>
          </div>
        </Link>

        {/* Top-Right 3D Floating Satellite Card: Calibrated Fit Gauge */}
        <Link
          href="/recommendations"
          className="group absolute -right-14 top-20 z-30 hidden w-48 rounded-2xl border border-emerald-200/80 bg-white/95 p-3.5 shadow-[0_22px_45px_-12px_rgba(15,23,42,0.22)] backdrop-blur-md transition hover:scale-105 sm:block"
          style={{ transform: "translateZ(68px)" }}
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 ring-2 ring-emerald-500">
              <span className="font-mono text-[13px] font-bold text-emerald-700">94%</span>
            </div>
            <div className="min-w-0">
              <div className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-emerald-700">
                {tx("ML COMPATIBILITY", "ML संगतता")}
              </div>
              <div className="truncate text-[12px] font-bold text-[#0f172a]">VectorLabs AI</div>
              <div className="text-[10px] text-[#64748b]">LTR 28.4 · 8/9 skills</div>
            </div>
          </div>
        </Link>

        {/* Bottom-Left 3D Floating Satellite Card: Live Job Ingestion & Ollama */}
        <div
          className="absolute -left-14 bottom-12 z-30 hidden w-56 rounded-2xl border border-slate-800/80 bg-[#0f172a]/95 p-3.5 text-white shadow-[0_25px_50px_-14px_rgba(15,23,42,0.45)] backdrop-blur-md sm:block"
          style={{ transform: "translateZ(58px)" }}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              {tx("MOBILE & WEB SYNCED", "मोबाइल और वेब सिंक")}
            </span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9.5px] text-indigo-200">
              Ollama + RAG
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-300">
            <span>Himalayas · Remotive · HN</span>
            <span className="font-mono font-bold text-white">6 APIs</span>
          </div>
        </div>

        {/* Realism Brushed-Titanium 3D iPhone Chassis */}
        <div
          className="relative w-[304px] sm:w-[322px] rounded-[48px] border-[9px] border-[#111827] bg-[#0b0f19] p-1.5 shadow-[0_38px_80px_-18px_rgba(15,23,42,0.48),0_0_0_1px_rgba(255,255,255,0.22)_inset]"
          style={{ transform: "translateZ(20px)" }}
        >
          {/* Side Titanium Hardware Buttons */}
          <span
            aria-hidden="true"
            className="absolute -left-[12px] top-24 h-8 w-[3px] rounded-l-sm bg-slate-700"
          />
          <span
            aria-hidden="true"
            className="absolute -left-[12px] top-36 h-12 w-[3px] rounded-l-sm bg-slate-700"
          />
          <span
            aria-hidden="true"
            className="absolute -right-[12px] top-28 h-14 w-[3px] rounded-r-sm bg-slate-700"
          />

          {/* Subtle Glass Screen Reflection */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 rounded-[40px] bg-gradient-to-tr from-transparent via-white/[0.04] to-white/[0.12] transition-opacity duration-300"
            style={{ opacity: hovering ? 0.9 : 0.45 }}
          />

          {/* Inner Screen Viewport Running Live Interactive Medo Mobile Webapp */}
          <div className="relative z-10 flex h-[575px] flex-col overflow-hidden rounded-[38px] bg-[#f8fafc] text-[#0f172a]">
            {/* Top Status Bar + Dynamic Island */}
            <div className="flex items-center justify-between bg-white px-5 pb-2 pt-3">
              <span className="font-mono text-[11px] font-bold text-[#0f172a]">9:41</span>
              <div className="flex h-5 w-24 items-center justify-between rounded-full bg-[#090d16] px-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                <span className="font-mono text-[8.5px] font-semibold text-white">Medo Live</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2 w-3 rounded-[2px] border border-[#0f172a] bg-emerald-500" />
              </div>
            </div>

            {/* Mobile Webapp Header Bar */}
            <div className="flex items-center justify-between border-b border-[#e5e7eb] bg-white px-4 py-2.5">
              <div className="flex items-center gap-2">
                <MedoMark size={24} />
                <div>
                  <div className="text-[12.5px] font-bold leading-none text-[#0f172a]">Medo</div>
                  <div className="mt-0.5 text-[9.5px] text-[#64748b]">
                    {phoneTab === "jobs" && tx("Mobile Job Discovery", "मोबाइल नौकरी खोज")}
                    {phoneTab === "ai" && tx("AI Orchestrator", "AI ऑर्केस्ट्रेटर")}
                    {phoneTab === "roadmap" && tx("AI Engineer Roadmap", "AI इंजीनियर रोडमैप")}
                    {phoneTab === "tracker" && tx("Pipeline Tracker", "पाइपलाइन ट्रैकर")}
                  </div>
                </div>
              </div>
              <span className="rounded-md bg-[#3b5bff]/10 px-2 py-0.5 font-mono text-[9.5px] font-bold text-[#3b5bff]">
                {tx("INTERACTIVE", "लाइव डेमो")}
              </span>
            </div>

            {/* Interactive Mobile Screen Body */}
            <div className="thin-scroll flex-1 overflow-y-auto p-3.5">
              {phoneTab === "jobs" && (
                <div className="space-y-2.5">
                  {/* Search + Area Filter Pills */}
                  <div className="flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-2.5 py-2 text-[11px] text-[#64748b]">
                    <Search className="h-3.5 w-3.5 text-[#3b5bff]" />
                    <span className="truncate">
                      {tx("PyTorch OR FastAPI in JD...", "JD में खोजें...")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {["All", "Bengaluru", "Remote", "London"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCityFilter(c)}
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold transition ${
                          cityFilter === c
                            ? "bg-[#0f172a] text-white"
                            : "bg-white text-[#475569] ring-1 ring-[#e2e8f0]"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2 pt-0.5">
                    {visibleJobs.map((job) => (
                      <Link
                        key={job.id}
                        href="/discover"
                        className="block rounded-xl border border-[#e5e7eb] bg-white p-3 shadow-2xs transition hover:border-[#3b5bff]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-bold text-[#0f172a]">{job.title}</div>
                            <div className="mt-0.5 flex items-center gap-1 text-[10.5px] text-[#64748b]">
                              <span className="font-medium text-[#334155]">{job.company}</span>
                              <span>·</span>
                              <MapPin className="h-2.5 w-2.5" />
                              <span>{job.city}</span>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700">
                            {job.fit}%
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px]">
                          <span className="rounded bg-[#f1f5f9] px-1.5 py-0.5 font-mono text-[#475569]">
                            {job.mode}
                          </span>
                          <span className="font-mono font-semibold text-[#3b5bff]">{job.salary}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {phoneTab === "ai" && (
                <div className="space-y-2.5">
                  <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[#0f172a] px-3 py-2 text-[11px] text-white">
                    {tx(
                      "Which AI jobs fit my Python + RAG skills in Bengaluru or Remote?",
                      "मेरे Python + RAG कौशल के लिए बेंगलुरु या रिमोट में कौन-सी नौकरियाँ फिट हैं?"
                    )}
                  </div>
                  <div className="rounded-2xl rounded-bl-sm border border-[#e2e8f0] bg-white p-3 shadow-2xs">
                    <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[9.5px] font-bold text-[#3b5bff]">
                      <Bot className="h-3 w-3" /> {tx("LANGGRAPH + OLLAMA", "LANGGRAPH + OLLAMA")}
                    </div>
                    <p className="text-[11px] leading-relaxed text-[#334155]">
                      {tx(
                        "Found 12 live matches. Top fit is Senior AI / RAG Engineer at VectorLabs (94% match).",
                        "12 लाइव नौकरियाँ मिलीं। VectorLabs में AI Engineer (94% फिट) शीर्ष स्थान पर है।"
                      )}
                    </p>
                    <div className="mt-2 rounded-lg bg-[#f8fafc] p-2 text-[10px]">
                      <div className="font-semibold text-[#0f172a]">VectorLabs · Bengaluru</div>
                      <div className="mt-0.5 text-emerald-700">✓ Python, pgvector, FastAPI</div>
                    </div>
                  </div>
                  <Link
                    href="/assistant"
                    className="inline-flex w-full items-center justify-center gap-1 rounded-xl bg-[#3b5bff] py-2 text-[11px] font-semibold text-white"
                  >
                    <Sparkles className="h-3 w-3" /> {tx("Try Live Orchestrator", "लाइव ऑर्केस्ट्रेटर खोलें")}
                  </Link>
                </div>
              )}

              {phoneTab === "roadmap" && (
                <div className="space-y-2">
                  <div className="text-center font-mono text-[9.5px] font-bold uppercase text-[#64748b]">
                    {tx("Tap a node inside phone", "फ़ोन में नोड टैप करें")}
                  </div>
                  {[
                    { id: "llms", label: "01 Pre-trained LLMs", desc: "GPT, Claude, Gemini & Tokens" },
                    { id: "rag", label: "02 Embeddings & RAG", desc: "pgvector + BM25 Hybrid Retrieval" },
                    { id: "agents", label: "03 AI Agents (LangGraph)", desc: "Tool Calling & ReAct Loops" },
                  ].map((node) => {
                    const active = selectedNode === node.id;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => setSelectedNode(node.id)}
                        className={`w-full rounded-lg border-2 px-3 py-2 text-left transition ${
                          active
                            ? "border-[#0f172a] bg-[#fde047] shadow-[0_2px_0_#0f172a]"
                            : "border-[#0f172a]/40 bg-[#ffedd5] hover:bg-[#fef08a]"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11.5px] font-bold text-[#0f172a]">
                          <span>{node.label}</span>
                          {active && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />}
                        </div>
                        {active && <div className="mt-1 text-[10px] font-medium text-[#334155]">{node.desc}</div>}
                      </button>
                    );
                  })}
                  <Link
                    href="/roadmaps"
                    className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-xl bg-[#4f46e5] py-2 text-[11px] font-semibold text-white"
                  >
                    <Compass className="h-3 w-3" /> {tx("Open All 30 Roadmaps", "सभी 30 रोडमैप्स खोलें")}
                  </Link>
                </div>
              )}

              {phoneTab === "tracker" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    {[
                      { label: tx("Saved", "सहेजे"), count: "6", color: "text-[#3b5bff]" },
                      { label: tx("Applied", "आवेदन"), count: "4", color: "text-amber-600" },
                      { label: tx("Interview", "इंटरव्यू"), count: "2", color: "text-emerald-600" },
                    ].map((s) => (
                      <div key={s.label} className="rounded-lg border border-[#e5e7eb] bg-white p-2">
                        <div className={`font-mono text-[14px] font-bold ${s.color}`}>{s.count}</div>
                        <div className="text-[9.5px] text-[#64748b]">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-[#e5e7eb] bg-white p-3">
                    <div className="flex items-center justify-between text-[11.5px] font-bold">
                      <span>AI Systems Engineer</span>
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9.5px] text-indigo-700">Final Loop</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#64748b]">ContextFlow · Remote</div>
                  </div>
                  <div className="rounded-xl border border-[#e5e7eb] bg-white p-3">
                    <div className="flex items-center justify-between text-[11.5px] font-bold">
                      <span>Backend API Engineer</span>
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9.5px] text-emerald-700">Offer Ready</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#64748b]">FinStack · Bengaluru</div>
                  </div>
                </div>
              )}
            </div>

            {/* Interactive Mobile Bottom Tab Bar */}
            <div className="grid grid-cols-4 border-t border-[#e5e7eb] bg-white px-2 py-2">
              {[
                { id: "jobs", label: tx("Jobs", "नौकरियाँ"), icon: Search },
                { id: "ai", label: tx("AI", "AI"), icon: Bot },
                { id: "roadmap", label: tx("Map", "मैप"), icon: GitBranch },
                { id: "tracker", label: tx("Track", "ट्रैक"), icon: Briefcase },
              ].map((t) => {
                const Icon = t.icon;
                const active = phoneTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setPhoneTab(t.id as PhoneTab)}
                    className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-[9.5px] font-semibold transition ${
                      active ? "text-[#3b5bff]" : "text-[#64748b] hover:text-[#0f172a]"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* iOS Home Gesture Indicator */}
            <div className="flex justify-center bg-white pb-2 pt-0.5">
              <span className="h-1 w-24 rounded-full bg-[#0f172a]/20" />
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Tilt Hint */}
      <div className="pointer-events-none absolute -bottom-1 flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-white/90 px-3 py-1 font-mono text-[10px] font-medium text-[#64748b] shadow-2xs">
        <Layers className="h-3 w-3 text-[#3b5bff]" />
        {tx("Move cursor to tilt 3D · Tap phone tabs to preview mobile webapp", "3D घुमाने के लिए माउस हिलाएँ · फ़ोन के अंदर टैब टैप करें")}
      </div>
    </div>
  );
}
