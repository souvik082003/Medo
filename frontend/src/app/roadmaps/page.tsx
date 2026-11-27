"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  GraduationCap,
  Menu,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { MedoMark } from "@/components/MedoLogo";
import { apiFetch, getToken, setAuthSession, TokenResponse } from "@/lib/api";
import { LanguageToggle, useLanguage } from "@/lib/i18n";
import { ALL_ROADMAP_TRACKS, ROADMAP_BY_ID, RoadmapSection, RoadmapTopic, RoadmapTrack } from "@/lib/roadmaps";

const TOPIC_DONE_KEY = "medo_public_roadmap_done_v1";

type DrawerSelection =
  | { kind: "section"; section: RoadmapSection }
  | { kind: "topic"; section: RoadmapSection; topic: RoadmapTopic };

const RESOURCE_PILL: Record<string, string> = {
  Course: "bg-indigo-100 text-indigo-800 border-indigo-300",
  Book: "bg-amber-100 text-amber-900 border-amber-300",
  Paper: "bg-purple-100 text-purple-800 border-purple-300",
  Article: "bg-sky-100 text-sky-900 border-sky-300",
  Tutorial: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Challenges: "bg-rose-100 text-rose-800 border-rose-300",
  Docs: "bg-slate-100 text-slate-800 border-slate-300",
  Tool: "bg-teal-100 text-teal-800 border-teal-300",
};

