"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  Cpu,
  Database,
  GitCommitHorizontal,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface ArchStage {
  id: string;
  num: string;
  tabEn: string;
  tabHi: string;
  titleEn: string;
  titleHi: string;
  file: string;
  route: string;
  routeLabelEn: string;
  routeLabelHi: string;
  summaryEn: string;
  summaryHi: string;
  stepsEn: Array<{ label: string; detail: string }>;
  stepsHi: Array<{ label: string; detail: string }>;
  visualRows: Array<{ label: string; value: string; pct?: number; tone?: "blue" | "green" | "amber" }>;
  jsonSample: string;
}

const ARCH_STAGES: ArchStage[] = [
  {
    id: "ingestion",
    num: "01",
    tabEn: "Live Ingestion",
    tabHi: "लाइव संग्रह",
    titleEn: "6-Source Async Ingestion & Canonical Normalization",
    titleHi: "6-स्रोत लाइव संग्रह और डेटा सफाई",
    file: "backend/app/ingestion/connectors.py",
    route: "/discover",
    routeLabelEn: "Open Job Discovery",
    routeLabelHi: "नौकरी खोज खोलें",
    summaryEn:
      "Fetches real openings from Himalayas, Jobicy, Remotive, RemoteOK, Arbeitnow, and HackerNews—stripping raw HTML tags, deduplicating across URL + SHA hash, normalizing INR/USD salaries, and encoding 384-d embeddings.",
    summaryHi:
      "Himalayas, Jobicy, Remotive, RemoteOK, Arbeitnow और HackerNews से लाइव नौकरियाँ लाता है—कच्चे HTML हटाता है, डुप्लिकेट रोकता है, और 384-d वेक्टर बनाता है।",
    stepsEn: [
      { label: "Async Adapter Sync", detail: "Concurrent httpx fetch with retry & health status telemetry." },
      { label: "HTML & Currency Clean", detail: "Strips broken DOM fragments and normalizes INR / USD pay." },
      { label: "3-Layer Deduplication", detail: "Matches URL, external ID, and company+title SHA fingerprint." },
      { label: "SentenceTransformer 384-d", detail: "Stores dense vectors locally in SQLite/pgvector." },
    ],
    stepsHi: [
      { label: "एसिंक कनेक्टर सिंक", detail: "6 लाइव जॉब स्रोतों से हेल्थ ट्रैकिंग के साथ समानांतर डेटा संग्रह।" },
      { label: "HTML व सैलरी सफाई", detail: "कच्चे HTML टैग हटाकर INR/USD वेतन को एकरूप करता है।" },
      { label: "3-स्तरीय डिडुप्लीकेशन", detail: "URL और कंपनी+शीर्षक फिंगरप्रिंट से दोहराव रोकता है।" },
      { label: "384-d वेक्टर इंडेक्स", detail: "लोकल सिमैंटिक खोज के लिए वेक्टर एम्बेडिंग सहेजता है।" },
    ],
    visualRows: [
      { label: "Himalayas · Global Remote", value: "24 indexed", pct: 85, tone: "blue" },
      { label: "Arbeitnow · EU / UK", value: "21 indexed", pct: 74, tone: "blue" },
      { label: "Jobicy + Remotive + HN", value: "46 indexed", pct: 95, tone: "green" },
    ],
    jsonSample: `{
  "sources_synced": 6,
  "raw_fetched": 118,
  "deduplicated": 91,
  "html_sanitized": true,
  "embedding_dim": 384
}`,
  },
  {
    id: "retrieval",
    num: "02",
    tabEn: "Hybrid RRF Search",
    tabHi: "हाइब्रिड RRF सर्च",
    titleEn: "pgvector Cosine + BM25Okapi + Reciprocal Rank Fusion",
    titleHi: "pgvector + BM25 + RRF फ़्यूज़न खोज",
    file: "backend/app/retrieval/hybrid.py",
    route: "/discover",
    routeLabelEn: "Try Hybrid Search",
    routeLabelHi: "हाइब्रिड सर्च आज़माएँ",
    summaryEn:
      "Dense embeddings recall semantically related titles while BM25 pinpoints exact stack terms inside full job descriptions. RRF(k=60) fuses both lists cleanly before Area, Region, Salary, and CrossEncoder filters run.",
    summaryHi:
      "डेंस वेक्टर अर्थ समझता है और BM25 विवरण में सटीक शब्द पकड़ता है। RRF(k=60) दोनों को जोड़ता है और एरिया, क्षेत्र व सैलरी फ़िल्टर लागू करता है।",
    stepsEn: [
      { label: "Dense Vector Recall", detail: "Cosine similarity retrieves semantically close roles." },
      { label: "Exact-in-JD BM25", detail: "Matches exact frameworks & skills directly inside descriptions." },
      { label: "RRF Fusion (k=60)", detail: "Combines ranks cleanly via 1/(60+dense) + 1/(60+bm25)." },
      { label: "Area & Neural Rerank", detail: "Filters Bengaluru / Remote / London + CrossEncoder sort." },
    ],
    stepsHi: [
      { label: "डेंस वेक्टर खोज", detail: "अर्थ के आधार पर मिलते-जुलते पद निकालता है।" },
      { label: "JD में सटीक खोज", detail: "विवरण के अंदर सटीक तकनीकी शब्दों को रैंक करता है।" },
      { label: "RRF फ़्यूज़न (k=60)", detail: "दोनों सूचियों को संतुलित स्कोर में जोड़ता है।" },
      { label: "एरिया + री-रैंकिंग", detail: "शहर व वेतन फ़िल्टर के साथ सटीक क्रम देता है।" },
    ],
    visualRows: [
      { label: "Dense Cosine Similarity", value: "0.86", pct: 86, tone: "blue" },
      { label: "BM25 Lexical JD Score", value: "0.91", pct: 91, tone: "green" },
      { label: "RRF(k=60) + CrossEncoder", value: "0.94 Final", pct: 94, tone: "green" },
    ],
    jsonSample: `{
  "query": "PyTorch OR pgvector",
  "area": "Bengaluru",
  "mode": "hybrid_rrf",
  "dense_score": 0.86,
  "bm25_score": 0.91,
  "final_score": 0.94
}`,
  },
  {
    id: "ml",
    num: "03",
    tabEn: "12-Feature ML",
    tabHi: "12-फ़ीचर ML",
    titleEn: "Calibrated Fit Probability & PairwiseTorch LTR Ranking",
    titleHi: "कैलिब्रेटेड फिट प्रतिशत और PairwiseTorch LTR",
    file: "backend/app/ml/ranking.py",
    route: "/recommendations",
    routeLabelEn: "Inspect ML Matches",
    routeLabelHi: "ML मैच देखें",
    summaryEn:
      "Never an arbitrary LLM percentage guess. Computes 12 verifiable features per candidate-job pair—skill overlap, semantic alignment, experience delta, location fit, and salary ratio—producing calibrated probabilities.",
    summaryHi:
      "कोई मनगढ़ंत प्रतिशत नहीं। हर जोड़ी के लिए 12 ठोस फ़ीचर्स (कौशल मिलान, अनुभव, कार्य मोड, सैलरी) की गणना कर सटीक फिट स्कोर देता है।",
    stepsEn: [
      { label: "Canonical Taxonomy", detail: "Normalizes resume skills with verbatim line evidence spans." },
      { label: "12-Feature Vector", detail: "Scores required/preferred overlap, seniority & geo fit." },
      { label: "Isotonic Calibration", detail: "ROC-AUC 0.979 & ECE 0.034 keep probabilities trustworthy." },
      { label: "PairwiseTorch Ranker", detail: "NDCG@10 0.986 · updates from explicit Save/Dismiss signals." },
    ],
    stepsHi: [
      { label: "कौशल टैक्सोनॉमी", detail: "रेज़्यूमे की मूल पंक्तियों से सत्यापित कौशल निकालता है।" },
      { label: "12-फ़ीचर वेक्टर", detail: "कौशल, अनुभव, क्षेत्र और वेतन संकेतों का आकलन।" },
      { label: "आइसोटोनिक कैलिब्रेशन", detail: "ROC-AUC 0.979 और कम ECE के साथ विश्वसनीय प्रतिशत।" },
      { label: "PairwiseTorch रैंकिंग", detail: "Save व Dismiss संकेतों से रैंकिंग लगातार सुधरती है।" },
    ],
    visualRows: [
      { label: "Required Skill Overlap (8/9)", value: "89%", pct: 89, tone: "green" },
      { label: "Profile-JD Vector Sim", value: "84%", pct: 84, tone: "blue" },
      { label: "Calibrated Compatibility", value: "94% Fit", pct: 94, tone: "green" },
    ],
    jsonSample: `{
  "compatibility_probability": 0.94,
  "ranking_score": 28.42,
  "strong_matching_skills": ["Python", "pgvector", "FastAPI"],
  "missing_skills": ["Triton"],
  "calibration_ece": 0.034
}`,
  },
  {
    id: "orchestrator",
    num: "04",
    tabEn: "Ollama 6-Agent",
    tabHi: "Ollama 6-एजेंट",
    titleEn: "Bounded LangGraph Supervisor With Bilingual Ollama AI",
    titleHi: "LangGraph ऑर्केस्ट्रेटर और स्थानीय Ollama (EN + हिंदी)",
    file: "backend/app/agents/orchestrator.py",
    route: "/assistant",
    routeLabelEn: "Open AI Orchestrator",
    routeLabelHi: "AI ऑर्केस्ट्रेटर खोलें",
    summaryEn:
      "Routes queries cleanly across 6 specialist agents and 14 Pydantic-validated tools (zero arbitrary shell execution). Local Ollama llama3.2 synthesizes honest, grounded career guidance in English or Hindi.",
    summaryHi:
      "6 विशेषज्ञ एजेंट्स और 14 सुरक्षित Pydantic टूल्स के ज़रिए प्रश्न प्रोसेस होता है, और लोकल Ollama (llama3.2) हिंदी या अंग्रेजी में साफ़ व ईमानदार सलाह देता है।",
    stepsEn: [
      { label: "Intent Classifier", detail: "Routes discovery, fit explanation, skill gaps & prep plans." },
      { label: "14 Pydantic Tools", detail: "Bounded tool loop (max_calls=8) with strict input schemas." },
      { label: "Honest Gap Reasoning", detail: "Calls out missing skills directly when a role is out of reach." },
      { label: "Native EN + हिंदी", detail: "Responds in clear Hindi when Devanagari or UI toggle is active." },
    ],
    stepsHi: [
      { label: "इरादा वर्गीकरण", detail: "खोज, योग्यता, कौशल कमी या रोडमैप सही एजेंट को भेजता है।" },
      { label: "14 सत्यापित टूल्स", detail: "बिना किसी शेल एक्सेस के सख्त डेटाबेस व ML टूल्स चलते हैं।" },
      { label: "सच्चा विश्लेषण", detail: "कौशल कम होने पर स्पष्ट कमियाँ और सीखने का मार्ग बताता है।" },
      { label: "अंग्रेजी और हिंदी", detail: "देवनागरी या भाषा टॉगल के अनुसार साफ़ हिंदी में जवाब।" },
    ],
    visualRows: [
      { label: "ProfileIntelligenceAgent", value: "17 verified skills", pct: 100, tone: "green" },
      { label: "JobDiscovery & Matching", value: "10 ranked matches", pct: 90, tone: "blue" },
      { label: "Ollama llama3.2 Synthesis", value: "EN / हिंदी Ready", pct: 100, tone: "green" },
    ],
    jsonSample: `{
  "intent": "career_fit_and_search",
  "agents_invoked": ["profile", "discovery", "matching", "advisor"],
  "tools_called": 3,
  "language": "hi",
  "provider": "ollama/llama3.2"
}`,
  },
  {
    id: "rag-hitl",
    num: "05",
    tabEn: "RAG & HITL Gate",
    tabHi: "RAG व HITL सुरक्षा",
    titleEn: "Cited Agentic RAG, Prompt-Injection Shield & HITL Approvals",
    titleHi: "प्रमाणित RAG और मानव अनुमोदन (HITL) नियंत्रण",
    file: "backend/app/rag/pipeline.py",
    route: "/privacy",
    routeLabelEn: "Open Privacy Studio",
    routeLabelHi: "गोपनीयता स्टूडियो खोलें",
    summaryEn:
      "Isolates documents strictly per user_id, strips untrusted prompt-injection instructions, rewrites weak RAG queries automatically (max 2x), and blocks external submissions behind Human-in-the-Loop approval gates.",
    summaryHi:
      "आपके दस्तावेज़ पूरी तरह निजी रहते हैं, प्रॉम्प्ट-इंजेक्शन हटाया जाता है, और कोई भी बाहरी कार्रवाई आपकी स्पष्ट मंज़ूरी (Approve/Reject) के बिना नहीं होती।",
    stepsEn: [
      { label: "Per-User Isolation", detail: "Argon2id auth scopes SQL, memory & vector reads to owner." },
      { label: "Injection Sanitizer", detail: "Scrubs malicious instruction overrides from retrieved chunks." },
      { label: "Rewrite + Cite Loop", detail: "Re-queries on weak similarity (max 2x) with source snippets." },
      { label: "approval_requests Gate", detail: "External submits pause until explicitly Approved or Rejected." },
    ],
    stepsHi: [
      { label: "कड़ा डेटा आइसोलेशन", detail: "Argon2id लॉगिन से हर डेटा क्वेरी केवल आपके खाते तक सीमित।" },
      { label: "इंजेक्शन सुरक्षा", detail: "दस्तावेज़ों में छिपे असुरक्षित निर्देशों को पहले ही हटाता है।" },
      { label: "उद्धरण सत्यापन", detail: "कम स्कोर पर क्वेरी सुधारकर प्रमाणित स्रोत उद्धरण जोड़ता है।" },
      { label: "मानव अनुमोदन द्वार", detail: "बाहरी आवेदन भेजने से पहले आपकी स्पष्ट मंज़ूरी ज़रूरी।" },
    ],
    visualRows: [
      { label: "Prompt Injection Scrubbing", value: "100% Enforced", pct: 100, tone: "green" },
      { label: "RAG Citation Grounding", value: "Top-3 Chunks", pct: 92, tone: "blue" },
      { label: "External Submit Gate", value: "Human Sign-off", pct: 100, tone: "amber" },
    ],
    jsonSample: `{
  "tenant_scope": "strict_user_id",
  "injection_patterns_stripped": 0,
  "rag_rewrite_attempts": 1,
  "hitl_status": "pending_user_approval"
}`,
  },
];

