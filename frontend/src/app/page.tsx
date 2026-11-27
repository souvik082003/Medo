"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  Compass,
  GitBranch,
  Globe,
  Lock,
  Menu,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import { SystemArchitectureMermaid, WorkflowMermaidSection } from "@/components/ArchitectureDiagrams";
import { MedoDeepDive } from "@/components/MedoDeepDive";
import { MedoHero3D } from "@/components/MedoHero3D";
import { MedoMark } from "@/components/MedoLogo";
import { MedoShowcase } from "@/components/MedoShowcase";
import { MedoStudioBento } from "@/components/MedoStudioBento";
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
    labelEn: "30 Roadmaps",
    labelHi: "30 रोडमैप्स",
    route: "/roadmaps",
    pipeline: "Interactive Role Flowcharts · How to Learn · AI Tutor",
    placeholderEn: "Explore AI Engineer, Backend, Full Stack, DevOps, SQL & UX roadmaps...",
    placeholderHi: "AI इंजीनियर, बैकएंड, फुल स्टैक, DevOps और SQL रोडमैप देखें...",
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
  { value: "13", labelEn: "Live Job Sources", labelHi: "लाइव जॉब स्रोत", detail: "9 free · 4 paid API" },
  { value: "6", labelEn: "Specialist Agents", labelHi: "विशेषज्ञ AI एजेंट्स", detail: "LangGraph conditional DAG" },
  { value: "12", labelEn: "ML/LTR Features", labelHi: "ML रैंकिंग फ़ीचर्स", detail: "Calibrated + Pairwise Torch" },
  { value: "30", labelEn: "Role Roadmaps", labelHi: "करियर रोडमैप्स", detail: "Visual flowcharts + AI tutor" },
];

const COMPARISON_ROWS = [
  {
    badge: "13 LIVE APIs",
    capEn: "Live Job Ingestion",
    capHi: "लाइव जॉब डेटा",
    subEn: "Real-time connector pipeline",
    subHi: "रियल-टाइम कनेक्टर पाइपलाइन",
    wrapEn: "Stale scraped dump or manual copy-paste",
    wrapHi: "पुराना डेटा या मैन्युअल कॉपी-पेस्ट",
    medoEn: "9 free + 4 keyed APIs with 3-layer deduplication",
    medoHi: "9 मुफ़्त + 4 कुंजी API और 3-स्तरीय डुप्लिकेट फ़िल्टर",
  },
  {
    badge: "RRF (k=60)",
    capEn: "Job Retrieval Engine",
    capHi: "जॉब खोज इंजन",
    subEn: "Dense + sparse fusion",
    subHi: "सिमैंटिक + कीवर्ड फ़्यूज़न",
    wrapEn: "Single keyword or raw prompt dump",
    wrapHi: "केवल साधारण कीवर्ड या रैंडम प्रॉम्प्ट",
    medoEn: "pgvector + BM25Okapi + CrossEncoder + Area/JD filters",
    medoHi: "pgvector + BM25 + CrossEncoder + शहर व सटीक JD फ़िल्टर",
  },
  {
    badge: "AUC 0.979",
    capEn: "Compatibility Scoring",
    capHi: "योग्यता स्कोरिंग",
    subEn: "Calibrated probability",
    subHi: "कैलिब्रेटेड संभावना",
    wrapEn: "Opaque hallucinated % guess",
    wrapHi: "बिना आधार का अनुमानित प्रतिशत",
    medoEn: "12-feature calibrated ML + PairwiseTorch LTR ranking",
    medoHi: "12-फ़ीचर कैलिब्रेटेड ML और PairwiseTorch रैंकिंग",
  },
  {
    badge: "VERIFIED SPANS",
    capEn: "Resume Skill Extraction",
    capHi: "रेज़्यूमे कौशल पहचान",
    subEn: "Deterministic taxonomy",
    subHi: "सटीक टैक्सोनॉमी मिलान",
    wrapEn: "Prompted tag guessing",
    wrapHi: "अस्पष्ट टैग अनुमान",
    medoEn: "Canonical skill mapping + verbatim resume evidence lines",
    medoHi: "मानक कौशल पहचान और रेज़्यूमे से सीधी प्रमाणित पंक्तियाँ",
  },
  {
    badge: "HITL GATE",
    capEn: "External Actions & Privacy",
    capHi: "गोपनीयता और नियंत्रण",
    subEn: "Human-in-the-loop safety",
    subHi: "मानव-नियंत्रित सुरक्षा",
    wrapEn: "Unbounded auto-send risk",
    wrapHi: "बिना अनुमति स्वचालित डेटा भेजने का जोखिम",
    medoEn: "Consent opt-in + approval_requests HITL gate",
    medoHi: "स्पष्ट सहमति और हर बाहरी एक्शन पर मानव अनुमोदन गेट",
  },
  {
    badge: "CITED RAG",
    capEn: "Grounded Career Q&A",
    capHi: "प्रमाणित AI उत्तर",
    subEn: "Zero unsupported claims",
    subHi: "बिना किसी अनुमान के उत्तर",
    wrapEn: "No document verification",
    wrapHi: "दस्तावेज़ सत्यापन की कमी",
    medoEn: "Iterative Agentic RAG with citations & Hindi/English Ollama",
    medoHi: "संदर्भ सहित Agentic RAG और पूर्ण हिंदी/अंग्रेजी Ollama",
  },
];

type FaqCategory = "all" | "architecture" | "ml" | "ai" | "privacy";

