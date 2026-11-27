"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUp, ArrowUpRight, Code2, Sparkles, User } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface StageData {
  id: string;
  labelEn: string;
  labelHi: string;
  headlineEn: string;
  headlineHi: string;
  subcopyEn: string;
  subcopyHi: string;
  messagesEn: Array<{ from: "bot" | "user"; text: string }>;
  messagesHi: Array<{ from: "bot" | "user"; text: string }>;
  delivered?: boolean;
  arcOffset: string;
}

const STAGES: StageData[] = [
  {
    id: "learns",
    labelEn: "Learns.",
    labelHi: "सीखता है।",
    headlineEn: "Your experience.\nYour next move.",
    headlineHi: "आपका अनुभव।\nआपका अगला कदम।",
    subcopyEn: "Start with your resume and a quick conversation.",
    subcopyHi: "अपने रेज़्यूमे और एक छोटी बातचीत से शुरुआत करें।",
    arcOffset: "pl-10",
    messagesEn: [
      { from: "bot", text: "What do you want next?" },
      { from: "user", text: "I lead an ML Systems team. I miss hands-on PyTorch & retrieval." },
      { from: "user", text: "Remote or Bengaluru hybrid. Happy to mentor." },
      { from: "bot", text: "Hands-on AI Systems with mentoring scope. Learned your profile." },
    ],
    messagesHi: [
      { from: "bot", text: "आप आगे किस तरह का रोल चाहते हैं?" },
      { from: "user", text: "मैं ML Systems लीड कर रहा हूँ, मुझे PyTorch और RAG पर काम करना है।" },
      { from: "user", text: "Remote या बेंगलुरु हाइब्रिड रोल चाहिए।" },
      { from: "bot", text: "हैंड्स-ऑन AI Systems और मेंटरिंग रोल। आपकी प्रोफ़ाइल समझ ली है।" },
    ],
    delivered: true,
  },
  {
    id: "looks",
    labelEn: "Looks.",
    labelHi: "खोजता है।",
    headlineEn: "Six live sources.\nZero noise.",
    headlineHi: "छह लाइव स्रोत।\nबिल्कुल सटीक।",
    subcopyEn: "Continuously syncs Himalayas, Jobicy, Remotive, RemoteOK, Arbeitnow & HN.",
    subcopyHi: "Himalayas, Jobicy, Remotive, RemoteOK, Arbeitnow और HN से लगातार अपडेट।",
    arcOffset: "pl-5",
    messagesEn: [
      { from: "bot", text: "Scanning 6 live job connectors across IN + Global Remote..." },
      { from: "user", text: "Focus on PyTorch, FastAPI, pgvector & ₹35L+ / $160k+." },
      { from: "bot", text: "Found 24 fresh openings matching your region & salary floor." },
    ],
    messagesHi: [
      { from: "bot", text: "भारत और ग्लोबल रिमोट के 6 लाइव जॉब स्रोतों को स्कैन किया जा रहा है..." },
      { from: "user", text: "PyTorch, FastAPI, pgvector और ₹35L+ वाली नौकरियाँ दिखाएँ।" },
      { from: "bot", text: "आपके क्षेत्र और सैलरी के अनुसार 24 नई लाइव नौकरियाँ मिलीं।" },
    ],
    delivered: true,
  },
  {
    id: "filters",
    labelEn: "Filters.",
    labelHi: "फ़िल्टर करता है।",
    headlineEn: "Hybrid search.\nPrecision ranking.",
    headlineHi: "हाइब्रिड सर्च।\nसटीक रैंकिंग।",
    subcopyEn: "Combines pgvector semantic recall, BM25, RRF fusion, and Cross-Encoder reranking.",
    subcopyHi: "pgvector सिमैंटिक सर्च, BM25, RRF फ़्यूज़न और Cross-Encoder री-रैंकिंग।",
    arcOffset: "pl-3",
    messagesEn: [
      { from: "bot", text: "Removed 14 mismatched roles & excluded VP titles per your rules." },
      { from: "user", text: "Which role ranks #1 for my skills?" },
      { from: "bot", text: "Staff Retrieval Engineer @ VectorLabs — 92% calibrated fit." },
    ],
    messagesHi: [
      { from: "bot", text: "आपके नियमों के अनुसार 14 असंगत रोल हटा दिए गए हैं।" },
      { from: "user", text: "मेरे कौशल के लिए #1 सबसे बेहतर रोल कौन-सा है?" },
      { from: "bot", text: "Staff Retrieval Engineer @ VectorLabs — 92% सटीक फिट।" },
    ],
    delivered: true,
  },
  {
    id: "explains",
    labelEn: "Explains.",
    labelHi: "समझाता है।",
    headlineEn: "Evidence first.\nEvery score explained.",
    headlineHi: "प्रमाण सबसे पहले।\nहर स्कोर स्पष्ट।",
    subcopyEn: "Inspect matched skills, missing gaps, and human-approved application drafts.",
    subcopyHi: "मैच हुए कौशल, कमियाँ और मानव-अनुमोदित आवेदन ड्राफ़्ट देखें।",
    arcOffset: "pl-9",
    messagesEn: [
      { from: "bot", text: "Matched 8/9 skills from your resume evidence spans (PyTorch, pgvector, LangGraph)." },
      { from: "user", text: "What's the only gap?" },
      { from: "bot", text: "CUDA Triton kernels. Ready to draft your tailored application for sign-off?" },
    ],
    messagesHi: [
      { from: "bot", text: "रेज़्यूमे से 8/9 मुख्य कौशल मैच हुए (PyTorch, pgvector, LangGraph)।" },
      { from: "user", text: "मेरी एकमात्र कमी क्या है?" },
      { from: "bot", text: "CUDA Triton kernels। क्या मैं आपके अनुमोदन के लिए आवेदन ड्राफ़्ट करूँ?" },
    ],
    delivered: true,
  },
];

