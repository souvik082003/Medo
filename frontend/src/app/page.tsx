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
  Lock,
  Menu,
  Search,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { SystemArchitectureMermaid, WorkflowMermaidSection } from "@/components/ArchitectureDiagrams";
import { MedoMark } from "@/components/MedoLogo";
import { MedoShowcase } from "@/components/MedoShowcase";
import { apiFetch, setAuthSession, TokenResponse } from "@/lib/api";
import { LanguageToggle, useLanguage } from "@/lib/i18n";

type ComposerMode = "discover" | "analyze" | "assistant" | "roadmap";

const MODE_META: Record<
  ComposerMode,
  {
    labelEn: string;
    labelHi: string;
    route: string;
    pipeline: string;
    placeholderEn: string;
    placeholderHi: string;
  }
> = {
  discover: {
    labelEn: "Hybrid Search",
    labelHi: "हाइब्रिड सर्च",
    route: "/discover",
    pipeline: "pgvector · BM25Okapi · RRF(k=60) · CrossEncoder",
    placeholderEn: "Find remote & Bengaluru ML Systems roles paying ₹35+ LPA with PyTorch and CUDA...",
    placeholderHi: "रिमोट और बेंगलुरु में PyTorch व FastAPI वाली AI/ML नौकरियाँ खोजें...",
  },
  analyze: {
    labelEn: "Resume Intelligence",
    labelHi: "रेज़्यूमे विश्लेषण",
    route: "/resume",
    pipeline: "PDF/DOCX Parser · Canonical Taxonomy · Evidence Spans",
    placeholderEn: "Analyze my resume skill gaps and extract verified evidence spans...",
    placeholderHi: "मेरे रेज़्यूमे से कौशल निकालें और कमियों का विश्लेषण करें...",
  },
  assistant: {
    labelEn: "Agentic RAG Chat",
    labelHi: "AI असिस्टेंट चैट",
    route: "/assistant",
    pipeline: "LangGraph Orchestrator · 6 Specialists · Cited RAG",
    placeholderEn: "Ask the career orchestrator to compare roles, plan prep, or explain fit...",
    placeholderHi: "करियर ऑर्केस्ट्रेटर से जॉब तुलना, इंटरव्यू तैयारी या रोडमैप पूछें...",
  },
  roadmap: {
    labelEn: "Career Roadmap",
    labelHi: "करियर रोडमैप",
    route: "/roadmap",
    pipeline: "Skill-Gap Graph · Market Signals · Learning Plan",
    placeholderEn: "Build a 12-week transition roadmap for Staff AI Retrieval Engineer...",
    placeholderHi: "AI Retrieval Engineer बनने के लिए 12-सप्ताह का रोडमैप बनाएँ...",
  },
};

const QUICK_BRIEFS_EN = [
  "Find remote & Bengaluru ML Systems roles paying ₹35+ LPA with PyTorch and CUDA",
  "Analyze my resume skill gaps for Staff AI Retrieval Engineer roles",
  "Compare my profile against hybrid search + LangGraph job descriptions",
];

const QUICK_BRIEFS_HI = [
  "रिमोट और बेंगलुरु में PyTorch और FastAPI वाली नौकरियाँ खोजें",
  "AI और ML इंजीनियर रोल के लिए मेरे कौशल अंतर का विश्लेषण करें",
  "मेरे प्रोफ़ाइल और लाइव नौकरियों के बीच फिट स्कोर की तुलना करें",
];

const SYSTEM_PILLARS = [
  { value: "6", labelEn: "Specialist Agents", labelHi: "विशेषज्ञ AI एजेंट्स", detail: "LangGraph conditional DAG" },
  { value: "14", labelEn: "Validated Tools", labelHi: "सत्यापित टूल्स", detail: "Pydantic schemas · zero shell" },
  { value: "12", labelEn: "ML/LTR Features", labelHi: "ML रैंकिंग फ़ीचर्स", detail: "Calibrated + Pairwise Torch" },
  { value: "3-Tier", labelEn: "Isolated Memory", labelHi: "सुरक्षित मेमोरी", detail: "HITL approval_requests gate" },
];