const FAQS: Array<{
  cat: Exclude<FaqCategory, "all">;
  qEn: string;
  qHi: string;
  aEn: string;
  aHi: string;
}> = [
  {
    cat: "architecture",
    qEn: "How does Medo fetch and normalize live jobs with zero mock data?",
    qHi: "Medo बिना किसी नकली डेटा के 13 लाइव स्रोतों से नौकरियाँ कैसे लाता है?",
    aEn: "Async connectors fetch live feeds from 9 free public APIs (Himalayas, Jobicy, Remotive, RemoteOK, Arbeitnow, HackerNews, The Muse, Working Nomads, Greenhouse ATS) plus 4 key-based aggregators. Each posting runs through HTML stripping, city/region extraction, INR/USD salary normalization, 3-layer SHA/URL deduplication, and 384-d vector indexing.",
    aHi: "एसिंक कनेक्टर्स 9 मुफ़्त API (Himalayas, Jobicy, Remotive, RemoteOK, Arbeitnow, HackerNews, The Muse, Working Nomads, Greenhouse ATS) और 4 कुंजी-आधारित स्रोतों से वास्तविक नौकरियाँ लाते हैं। हर पोस्ट से HTML साफ़, वेतन सामान्य और वेक्टर इंडेक्स होता है।",
  },
  {
    cat: "ml",
    qEn: "How does Hybrid Search combine pgvector, BM25, Area & Exact-in-JD filters?",
    qHi: "हाइब्रिड सर्च pgvector, BM25, एरिया और Exact-in-JD फ़िल्टर को कैसे जोड़ता है?",
    aEn: "Dense Sentence Transformer similarity finds semantic matches while BM25Okapi scores exact keywords inside full descriptions. Reciprocal Rank Fusion (RRF, k=60) merges both lists cleanly, followed by SQL Region/City/Salary filtering and CrossEncoder neural reranking.",
    aHi: "वेक्टर समानता अर्थ के अनुसार नौकरियाँ ढूँढती है जबकि BM25 विवरण में सटीक कीवर्ड मिलाता है। दोनों को RRF(k=60) से जोड़ा जाता है और फिर शहर, कार्य मोड, वेतन फ़िल्टर तथा CrossEncoder री-रैंकिंग लागू होती है।",
  },
  {
    cat: "ml",
    qEn: "How are the 12-feature ML compatibility % and LTR scores computed?",
    qHi: "12-फ़ीचर ML फिट प्रतिशत और LTR रैंकिंग स्कोर कैसे निकाले जाते हैं?",
    aEn: "For each candidate-job pair, Medo computes exact required/preferred skill coverage, title/profile semantic cosine similarity, experience/seniority deltas, location/work-mode fit, and salary alignment. Models are trained on zero-leakage GroupShuffleSplit pairs (ROC-AUC 0.979, NDCG@10 0.986).",
    aHi: "हर जोड़ी के लिए 12 फ़ीचर (कौशल ओवरलैप, अनुभव अंतर, लोकेशन, सैलरी और सिमैंटिक समानता) निकाले जाते हैं। कैलिब्रेटेड क्लासिफ़ायर (ROC-AUC 0.979) और PairwiseTorch रैंकर (NDCG@10 0.986) सटीक स्कोर देते हैं।",
  },
  {
    cat: "ai",
    qEn: "How does the 6-Agent LangGraph Orchestrator work with local Ollama?",
    qHi: "6-एजेंट LangGraph ऑर्केस्ट्रेटर लोकल Ollama के साथ कैसे काम करता है?",
    aEn: "Your query routes through a bounded LangGraph supervisor across ProfileIntelligence, JobDiscovery, JobMatching, CareerAdvisor, ApplicationAssistant, and MemoryAgent using 14 strict Pydantic tools (no arbitrary shell execution). Local Ollama (llama3.2) then synthesizes honest answers—explicitly naming gaps when a role does not fit.",
    aHi: "आपका प्रश्न 6 विशेषज्ञ एजेंट्स और 14 सुरक्षित Pydantic टूल्स के बीच राउट होता है। अंत में लोकल Ollama (llama3.2) ईमानदारी से विश्लेषण देता है—अगर कौशल कम हैं तो साफ़ कमियाँ और सीखने के कदम बताता है।",
  },
  {
    cat: "ai",
    qEn: "Does the entire app and AI Orchestrator support Hindi (हिंदी) + English?",
    qHi: "क्या पूरा वेब ऐप और AI ऑर्केस्ट्रेटर हिंदी (हिंदी) और अंग्रेजी दोनों में काम करता है?",
    aEn: "Yes. Clicking EN | हिंदी in any navbar switches every screen immediately and sends your active language preference to /api/v1/agent/chat and /api/v1/rag/query so Ollama responds naturally in Hindi or English.",
    aHi: "हाँ। ऊपर दिए गए EN | हिंदी टॉगल से पूरा प्लेटफ़ॉर्म तुरंत बदल जाता है और AI ऑर्केस्ट्रेटर व Cited RAG सीधे हिंदी में उत्तर देते हैं।",
  },
  {
    cat: "architecture",
    qEn: "How does Iterative Agentic RAG prevent hallucinations and prompt injection?",
    qHi: "Iterative Agentic RAG गलत जानकारी और प्रॉम्प्ट इंजेक्शन से कैसे बचाता है?",
    aEn: "Uploaded career notes are chunked per-user and scrubbed for indirect prompt-injection overrides. If initial retrieval similarity is low, the RAG graph rewrites the query up to 2 times before generating cited answers grounded strictly in retrieved snippets.",
    aHi: "आपके दस्तावेज़ यूज़र-वार अलग इंडेक्स होते हैं और संदिग्ध प्रॉम्प्ट इंजेक्शन हटाए जाते हैं। कम स्कोर मिलने पर सिस्टम क्वेरी को 2 बार तक सुधारकर केवल प्रमाणित अंशों से उद्धरण सहित उत्तर देता है।",
  },
  {
    cat: "ml",
    qEn: "How does Resume Intelligence extract verified skills without guessing?",
    qHi: "रेज़्यूमे स्टूडियो बिना अनुमान लगाए सटीक कौशल कैसे निकालता है?",
    aEn: "The deterministic resume parser stores SHA-256 versioned files, normalizes aliases (like 'py' or 'k8s') into canonical taxonomy entries, assigns proficiency estimates, and attaches exact verbatim evidence lines copied directly from your resume sections.",
    aHi: "पार्सर SHA-256 वर्जन नियंत्रण के साथ समानार्थी शब्दों को मानक कौशलों में बदलता है और हर कौशल के साथ आपके रेज़्यूमे की मूल प्रमाणित पंक्ति दिखाता है।",
  },
  {
    cat: "privacy",
    qEn: "What is the Human-in-the-Loop (HITL) approval gate?",
    qHi: "ह्यूमन-इन-द-लूप (HITL) अनुमोदन गेट कैसे सुरक्षा सुनिश्चित करता है?",
    aEn: "Medo never auto-submits applications or sends emails behind your back. High-impact external actions pause and create a database approval_requests record in Privacy & Memory that executes only after you click Approve.",
    aHi: "Medo आपकी अनुमति के बिना कभी कोई बाहरी आवेदन या ईमेल नहीं भेजता। हर संवेदनशील कार्रवाई अनुमोदन द्वार पर रुकती है और आपके 'Approve' दबाने पर ही आगे बढ़ती है।",
  },
  {
    cat: "privacy",
    qEn: "Do my resumes or private career notes leave my machine?",
    qHi: "क्या मेरा रेज़्यूमे या निजी नोट्स बाहरी सर्वर पर भेजे जाते हैं?",
    aEn: "No. Resume parsing, local SentenceTransformer embeddings, ML compatibility ranking, and local Ollama inference stay inside your workspace. External LLM calls require explicit Consent opt-in.",
    aHi: "नहीं। रेज़्यूमे पार्सिंग, वेक्टर स्कोरिंग और लोकल Ollama AI सब आपके लोकल सिस्टम में रहते हैं। बाहरी क्लाउड LLM के लिए स्पष्ट सहमति आवश्यक है।",
  },
  {
    cat: "architecture",
    qEn: "How do the 30 Interactive Roadmaps connect with How-to-Learn & AI tutoring?",
    qHi: "30 इंटरैक्टिव रोडमैप्स 'कैसे सीखें' और AI ट्यूटर से कैसे जुड़े हैं?",
    aEn: "Visit /roadmaps to browse 30 role blueprints (AI, Backend, Full Stack, DevOps, SQL, AWS, Docker, Kubernetes, Mobile, Product/UX). Click any yellow milestone or peach topic node to inspect what it is, step-by-step learning order, curated books/courses, progress checkmarks, and an on-demand Ollama tutor.",
    aHi: "/roadmaps पर 30 भूमिकाओं (AI, बैकएंड, फुल स्टैक, DevOps, SQL, Product/UX) के फ्लोचार्ट उपलब्ध हैं। किसी भी बॉक्स पर क्लिक करके उसका विवरण, सीखने के चरण, कोर्स/किताबें और AI पाठ तुरंत देख सकते हैं।",
  },
];