export function MedoShowcase() {
  const { lang, tx } = useLanguage();
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [draftMsg, setDraftMsg] = useState("");
  const [customReplies, setCustomReplies] = useState<Array<{ from: "bot" | "user"; text: string }>>([]);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % STAGES.length);
      setCustomReplies([]);
    }, 5200);
    return () => clearInterval(timer);
  }, [paused]);

  const stage = STAGES[activeIdx];
  const baseMessages = lang === "hi" ? stage.messagesHi : stage.messagesEn;
  const allMessages = [...baseMessages, ...customReplies];

  const handleStageSelect = (idx: number) => {
    setPaused(true);
    setActiveIdx(idx);
    setCustomReplies([]);
  };

  const handlePhoneSend = (e: React.FormEvent) => {
    e.preventDefault();
    const txt = draftMsg.trim();
    if (!txt) return;
    setPaused(true);
    setDraftMsg("");
    setCustomReplies((prev) => [
      ...prev,
      { from: "user", text: txt },
      {
        from: "bot",
        text:
          lang === "hi"
            ? `समझ गया — "${txt}" Medo AI ऑर्केस्ट्रेटर में भेज दिया गया है। पूर्ण परिणाम देखने के लिए स्टूडियो खोलें।`
            : `Got it — queued "${txt}" for Medo AI Orchestrator. Open Workspace to inspect live matches.`,
      },
    ]);
  };

  return (
    <section
      id="experience"
      className="relative overflow-hidden border-y border-[#E6DFD1] bg-[#F7F3EA] py-16 text-[#1C1917] lg:py-24"
    >
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/15 blur-3xl" />

      <div className="absolute bottom-6 left-6 z-20 hidden flex-col overflow-hidden rounded-xl border border-[#DFD7C8] bg-[#FBF9F4]/95 shadow-sm sm:flex">
        <Link
          href="/dashboard"
          title={tx("Open Candidate Workspace", "डैशबोर्ड खोलें")}
          className="flex h-9 w-9 items-center justify-center border-b border-[#E8E1D3] text-[#4A453E] transition hover:bg-[#EFE9DC] hover:text-[#1C1917]"
        >
          <User className="h-4 w-4" />
        </Link>
        <a
          href="#architecture"
          title={tx("Inspect System Architecture", "आर्किटेक्चर देखें")}
          className="flex h-9 w-9 items-center justify-center text-[#4A453E] transition hover:bg-[#EFE9DC] hover:text-[#1C1917]"
        >
          <Code2 className="h-4 w-4" />
        </a>
      </div>

      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-6 lg:grid-cols-12">
        {/* Left Curved Orbit Timeline */}
        <div className="relative flex min-h-[380px] flex-col justify-center lg:col-span-4 lg:min-h-[520px]">
          <svg
            viewBox="0 0 140 520"
            className="pointer-events-none absolute left-0 top-0 hidden h-full w-36 lg:block"
            fill="none"
          >
            <path d="M 105 12 Q 22 260 105 508" stroke="#CFC6B5" strokeWidth="1.25" strokeDasharray="4 5" />
          </svg>

          <div className="relative z-10 space-y-7 lg:space-y-9">
            {STAGES.map((st, idx) => {
              const isActive = idx === activeIdx;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => handleStageSelect(idx)}
                  className={`group relative flex w-full items-center text-left transition-all ${st.arcOffset}`}
                >
                  <span
                    className={`mr-4 hidden h-2.5 w-2.5 shrink-0 rounded-[2px] transition-all lg:inline-block ${
                      isActive
                        ? "scale-110 bg-[#D97706] shadow-[0_0_0_5px_rgba(217,119,6,0.18)]"
                        : "bg-[#C7BEB0] group-hover:bg-[#8C8274]"
                    }`}
                  />
                  <span
                    style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}
                    className={`tracking-tight transition-all duration-200 ${
                      isActive
                        ? "text-4xl font-normal text-[#1C1917] sm:text-5xl"
                        : "text-3xl font-normal text-[#8E8679] hover:text-[#4B453E] sm:text-[38px]"
                    }`}
                  >
                    {tx(st.labelEn, st.labelHi)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Center Realistic iPhone Interactive Conversation Frame */}
        <div className="flex justify-center lg:col-span-4">
          <div className="relative w-[312px] sm:w-[342px] rounded-[46px] border-[9px] border-[#1F1A17] bg-[#FBF8F1] p-2.5 shadow-[0_32px_70px_-20px_rgba(28,25,23,0.3)]">
            <div className="flex h-[585px] flex-col overflow-hidden rounded-[36px] bg-[#FAF7F0]">
              <div className="flex items-center justify-between px-5 pt-2.5 pb-2">
                <span className="text-[11px] font-semibold tracking-tight text-[#1C1917]">11:48</span>
                <div className="h-5 w-24 rounded-full bg-[#151210]" />
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#1C1917]/75" />
                  <span className="h-2.5 w-4 rounded-[3px] border border-[#1C1917]/60 bg-[#1C1917]/75" />
                </div>
              </div>

              <div className="flex items-center gap-2.5 border-b border-[#E9E2D4] px-4 py-2.5">
                <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-[#F59E0B] shadow-2xs">
                  <div className="flex items-center gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#1C1917]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#1C1917]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#1C1917]" />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#FAF7F0] bg-emerald-500" />
                </div>
                <div>
                  <div
                    style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}
                    className="text-[14px] font-medium leading-none text-[#1C1917]"
                  >
                    Medo
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-[#6B6358]">{tx("online", "ऑनलाइन")}</div>
                </div>
              </div>

              <div className="thin-scroll flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
                <div className="flex flex-col items-center py-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F59E0B] shadow-[0_8px_20px_-6px_rgba(245,158,11,0.55)]">
                    <div className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-[#1C1917]" />
                      <span className="h-2 w-2 rounded-full bg-[#1C1917]" />
                      <span className="h-2 w-2 rounded-full bg-[#1C1917]" />
                    </div>
                  </div>
                  <div
                    style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}
                    className="mt-2 text-[17px] font-medium text-[#1C1917]"
                  >
                    Medo
                  </div>
                </div>

                <div className="flex justify-center pb-1">
                  <span className="rounded-full bg-[#EAE3D5] px-2.5 py-0.5 text-[10px] font-medium text-[#6B6358]">
                    {tx("Today 11:48 PM", "आज 11:48 PM")}
                  </span>
                </div>

                {allMessages.map((m, mi) => (
                  <div key={mi} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-snug ${
                        m.from === "user"
                          ? "rounded-br-sm bg-[#1E1A17] text-white"
                          : "rounded-bl-sm border border-[#E7E0D2] bg-[#F2EEE4] text-[#1C1917]"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}

                {stage.delivered && (
                  <div className="pr-1 text-right text-[9.5px] font-medium text-[#8E8679]">
                    {tx("Delivered", "संदेश भेजा गया")}
                  </div>
                )}
              </div>

              <form
                onSubmit={handlePhoneSend}
                className="flex items-center gap-2 border-t border-[#E9E2D4] bg-[#FAF7F0] px-3 py-2.5"
              >
                <input
                  value={draftMsg}
                  onChange={(e) => setDraftMsg(e.target.value)}
                  onFocus={() => setPaused(true)}
                  placeholder={tx("Message", "संदेश लिखें")}
                  className="flex-1 rounded-full border border-[#DFD7C8] bg-white px-3.5 py-1.5 text-[12px] text-[#1C1917] placeholder:text-[#9B9284] outline-none focus:border-[#D97706]"
                />
                <button
                  type="submit"
                  aria-label="Send demo message"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1E1A17] text-white transition hover:bg-[#3A332D]"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Right Editorial Annotation & Curved Arrow */}
        <div className="relative flex flex-col items-start lg:col-span-4 lg:pl-4">
          <svg viewBox="0 0 110 64" className="-ml-10 mb-1 hidden h-14 w-24 text-[#9A6B2F] lg:block" fill="none">
            <path d="M 96 14 Q 44 4 12 46" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path
              d="M 12 34 L 10 47 L 23 44"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          <h3
            style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}
            className="whitespace-pre-line text-3xl italic leading-tight text-[#8C5A1E] sm:text-[34px]"
          >
            {tx(stage.headlineEn, stage.headlineHi)}
          </h3>

          <p className="mt-3 max-w-xs text-[14.5px] leading-relaxed text-[#4A453E]">
            {tx(stage.subcopyEn, stage.subcopyHi)}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 rounded-xl bg-[#1E1A17] px-5 py-2.5 text-[13.5px] font-medium text-white shadow-sm transition hover:bg-[#332C27]"
            >
              <span>{tx("Meet Medo", "मेडो से मिलें")}</span>
              <ArrowUpRight className="h-4 w-4 text-[#F59E0B]" />
            </Link>
            <Link
              href="/assistant"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8CFC0] bg-white/80 px-4 py-2.5 text-[13px] font-medium text-[#1C1917] transition hover:border-[#B6AC9A] hover:bg-white"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#D97706]" />
              {tx("Open Full Studio", "पूरा स्टूडियो खोलें")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