const WORKSPACE_MODULES = [
  {
    href: "/discover",
    titleEn: "Hybrid Job Discovery",
    titleHi: "हाइब्रिड जॉब खोज",
    tag: "pgvector + BM25",
    descEn: "Semantic + lexical search with RRF fusion, Area/Region filters, and normalized INR/USD salaries.",
    descHi: "सिमैंटिक और सटीक कीवर्ड सर्च के साथ शहर, क्षेत्र और वेतन फ़िल्टर।",
    icon: Search,
  },
  {
    href: "/recommendations",
    titleEn: "Calibrated ML & LTR",
    titleHi: "ML योग्यता और रैंकिंग",
    tag: "12 Features",
    descEn: "Inspect calibrated fit probabilities, pairwise LTR ordering, and exact per-feature drivers.",
    descHi: "हर नौकरी के लिए सटीक फिट प्रतिशत और कौशल मिलान विवरण देखें।",
    icon: Sparkles,
  },
  {
    href: "/resume",
    titleEn: "Resume Intelligence",
    titleHi: "रेज़्यूमे स्टूडियो",
    tag: "Evidence Spans",
    descEn: "Upload PDF/DOCX/MD resumes for SHA-256 versioning, canonical skill mapping, and gap analysis.",
    descHi: "रेज़्यूमे अपलोड कर स्वचालित कौशल वर्गीकरण और प्रमाणित साक्ष्य प्राप्त करें।",
    icon: FileText,
  },
  {
    href: "/assistant",
    titleEn: "LangGraph & Cited RAG",
    titleHi: "AI ऑर्केस्ट्रेटर और RAG",
    tag: "6 Specialists",
    descEn: "Multi-agent career orchestration with Ollama/LLM synthesis, traceable tools, and citations.",
    descHi: "हिंदी और अंग्रेजी में Ollama AI करियर सलाह और प्रमाणित दस्तावेज़ खोज।",
    icon: Bot,
  },
  {
    href: "/tracker",
    titleEn: "Application Pipeline",
    titleHi: "आवेदन पाइपलाइन ट्रैकर",
    tag: "HITL Controlled",
    descEn: "Kanban & Table stage tracking from Draft to Offer with explicit approval gates.",
    descHi: "ड्राफ़्ट से ऑफ़र तक हर आवेदन चरण को कैनबन बोर्ड पर ट्रैक करें।",
    icon: Briefcase,
  },
  {
    href: "/privacy",
    titleEn: "Privacy, Memory & Audit",
    titleHi: "गोपनीयता और सुरक्षा",
    tag: "Zero-Trust",
    descEn: "Manage LLM consent, review pending approvals, inspect 3-tier memory, or check audit trails.",
    descHi: "AI सहमति, मानव अनुमोदन, 3-स्तरीय मेमोरी और ऑडिट लॉग नियंत्रित करें।",
    icon: Lock,
  },
];