const JOB_SOURCES = [
  { name: "Himalayas", tag: "Free", color: "bg-sky-100 text-sky-700" },
  { name: "Jobicy", tag: "Free", color: "bg-amber-100 text-amber-700" },
  { name: "Remotive", tag: "Free", color: "bg-emerald-100 text-emerald-700" },
  { name: "RemoteOK", tag: "Free", color: "bg-rose-100 text-rose-700" },
  { name: "Arbeitnow", tag: "Free", color: "bg-indigo-100 text-indigo-700" },
  { name: "HackerNews", tag: "Free", color: "bg-orange-100 text-orange-700" },
  { name: "The Muse", tag: "Free", color: "bg-violet-100 text-violet-700" },
  { name: "Working Nomads", tag: "Free", color: "bg-teal-100 text-teal-700" },
  { name: "Greenhouse ATS", tag: "Free", color: "bg-lime-100 text-lime-700" },
  { name: "Adzuna IN/UK/US", tag: "250/day", color: "bg-cyan-100 text-cyan-700" },
  { name: "JSearch RapidAPI", tag: "200/mo", color: "bg-blue-100 text-blue-700" },
  { name: "SerpAPI Jobs", tag: "100/mo", color: "bg-fuchsia-100 text-fuchsia-700" },
  { name: "Apify LinkedIn", tag: "$5 credit", color: "bg-sky-100 text-sky-800" },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    icon: Search,
    titleEn: "Search Live Jobs",
    titleHi: "लाइव नौकरी खोजें",
    descEn: "Fetch real openings from 13 live sources instantly. Hybrid RRF search ranks them by semantic + keyword fit in <200ms.",
    descHi: "13 लाइव स्रोतों से तुरंत असली नौकरियाँ लाएँ। हाइब्रिड RRF सर्च <200ms में रैंक करता है।",
    color: "from-blue-500 to-indigo-600",
  },
  {
    step: "02",
    icon: Brain,
    titleEn: "AI Scores Your Fit",
    titleHi: "AI आपकी योग्यता मापता है",
    descEn: "12-feature calibrated ML + PairwiseTorch LTR computes a verifiable compatibility % with zero hallucination.",
    descHi: "12-फ़ीचर कैलिब्रेटेड ML + PairwiseTorch LTR बिना किसी अनुमान के सटीक योग्यता % देता है।",
    color: "from-violet-500 to-purple-600",
  },
  {
    step: "03",
    icon: BookOpen,
    titleEn: "Learn What's Missing",
    titleHi: "सीखें क्या कमी है",
    descEn: "Skill-gap radar + 30 interactive roadmaps + on-demand Ollama tutor guide your exact upskilling path.",
    descHi: "कौशल-अंतर रडार + 30 रोडमैप्स + ऑन-डिमांड Ollama ट्यूटर आपका सीखने का रास्ता बताते हैं।",
    color: "from-emerald-500 to-teal-600",
  },
  {
    step: "04",
    icon: Target,
    titleEn: "Apply with Confidence",
    titleHi: "आत्मविश्वास से आवेदन करें",
    descEn: "AI drafts cover letters, tracks your pipeline, and every external action requires your explicit approval.",
    descHi: "AI कवर लेटर बनाता है, पाइपलाइन ट्रैक करता है और हर बाहरी एक्शन पर आपकी स्पष्ट मंज़ूरी ज़रूरी है।",
    color: "from-orange-500 to-rose-500",
  },
];

const TECH_STACK = [
  { name: "FastAPI", sub: "Backend API", badge: "0.115+" },
  { name: "Next.js 15", sub: "Frontend Studio", badge: "App Router" },
  { name: "pgvector", sub: "Vector Search", badge: "HNSW" },
  { name: "LangGraph", sub: "Multi-Agent", badge: "6 Agents" },
  { name: "PyTorch", sub: "LTR Ranker", badge: "Pairwise" },
  { name: "Ollama", sub: "Local LLM", badge: "llama3.2" },
  { name: "Redis", sub: "Task Queue", badge: "Celery" },
  { name: "Alembic", sub: "DB Migrations", badge: "25 tables" },
];

const TESTIMONIALS = [
  {
    textEn: "Finally a career tool that doesn't just hallucinate compatibility scores. The 12-feature ML ranking is genuinely transparent.",
    textHi: "आखिरकार एक करियर टूल जो सिर्फ अनुमान नहीं लगाता। 12-फ़ीचर ML रैंकिंग वाकई पारदर्शी है।",
    nameEn: "Priya S.", nameHi: "प्रिया एस.",
    roleEn: "ML Engineer, Bengaluru", roleHi: "ML इंजीनियर, बेंगलुरु",
  },
  {
    textEn: "The HN + Greenhouse + Himalayas free combo alone gives me 100+ quality openings every week without any API key.",
    textHi: "HN + Greenhouse + Himalayas का मुफ़्त कॉम्बो ही हर हफ्ते 100+ अच्छी नौकरियाँ देता है बिना किसी API कुंजी के।",
    nameEn: "Rahul M.", nameHi: "राहुल एम.",
    roleEn: "Backend Dev, Pune", roleHi: "बैकएंड डेव, पुणे",
  },
  {
    textEn: "30 visual roadmaps with Ollama tutoring — this is better than any paid course for structured tech prep.",
    textHi: "Ollama ट्यूटरिंग के साथ 30 विज़ुअल रोडमैप — structured tech prep के लिए किसी paid course से बेहतर।",
    nameEn: "Ananya K.", nameHi: "अनन्या के.",
    roleEn: "SDE-2, Hyderabad", roleHi: "SDE-2, हैदराबाद",
  },
];