export default function PublicRoadmapsPage() {
  const { lang, tx } = useLanguage();
  const [selectedId, setSelectedId] = useState<string>("ai-engineer");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({});
  const [drawer, setDrawer] = useState<DrawerSelection | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Live Ollama Tutor inside Drawer (works if logged in or after clicking Try Demo)
  const [aiBusy, setAiBusy] = useState(false);
  const [aiLesson, setAiLesson] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [hasAuth, setHasAuth] = useState(false);

  useEffect(() => {
    setHasAuth(Boolean(getToken()));
    try {
      const saved = localStorage.getItem(TOPIC_DONE_KEY);
      if (saved) setDoneMap(JSON.parse(saved) as Record<string, boolean>);
    } catch {
      // ignore storage failure
    }
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const trackParam = params.get("track");
      if (trackParam && ROADMAP_BY_ID[trackParam]) {
        setSelectedId(trackParam);
      }
    }
  }, []);

  const currentTrack: RoadmapTrack = ROADMAP_BY_ID[selectedId] || ALL_ROADMAP_TRACKS[0];

  const toggleDone = (topicId: string) => {
    setDoneMap((prev) => {
      const next = { ...prev, [topicId]: !prev[topicId] };
      try {
        localStorage.setItem(TOPIC_DONE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage error
      }
      return next;
    });
  };

  const filteredTracks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ALL_ROADMAP_TRACKS.filter((t) => {
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (q) {
        const hay = `${t.title} ${t.shortDesc} ${t.keywords.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [categoryFilter, searchQuery]);

  const totalTopics = currentTrack.sections.reduce((acc, s) => acc + s.topics.length, 0);
  const completedCount = currentTrack.sections.reduce(
    (acc, s) => acc + s.topics.filter((t) => Boolean(doneMap[t.id])).length,
    0
  );
  const pct = totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;

  const openNode = (sel: DrawerSelection) => {
    setDrawer(sel);
    setAiLesson(null);
    setAiError(null);
  };

  const handleAskAiLesson = async () => {
    if (!drawer) return;
    setAiBusy(true);
    setAiError(null);
    try {
      if (!getToken()) {
        const demoRes = await apiFetch<TokenResponse>("/api/v1/auth/demo", { method: "POST" });
        setAuthSession(demoRes);
        setHasAuth(true);
      }
      const topicTitle =
        drawer.kind === "topic" ? drawer.topic.label : drawer.section.title;
      const subs =
        drawer.kind === "topic"
          ? drawer.topic.subtopics.slice(0, 6).join(", ")
          : drawer.section.topics.map((t) => t.label).join(", ");
      const prompt =
        lang === "hi"
          ? `मैं "${currentTrack.title}" रोडमैप पढ़ रहा हूँ। कृपया "${topicTitle}" (${subs}) को विस्तार से समझाएं: यह क्या है, इसे 4 आसान चरणों में कैसे सीखें, एक प्रैक्टिस प्रोजेक्ट बताएं और 2 इंटरव्यू प्रश्न पूछें।`
          : `I am learning the "${currentTrack.title}" roadmap. Explain "${topicTitle}" (${subs}): (1) What it is & why it matters, (2) 4-step practical way to learn it from zero, (3) one portfolio mini-project, and (4) 2 real interview questions.`;

      const res = await apiFetch<{ reply: string }>("/api/v1/agent/chat", {
        method: "POST",
        body: JSON.stringify({ message: prompt, language: lang }),
      });
      setAiLesson(res.reply);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : tx("Could not connect to AI tutor", "AI ट्यूटर से कनेक्ट नहीं हो सका"));
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a]">
      {/* Home Navbar with Roadmaps Active */}
      <header className="sticky top-0 z-40 border-b border-[#e5e7eb] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <MedoMark size={34} className="shadow-xs" />
            <span className="text-[16.5px] font-bold tracking-tight text-[#0f172a]">Medo</span>
            <span className="rounded-md border border-[#3b5bff]/25 bg-[#3b5bff]/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-[#3b5bff]">
              {tx("ROADMAPS", "रोडमैप्स")}
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-[13px] font-medium text-[#475569] md:flex">
            <Link href="/" className="transition hover:text-[#0f172a]">
              {tx("Home", "होम")}
            </Link>
            <Link href="/roadmaps" className="font-semibold text-[#3b5bff]">
              {tx("Roadmaps", "रोडमैप्स")}
            </Link>
            <Link href="/#architecture" className="transition hover:text-[#0f172a]">
              {tx("Architecture", "आर्किटेक्चर")}
            </Link>
            <Link href="/discover" className="transition hover:text-[#0f172a]">
              {tx("Discovery", "नौकरियाँ")}
            </Link>
            <Link href="/dashboard" className="transition hover:text-[#0f172a]">
              {tx("Dashboard", "डैशबोर्ड")}
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <LanguageToggle />
            <Link
              href={hasAuth ? "/dashboard" : "/auth?mode=register"}
              className="hidden rounded-xl bg-[#0f172a] px-4 py-1.5 text-[12.5px] font-medium text-white shadow-xs transition hover:bg-[#1e293b] sm:inline-flex"
            >
              {hasAuth ? tx("Open Studio", "स्टूडियो खोलें") : tx("Start Free", "मुफ्त शुरू करें")}
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="inline-flex rounded-xl border border-[#e2e8f0] p-1.5 text-[#0f172a] md:hidden"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="border-t border-[#e5e7eb] bg-white px-6 py-3 md:hidden">
            <div className="grid grid-cols-2 gap-2 text-[13px] font-medium text-[#475569]">
              <Link href="/" className="rounded-lg px-2 py-1.5 hover:bg-[#f1f5f9]">
                {tx("Home", "होम")}
              </Link>
              <Link href="/roadmaps" className="rounded-lg px-2 py-1.5 font-semibold text-[#3b5bff] hover:bg-[#f1f5f9]">
                {tx("Roadmaps", "रोडमैप्स")}
              </Link>
              <Link href="/discover" className="rounded-lg px-2 py-1.5 hover:bg-[#f1f5f9]">
                {tx("Discovery", "नौकरियाँ")}
              </Link>
              <Link href="/dashboard" className="rounded-lg px-2 py-1.5 hover:bg-[#f1f5f9]">
                {tx("Dashboard", "डैशबोर्ड")}
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Top Track Selector Strip */}
      <section className="border-b border-[#e5e7eb] bg-white px-6 py-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#0f172a] sm:text-3xl">
                {tx("Developer & AI Career Roadmaps", "डेवलपर और AI करियर रोडमैप्स")}
              </h1>
              <p className="mt-1 text-[13.5px] text-[#475569]">
                {tx(
                  `Choose any of the ${ALL_ROADMAP_TRACKS.length} role tracks below. Click any yellow node or peach topic box in the flowchart to see full explanations, how to learn, resources & AI lessons.`,
                  `नीचे दिए गए ${ALL_ROADMAP_TRACKS.length} करियर पथों में से चुनें। सीखने का तरीका, संसाधन और AI गाइड देखने के लिए चार्ट के किसी भी बॉक्स पर क्लिक करें।`
                )}
              </p>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748b]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tx(
                  `Search ${ALL_ROADMAP_TRACKS.length} roadmaps...`,
                  `${ALL_ROADMAP_TRACKS.length} रोडमैप्स में खोजें...`
                )}
                className="w-full rounded-xl border border-[#cbd5e1] bg-[#f8fafc] py-2 pl-9 pr-3 text-[12.5px] outline-none focus:border-[#2563eb] focus:bg-white"
              />
            </div>
          </div>

          {/* Category Filter + Role Buttons */}
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: tx(`All (${ALL_ROADMAP_TRACKS.length})`, `सभी (${ALL_ROADMAP_TRACKS.length})`) },
              { id: "AI & Data", label: tx("AI & Data", "AI और डेटा") },
              { id: "Software & Mobile", label: tx("Software & Mobile", "सॉफ़्टवेयर व मोबाइल") },
              { id: "Infra & Security", label: tx("Infra & Security", "इंफ्रा व सुरक्षा") },
              { id: "Design & Product", label: tx("Design & Product", "डिज़ाइन व प्रोडक्ट") },
              { id: "Specialized", label: tx("Specialized", "विशेषज्ञ") },
            ].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryFilter(c.id)}
                className={`rounded-lg px-3 py-1 text-[11.5px] font-semibold transition ${
                  categoryFilter === c.id
                    ? "bg-[#0f172a] text-white"
                    : "bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {filteredTracks.map((tr) => {
              const active = tr.id === currentTrack.id;
              return (
                <button
                  key={tr.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(tr.id);
                    setDrawer(null);
                  }}
                  className={`inline-flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-[12.5px] font-semibold transition ${
                    active
                      ? "border-[#0f172a] bg-[#fde047] text-[#0f172a] shadow-[0_2px_0_#0f172a]"
                      : "border-[#cbd5e1] bg-white text-[#334155] hover:border-[#0f172a] hover:bg-[#fffbeb]"
                  }`}
                >
                  <span>{tx(tr.title, tr.titleHi)}</span>
                  <span className="rounded bg-[#0f172a]/10 px-1.5 py-0.5 font-mono text-[10px]">
                    {tr.sections.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Authentic roadmap.sh-Style White Canvas + Blue Spine + Yellow/Peach Boxes */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div
          className="relative overflow-hidden rounded-2xl border-2 border-[#0f172a]/15 bg-white p-5 shadow-sm sm:p-8"
          style={{
            backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        >
          {/* Top 3-Column Diagram Header (just like roadmap.sh PDFs) */}
          <div className="grid items-start gap-4 lg:grid-cols-12">
            {/* Top-Left: Related Roadmaps & Prerequisites Box */}
            <div className="rounded-xl border-2 border-[#0f172a] bg-white p-4 shadow-[0_2px_0_#0f172a] lg:col-span-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#475569]">
                {tx("Prerequisites & Related", "आवश्यक आधार और संबंधित पथ")}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(lang === "hi" ? currentTrack.prerequisitesHi : currentTrack.prerequisites).map((pre) => (
                  <span
                    key={pre}
                    className="rounded border border-[#cbd5e1] bg-[#f8fafc] px-2 py-0.5 text-[11px] font-medium text-[#334155]"
                  >
                    {pre}
                  </span>
                ))}
              </div>
              <div className="mt-3 space-y-1 border-t border-[#f1f5f9] pt-2.5">
                {currentTrack.relatedTrackIds.map((rid) => {
                  const rel = ROADMAP_BY_ID[rid];
                  if (!rel) return null;
                  return (
                    <button
                      key={rid}
                      type="button"
                      onClick={() => {
                        setSelectedId(rid);
                        setDrawer(null);
                      }}
                      className="flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-[12px] font-semibold text-[#1e293b] hover:bg-[#eff6ff] hover:text-[#2563eb]"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#4f46e5]" />
                      <span className="underline decoration-[#cbd5e1]">{tx(rel.title, rel.titleHi)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Top-Center: Track Main Title + Blue Dotted Spine Stem */}
            <div className="flex flex-col items-center justify-center py-2 text-center lg:col-span-4">
              <div className="h-6 border-l-2 border-dotted border-[#2563eb]" />
              <div className="rounded-xl border-2 border-[#0f172a] bg-white px-5 py-2.5 shadow-[0_3px_0_#0f172a]">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#2563eb]">
                  {tx(currentTrack.category, currentTrack.categoryHi)}
                </span>
                <h2 className="text-xl font-bold tracking-tight text-[#0f172a] sm:text-2xl">
                  {tx(currentTrack.title, currentTrack.titleHi)}
                </h2>
              </div>
              <p className="mt-2 max-w-xs text-[12px] text-[#475569]">
                {tx(currentTrack.shortDesc, currentTrack.shortDescHi)}
              </p>
              <div className="mt-2 h-8 border-l-2 border-[#2563eb]" />
            </div>

            {/* Top-Right: Legend & Live Progress Box (matching PDFs) */}
            <div className="rounded-xl border-2 border-[#0f172a] bg-white p-4 shadow-[0_2px_0_#0f172a] lg:col-span-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#475569]">
                  {tx("Diagram Legend & Progress", "आरेख संकेत और प्रगति")}
                </span>
                <span className="tnum rounded-md bg-[#4f46e5] px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                  {completedCount}/{totalTopics} ({pct}%)
                </span>
              </div>
              <div className="mt-2.5 space-y-1.5 text-[11.5px] font-medium text-[#334155]">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3.5 w-5 rounded border border-[#0f172a] bg-[#fde047]" />
                  <span>{tx("Yellow Box — Main Stage (Click for overview)", "पीला बॉक्स — मुख्य चरण (सारांश देखें)")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3.5 w-5 rounded border border-[#0f172a] bg-[#ffedd5]" />
                  <span>{tx("Peach Box — Topic (Click to see How to Learn)", "पीच बॉक्स — विषय (सीखने का तरीका देखें)")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[9px] text-white">
                    ✓
                  </span>
                  <span>{tx("Tick Box — Track your completed modules", "चेकमार्क — अपनी पूर्ण प्रगति ट्रैक करें")}</span>
                </div>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full border border-[#0f172a]/20 bg-[#f1f5f9]">
                <div className="h-full bg-[#4f46e5] transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>

          {/* Interactive Central Blue Spine + Alternating Left/Right Dotted Branches */}
          <div className="relative mx-auto mt-2 max-w-5xl pb-6">
            {currentTrack.sections.map((sec, sIdx) => {
              const secDone = sec.topics.filter((t) => Boolean(doneMap[t.id])).length;
              const isLastSection = sIdx === currentTrack.sections.length - 1;
              const leftTopics = sec.topics.filter((_, idx) => idx % 2 === 0);
              const rightTopics = sec.topics.filter((_, idx) => idx % 2 === 1);
              const singleColumnTopics = sec.topics.length === 1;

              return (
                <div key={sec.id} className="relative">
                  {/* Continuous Blue Spine Line behind each section */}
                  {!isLastSection && (
                    <div
                      aria-hidden="true"
                      className="absolute bottom-0 left-1/2 top-0 hidden w-[2.5px] -translate-x-1/2 bg-[#2563eb] lg:block"
                    />
                  )}

                  {/* Section Main Row: Left Branches <.. Yellow Core Node ..> Right Branches */}
                  <div className="relative z-10 grid items-center gap-4 py-5 lg:grid-cols-12">
                    {/* LEFT BRANCH TOPICS */}
                    <div className="order-2 space-y-2.5 lg:order-1 lg:col-span-4">
                      {leftTopics.map((tp) => {
                        const done = Boolean(doneMap[tp.id]);
                        return (
                          <div key={tp.id} className="relative flex items-center">
                            <button
                              type="button"
                              onClick={() => openNode({ kind: "topic", section: sec, topic: tp })}
                              className={`group w-full rounded-lg border-[1.5px] px-3.5 py-2.5 text-left transition ${
                                done
                                  ? "border-emerald-700 bg-emerald-50 shadow-[0_2px_0_#047857]"
                                  : "border-[#0f172a] bg-[#ffedd5] shadow-[0_2px_0_#0f172a] hover:-translate-y-0.5 hover:bg-[#fef08a]"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2">
                                  <span
                                    role="checkbox"
                                    aria-checked={done}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleDone(tp.id);
                                    }}
                                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition ${
                                      done
                                        ? "border-emerald-700 bg-emerald-600 text-white"
                                        : "border-[#0f172a] bg-white text-transparent hover:border-[#2563eb]"
                                    }`}
                                  >
                                    ✓
                                  </span>
                                  <span
                                    className={`text-[12.5px] font-bold leading-snug text-[#0f172a] ${
                                      done ? "line-through decoration-emerald-700/60" : ""
                                    }`}
                                  >
                                    {tx(tp.label, tp.labelHi)}
                                  </span>
                                </div>
                              </div>
                              {/* Inner cream/white sub-boxes like PDF */}
                              <div className="mt-2 flex flex-wrap gap-1">
                                {tp.subtopics.slice(0, 4).map((sub) => (
                                  <span
                                    key={sub}
                                    className="rounded border border-[#0f172a]/35 bg-white/95 px-1.5 py-0.5 text-[10.5px] font-medium text-[#1e293b]"
                                  >
                                    {sub}
                                  </span>
                                ))}
                              </div>
                              {tp.resources[0] && (
                                <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold text-[#4f46e5]">
                                  <span className="truncate">{tp.resources[0].title}</span>
                                  <span className="shrink-0">{tx("How to learn →", "तरीका देखें →")}</span>
                                </div>
                              )}
                            </button>
                            {/* Dotted Blue Connector Line to Center Yellow Node */}
                            <div
                              aria-hidden="true"
                              className="hidden h-0 w-6 shrink-0 border-t-2 border-dotted border-[#2563eb] lg:block"
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* CENTER SPINE: YELLOW MAIN MILESTONE BOX */}
                    <div className="order-1 flex flex-col items-center lg:order-2 lg:col-span-4">
                      <button
                        type="button"
                        onClick={() => openNode({ kind: "section", section: sec })}
                        className="group relative w-full max-w-xs rounded-lg border-2 border-[#0f172a] bg-[#fde047] px-4 py-3 text-center shadow-[0_3px_0_#0f172a] transition hover:-translate-y-0.5 hover:bg-[#fef08a]"
                      >
                        <span className="absolute -left-2.5 -top-2.5 flex h-6 w-6 items-center justify-center rounded-md border-2 border-[#0f172a] bg-[#0f172a] font-mono text-[10.5px] font-bold text-white">
                          {sec.order}
                        </span>
                        <div className="text-[14px] font-bold tracking-tight text-[#0f172a]">
                          {tx(sec.title, sec.titleHi)}
                        </div>
                        <div className="mt-0.5 text-[11px] font-medium text-[#334155]">
                          {tx(sec.tagline, sec.taglineHi)}
                        </div>
                        <div className="mt-2 inline-flex items-center gap-2 font-mono text-[10px] font-bold text-[#0f172a]/80">
                          <span className="rounded bg-white/80 px-1.5 py-0.5">
                            {secDone}/{sec.topics.length} {tx("done", "पूर्ण")}
                          </span>
                          <span>·</span>
                          <span>{sec.estimatedWeeks}</span>
                          <span>·</span>
                          <span className="text-[#1d4ed8] group-hover:underline">{tx("Details →", "विवरण →")}</span>
                        </div>
                      </button>

                      {/* Blue downward arrow indicator between sections */}
                      {!isLastSection && (
                        <div className="mt-3 hidden flex-col items-center lg:flex">
                          <div className="h-5 w-[2.5px] bg-[#2563eb]" />
                          <div className="h-2.5 w-2.5 -translate-y-1.5 rotate-45 border-b-[2.5px] border-r-[2.5px] border-[#2563eb]" />
                        </div>
                      )}
                    </div>

                    {/* RIGHT BRANCH TOPICS */}
                    <div className="order-3 space-y-2.5 lg:col-span-4">
                      {rightTopics.map((tp) => {
                        const done = Boolean(doneMap[tp.id]);
                        return (
                          <div key={tp.id} className="relative flex items-center">
                            {/* Dotted Blue Connector Line from Center Yellow Node */}
                            <div
                              aria-hidden="true"
                              className="hidden h-0 w-6 shrink-0 border-t-2 border-dotted border-[#2563eb] lg:block"
                            />
                            <button
                              type="button"
                              onClick={() => openNode({ kind: "topic", section: sec, topic: tp })}
                              className={`group w-full rounded-lg border-[1.5px] px-3.5 py-2.5 text-left transition ${
                                done
                                  ? "border-emerald-700 bg-emerald-50 shadow-[0_2px_0_#047857]"
                                  : "border-[#0f172a] bg-[#ffedd5] shadow-[0_2px_0_#0f172a] hover:-translate-y-0.5 hover:bg-[#fef08a]"
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <span
                                  role="checkbox"
                                  aria-checked={done}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleDone(tp.id);
                                  }}
                                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition ${
                                    done
                                      ? "border-emerald-700 bg-emerald-600 text-white"
                                      : "border-[#0f172a] bg-white text-transparent hover:border-[#2563eb]"
                                  }`}
                                >
                                  ✓
                                </span>
                                <span
                                  className={`text-[12.5px] font-bold leading-snug text-[#0f172a] ${
                                    done ? "line-through decoration-emerald-700/60" : ""
                                  }`}
                                >
                                  {tx(tp.label, tp.labelHi)}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1">
                                {tp.subtopics.slice(0, 4).map((sub) => (
                                  <span
                                    key={sub}
                                    className="rounded border border-[#0f172a]/35 bg-white/95 px-1.5 py-0.5 text-[10.5px] font-medium text-[#1e293b]"
                                  >
                                    {sub}
                                  </span>
                                ))}
                              </div>
                              {tp.resources[0] && (
                                <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold text-[#4f46e5]">
                                  <span className="truncate">{tp.resources[0].title}</span>
                                  <span className="shrink-0">{tx("How to learn →", "तरीका देखें →")}</span>
                                </div>
                              )}
                            </button>
                          </div>
                        );
                      })}

                      {/* Helpful hint card when a stage has 1 core branch so diagram looks balanced */}
                      {singleColumnTopics && (
                        <div className="hidden items-center lg:flex">
                          <div className="h-0 w-6 shrink-0 border-t-2 border-dotted border-[#2563eb]" />
                          <div className="w-full rounded-lg border border-dashed border-[#94a3b8] bg-[#f8fafc]/90 px-3.5 py-2.5 text-[11.5px] text-[#475569]">
                            <div className="font-semibold text-[#0f172a]">{tx("How to Master This Stage", "सीखने का तरीका")}</div>
                            <div className="mt-1 line-clamp-2">
                              {lang === "hi" ? sec.howToMasterHi[0] : sec.howToMaster[0]}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Bottom Continue Learning Box (Purple roadmap.sh Buttons) */}
            <div className="mt-6 flex flex-col items-center">
              <div className="h-6 border-l-2 border-dotted border-[#2563eb]" />
              <div className="w-full max-w-xl rounded-xl border-2 border-[#0f172a] bg-white p-5 text-center shadow-[0_3px_0_#0f172a]">
                <div className="text-[12.5px] font-bold text-[#0f172a]">
                  {tx("Keep Learning — Explore Related Tracks or Open Your Studio", "सीखना जारी रखें — संबंधित रोडमैप या स्टूडियो खोलें")}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  {currentTrack.relatedTrackIds.map((rid) => {
                    const rel = ROADMAP_BY_ID[rid];
                    if (!rel) return null;
                    return (
                      <button
                        key={rid}
                        type="button"
                        onClick={() => {
                          setSelectedId(rid);
                          setDrawer(null);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="rounded-lg bg-[#4f46e5] px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#4338ca]"
                      >
                        {tx(rel.title, rel.titleHi)}
                      </button>
                    );
                  })}
                  <Link
                    href="/roadmap"
                    className="rounded-lg border border-[#0f172a] bg-[#fde047] px-3.5 py-1.5 text-[12px] font-bold text-[#0f172a] hover:bg-[#fef08a]"
                  >
                    {tx("Track in My Career Studio →", "मेरे स्टूडियो रोडमैप में खोलें →")}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Slide-Over Learning Drawer when Clicking Any Box */}
      {drawer && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-xs"
          onClick={() => setDrawer(null)}
        >
          <div
            className="flex h-full w-full max-w-xl flex-col border-l-2 border-[#0f172a] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-start justify-between gap-3 border-b-2 border-[#0f172a] bg-[#fde047] p-5 text-[#0f172a]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[#0f172a] px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                    {drawer.kind === "topic"
                      ? `${tx("STAGE", "चरण")} 0${drawer.section.order} · ${tx("TOPIC GUIDE", "विषय विवरण")}`
                      : `${tx("STAGE", "चरण")} 0${drawer.section.order} · ${tx("STAGE OVERVIEW", "चरण सारांश")}`}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[#334155]">
                    <Clock className="h-3 w-3" /> {drawer.section.estimatedWeeks}
                  </span>
                </div>
                <h3 className="mt-2 text-xl font-bold tracking-tight text-[#0f172a]">
                  {drawer.kind === "topic"
                    ? tx(drawer.topic.label, drawer.topic.labelHi)
                    : tx(drawer.section.title, drawer.section.titleHi)}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {drawer.kind === "topic" && (
                  <button
                    type="button"
                    onClick={() => toggleDone(drawer.topic.id)}
                    className={`inline-flex items-center gap-1 rounded-lg border-2 border-[#0f172a] px-3 py-1.5 text-[11.5px] font-bold transition ${
                      doneMap[drawer.topic.id] ? "bg-emerald-500 text-white" : "bg-white text-[#0f172a] hover:bg-slate-100"
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {doneMap[drawer.topic.id] ? tx("Completed", "पूर्ण") : tx("Mark Done", "पूर्ण चिह्नित करें")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDrawer(null)}
                  className="rounded-lg border-2 border-[#0f172a] bg-white p-1.5 text-[#0f172a] hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Drawer Scrollable Body */}
            <div className="thin-scroll flex-1 space-y-5 overflow-y-auto p-6">
              {/* What It Is */}
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[#2563eb]">
                  <BookOpen className="h-3.5 w-3.5" />
                  {tx("Description — What It Is & Why It Matters", "विवरण — यह क्या है और क्यों ज़रूरी है")}
                </div>
                <p className="text-[13.5px] leading-relaxed text-[#1e293b]">
                  {drawer.kind === "topic"
                    ? tx(drawer.topic.summary, drawer.topic.summaryHi)
                    : tx(drawer.section.description, drawer.section.descriptionHi)}
                </p>
              </div>

              {/* Subtopics / Topics inside Section */}
              {drawer.kind === "topic" ? (
                <div>
                  <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-[#475569]">
                    {tx("Key Concepts in This Node", "इस विषय के मुख्य भाग")}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {drawer.topic.subtopics.map((sub) => (
                      <span
                        key={sub}
                        className="rounded-md border border-[#0f172a]/30 bg-[#ffedd5] px-2.5 py-1 text-[12px] font-semibold text-[#0f172a]"
                      >
                        {sub}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-[#475569]">
                    {tx("Topics Inside This Stage (Click any to learn)", "इस चरण के विषय (सीखने के लिए क्लिक करें)")}
                  </div>
                  <div className="space-y-2">
                    {drawer.section.topics.map((tp) => (
                      <button
                        key={tp.id}
                        type="button"
                        onClick={() => openNode({ kind: "topic", section: drawer.section, topic: tp })}
                        className="flex w-full items-center justify-between rounded-lg border-[1.5px] border-[#0f172a] bg-[#ffedd5] px-3.5 py-2.5 text-left text-[13px] font-bold text-[#0f172a] transition hover:bg-[#fde047]"
                      >
                        <span>{tx(tp.label, tp.labelHi)}</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* How To Learn Step-by-Step */}
              <div className="rounded-xl border-2 border-[#0f172a] bg-[#f8fafc] p-4">
                <div className="mb-3 flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[#0f172a]">
                  <GraduationCap className="h-4 w-4 text-[#2563eb]" />
                  {tx("How to Learn (Step-by-Step Guide)", "कैसे सीखें (चरण-दर-चरण तरीका)")}
                </div>
                <ol className="space-y-2.5">
                  {(drawer.kind === "topic"
                    ? lang === "hi"
                      ? drawer.topic.howToLearnHi
                      : drawer.topic.howToLearn
                    : lang === "hi"
                      ? drawer.section.howToMasterHi
                      : drawer.section.howToMaster
                  ).map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-[#1e293b]">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2563eb] font-mono text-[10.5px] font-bold text-white">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>

                {drawer.kind === "topic" && drawer.topic.projectIdea && (
                  <div className="mt-3.5 border-t border-[#cbd5e1] pt-3">
                    <div className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-emerald-700">
                      {tx("Hands-On Practice Project", "अभ्यास प्रोजेक्ट")}
                    </div>
                    <p className="mt-1 text-[12.5px] font-semibold text-[#0f172a]">
                      {tx(drawer.topic.projectIdea, drawer.topic.projectIdeaHi || drawer.topic.projectIdea)}
                    </p>
                  </div>
                )}
              </div>

              {/* Resources List */}
              {drawer.kind === "topic" && drawer.topic.resources.length > 0 && (
                <div>
                  <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-[#475569]">
                    {tx("Courses, Books, Papers & Tutorials", "कोर्स, किताबें, पेपर्स और ट्यूटोरियल")}
                  </div>
                  <div className="space-y-2">
                    {drawer.topic.resources.map((res, ri) => (
                      <div
                        key={ri}
                        className="flex items-center justify-between gap-2 rounded-lg border border-[#cbd5e1] bg-white px-3.5 py-2.5 text-[12.5px]"
                      >
                        <span className="font-semibold text-[#0f172a]">{res.title}</span>
                        <span
                          className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] font-bold ${
                            RESOURCE_PILL[res.kind] || "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {res.kind}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Live Ollama AI Teacher inside Drawer */}
              <div className="space-y-3 border-t border-[#e2e8f0] pt-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleAskAiLesson}
                    disabled={aiBusy}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#2563eb] px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-xs transition hover:bg-[#1d4ed8] disabled:opacity-60"
                  >
                    {aiBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
                    {aiBusy
                      ? tx("Preparing AI Lesson...", "AI पाठ बना रहा है...")
                      : tx("Explain Deeper & Give Practice Plan (AI)", "AI से विस्तार से समझें व अभ्यास प्लान पाएँ")}
                  </button>
                  <Link
                    href={`/discover?q=${encodeURIComponent(
                      drawer.kind === "topic"
                        ? drawer.topic.subtopics[0] || drawer.topic.label
                        : currentTrack.keywords[0] || currentTrack.title
                    )}`}
                    className="inline-flex items-center gap-1 rounded-xl border border-[#cbd5e1] bg-white px-3.5 py-2.5 text-[12.5px] font-semibold text-[#0f172a] hover:bg-[#f8fafc]"
                  >
                    {tx("Find Jobs", "नौकरियाँ खोजें")} <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {aiError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                    {aiError}
                  </div>
                )}

                {aiLesson && (
                  <div className="rounded-xl border-2 border-[#2563eb]/30 bg-[#eff6ff]/70 p-4">
                    <div className="mb-2 flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-[#2563eb]">
                      <Sparkles className="h-3.5 w-3.5" /> {tx("AI Tutor Guide", "AI शिक्षक मार्गदर्शिका")}
                    </div>
                    <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#0f172a]">{aiLesson}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
