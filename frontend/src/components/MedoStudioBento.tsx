"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Briefcase,
  Check,
  Compass,
  FileText,
  Lock,
  MapPin,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export function MedoStudioBento() {
  const { tx } = useLanguage();

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {/* 1. Large Hero Bento Card: Hybrid Job Discovery (6 cols) */}
      <Link
        href="/discover"
        className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-[#e2e8f0] bg-gradient-to-br from-white via-white to-[#eef2ff]/60 p-6 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-[#3b5bff]/50 hover:shadow-[0_20px_45px_-15px_rgba(59,91,255,0.18)] lg:col-span-6"
      >
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3b5bff] text-white shadow-xs">
                <Search className="h-4.5 w-4.5" />
              </div>
              <div>
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#3b5bff]">
                  pgvector + BM25 + RRF
                </span>
                <h3 className="text-[17px] font-bold tracking-tight text-[#0f172a] group-hover:text-[#3b5bff]">
                  {tx("Hybrid Job Discovery", "हाइब्रिड जॉब खोज")}
                </h3>
              </div>
            </div>
            <ArrowUpRight className="h-4.5 w-4.5 text-[#94a3b8] transition group-hover:translate-x-0.5 group-hover:text-[#3b5bff]" />
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-[#475569]">
            {tx(
              "Live retrieval across 6 free job APIs with Exact-in-JD matching, City & Area dropdowns, and INR/USD pay normalization.",
              "6 लाइव जॉब स्रोतों से रियल-टाइम खोज, Exact-in-JD मिलान, शहर/एरिया फ़िल्टर और INR/USD वेतन समानता।"
            )}
          </p>
        </div>

        {/* Rich Live Micro-UI Preview Inside Card */}
        <div className="mt-5 rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-3.5">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-[11px] text-[#334155] ring-1 ring-[#e2e8f0]">
              <Search className="h-3 w-3 text-[#3b5bff]" />
              <span className="font-medium">React OR FastAPI</span>
            </div>
            <div className="flex items-center gap-1 font-mono text-[9.5px]">
              <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 font-semibold text-[#0f172a] ring-1 ring-[#e2e8f0]">
                <MapPin className="h-2.5 w-2.5 text-[#3b5bff]" /> Bengaluru
              </span>
              <span className="rounded-md bg-[#3b5bff] px-2 py-0.5 font-semibold text-white">Exact JD</span>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { title: "Applied AI Systems Eng", co: "VectorLabs", pay: "₹42L", rrf: "0.94" },
              { title: "Senior Full-Stack Dev", co: "Deliveroo · Hybrid", pay: "£95k", rrf: "0.89" },
            ].map((row) => (
              <div
                key={row.title}
                className="flex items-center justify-between rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-[11.5px]"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-[#0f172a]">{row.title}</div>
                  <div className="text-[10px] text-[#64748b]">{row.co}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 font-mono text-[10px]">
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">{row.pay}</span>
                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-bold text-[#3b5bff]">RRF {row.rrf}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Link>

      {/* 2. Large Hero Bento Card: Calibrated ML & LTR (6 cols) */}
      <Link
        href="/recommendations"
        className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-[#e2e8f0] bg-gradient-to-br from-white via-white to-emerald-50/40 p-6 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400 hover:shadow-[0_20px_45px_-15px_rgba(16,185,129,0.18)] lg:col-span-6"
      >
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                <Sparkles className="h-4.5 w-4.5" />
              </div>
              <div>
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                  12 Features · PairwiseTorch
                </span>
                <h3 className="text-[17px] font-bold tracking-tight text-[#0f172a] group-hover:text-emerald-700">
                  {tx("Calibrated ML & LTR Ranking", "कैलिब्रेटेड ML और LTR रैंकिंग")}
                </h3>
              </div>
            </div>
            <ArrowUpRight className="h-4.5 w-4.5 text-[#94a3b8] transition group-hover:translate-x-0.5 group-hover:text-emerald-600" />
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-[#475569]">
            {tx(
              "Real calibrated compatibility probabilities backed by matched vs missing skill pills and transparent ranking drivers.",
              "मैच हुए और लापता कौशलों के प्रमाण के साथ सटीक योग्यता प्रतिशत और पारदर्शी LTR रैंकिंग।"
            )}
          </p>
        </div>

        {/* Rich ML Compatibility Micro-UI Preview */}
        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-3.5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-4 border-emerald-500 bg-emerald-50 font-mono text-[14px] font-bold text-emerald-700">
              94%
            </div>
            <div>
              <div className="font-mono text-[9.5px] font-semibold uppercase text-[#64748b]">Calibrated Fit</div>
              <div className="font-mono text-[12px] font-bold text-[#0f172a]">LTR 28.4</div>
            </div>
          </div>
          <div className="flex-1 space-y-2 text-[11px]">
            <div>
              <div className="flex justify-between font-medium text-[#334155]">
                <span>{tx("Required Skills (8/9)", "कौशल मिलान (8/9)")}</span>
                <span className="font-mono font-bold text-emerald-700">89%</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-[#e2e8f0]">
                <div className="h-full w-[89%] rounded-full bg-emerald-500" />
              </div>
            </div>
            <div>
              <div className="flex justify-between font-medium text-[#334155]">
                <span>{tx("Semantic Alignment", "सिमैंटिक समानता")}</span>
                <span className="font-mono font-bold text-[#3b5bff]">84%</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-[#e2e8f0]">
                <div className="h-full w-[84%] rounded-full bg-[#3b5bff]" />
              </div>
            </div>
          </div>
        </div>
      </Link>

      {/* 3. Dark Obsidian Tile: LangGraph + Ollama Orchestrator (4 cols) */}
      <Link
        href="/assistant"
        className="group flex flex-col justify-between rounded-3xl border border-[#1e293b] bg-[#0f172a] p-5 text-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#3b5bff] hover:shadow-[0_18px_40px_-14px_rgba(15,23,42,0.5)] lg:col-span-4"
      >
        <div>
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3b5bff] text-white">
              <Bot className="h-4 w-4" />
            </div>
            <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-200">
              6 Agents · EN / हिंदी
            </span>
          </div>
          <h3 className="mt-3.5 text-[15.5px] font-bold text-white group-hover:text-indigo-300">
            {tx("LangGraph & Cited RAG", "AI ऑर्केस्ट्रेटर और RAG")}
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-300">
            {tx(
              "Local Ollama career chat backed by 14 Pydantic tools and inline cited workspace notes.",
              "लोकल Ollama (हिंदी व अंग्रेजी) चैट, 14 टूल्स और प्रमाणित दस्तावेज़ खोज।"
            )}
          </p>
        </div>

        <div className="mt-4 space-y-1.5 rounded-xl border border-white/10 bg-black/35 p-3 font-mono text-[10.5px]">
          <div className="text-slate-300">› Can I get ML jobs knowing only HTML?</div>
          <div className="text-emerald-300">
            [Advisor] Honest gap check + Python/JS roadmap →
          </div>
        </div>
      </Link>

      {/* 4. Roadmap.sh Style Tile: 30 Interactive Roadmaps (4 cols) */}
      <Link
        href="/roadmaps"
        className="group flex flex-col justify-between rounded-3xl border border-[#e2e8f0] bg-white p-5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-[#0f172a] hover:shadow-md lg:col-span-4"
      >
        <div>
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fde047] text-[#0f172a] ring-1 ring-[#0f172a]">
              <Compass className="h-4 w-4" />
            </div>
            <span className="rounded-md bg-[#fde047] px-2 py-0.5 font-mono text-[10px] font-bold text-[#0f172a]">
              30 Tracks
            </span>
          </div>
          <h3 className="mt-3.5 text-[15.5px] font-bold text-[#0f172a] group-hover:text-[#3b5bff]">
            {tx("Interactive Role Roadmaps", "30 करियर रोडमैप्स")}
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#475569]">
            {tx(
              "Click any node across AI, Backend, Cloud, SQL & UX for step-by-step guides and courses.",
              "AI, बैकएंड, क्लाउड, SQL व UX के हर नोड पर सीखने का तरीका व कोर्स देखें।"
            )}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-1.5 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-2.5 text-[10.5px] font-bold text-[#0f172a]">
          <span className="rounded border border-[#0f172a] bg-[#fde047] px-2 py-1">01 LLMs</span>
          <span className="flex-1 border-t-2 border-dotted border-[#2563eb]" />
          <span className="rounded border border-[#0f172a] bg-[#ffedd5] px-2 py-1">RAG ✓</span>
          <span className="flex-1 border-t-2 border-dotted border-[#2563eb]" />
          <span className="rounded border border-[#0f172a] bg-[#ffedd5] px-2 py-1">Agents</span>
        </div>
      </Link>

      {/* 5. Resume Intelligence Tile (4 cols) */}
      <Link
        href="/resume"
        className="group flex flex-col justify-between rounded-3xl border border-[#e2e8f0] bg-white p-5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-[#3b5bff]/50 hover:shadow-md lg:col-span-4"
      >
        <div>
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-[#3b5bff]">
              <FileText className="h-4 w-4" />
            </div>
            <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#475569]">
              SHA-256 · Verbatim
            </span>
          </div>
          <h3 className="mt-3.5 text-[15.5px] font-bold text-[#0f172a] group-hover:text-[#3b5bff]">
            {tx("Resume Intelligence", "रेज़्यूमे स्टूडियो")}
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#475569]">
            {tx(
              "PDF/DOCX parsing that normalizes skills into canonical tags with proof lines.",
              "PDF/DOCX से सटीक कौशल और रेज़्यूमे की मूल प्रमाणित पंक्तियाँ निकालता है।"
            )}
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-2.5 font-mono text-[10px]">
          <div className="flex items-center justify-between text-[#0f172a]">
            <span className="font-bold">PostgreSQL · pgvector</span>
            <span className="text-emerald-700">96% ✓</span>
          </div>
          <div className="mt-1 truncate text-[#64748b]">&ldquo;Indexed 50k job embeddings...&rdquo;</div>
        </div>
      </Link>

      {/* 6. Skill-Gap Analysis Tile (4 cols) */}
      <Link
        href="/skills"
        className="group flex flex-col justify-between rounded-3xl border border-[#e2e8f0] bg-white p-5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-amber-400 hover:shadow-md lg:col-span-4"
      >
        <div>
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Target className="h-4 w-4" />
            </div>
            <span className="rounded-md bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-800">
              Market Radar
            </span>
          </div>
          <h3 className="mt-3.5 text-[15.5px] font-bold text-[#0f172a] group-hover:text-amber-700">
            {tx("Skill-Gap Analysis", "कौशल-अंतर विश्लेषण")}
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#475569]">
            {tx(
              "Pinpoint the exact missing market skills prioritized by live role frequency.",
              "लाइव नौकरियों की माँग के अनुसार प्रमुख लापता कौशलों की पहचान करें।"
            )}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-2.5 font-mono text-[10px]">
          <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">+ Python ✓</span>
          <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">+ React ✓</span>
          <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">− Docker</span>
        </div>
      </Link>

      {/* 7. Application Pipeline Tile (4 cols) */}
      <Link
        href="/tracker"
        className="group flex flex-col justify-between rounded-3xl border border-[#e2e8f0] bg-white p-5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-[#3b5bff]/50 hover:shadow-md lg:col-span-4"
      >
        <div>
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-[#0f172a]">
              <Briefcase className="h-4 w-4" />
            </div>
            <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#475569]">
              Kanban + Table
            </span>
          </div>
          <h3 className="mt-3.5 text-[15.5px] font-bold text-[#0f172a] group-hover:text-[#3b5bff]">
            {tx("Application Pipeline", "आवेदन पाइपलाइन ट्रैकर")}
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#475569]">
            {tx(
              "Track every stage from Saved Draft through Interview loops to Final Offer.",
              "ड्राफ़्ट से इंटरव्यू और अंतिम ऑफ़र तक हर आवेदन को कैनबन बोर्ड पर सँभालें।"
            )}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-2.5 text-center font-mono text-[10px]">
          <div className="rounded-lg bg-white py-1.5 ring-1 ring-[#e2e8f0]">
            <span className="font-bold text-[#3b5bff]">6</span> Draft
          </div>
          <div className="rounded-lg bg-white py-1.5 ring-1 ring-[#e2e8f0]">
            <span className="font-bold text-amber-600">4</span> Interview
          </div>
          <div className="rounded-lg bg-emerald-50 py-1.5 ring-1 ring-emerald-200">
            <span className="font-bold text-emerald-700">1</span> Offer
          </div>
        </div>
      </Link>

      {/* 8. Privacy, Memory & HITL Gate Tile (4 cols) */}
      <Link
        href="/privacy"
        className="group flex flex-col justify-between rounded-3xl border border-[#e2e8f0] bg-white p-5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400 hover:shadow-md lg:col-span-4"
      >
        <div>
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Lock className="h-4 w-4" />
            </div>
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-800">
              Zero-Trust HITL
            </span>
          </div>
          <h3 className="mt-3.5 text-[15.5px] font-bold text-[#0f172a] group-hover:text-emerald-700">
            {tx("Privacy, Memory & Audit", "गोपनीयता, मेमोरी और सुरक्षा")}
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#475569]">
            {tx(
              "Control LLM consent, edit 3-tier memory rules, and approve external actions cleanly.",
              "LLM सहमति, 3-स्तरीय मेमोरी नियम और मानव अनुमोदन लॉग नियंत्रित करें।"
            )}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-[11px] font-semibold text-emerald-900">
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-700" />
            {tx("Approval Gate Active", "मानव अनुमोदन सक्रिय")}
          </span>
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </Link>
    </div>
  );
}