const COMPARISON_ROWS = [
  {
    capEn: "Job Retrieval Engine",
    capHi: "जॉब खोज इंजन",
    wrapEn: "Single keyword or raw prompt dump",
    wrapHi: "केवल साधारण कीवर्ड या रैंडम प्रॉम्प्ट",
    medoEn: "pgvector + BM25Okapi + RRF(k=60) + Area/JD Filters",
    medoHi: "pgvector + BM25 + RRF फ़्यूज़न + शहर और सटीक JD फ़िल्टर",
  },
  {
    capEn: "Compatibility Scoring",
    capHi: "योग्यता स्कोरिंग",
    wrapEn: "Opaque hallucinated % guess",
    wrapHi: "बिना आधार का अनुमानित प्रतिशत",
    medoEn: "12-feature calibrated ML + PairwiseTorch LTR ranking",
    medoHi: "12-फ़ीचर कैलिब्रेटेड ML और PairwiseTorch रैंकिंग",
  },
  {
    capEn: "Resume Skill Extraction",
    capHi: "रेज़्यूमे कौशल पहचान",
    wrapEn: "Prompted tag guessing",
    wrapHi: "अस्पष्ट टैग अनुमान",
    medoEn: "Deterministic taxonomy + verbatim resume spans",
    medoHi: "सटीक टैक्सोनॉमी और रेज़्यूमे से सीधे प्रमाणित पंक्तियाँ",
  },
  {
    capEn: "External Actions & Privacy",
    capHi: "गोपनीयता और नियंत्रण",
    wrapEn: "Unbounded auto-send risk",
    wrapHi: "बिना अनुमति स्वचालित डेटा भेजने का जोखिम",
    medoEn: "Consent opt-in + approval_requests HITL gate",
    medoHi: "स्पष्ट सहमति और हर बाहरी एक्शन पर मानव अनुमोदन गेट",
  },
  {
    capEn: "Grounded Career Q&A",
    capHi: "प्रमाणित AI उत्तर",
    wrapEn: "No document verification",
    wrapHi: "दस्तावेज़ सत्यापन की कमी",
    medoEn: "Iterative Agentic RAG with citations & Hindi/English support",
    medoHi: "संदर्भ सहित Agentic RAG और पूर्ण हिंदी/अंग्रेजी समर्थन",
  },
];