export function MedoDeepDive() {
  const { lang, tx } = useLanguage();
  const [activeId, setActiveId] = useState<string>("ml");
  const [inspectorTab, setInspectorTab] = useState<"visual" | "json">("visual");

  const current = ARCH_STAGES.find((s) => s.id === activeId) || ARCH_STAGES[0];
  const steps = lang === "hi" ? current.stepsHi : current.stepsEn;

  const toneBar = (tone?: "blue" | "green" | "amber") => {
    if (tone === "green") return "bg-emerald-500";
    if (tone === "amber") return "bg-amber-500";
    return "bg-[#3b5bff]";
  };

  return (
    <section
      className="border-y border-[#e5e7eb] bg-white px-6 py-20 text-[#0f172a]"
      style={{
        backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    >
      <div className="mx-auto max-w-6xl">
        {/* Clean Light Studio Header */}
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#3b5bff]">
              <Cpu className="h-3.5 w-3.5" />
              {tx("System Pipeline Walkthrough", "सिस्टम पाइपलाइन आर्किटेक्चर")}
            </div>
            <h2 className="mt-2.5 text-2xl font-semibold tracking-tight text-[#0f172a] sm:text-3xl">
              {tx("How Every Layer Works Under the Hood", "अंदर से हर लेयर कैसे काम करती है — चरणबद्ध विवरण")}
            </h2>
            <p className="mt-1.5 max-w-2xl text-[14px] text-[#475569]">
              {tx(
                "Trace each backend stage from live connector ingestion to hybrid RRF fusion, 12-feature ML calibration, and local Ollama execution.",
                "लाइव जॉब संग्रह से लेकर हाइब्रिड RRF सर्च, 12-फ़ीचर ML रैंकिंग और लोकल Ollama एजेंट्स तक हर लेयर का निरीक्षण करें।"
              )}
            </p>
          </div>
          <Link
            href={current.route}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#0f172a] px-4 py-2 text-[12.5px] font-medium text-white transition hover:bg-[#3b5bff]"
          >
            {tx(current.routeLabelEn, current.routeLabelHi)} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Connected Horizontal Stepper Switcher */}
        <div className="mb-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {ARCH_STAGES.map((st) => {
            const active = st.id === current.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setActiveId(st.id)}
                className={`rounded-2xl border p-3.5 text-left transition-all ${
                  active
                    ? "border-[#3b5bff] bg-[#eef2ff]/80 shadow-xs ring-2 ring-[#3b5bff]/20"
                    : "border-[#e2e8f0] bg-white hover:border-[#cbd5e1] hover:bg-[#f8fafc]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10.5px] font-bold text-[#3b5bff]">STAGE {st.num}</span>
                  {active && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                </div>
                <div className="mt-1 text-[13px] font-semibold text-[#0f172a]">{tx(st.tabEn, st.tabHi)}</div>
              </button>
            );
          })}
        </div>

        {/* Clean Unified Light Studio Inspector Card */}
        <div className="atoms-card overflow-hidden bg-white shadow-sm">
          <div className="grid lg:grid-cols-12">
            {/* Left Pipeline Steps Spine (7 cols) */}
            <div className="border-b border-[#f1f5f9] p-6 sm:p-7 lg:col-span-7 lg:border-b-0 lg:border-r">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-md bg-[#3b5bff]/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#3b5bff]">
                  {current.file}
                </span>
                <span className="font-mono text-[11px] font-medium text-[#64748b]">STAGE {current.num} / 05</span>
              </div>

              <h3 className="mt-3 text-xl font-semibold tracking-tight text-[#0f172a]">
                {tx(current.titleEn, current.titleHi)}
              </h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[#475569]">
                {tx(current.summaryEn, current.summaryHi)}
              </p>

              {/* Connected 4-Step Execution Timeline */}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {steps.map((s, idx) => (
                  <div
                    key={s.label}
                    className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3.5 transition hover:border-[#3b5bff]/35 hover:bg-white"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#0f172a] font-mono text-[10px] font-bold text-white">
                        {idx + 1}
                      </span>
                      <span className="text-[12.5px] font-bold text-[#0f172a]">{s.label}</span>
                    </div>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-[#475569]">{s.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Interactive Telemetry / API Inspector Pane (5 cols) */}
            <div className="flex flex-col justify-between bg-[#f8fafc] p-6 sm:p-7 lg:col-span-5">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#3b5bff]">
                    <GitCommitHorizontal className="h-3.5 w-3.5" />
                    {tx("Stage Execution Inspector", "लाइव चरण निरीक्षक")}
                  </span>
                  <div className="atoms-segmented">
                    <button
                      type="button"
                      data-active={inspectorTab === "visual"}
                      onClick={() => setInspectorTab("visual")}
                      className="atoms-segmented-btn px-2 py-0.5 text-[11px]"
                    >
                      {tx("Visual", "विज़ुअल")}
                    </button>
                    <button
                      type="button"
                      data-active={inspectorTab === "json"}
                      onClick={() => setInspectorTab("json")}
                      className="atoms-segmented-btn inline-flex items-center gap-1 px-2 py-0.5 text-[11px]"
                    >
                      <Code2 className="h-3 w-3" /> JSON
                    </button>
                  </div>
                </div>

                {inspectorTab === "visual" ? (
                  <div className="mt-4 space-y-3">
                    {current.visualRows.map((row) => (
                      <div key={row.label} className="rounded-xl border border-[#e5e7eb] bg-white p-3.5">
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="font-medium text-[#334155]">{row.label}</span>
                          <span className="tnum font-mono font-semibold text-[#0f172a]">{row.value}</span>
                        </div>
                        {typeof row.pct === "number" && (
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e2e8f0]">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${toneBar(row.tone)}`}
                              style={{ width: `${row.pct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <pre className="mt-4 overflow-x-auto rounded-xl border border-[#e2e8f0] bg-white p-4 font-mono text-[11.5px] leading-relaxed text-[#0f172a]">
                    {current.jsonSample}
                  </pre>
                )}
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-[#e2e8f0] pt-4 text-[12px]">
                <span className="inline-flex items-center gap-1.5 font-medium text-[#475569]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  {tx("Inspectable & deterministic", "सत्यापित और पारदर्शी")}
                </span>
                <Link
                  href={current.route}
                  className="inline-flex items-center gap-1 font-semibold text-[#3b5bff] hover:underline"
                >
                  {tx("Open Module", "मॉड्यूल खोलें")} <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Clean Stack Invariants Bar */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Database,
              title: tx("PostgreSQL + pgvector", "PostgreSQL + pgvector"),
              sub: tx("Relational + 384d vector + memory", "रिलेशनल + वेक्टर + मेमोरी"),
            },
            {
              icon: Search,
              title: tx("BM25 + Dense RRF", "BM25 + डेंस RRF"),
              sub: tx("Exact-in-JD + Area dropdowns", "सटीक JD व शहर फ़िल्टर"),
            },
            {
              icon: Sparkles,
              title: tx("Local Ollama AI", "लोकल Ollama AI"),
              sub: tx("Private EN + हिंदी inference", "डिवाइस पर हिंदी व अंग्रेजी AI"),
            },
            {
              icon: ShieldCheck,
              title: tx("Argon2id + HITL Gate", "Argon2id + HITL सुरक्षा"),
              sub: tx("Explicit approval on external sends", "बाहरी एक्शन पर मानव अनुमोदन"),
            },
          ].map((g) => {
            const Icon = g.icon;
            return (
              <div key={g.title} className="atoms-card flex items-center gap-3 bg-white p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#3b5bff]/10 text-[#3b5bff]">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-semibold text-[#0f172a]">{g.title}</div>
                  <div className="truncate text-[11px] text-[#64748b]">{g.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