// Animated counter hook
function useCounter(target: number, duration = 1500) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const start = Date.now();
        const tick = () => {
          const elapsed = Date.now() - start;
          const progress = Math.min(elapsed / duration, 1);
          setCount(Math.round(progress * target));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target, duration]);
  return { count, ref };
}

function StatCounter({ value, suffix = "", labelEn, labelHi, tx }: { value: number; suffix?: string; labelEn: string; labelHi: string; tx: (en: string, hi: string) => string }) {
  const { count, ref } = useCounter(value);
  return (
    <div ref={ref} className="text-center">
      <div className="font-mono text-4xl font-black text-white sm:text-5xl">
        {count}{suffix}
      </div>
      <div className="mt-1.5 text-[13px] font-medium text-white/70">{tx(labelEn, labelHi)}</div>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const { lang, tx } = useLanguage();
  const [activeMode, setActiveMode] = useState<ComposerMode>("discover");
  const [promptText, setPromptText] = useState(QUICK_BRIEFS_EN[0]);
  const [demoLoading, setDemoLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [faqCategory, setFaqCategory] = useState<FaqCategory>("all");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [activeTestimonial, setActiveTestimonial] = useState(0);

  const visibleFaqs = faqCategory === "all" ? FAQS : FAQS.filter((f) => f.cat === faqCategory);
  const currentMode = MODE_META[activeMode];
  const quickBriefs = lang === "hi" ? QUICK_BRIEFS_HI : QUICK_BRIEFS_EN;

  useEffect(() => {
    const timer = setInterval(() => setActiveTestimonial((p) => (p + 1) % TESTIMONIALS.length), 4000);
    return () => clearInterval(timer);
  }, []);

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
            <a href="#how-it-works" className="transition hover:text-[#0f172a]">
              {tx("How it Works", "कैसे काम करता है")}
            </a>
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
              <Link href="/" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-2 py-1.5 text-[#0f172a] hover:bg-[#f1f5f9]">{tx("Home", "होम")}</Link>
              <Link href="/roadmaps" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-2 py-1.5 font-semibold text-[#3b5bff] hover:bg-[#f1f5f9]">{tx("Roadmaps", "रोडमैप्स")}</Link>
              <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-2 py-1.5 hover:bg-[#f1f5f9]">{tx("How it Works", "कैसे काम करता है")}</a>
              <a href="#architecture" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-2 py-1.5 hover:bg-[#f1f5f9]">{tx("Architecture", "आर्किटेक्चर")}</a>
              <Link href="/discover" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-2 py-1.5 hover:bg-[#f1f5f9]">{tx("Discovery", "नौकरियाँ")}</Link>
              <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-2 py-1.5 hover:bg-[#f1f5f9]">{tx("Dashboard", "डैशबोर्ड")}</Link>
              <Link href="/auth?mode=register" onClick={() => setMobileMenuOpen(false)} className="col-span-2 rounded-lg px-2 py-1.5 font-semibold text-[#3b5bff] hover:bg-[#f1f5f9]">{tx("Start Free", "मुफ्त शुरू करें")}</Link>
            </div>
          </div>
        )}
      </header>

      {/* ─── HERO SECTION ─── */}
      <section className="atoms-grid-bg relative overflow-hidden border-b border-black/[0.07] px-6 pb-16 pt-10 lg:pt-14">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-12">
          {/* Left Column */}
          <div className="lg:col-span-6">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white px-3.5 py-1 text-[11.5px] font-medium text-[#52525b] shadow-2xs">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              <span>{tx("13 Live Job Sources · 9 Free APIs · 0 Mock Data", "13 लाइव स्रोत · 9 मुफ़्त API · शून्य नकली डेटा")}</span>
            </div>

            <h1 className="text-4xl font-semibold tracking-tight text-[#0f172a] sm:text-5xl sm:leading-[1.1]">
              {tx("Your AI career engine, in ", "आपका पूरा AI करियर सिस्टम — ")}
              <span className="bg-gradient-to-r from-[#3b5bff] via-indigo-600 to-[#0f172a] bg-clip-text text-transparent">
                {tx("pocket & studio.", "मोबाइल और स्टूडियो दोनों में।")}
              </span>
            </h1>

            <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-[#475569]">
              {tx(
                "Engineered as an inspectable AI career platform—13 live job sources, hybrid RRF search, 12-feature ML compatibility, local Ollama multi-agent chat, and 30 visual learning roadmaps. Zero mock data. Zero hallucinated scores.",
                "13 लाइव जॉब स्रोत, हाइब्रिड RRF सर्च, 12-फ़ीचर ML योग्यता, लोकल Ollama हिंदी/अंग्रेजी AI और 30 विज़ुअल करियर रोडमैप्स। शून्य नकली डेटा।"
              )}
            </p>

            {/* Studio Command Composer */}
            <form onSubmit={handleLaunch} className="atoms-card mt-6 p-4 text-left shadow-lg shadow-slate-900/[0.05]">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="atoms-segmented flex-wrap">
                  {(Object.keys(MODE_META) as ComposerMode[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      data-active={activeMode === key}
                      onClick={() => setActiveMode(key)}
                      className="atoms-segmented-btn text-[11.5px]"
                    >
                      {tx(MODE_META[key].labelEn, MODE_META[key].labelHi)}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                rows={2}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder={tx(currentMode.placeholderEn, currentMode.placeholderHi)}
                className="studio-input resize-none px-3.5 py-2.5 text-[13.5px]"
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
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
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0f172a] px-4 py-2 text-[12.5px] font-medium text-white shadow-xs transition hover:bg-[#3b5bff]"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {tx("Launch Workspace", "वर्कस्पेस खोलें")}
                </button>
              </div>
            </form>

            {/* System Pillars */}
            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {SYSTEM_PILLARS.map((item) => (
                <div key={item.labelEn} className="atoms-card px-3.5 py-2.5 text-left">
                  <div className="font-mono text-lg font-bold text-[#0f172a]">{item.value}</div>
                  <div className="text-[11.5px] font-semibold text-[#0f172a]">{tx(item.labelEn, item.labelHi)}</div>
                  <div className="truncate font-mono text-[9.5px] text-[#64748b]">{item.detail}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: 3D Mobile Webapp */}
          <div className="lg:col-span-6">
            <MedoHero3D />
          </div>
        </div>
      </section>

      {/* ─── LIVE STATS BANNER ─── */}
      <section className="bg-gradient-to-r from-[#0f172a] via-[#1e1b4b] to-[#0f172a] px-6 py-14">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-10 sm:grid-cols-4">
          <StatCounter value={13} suffix="×" labelEn="Live Job APIs" labelHi="लाइव जॉब API" tx={tx} />
          <StatCounter value={9} labelEn="Free · No API Key" labelHi="मुफ़्त · बिना कुंजी" tx={tx} />
          <StatCounter value={30} labelEn="Role Roadmaps" labelHi="करियर रोडमैप्स" tx={tx} />
          <StatCounter value={979} suffix="/1000" labelEn="ML ROC-AUC" labelHi="ML ROC-AUC" tx={tx} />
        </div>
      </section>

      {/* ─── 13 LIVE JOB SOURCES DIRECTORY STRIP ─── */}
      <section className="border-y border-[#e5e7eb] bg-white px-6 py-7">
        <div className="mx-auto max-w-6xl">
          <div className="mb-3.5 flex flex-col items-center justify-between gap-2 sm:flex-row">
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-widest text-[#64748b]">
              {tx("13 Live Job APIs Powering Real-Time Discovery (9 Free · 4 Keyed)", "13 लाइव जॉब API — 9 मुफ़्त पब्लिक + 4 API-कुंजी स्रोत")}
            </span>
            <Link href="/discover" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#3b5bff] hover:underline">
              {tx("Open Live Ingestion", "लाइव जॉब लाएँ")} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            {JOB_SOURCES.map((src) => (
              <Link
                key={src.name}
                href="/discover"
                className="flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-[#f8fafc] px-3 py-1.5 text-[11.5px] font-semibold transition hover:border-[#3b5bff]/40 hover:bg-white"
              >
                <span className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold ${src.color}`}>{src.tag}</span>
                <span className="text-[#0f172a]">{src.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="px-6 py-20 bg-[#f6f7f9]">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-white px-3 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#3b5bff]">
              {tx("How it Works", "यह कैसे काम करता है")}
            </span>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#0f172a]">
              {tx("From search to offer — in four steps", "खोज से ऑफर तक — चार चरणों में")}
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-[14px] text-[#64748b]">
              {tx("Every step is backed by real ML — no black-box AI, no fabricated scores.", "हर चरण असली ML द्वारा समर्थित — कोई ब्लैक-बॉक्स AI नहीं, कोई बनावटी स्कोर नहीं।")}
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="group relative rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${step.color} mb-4 shadow-md`}>
                  <step.icon className="h-6 w-6 text-white" />
                </div>
                <div className="mb-1 font-mono text-[10px] font-bold tracking-widest text-[#94a3b8]">{tx(`STEP ${step.step}`, `चरण ${step.step}`)}</div>
                <h3 className="text-[16px] font-bold text-[#0f172a] group-hover:text-[#3b5bff] transition-colors">{tx(step.titleEn, step.titleHi)}</h3>
                <p className="mt-2 text-[12.5px] leading-relaxed text-[#64748b]">{tx(step.descEn, step.descHi)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 30 ROADMAPS SECTION ─── */}
      <section className="border-b border-[#e5e7eb] bg-white px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <div className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#3b5bff]">
                <Compass className="h-3.5 w-3.5" />
                {tx("30 Role & Skill Blueprints", "30 करियर व तकनीकी रोडमैप्स")}
              </div>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#0f172a]">
                {tx("Visual Flowchart Roadmaps With Guided Learning", "विज़ुअल फ्लोचार्ट और चरण-दर-चरण सीखने का तरीका")}
              </h2>
            </div>
            <Link
              href="/roadmaps"
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#0f172a] bg-[#fde047] px-4 py-2 text-[12.5px] font-bold text-[#0f172a] shadow-[0_2px_0_#0f172a] transition hover:-translate-y-0.5 hover:bg-[#fef08a]"
            >
              {tx("Explore All 30 Roadmaps", "सभी 30 रोडमैप्स देखें")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { id: "ai-engineer", title: tx("AI Engineer", "AI इंजीनियर"), tag: tx("AI & Agents", "AI व एजेंट्स"), chips: ["LLMs", "Ollama", "RAG", "LangGraph"] },
              { id: "backend", title: tx("Backend Developer", "बैकएंड डेवलपर"), tag: tx("Systems & APIs", "सिस्टम व API"), chips: ["PostgreSQL", "REST/gRPC", "Redis", "JWT"] },
              { id: "full-stack", title: tx("Full Stack Developer", "फुल स्टैक डेवलपर"), tag: tx("Web + Cloud", "वेब + क्लाउड"), chips: ["React", "Tailwind", "Node.js", "AWS"] },
              { id: "devops", title: tx("DevOps & Kubernetes", "DevOps व K8s"), tag: tx("Cloud Infra", "क्लाउड इंफ्रा"), chips: ["Docker", "Kubernetes", "Terraform", "CI/CD"] },
              { id: "ai-data-scientist", title: tx("AI & Data Scientist", "AI व डेटा साइंटिस्ट"), tag: tx("Math & ML", "गणित व ML"), chips: ["Statistics", "CUPED", "EDA", "PyTorch"] },
              { id: "sql", title: tx("SQL & PostgreSQL DBA", "SQL व PostgreSQL"), tag: tx("Databases", "डेटाबेस"), chips: ["Joins", "Window Fn", "MVCC", "EXPLAIN"] },
              { id: "product-design", title: tx("Product & UX Design", "प्रोडक्ट व UX डिज़ाइन"), tag: tx("Design & HEART", "डिज़ाइन व UX"), chips: ["Wireframes", "Figma", "Usability", "HEART"] },
              { id: "android", title: tx("Mobile (Android / iOS / Flutter)", "मोबाइल (Android/iOS/Flutter)"), tag: tx("Native & Cross", "नेटिव व क्रॉस"), chips: ["Kotlin", "SwiftUI", "Flutter", "React Native"] },
            ].map((card) => (
              <Link
                key={card.id}
                href={`/roadmaps?track=${card.id}`}
                className="group rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-4 transition-all duration-200 hover:-translate-y-1 hover:border-[#0f172a] hover:bg-white hover:shadow-[0_14px_30px_-12px_rgba(15,23,42,0.18)]"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-[#fde047] px-2 py-0.5 font-mono text-[10px] font-bold text-[#0f172a]">{card.tag}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[#64748b] transition group-hover:translate-x-0.5 group-hover:text-[#3b5bff]" />
                </div>
                <h3 className="mt-2.5 text-[14px] font-bold text-[#0f172a] group-hover:text-[#3b5bff]">{card.title}</h3>
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {card.chips.map((ch) => (
                    <span key={ch} className="rounded border border-[#fed7aa] bg-[#ffedd5]/80 px-1.5 py-0.5 text-[10px] font-semibold text-[#334155]">{ch}</span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SHOWCASE & DEEP DIVE ─── */}
      <MedoShowcase />
      <MedoDeepDive />

      {/* ─── TECH STACK GRID ─── */}
      <section className="border-y border-[#e5e7eb] bg-[#f6f7f9] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <div className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#3b5bff]">
              <Zap className="h-3.5 w-3.5" />
              {tx("Technology Stack", "तकनीकी स्टैक")}
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#0f172a]">
              {tx("Enterprise-grade stack. Local-first philosophy.", "एंटरप्राइज़-ग्रेड स्टैक। लोकल-फ़र्स्ट दर्शन।")}
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {TECH_STACK.map((tech) => (
              <div key={tech.name} className="rounded-2xl border border-[#e5e7eb] bg-white p-4 text-center transition hover:border-[#3b5bff]/40 hover:shadow-md">
                <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#3b5bff]">{tech.name}</div>
                <div className="mt-0.5 text-[12px] text-[#64748b]">{tech.sub}</div>
                <div className="mt-2 inline-block rounded-full bg-[#f1f5f9] px-2.5 py-0.5 font-mono text-[10px] font-semibold text-[#334155]">{tech.badge}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section className="bg-white px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <div className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#3b5bff]">
              <Users className="h-3.5 w-3.5" />
              {tx("From the Community", "समुदाय से")}
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#0f172a]">
              {tx("What engineers say about Medo", "इंजीनियर Medo के बारे में क्या कहते हैं")}
            </h2>
          </div>
          <div className="rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-8 text-center shadow-2xs transition-all">
            <div className="mb-2 font-serif text-3xl leading-none text-[#3b5bff]/35">&ldquo;</div>
            <p className="mx-auto max-w-2xl text-[15px] leading-relaxed text-[#334155] italic">
              {tx(TESTIMONIALS[activeTestimonial].textEn, TESTIMONIALS[activeTestimonial].textHi)}
            </p>
            <div className="mt-5 font-semibold text-[#0f172a]">
              {tx(TESTIMONIALS[activeTestimonial].nameEn, TESTIMONIALS[activeTestimonial].nameHi)}
            </div>
            <div className="text-[12px] text-[#64748b]">
              {tx(TESTIMONIALS[activeTestimonial].roleEn, TESTIMONIALS[activeTestimonial].roleHi)}
            </div>
          </div>
          <div className="mt-6 flex justify-center gap-2">
            {TESTIMONIALS.map((item, i) => (
              <button
                key={item.nameEn}
                type="button"
                aria-label={item.nameEn}
                onClick={() => setActiveTestimonial(i)}
                className={`h-2 rounded-full transition-all ${i === activeTestimonial ? "w-6 bg-[#3b5bff]" : "w-2 bg-[#cbd5e1]"}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─── ARCHITECTURE SECTION ─── */}
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
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-[13px] font-medium text-[#3b5bff] hover:underline">
            {tx("Open Career Dashboard", "करियर डैशबोर्ड खोलें")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <SystemArchitectureMermaid />
      </section>

      {/* ─── PIPELINE & BENCHMARKS ─── */}
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
                <span className="rounded border border-amber-500/30 bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-800">1,500 grouped pairs</span>
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
                <span className="rounded border border-amber-500/30 bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-800">GroupShuffleSplit zero-leakage</span>
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

      {/* ─── STUDIO BENTO + COMPARISON TABLE ─── */}
      <section id="workspace" className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-[#3b5bff]">{tx("Studio Modules", "स्टूडियो मॉड्यूल")}</div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{tx("Built for Every Stage of Job Intelligence", "करियर की हर ज़रूरत के लिए डिज़ाइन किया गया")}</h2>
          </div>
          <Link href="/onboarding" className="inline-flex items-center gap-1 text-[13px] font-medium text-[#3b5bff] hover:underline">
            {tx("Start Guided Onboarding", "गाइडेड सेटअप शुरू करें")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <MedoStudioBento />

        {/* Why Medo Engineering Standard Comparison */}
        <div className="mt-16 overflow-hidden rounded-3xl border border-[#e2e8f0] bg-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.18)]">
          {/* Header Banner */}
          <div className="relative overflow-hidden border-b border-[#e5e7eb] bg-gradient-to-r from-[#0f172a] via-[#172554] to-[#1e1b4b] px-6 py-6 sm:px-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-sky-300">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {tx("Engineering Standard", "इंजीनियरिंग मानक")}
                </div>
                <h3 className="mt-2.5 text-xl font-bold tracking-tight text-white sm:text-2xl">
                  {tx("Why Medo AI Beats Generic ChatGPT Job Wrappers", "Medo AI साधारण चैटबॉट रैपर्स से बेहतर क्यों है")}
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-xl border border-emerald-400/25 bg-emerald-500/15 px-3 py-1.5 font-mono text-[11px] font-semibold text-emerald-300">
                  {tx("6 Core Guarantees · 0 Hallucination", "6 मुख्य गारंटी · 0 अनुमान")}
                </span>
              </div>
            </div>
          </div>

          {/* Column Headers (Desktop) */}
          <div className="hidden grid-cols-12 border-b border-[#e5e7eb] bg-[#f8fafc] px-6 py-3.5 text-[11px] font-mono font-semibold uppercase tracking-wider sm:px-8 md:grid">
            <div className="col-span-4 text-[#64748b]">{tx("Engineering Layer", "इंजीनियरिंग परत")}</div>
            <div className="col-span-3 text-[#94a3b8]">{tx("Generic Wrapper", "साधारण रैपर")}</div>
            <div className="col-span-5 flex items-center gap-1.5 text-[#3b5bff]">
              <Sparkles className="h-3.5 w-3.5" />
              {tx("Medo Career Studio", "मेडो करियर स्टूडियो")}
            </div>
          </div>

          {/* Comparison Rows */}
          <div className="divide-y divide-[#f1f5f9] bg-white">
            {COMPARISON_ROWS.map((row) => (
              <div
                key={row.capEn}
                className="grid grid-cols-1 gap-3 px-6 py-4 transition-colors hover:bg-[#f8fafc]/80 sm:px-8 md:grid-cols-12 md:items-center md:gap-4"
              >
                {/* Capability */}
                <div className="md:col-span-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-bold text-[#0f172a]">{tx(row.capEn, row.capHi)}</span>
                    <span className="rounded-md bg-[#f1f5f9] px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-[#475569]">
                      {row.badge}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-[#64748b]">{tx(row.subEn, row.subHi)}</div>
                </div>

                {/* Generic Wrapper */}
                <div className="md:col-span-3">
                  <div className="inline-flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50/50 px-3 py-2 text-[12px] text-[#64748b] md:w-full">
                    <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                    <span>{tx(row.wrapEn, row.wrapHi)}</span>
                  </div>
                </div>

                {/* Medo Career Studio */}
                <div className="md:col-span-5">
                  <div className="flex items-start gap-2.5 rounded-xl border border-[#3b5bff]/20 bg-gradient-to-r from-[#3b5bff]/[0.06] via-indigo-50/50 to-emerald-50/40 px-3.5 py-2.5 text-[12.5px] font-semibold text-[#0f172a]">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </span>
                    <span>{tx(row.medoEn, row.medoHi)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRIVACY & SECURITY PILLARS ─── */}
      <section className="border-t border-[#e5e7eb] bg-gradient-to-br from-slate-900 to-indigo-950 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-white/70">
              {tx("Privacy & Governance", "गोपनीयता और शासन")}
            </span>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              {tx("Human-Controlled by Design", "डिज़ाइन में मानव-नियंत्रित")}
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Lock, titleEn: "HITL Approval Gate", titleHi: "HITL अनुमोदन द्वार", descEn: "Every external action (email, submit) requires your explicit click to proceed.", descHi: "हर बाहरी कार्रवाई के लिए आपकी स्पष्ट क्लिक ज़रूरी है।" },
              { icon: ShieldCheck, titleEn: "Consent-Gated LLMs", titleHi: "सहमति-नियंत्रित LLM", descEn: "Resume and private notes never reach external LLMs without opt-in consent.", descHi: "रेज़्यूमे और निजी नोट्स सहमति के बिना बाहरी LLM तक नहीं पहुँचते।" },
              { icon: Globe, titleEn: "Zero Mock Data", titleHi: "शून्य नकली डेटा", descEn: "All 13 connectors fetch real live postings. No fixtures, no fabricated jobs.", descHi: "सभी 13 कनेक्टर असली लाइव नौकरियाँ लाते हैं। कोई बनावटी डेटा नहीं।" },
              { icon: TrendingUp, titleEn: "Verifiable Scores", titleHi: "सत्यापन योग्य स्कोर", descEn: "Every compatibility %, ranking, and skill gap is computed from real data rows.", descHi: "हर योग्यता %, रैंकिंग और कौशल अंतर असली डेटा से निकाला जाता है।" },
              { icon: Brain, titleEn: "Local-First AI", titleHi: "लोकल-फ़र्स्ट AI", descEn: "Resume parsing, embeddings, ML ranking and Ollama inference stay on your machine.", descHi: "रेज़्यूमे पार्सिंग, एम्बेडिंग, ML रैंकिंग और Ollama आपके मशीन पर रहते हैं।" },
              { icon: GitBranch, titleEn: "Multi-Tenant Isolation", titleHi: "मल्टी-टेनेंट आइसोलेशन", descEn: "Data ownership boundaries enforced at SQL row-level. No cross-user data leaks.", descHi: "SQL रो-लेवल पर डेटा स्वामित्व सीमाएँ — कोई क्रॉस-यूज़र लीक नहीं।" },
            ].map((p) => (
              <div key={p.titleEn} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                <p.icon className="h-7 w-7 text-[#60a5fa] mb-3" />
                <h3 className="font-semibold text-white">{tx(p.titleEn, p.titleHi)}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">{tx(p.descEn, p.descHi)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq" className="border-t border-[#e5e7eb] bg-white px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#3b5bff]">
              {tx("FAQ · Technical & Security", "अक्सर पूछे जाने वाले सवाल")}
            </span>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#0f172a]">
              {tx("Questions engineers ask before adopting Medo", "आर्किटेक्चर, ML और गोपनीयता से जुड़े प्रमुख प्रश्न")}
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-[14px] text-[#64748b]">
              {tx(
                "Everything from hybrid RRF search and ML calibration to local Ollama Hindi AI and HITL approvals.",
                "हाइब्रिड खोज, 12-फ़ीचर ML स्कोरिंग, हिंदी Ollama AI और मानव अनुमोदन प्रणाली के बारे में स्पष्ट उत्तर।"
              )}
            </p>
          </div>

          {/* Category filters */}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {(["all", "architecture", "ml", "ai", "privacy"] as FaqCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => { setFaqCategory(cat); setOpenFaq(null); }}
                className={`rounded-full border px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide transition ${
                  faqCategory === cat
                    ? "border-[#3b5bff] bg-[#3b5bff] text-white"
                    : "border-[#e2e8f0] bg-white text-[#64748b] hover:border-[#cbd5e1] hover:text-[#0f172a]"
                }`}
              >
                {cat === "all" ? tx("All", "सभी") : cat === "architecture" ? tx("Architecture", "आर्किटेक्चर") : cat === "ml" ? "ML & Search" : cat === "ai" ? "AI & Agents" : tx("Privacy", "गोपनीयता")}
              </button>
            ))}
          </div>

          <div className="mt-8 space-y-2">
            {visibleFaqs.map((faq, i) => (
              <div key={i} className="rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="text-[14px] font-semibold text-[#0f172a]">{tx(faq.qEn, faq.qHi)}</span>
                  {openFaq === i ? <Minus className="h-4 w-4 shrink-0 text-[#3b5bff]" /> : <Plus className="h-4 w-4 shrink-0 text-[#64748b]" />}
                </button>
                {openFaq === i && (
                  <div className="border-t border-[#e5e7eb] bg-white px-5 pb-5 pt-4 text-[13.5px] leading-relaxed text-[#475569]">
                    {tx(faq.aEn, faq.aHi)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="border-t border-[#e5e7eb] bg-gradient-to-br from-[#3b5bff] via-indigo-700 to-[#0f172a] px-6 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-white/80">
            <Sparkles className="h-3.5 w-3.5" /> {tx("Open Source · Local-First · Bilingual AI", "ओपन सोर्स · लोकल-फ़र्स्ट · द्विभाषी AI")}
          </div>
          <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            {tx("Start your career intelligence journey", "अपनी करियर इंटेलिजेंस यात्रा शुरू करें")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-white/70">
            {tx(
              "13 live job APIs. Verifiable ML. Local Ollama AI. 30 visual roadmaps. No subscription needed to get started.",
              "13 लाइव जॉब API। सत्यापनीय ML। लोकल Ollama AI। 30 विज़ुअल रोडमैप। शुरुआत के लिए कोई सदस्यता नहीं।"
            )}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/auth?mode=register"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 text-[14px] font-bold text-[#0f172a] shadow-xl transition hover:scale-105 hover:shadow-2xl"
            >
              <Sparkles className="h-4 w-4 text-[#3b5bff]" />
              {tx("Create Free Account", "मुफ़्त खाता बनाएँ")}
            </Link>
            <button
              onClick={handleDemoLogin}
              disabled={demoLoading}
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-white/30 bg-white/10 px-7 py-3.5 text-[14px] font-bold text-white backdrop-blur-sm transition hover:bg-white/20 disabled:opacity-60"
            >
              {demoLoading ? tx("Opening...", "खुल रहा है...") : tx("Open Live Workspace", "लाइव वर्कस्पेस खोलें")}
            </button>
            <Link
              href="/roadmaps"
              className="inline-flex items-center gap-1.5 rounded-2xl border border-white/25 bg-white/10 px-5 py-3.5 text-[13.5px] font-medium text-white backdrop-blur-xs transition hover:bg-white/20"
            >
              {tx("Browse 30 Roadmaps", "30 रोडमैप्स देखें")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {/* Trust badges */}
          <div className="mt-10 flex flex-wrap justify-center gap-6 text-[12px] text-white/50">
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> {tx("No credit card required", "कोई क्रेडिट कार्ड नहीं")}</span>
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> {tx("9 completely free job APIs", "9 पूरी तरह मुफ़्त जॉब API")}</span>
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> {tx("Local Ollama — data stays on your machine", "लोकल Ollama — डेटा आपके मशीन पर")}</span>
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> {tx("Hindi + English bilingual", "हिंदी + अंग्रेजी द्विभाषी")}</span>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-[#e5e7eb] bg-white px-6 pb-10 pt-14">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 pb-10 sm:grid-cols-2 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Link href="/" className="inline-flex items-center gap-2.5">
                <MedoMark size={32} />
                <span className="text-[16.5px] font-bold tracking-tight text-[#0f172a]">Medo</span>
                <span className="rounded-md bg-[#3b5bff]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#3b5bff]">{tx("CAREER STUDIO", "करियर स्टूडियो")}</span>
              </Link>
              <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-[#64748b]">
                {tx("AI-native career intelligence platform combining 13 live job APIs, calibrated ML/LTR ranking, bilingual Ollama agents, and 30 interactive roadmaps.", "13 लाइव जॉब API, कैलिब्रेटेड ML रैंकिंग, द्विभाषी Ollama AI और 30 इंटरैक्टिव रोडमैप्स का संपूर्ण करियर प्लेटफ़ॉर्म।")}
              </p>
              <div className="mt-4 font-mono text-[11px] text-[#94a3b8]">FastAPI · PostgreSQL 16 + pgvector · LangGraph · Next.js 15</div>
            </div>
            <div className="lg:col-span-2">
              <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#0f172a]">{tx("Opportunities", "अवसर")}</div>
              <ul className="mt-3 space-y-2 text-[13px] text-[#475569]">
                <li><Link href="/dashboard" className="hover:text-[#0f172a]">{tx("Dashboard", "डैशबोर्ड")}</Link></li>
                <li><Link href="/discover" className="hover:text-[#0f172a]">{tx("Job Discovery", "नौकरी खोज")}</Link></li>
                <li><Link href="/recommendations" className="hover:text-[#0f172a]">{tx("ML Matches", "ML मिलान")}</Link></li>
                <li><Link href="/tracker" className="hover:text-[#0f172a]">{tx("Pipeline Tracker", "पाइपलाइन ट्रैकर")}</Link></li>
              </ul>
            </div>
            <div className="lg:col-span-3">
              <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#0f172a]">{tx("Intelligence & Roadmaps", "AI और रोडमैप्स")}</div>
              <ul className="mt-3 space-y-2 text-[13px] text-[#475569]">
                <li><Link href="/assistant" className="hover:text-[#0f172a]">{tx("AI Orchestrator", "AI ऑर्केस्ट्रेटर")}</Link></li>
                <li><Link href="/roadmaps" className="hover:text-[#0f172a]">{tx("30 Skill Roadmaps", "30 करियर रोडमैप्स")}</Link></li>
                <li><Link href="/resume" className="hover:text-[#0f172a]">{tx("Resume Studio", "रिज्यूमे स्टूडियो")}</Link></li>
                <li><Link href="/skills" className="hover:text-[#0f172a]">{tx("Skill-Gap Radar", "कौशल अंतर")}</Link></li>
              </ul>
            </div>
            <div className="lg:col-span-2">
              <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#0f172a]">{tx("Governance", "सुरक्षा")}</div>
              <ul className="mt-3 space-y-2 text-[13px] text-[#475569]">
                <li><Link href="/privacy" className="hover:text-[#0f172a]">{tx("Privacy & HITL", "गोपनीयता और HITL")}</Link></li>
                <li><Link href="/profile" className="hover:text-[#0f172a]">{tx("Preferences", "प्राथमिकताएँ")}</Link></li>
                <li><Link href="/auth" className="hover:text-[#0f172a]">{tx("Sign in", "साइन इन")}</Link></li>
                <li><a href="#faq" className="hover:text-[#0f172a]">{tx("Architecture FAQ", "FAQ")}</a></li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col items-start justify-between gap-3 border-t border-[#f1f5f9] pt-6 text-[12px] text-[#94a3b8] sm:flex-row sm:items-center">
            <span>© {new Date().getFullYear()} Medo AI Career Intelligence Studio</span>
            <span>{tx("Local-First · English & हिंदी · Verifiable ML · 13 Live APIs", "लोकल-फ़र्स्ट · अंग्रेजी और हिंदी · सत्यापित ML · 13 लाइव API")}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