const FAQS = [
  {
    qEn: "How does Medo fetch live roles across regions?",
    qHi: "Medo विभिन्न क्षेत्रों से लाइव नौकरियाँ कैसे लाता है?",
    aEn: "Medo aggregates free live connectors (Himalayas, Jobicy, Remotive, RemoteOK, Arbeitnow, HackerNews), deduplicates listings, strips HTML cleanly, normalizes salaries, and indexes embeddings for hybrid search.",
    aHi: "Medo 6 मुफ्त लाइव जॉब स्रोतों (Himalayas, Jobicy, Remotive, RemoteOK, Arbeitnow, HackerNews) से सीधे नौकरियाँ एकत्र करता है, डुप्लिकेट हटाता है और उन्हें सटीक सर्च के लिए इंडेक्स करता है।",
  },
  {
    qEn: "Do my resumes leave my workspace without permission?",
    qHi: "क्या मेरा रेज़्यूमे बिना अनुमति के बाहर भेजा जाता है?",
    aEn: "No. Resume parsing, skill extraction, local Ollama inference, and ML scoring run locally. External cloud LLM calls happen only if you enable Consent in Privacy & Memory.",
    aHi: "नहीं। रेज़्यूमे पार्सिंग, कौशल पहचान, लोकल Ollama AI और ML स्कोरिंग आपके सिस्टम में सुरक्षित रहते हैं। बाहरी क्लाउड LLM तभी उपयोग होता है जब आप अनुमति देते हैं।",
  },
  {
    qEn: "What is the Human-in-the-Loop (HITL) approval gate?",
    qHi: "ह्यूमन-इन-द-लूप (HITL) अनुमोदन गेट क्या है?",
    aEn: "Before any external submission or sensitive action proceeds, the agent creates an explicit approval_requests record that pauses execution until you Approve or Reject it.",
    aHi: "किसी भी बाहरी आवेदन को सबमिट करने से पहले सिस्टम एक स्पष्ट अनुमोदन अनुरोध बनाता है और आपकी मंज़ूरी के बिना कोई कार्रवाई नहीं करता।",
  },
  {
    qEn: "How are ML compatibility probabilities verified?",
    qHi: "ML फिट प्रतिशत की सटीकता कैसे सत्यापित होती है?",
    aEn: "Ranking models are trained on zero-leakage GroupShuffleSplit candidate-job splits and tracked via ROC-AUC, ECE, NDCG@10, and MRR evaluation metrics.",
    aHi: "मॉडल को ज़ीरो-लीकेज विभाजन पर ट्रेन किया गया है और ROC-AUC, ECE, NDCG@10 और MRR मेट्रिक्स के माध्यम से लगातार मापा जाता है।",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { lang, tx } = useLanguage();
  const [activeMode, setActiveMode] = useState<ComposerMode>("discover");
  const [promptText, setPromptText] = useState(QUICK_BRIEFS_EN[0]);
  const [demoLoading, setDemoLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const currentMode = MODE_META[activeMode];
  const quickBriefs = lang === "hi" ? QUICK_BRIEFS_HI : QUICK_BRIEFS_EN;

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
            <MedoMark size={34} className="shadow-xs" />
            <span className="text-[16.5px] font-bold tracking-tight text-[#0f172a]">Medo</span>
            <span className="rounded-md border border-[#3b5bff]/25 bg-[#3b5bff]/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-[#3b5bff]">
              {tx("CAREER STUDIO", "करियर स्टूडियो")}
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-[13px] font-medium text-[#475569] md:flex">
            <Link href="/" className="font-semibold text-[#0f172a] transition hover:text-[#3b5bff]">
              {tx("Home", "होम")}
            </Link>
            <Link href="/roadmaps" className="transition hover:text-[#3b5bff]">
              {tx("Roadmaps", "रोडमैप्स")}
            </Link>
            <a href="#architecture" className="transition hover:text-[#0f172a]">
              {tx("Architecture", "आर्किटेक्चर")}
            </a>
            <Link href="/discover" className="transition hover:text-[#0f172a]">
              {tx("Discovery", "नौकरियाँ")}
            </Link>
            <Link href="/dashboard" className="transition hover:text-[#0f172a]">
              {tx("Dashboard", "डैशबोर्ड")}
            </Link>
          </nav>

          <div className="flex items-center gap-2.5">
            <LanguageToggle />
            <Link
              href="/auth"
              className="hidden rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#475569] transition hover:bg-[#f1f5f9] hover:text-[#0f172a] sm:inline-flex"
            >
              {tx("Sign in", "साइन इन")}
            </Link>
            <Link
              href="/auth?mode=register"
              className="hidden items-center gap-1.5 rounded-lg bg-[#0f172a] px-3.5 py-1.5 text-[12.5px] font-medium text-white transition hover:bg-[#1e293b] sm:inline-flex"
            >
              {tx("Get started", "शुरू करें")}
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
                {tx("Home", "होम")}
              </Link>
              <Link href="/roadmaps" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-2 py-1.5 font-semibold text-[#3b5bff] hover:bg-[#f1f5f9]">
                {tx("Roadmaps", "रोडमैप्स")}
              </Link>
              <a href="#architecture" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-2 py-1.5 hover:bg-[#f1f5f9]">
                {tx("Architecture", "आर्किटेक्चर")}
              </a>
              <Link href="/discover" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-2 py-1.5 hover:bg-[#f1f5f9]">
                {tx("Discovery", "नौकरियाँ")}
              </Link>
              <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-2 py-1.5 hover:bg-[#f1f5f9]">
                {tx("Dashboard", "डैशबोर्ड")}
              </Link>
              <Link href="/auth?mode=register" onClick={() => setMobileMenuOpen(false)} className="col-span-2 rounded-lg px-2 py-1.5 font-semibold text-[#3b5bff] hover:bg-[#f1f5f9]">
                {tx("Start Free", "मुफ्त शुरू करें")}
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section + Studio Command Composer */}
      <section className="atoms-grid-bg relative border-b border-black/[0.07] px-6 pb-16 pt-14">
        <div className="mx-auto max-w-5xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white px-3.5 py-1 text-[12px] font-medium text-[#52525b] shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-[#3b5bff]" />
            <span>
              {tx(
                "ML Compatibility · Hybrid BM25 + pgvector · LangGraph Agents",
                "ML योग्यता · हाइब्रिड BM25 + pgvector · हिंदी व अंग्रेजी AI एजेंट्स"
              )}
            </span>
          </div>

          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-[#0f172a] sm:text-5xl sm:leading-[1.12]">
            {tx("Turn your career profile into ", "अपने करियर प्रोफ़ाइल को बदलें ")}
            <span className="bg-gradient-to-r from-[#3b5bff] to-[#0f172a] bg-clip-text text-transparent">
              {tx("evidence-backed job intelligence", "प्रमाणित जॉब इंटेलिजेंस में")}
            </span>
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-[#475569]">
            {tx(
              "Engineered as a verifiable AI system rather than an opaque wrapper—uniting canonical skill extraction, hybrid RRF retrieval, calibrated ML/LTR ranking, and specialist LangGraph orchestration.",
              "एक सत्यापित AI करियर सिस्टम जो सटीक कौशल पहचान, हाइब्रिड जॉब सर्च, कैलिब्रेटेड ML रैंकिंग और विशेषज्ञ AI ऑर्केस्ट्रेटर को एक साथ लाता है।"
            )}
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
                    {tx(MODE_META[key].labelEn, MODE_META[key].labelHi)}
                  </button>
                ))}
              </div>
              <span className="font-mono text-[11px] text-[#64748b]">{currentMode.pipeline}</span>
            </div>

            <textarea
              rows={3}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={tx(currentMode.placeholderEn, currentMode.placeholderHi)}
              className="studio-input resize-none px-4 py-3 text-[14px]"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {quickBriefs.map((brief, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPromptText(brief)}
                    className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-[11px] text-[#475569] transition hover:border-[#cbd5e1] hover:text-[#0f172a]"
                  >
                    {tx(`Example ${idx + 1}`, `उदाहरण ${idx + 1}`)}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-[#3b5bff] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[#2948eb]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {tx("Launch Workspace", "वर्कस्पेस खोलें")}
              </button>
            </div>
          </form>

          {/* Compact System Pillars */}
          <div className="mx-auto mt-8 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
            {SYSTEM_PILLARS.map((item) => (
              <div key={item.labelEn} className="atoms-card px-4 py-3 text-left">
                <div className="font-mono text-xl font-semibold text-[#0f172a]">{item.value}</div>
                <div className="mt-0.5 text-[12px] font-semibold text-[#0f172a]">{tx(item.labelEn, item.labelHi)}</div>
                <div className="font-mono text-[10px] text-[#64748b]">{item.detail}</div>
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
            <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-[#3b5bff]">
              {tx("System Architecture · Interactive Mermaid Diagram", "सिस्टम आर्किटेक्चर · इंटरैक्टिव डायग्राम")}
            </div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              {tx("End-to-End Platform Topology & Data Flow", "एंड-टू-एंड प्लेटफ़ॉर्म टोपोलॉजी और डेटा फ़्लो")}
            </h2>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[#3b5bff] hover:underline"
          >
            {tx("Open Career Dashboard", "करियर डैशबोर्ड खोलें")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <SystemArchitectureMermaid />
      </section>

      {/* Mermaid-Style LangGraph & Agentic RAG Flowcharts + Verified Benchmarks */}
      <section id="pipeline" className="border-y border-black/[0.07] bg-white px-6 py-16">
        <div className="mx-auto max-w-6xl space-y-6">
          <WorkflowMermaidSection />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="atoms-card bg-[#f8fafc] p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[14px] font-semibold text-[#0f172a]">
                  <Target className="h-4 w-4 text-[#3b5bff]" />
                  <span>{tx("Calibrated ML Compatibility", "कैलिब्रेटेड ML योग्यता")}</span>
                </div>
                <span className="rounded border border-amber-500/30 bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-800">
                  1,500 grouped pairs
                </span>
              </div>
              <div className="space-y-2 text-[12.5px]">
                <div className="flex items-center justify-between rounded-lg border border-[#e5e7eb] bg-white px-3 py-2">
                  <span className="font-medium">Calibrated LogisticRegression</span>
                  <span className="font-mono text-[#3b5bff]">ROC-AUC 0.979 · ECE 0.034</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[#e5e7eb] bg-white px-3 py-2">
                  <span className="font-medium">GradientBoostingClassifier</span>
                  <span className="font-mono text-[#64748b]">ROC-AUC 0.962 · ECE 0.035</span>
                </div>
              </div>
            </div>

            <div className="atoms-card bg-[#f8fafc] p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[14px] font-semibold text-[#0f172a]">
                  <GitBranch className="h-4 w-4 text-[#3b5bff]" />
                  <span>{tx("Learning-to-Rank (LTR) Models", "लर्निंग-टू-रैंक (LTR) मॉडल")}</span>
                </div>
                <span className="rounded border border-amber-500/30 bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-800">
                  GroupShuffleSplit zero-leakage
                </span>
              </div>
              <div className="space-y-2 text-[12.5px]">
                <div className="flex items-center justify-between rounded-lg border border-[#e5e7eb] bg-white px-3 py-2">
                  <span className="font-medium">Pointwise GBR Ranker</span>
                  <span className="font-mono text-[#3b5bff]">NDCG@10 0.986 · MRR 1.000</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[#e5e7eb] bg-white px-3 py-2">
                  <span className="font-medium">PairwiseTorchRanker</span>
                  <span className="font-mono text-[#64748b]">NDCG@10 0.985 · MAP 0.993</span>
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
            <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-[#3b5bff]">
              {tx("Studio Modules", "स्टूडियो मॉड्यूल")}
            </div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              {tx("Built for Every Stage of Job Intelligence", "करियर की हर ज़रूरत के लिए डिज़ाइन किया गया")}
            </h2>
          </div>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[#3b5bff] hover:underline"
          >
            {tx("Start Guided Onboarding", "गाइडेड सेटअप शुरू करें")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WORKSPACE_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link key={mod.href} href={mod.href} className="atoms-card atoms-card-hover group flex flex-col justify-between p-5">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#3b5bff]/10 text-[#3b5bff]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="rounded-md border border-[#e5e7eb] bg-[#f8fafc] px-2 py-0.5 font-mono text-[10px] font-medium text-[#475569]">
                      {mod.tag}
                    </span>
                  </div>
                  <h3 className="text-[15px] font-semibold text-[#0f172a] group-hover:text-[#3b5bff]">
                    {tx(mod.titleEn, mod.titleHi)}
                  </h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[#475569]">
                    {tx(mod.descEn, mod.descHi)}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[#f1f5f9] pt-3 font-mono text-[11px] font-medium text-[#3b5bff]">
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
              {tx("Engineering Standard", "इंजीनियरिंग मानक")}
            </div>
            <h3 className="mt-0.5 text-[18px] font-semibold text-[#0f172a]">
              {tx("Why Medo AI Beats Generic ChatGPT Job Wrappers", "Medo AI साधारण चैटबॉट रैपर्स से बेहतर क्यों है")}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="border-b border-[#e5e7eb] bg-white font-mono text-[11px] uppercase text-[#64748b]">
                <tr>
                  <th className="px-6 py-3">{tx("Capability", "क्षमता")}</th>
                  <th className="px-6 py-3">{tx("Generic Wrapper", "साधारण रैपर")}</th>
                  <th className="px-6 py-3 text-[#3b5bff]">{tx("Medo Career Studio", "मेडो करियर स्टूडियो")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9] bg-white">
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.capEn}>
                    <td className="px-6 py-3.5 font-semibold text-[#0f172a]">{tx(row.capEn, row.capHi)}</td>
                    <td className="px-6 py-3.5 text-[#64748b]">{tx(row.wrapEn, row.wrapHi)}</td>
                    <td className="px-6 py-3.5 font-medium text-[#0f172a]">
                      <span className="inline-flex items-center gap-1.5">
                        <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                        {tx(row.medoEn, row.medoHi)}
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
              {tx("Frequently Asked", "अक्सर पूछे जाने वाले सवाल")}
            </div>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[#0f172a]">
              {tx("Architecture, Privacy & Control", "आर्किटेक्चर, गोपनीयता और नियंत्रण")}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-[#64748b]">
              {tx(
                "Everything from hybrid vector retrieval to consent-gated explanations is inspectable and verifiable.",
                "हाइब्रिड वेक्टर सर्च से लेकर सहमति-आधारित व्याख्याओं तक सब कुछ पारदर्शी और सत्यापित है।"
              )}
            </p>
          </div>
          <div className="space-y-2.5 lg:col-span-8">
            {FAQS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.qEn} className="atoms-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[14px] font-semibold text-[#0f172a] transition hover:bg-[#f8fafc]"
                  >
                    <span>{tx(item.qEn, item.qHi)}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-[#64748b] transition-transform ${
                        isOpen ? "rotate-180 text-[#3b5bff]" : ""
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="border-t border-[#f1f5f9] bg-[#f8fafc] px-5 py-3.5 text-[13px] leading-relaxed text-[#475569]">
                      {tx(item.aEn, item.aHi)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Governance & Demo Banner */}
        <div className="mt-8 flex flex-col justify-between gap-5 rounded-2xl border border-[#e5e7eb] bg-white p-6 md:flex-row md:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0f172a] text-white">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold text-[#0f172a]">
                  {tx("Human-Controlled & Zero Fabricated Metrics", "पूर्णतः मानव-नियंत्रित और वास्तविक डेटा")}
                </h3>
                <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-700">
                  HITL Ready
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-[13px] text-[#475569]">
                {tx(
                  "Every dashboard metric reflects real PostgreSQL/SQLite rows. External job submissions require explicit approval_requests sign-off.",
                  "डैशबोर्ड का हर आंकड़ा वास्तविक डेटाबेस से आता है। बाहरी आवेदन सबमिट करने के लिए आपकी स्पष्ट मंज़ूरी आवश्यक होती है।"
                )}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={demoLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#3b5bff] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[#2948eb] disabled:opacity-60"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {demoLoading ? tx("Loading...", "खुल रहा है...") : tx("Open Workspace", "वर्कस्पेस खोलें")}
            </button>
            <Link
              href="/auth"
              className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-2 text-[13px] font-medium text-[#0f172a] transition hover:border-[#cbd5e1]"
            >
              {tx("Sign in", "साइन इन")}
            </Link>
          </div>
        </div>
      </section>

      {/* Studio Footer */}
      <footer className="border-t border-[#e5e7eb] bg-white px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0f172a] text-white">
              <Database className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[#0f172a]">
                {tx("Medo AI Career Intelligence", "मेडो AI करियर इंटेलिजेंस")}
              </div>
              <div className="font-mono text-[11px] text-[#64748b]">
                FastAPI · PostgreSQL 16 + pgvector · LangGraph · Next.js 15
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-[12.5px] font-medium text-[#475569]">
            <Link href="/dashboard" className="hover:text-[#0f172a]">
              {tx("Dashboard", "डैशबोर्ड")}
            </Link>
            <Link href="/discover" className="hover:text-[#0f172a]">
              {tx("Discovery", "नौकरियाँ खोजें")}
            </Link>
            <Link href="/recommendations" className="hover:text-[#0f172a]">
              {tx("ML Matching", "ML मिलान")}
            </Link>
            <Link href="/assistant" className="hover:text-[#0f172a]">
              {tx("AI Assistant", "AI सहायक")}
            </Link>
            <Link href="/privacy" className="hover:text-[#0f172a]">
              {tx("Privacy & Approvals", "गोपनीयता और अनुमोदन")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
