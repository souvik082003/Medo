"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Compass,
  Copy,
  FileText,
  GitBranch,
  Layers,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import { StudioShell } from "@/components/StudioShell";
import { Banner, StatTile } from "@/components/ui";
import { apiFetch, ApplicationItem, ProfileBundle, RecommendationItem } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

const CHECKLIST_STORAGE_KEY = "medo_roadmap_checks_v1";
const AI_PLAN_STORAGE_KEY = "medo_roadmap_ai_plan_v1";

interface RoadmapTask {
  id: string;
  label: string;
  hint: string;
  autoDone?: boolean;
  href?: string;
  cta?: string;
}

interface RoadmapPhase {
  id: string;
  num: string;
  title: string;
  subtitle: string;
  accent: string;
  tasks: RoadmapTask[];
}

interface AgentPlanPayload {
  conversation_id: string;
  reply: string;
  plan?: string[];
  generated_at: string;
}

function ReadinessRing({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ - (clamped / 100) * circ;
  const stroke = clamped >= 75 ? "#10b981" : clamped >= 45 ? "#3b5bff" : "#f59e0b";

  return (
    <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
      <svg className="h-24 w-24 -rotate-90" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="7" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center text-center">
        <span className="tnum font-mono text-xl font-bold leading-none text-white">{clamped}%</span>
        <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-slate-300">{label}</span>
      </div>
    </div>
  );
}

export default function RoadmapPage() {
  const { lang, tx } = useLanguage();
  const [bundle, setBundle] = useState<ProfileBundle | null>(null);
  const [recs, setRecs] = useState<RecommendationItem[]>([]);
  const [apps, setApps] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({
    foundation: true,
    skills: true,
    alignment: true,
    execution: true,
  });
  const [activeStageFocus, setActiveStageFocus] = useState<string>("all");
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [aiPlan, setAiPlan] = useState<AgentPlanPayload | null>(null);
  const [copiedPlan, setCopiedPlan] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const savedChecks = localStorage.getItem(CHECKLIST_STORAGE_KEY);
      if (savedChecks) setChecks(JSON.parse(savedChecks) as Record<string, boolean>);
      const savedPlan = localStorage.getItem(AI_PLAN_STORAGE_KEY);
      if (savedPlan) setAiPlan(JSON.parse(savedPlan) as AgentPlanPayload);
    } catch {
      // Ignore malformed local storage state
    }

    Promise.all([
      apiFetch<ProfileBundle>("/api/v1/profile"),
      apiFetch<{ items: RecommendationItem[] }>("/api/v1/recommendations?refresh=false&limit=20").catch(() => ({
        items: [],
      })),
      apiFetch<{ items: ApplicationItem[] }>("/api/v1/applications?limit=25").catch(() => ({ items: [] })),
    ])
      .then(([b, r, a]) => {
        setBundle(b);
        setRecs(r.items);
        setApps(a.items);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load roadmap data"))
      .finally(() => setLoading(false));
  }, []);

  const toggleCheck = (taskId: string, currentlyDone: boolean) => {
    setChecks((prev) => {
      const next = { ...prev, [taskId]: !currentlyDone };
      try {
        localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage write failure
      }
      return next;
    });
  };

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) => ({ ...prev, [phaseId]: !prev[phaseId] }));
  };

  const skills = bundle?.skills || [];
  const roles = bundle?.preferences?.preferred_roles || [];
  const regions = bundle?.preferences?.preferred_regions || [];
  const workModes = bundle?.preferences?.work_modes || [];
  const resumes = bundle?.resumes || [];
  const completeness = Math.round((bundle?.profile?.completeness_score || 0) * 100);

  const skillsByCategory = useMemo(() => {
    const map: Record<string, typeof skills> = {};
    for (const sk of skills) {
      const cat = sk.category || "general";
      if (!map[cat]) map[cat] = [];
      map[cat].push(sk);
    }
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [skills]);

  const rankedGaps = useMemo(() => {
    const freq: Record<string, number> = {};
    for (const r of recs) {
      for (const gap of r.missing_skills) {
        freq[gap] = (freq[gap] || 0) + 1;
      }
    }
    return Object.entries(freq)
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count);
  }, [recs]);

  const missingTop = rankedGaps.slice(0, 8);
  const interviewCount = apps.filter((a) =>
    ["phone_screen", "hr_interview", "hm_interview", "final_round"].includes(a.status)
  ).length;
  const offerCount = apps.filter((a) => a.status === "offer").length;
  const appliedCount = apps.filter((a) => a.status === "applied").length;
  const draftCount = apps.filter((a) => ["draft", "shortlisted"].includes(a.status)).length;

  const phases: RoadmapPhase[] = useMemo(
    () => [
      {
        id: "foundation",
        num: "01",
        title: tx("Foundation · Identity, Resume & Preferences", "चरण 01 · पहचान, रिज्यूमे और प्राथमिकताएँ"),
        subtitle: tx(
          "Establish your verified skill inventory, target titles, work modes, and salary floor.",
          "अपने सत्यापित कौशल, पसंदीदा पद, कार्य मोड और न्यूनतम वेतन लक्ष्य निर्धारित करें।"
        ),
        accent: "bg-[#3b5bff]/10 text-[#3b5bff]",
        tasks: [
          {
            id: "f_resume",
            label: tx("Upload & parse primary resume", "मुख्य रिज्यूमे अपलोड और पार्स करें"),
            hint:
              resumes.length > 0
                ? tx(
                    `${resumes.length} version(s) indexed · ${skills.length} skills extracted.`,
                    `${resumes.length} वर्जन इंडेक्स · ${skills.length} कौशल निकाले गए।`
                  )
                : tx("Upload PDF/DOCX/MD in Resume Studio for semantic indexing.", "वेक्टर इंडेक्सिंग के लिए रिज्यूमे स्टूडियो में फ़ाइल अपलोड करें।"),
            autoDone: resumes.length > 0 && skills.length > 0,
            href: "/resume",
            cta: tx("Resume Studio", "रिज्यूमे स्टूडियो"),
          },
          {
            id: "f_prefs",
            label: tx("Configure target roles & region filters", "लक्षित पद और क्षेत्र फ़िल्टर सेट करें"),
            hint:
              roles.length > 0
                ? tx(
                    `Targeting ${roles.slice(0, 3).join(", ")} (${regions.join(", ") || "GLOBAL"}).`,
                    `लक्षित पद: ${roles.slice(0, 3).join(", ")} (${regions.join(", ") || "ग्लोबल"})।`
                  )
                : tx("Set desired titles, locations, and minimum compensation.", "पसंदीदा पद, स्थान और वेतन सीमा दर्ज करें।"),
            autoDone: roles.length > 0,
            href: "/profile",
            cta: tx("Preferences", "प्राथमिकताएँ"),
          },
          {
            id: "f_goals",
            label: tx("Define clear career north-star objective", "करियर का मुख्य उद्देश्य स्पष्ट करें"),
            hint: bundle?.preferences?.career_goals
              ? bundle.preferences.career_goals
              : tx("Add a short 2-line goal statement for tailored AI coaching.", "सटीक AI मार्गदर्शन के लिए 2-पंक्ति का करियर लक्ष्य जोड़ें।"),
            autoDone: Boolean(bundle?.preferences?.career_goals?.trim()),
            href: "/profile",
            cta: tx("Edit Goal", "लक्ष्य बदलें"),
          },
        ],
      },
      {
        id: "skills",
        num: "02",
        title: tx("Capability Sprint · Close High-Impact Skill Gaps", "चरण 02 · कौशल उन्नयन और अंतर पूर्ति"),
        subtitle: tx(
          "Prioritize missing market competencies by frequency across real matched openings.",
          "लाइव नौकरियों में माँग के आधार पर महत्वपूर्ण कौशल कमियाँ दूर करें।"
        ),
        accent: "bg-amber-500/12 text-amber-700",
        tasks: [
          {
            id: "s_audit",
            label: tx("Benchmark your stack against live openings", "लाइव नौकरियों से अपने कौशल की तुलना करें"),
            hint:
              recs.length > 0
                ? tx(
                    `Evaluated against ${recs.length} compatible live openings.`,
                    `${recs.length} संगत लाइव नौकरियों पर मूल्यांकन पूरा।`
                  )
                : tx("Run ML Matches to surface missing market requirements.", "लापता कौशल खोजने के लिए ML मैच चलाएँ।"),
            autoDone: recs.length > 0,
            href: "/skills",
            cta: tx("Skill Gaps", "कौशल अंतर"),
          },
          {
            id: "s_core_gap",
            label:
              missingTop.length > 0
                ? tx(
                    `Upskill & build proof in: ${missingTop
                      .slice(0, 3)
                      .map((g) => g.skill)
                      .join(", ")}`,
                    `इन कौशलों पर काम करें: ${missingTop
                      .slice(0, 3)
                      .map((g) => g.skill)
                      .join(", ")}`
                  )
                : tx("Complete focused fundamentals & mini-project sprint", "मुख्य तकनीकी आधार और मिनी-प्रोजेक्ट पूरा करें"),
            hint: tx(
              "Build one demonstrable GitHub project or sandbox artifact per priority skill.",
              "प्रत्येक मुख्य कौशल के लिए एक व्यावहारिक प्रोजेक्ट या प्रमाण तैयार करें।"
            ),
            href: "/roadmaps",
            cta: tx("Visual Role Maps", "विज़ुअल रोडमैप्स"),
          },
          {
            id: "s_resync",
            label: tx("Update resume bullets & refresh embeddings", "रिज्यूमे बुलेट्स अपडेट कर पुनः स्कोर करें"),
            hint: tx(
              "Include measurable outcomes after closing each gap to boost your compatibility rank.",
              "नए कौशल सीखने के बाद रिज्यूमे अपडेट करके बेहतर मैच रैंकिंग पाएँ।"
            ),
            href: "/resume",
            cta: tx("Update Resume", "रिज्यूमे अपडेट"),
          },
        ],
      },
      {
        id: "alignment",
        num: "03",
        title: tx("Target Alignment · Discovery, Fit & Pitch Tailoring", "चरण 03 · सटीक खोज, मिलान और रिज्यूमे पिच"),
        subtitle: tx(
          "Filter live market roles by description & area, inspect compatibility scores, and tailor pitches.",
          "एरिया व विवरण खोज से उपयुक्त नौकरियाँ चुनें, फिट स्कोर जांचें और पिच तैयार करें।"
        ),
        accent: "bg-indigo-500/12 text-indigo-700",
        tasks: [
          {
            id: "a_discover",
            label: tx("Shortlist high-fit live roles via Hybrid Search", "हाइब्रिड खोज से शीर्ष उपयुक्त नौकरियाँ चुनें"),
            hint: tx(
              "Use Exact-in-JD + Area dropdown filters to isolate the best openings.",
              "सटीक परिणामों के लिए JD खोज और एरिया फ़िल्टर का उपयोग करें।"
            ),
            autoDone: recs.some((r) => r.compatibility_probability >= 0.65),
            href: "/discover",
            cta: tx("Job Discovery", "नौकरी खोज"),
          },
          {
            id: "a_pitch",
            label: tx("Generate tailored pitches & AI explanations", "AI संगतता व्याख्या और पिच तैयार करें"),
            hint: tx(
              "Open any role brief and click AI Explain or AI Prep before applying.",
              "आवेदन से पहले किसी भी नौकरी का विवरण खोलें और AI व्याख्या देखें।"
            ),
            href: recs[0] ? `/jobs/${recs[0].job.id}` : "/recommendations",
            cta: tx("Inspect Top Match", "शीर्ष मैच देखें"),
          },
        ],
      },
      {
        id: "execution",
        num: "04",
        title: tx("Execution Loop · Applications & Interview Readiness", "चरण 04 · आवेदन पाइपलाइन और इंटरव्यू तैयारी"),
        subtitle: tx(
          "Track every stage with discipline, drill core technical & behavioral rounds, and close offers.",
          "हर आवेदन चरण को ट्रैक करें, तकनीकी व बिहेवियरल राउंड का अभ्यास करें और ऑफ़र पाएं।"
        ),
        accent: "bg-emerald-500/12 text-emerald-700",
        tasks: [
          {
            id: "e_track",
            label: tx("Track active applications in Kanban Pipeline", "कैनबन पाइपलाइन में आवेदन ट्रैक करें"),
            hint:
              apps.length > 0
                ? tx(
                    `${apps.length} role(s) tracked (${interviewCount} interviewing, ${offerCount} offers).`,
                    `${apps.length} आवेदन ट्रैक (${interviewCount} साक्षात्कार, ${offerCount} ऑफ़र)।`
                  )
                : tx("Move shortlisted roles into Saved, Applied, and Interviewing.", "चुनी गई नौकरियों को पाइपलाइन में ट्रैक करना शुरू करें।"),
            autoDone: apps.length > 0,
            href: "/tracker",
            cta: tx("Open Tracker", "पाइपलाइन खोलें"),
          },
          {
            id: "e_mock_tech",
            label: tx("Practice role-specific technical & coding rounds", "पद-आधारित तकनीकी और कोडिंग अभ्यास"),
            hint: tx(
              "Run timed problem solving, architecture trade-offs, and API/UI debugging drills.",
              "समस्या-समाधान, सिस्टम डिज़ाइन और कोडिंग अभ्यास सत्र पूरे करें।"
            ),
            href: "/assistant",
            cta: tx("Mock Interview", "मॉक इंटरव्यू"),
          },
          {
            id: "e_behavioral",
            label: tx("Prepare STAR impact stories from resume projects", "प्रोजेक्ट्स पर आधारित STAR उत्तर तैयार करें"),
            hint: tx(
              "Quantify challenges, decisions, tradeoffs, and outcomes for hiring manager loops.",
              "प्रोजेक्ट के प्रभाव, निर्णयों और परिणामों के लिए स्पष्ट उदाहरण तैयार रखें।"
            ),
            href: "/assistant",
            cta: tx("Prep Stories", "कहानियाँ बनाएँ"),
          },
        ],
      },
    ],
    [tx, resumes.length, skills.length, roles, regions, bundle?.preferences?.career_goals, recs, missingTop, apps.length, interviewCount, offerCount]
  );

  const isTaskDone = (task: RoadmapTask) => {
    if (task.id in checks) return checks[task.id];
    return Boolean(task.autoDone);
  };

  const phaseMetrics = useMemo(() => {
    return phases.map((p) => {
      const done = p.tasks.filter(isTaskDone).length;
      const total = p.tasks.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      return { id: p.id, done, total, pct };
    });
  }, [phases, checks]);

  const totalTasks = phaseMetrics.reduce((acc, m) => acc + m.total, 0);
  const completedTasks = phaseMetrics.reduce((acc, m) => acc + m.done, 0);
  const overallPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const visiblePhases =
    activeStageFocus === "all" ? phases : phases.filter((p) => p.id === activeStageFocus);

  const handleGenerateAiBlueprint = async () => {
    setGeneratingPlan(true);
    setError(null);
    setMsg(null);
    try {
      const roleSummary = roles.length ? roles.join(", ") : "Software / AI Engineer";
      const ownedList = skills.slice(0, 12).map((s) => s.canonical_name).join(", ") || "core programming";
      const gapList = missingTop.map((g) => g.skill).join(", ") || "system design, testing, deployment";
      const prompt =
        lang === "hi"
          ? `मेरे प्रोफ़ाइल (लक्षित पद: ${roleSummary}; मौजूदा कौशल: ${ownedList}; प्रमुख कमियाँ: ${gapList}) के लिए एक संरचित 4-सप्ताह का करियर और इंटरव्यू तैयारी रोडमैप बनाएं — जिसमें हर सप्ताह के विषय, अभ्यास प्रोजेक्ट और इंटरव्यू तैयारी के स्पष्ट कदम हों।`
          : `Build a structured 4-week execution career roadmap for target role(s): ${roleSummary}. Verified skills: ${ownedList}. Priority market gaps: ${gapList}. Break it down cleanly into Week 1, Week 2, Week 3, and Week 4 with concrete learning goals, one practical portfolio deliverable, and interview drills.`;

      const res = await apiFetch<AgentPlanPayload & { thread_id?: string }>("/api/v1/agent/chat", {
        method: "POST",
        body: JSON.stringify({
          message: prompt,
          language: lang,
        }),
      });
      const payload: AgentPlanPayload = {
        conversation_id: res.conversation_id,
        reply: res.reply,
        plan: res.plan || [],
        generated_at: new Date().toISOString(),
      };
      setAiPlan(payload);
      try {
        localStorage.setItem(AI_PLAN_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Ignore storage write error
      }
      setMsg(tx("Generated personalized 4-week AI blueprint.", "व्यक्तिगत 4-सप्ताह का AI रोडमैप तैयार किया गया।"));
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Could not generate AI blueprint", "AI रोडमैप नहीं बन सका"));
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleCopyBlueprint = () => {
    const lines = [
      `# Medo Career Roadmap (${roles.join(", ") || "Target Track"})`,
      `Overall Readiness: ${overallPct}% (${completedTasks}/${totalTasks} milestones)`,
      "",
      ...phases.flatMap((p) => [
        `## ${p.title}`,
        ...p.tasks.map((t) => `- [${isTaskDone(t) ? "x" : " "}] ${t.label} — ${t.hint}`),
        "",
      ]),
    ];
    if (aiPlan?.reply) {
      lines.push("## AI 4-Week Study Blueprint", aiPlan.reply);
    }
    navigator.clipboard?.writeText(lines.join("\n")).catch(() => {});
    setCopiedPlan(true);
    setTimeout(() => setCopiedPlan(false), 1800);
  };

  return (
    <StudioShell
      title={tx("Career Roadmap", "करियर रोडमैप")}
      subtitle={tx(
        "Structured multi-phase execution architecture grounded in your skills, market gaps, and pipeline",
        "आपके कौशल, बाज़ार माँग और आवेदन पाइपलाइन पर आधारित बहु-चरणीय करियर संरचना"
      )}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/roadmaps"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0f172a] hover:border-[#cbd5e1]"
          >
            <Compass className="h-3.5 w-3.5 text-[#3b5bff]" />
            {tx("Visual Skill Maps", "रोडमैप्स (30)")}
          </Link>
          <button
            type="button"
            onClick={handleCopyBlueprint}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0f172a] hover:border-[#cbd5e1]"
          >
            {copiedPlan ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-[#3b5bff]" />}
            {copiedPlan ? tx("Copied", "कॉपी हो गया") : tx("Export MD", "एक्सपोर्ट MD")}
          </button>
          <button
            type="button"
            onClick={handleGenerateAiBlueprint}
            disabled={generatingPlan}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#3b5bff] px-3.5 py-1.5 text-[12px] font-medium text-white shadow-xs transition hover:bg-[#2948eb] disabled:opacity-60"
          >
            {generatingPlan ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {generatingPlan ? tx("Generating...", "तैयार हो रहा है...") : tx("Generate AI 4-Week Plan", "AI 4-सप्ताह योजना बनाएं")}
          </button>
        </div>
      }
    >
      {error && <Banner tone="error" message={error} onClose={() => setError(null)} className="mb-4" />}
      {msg && <Banner tone="success" message={msg} onClose={() => setMsg(null)} className="mb-4" />}

      {/* Executive Structural Hero Banner */}
      <div className="mb-5 overflow-hidden rounded-2xl border border-[#1e293b] bg-gradient-to-br from-[#0f172a] via-[#172038] to-[#283066] p-6 text-white shadow-lg">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-5">
            <ReadinessRing pct={overallPct} label={tx("Ready", "तैयारी")} />
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-indigo-200">
                <Compass className="h-3 w-3" />
                {tx("CAREER EXECUTION ARCHITECTURE", "करियर निष्पादन संरचना")}
              </div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {roles.length > 0
                  ? roles.slice(0, 2).join(" · ")
                  : tx("Define Your Target Engineering Track", "अपना लक्षित इंजीनियरिंग पथ चुनें")}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-300">
                <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11px]">
                  {regions.length > 0 ? regions.join(" · ") : "GLOBAL"}
                </span>
                <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11px] capitalize">
                  {workModes.length > 0 ? workModes.join(" / ") : "Remote / Hybrid"}
                </span>
                <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-mono text-[11px] text-emerald-200">
                  {completedTasks}/{totalTasks} {tx("milestones done", "चरण पूर्ण")}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
            <Link
              href="/profile"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-[12px] font-medium text-white backdrop-blur-xs transition hover:bg-white/20"
            >
              {tx("Edit Track", "पथ बदलें")}
            </Link>
            <Link
              href="/assistant"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-[12px] font-semibold text-[#0f172a] shadow-sm transition hover:bg-slate-100"
            >
              <Bot className="h-3.5 w-3.5 text-[#3b5bff]" /> {tx("Coach in Orchestrator", "AI कोच से जुड़ें")}
            </Link>
          </div>
        </div>

        <div className="mt-6 border-t border-white/10 pt-5">
          <div className="mb-2.5 flex items-center justify-between text-[11px] text-slate-300">
            <span className="font-mono uppercase tracking-wider">
              {tx("Pipeline Dependency Graph (Click to filter phase)", "चरण निर्भरता मानचित्र (फ़िल्टर करने के लिए क्लिक करें)")}
            </span>
            {activeStageFocus !== "all" && (
              <button
                type="button"
                onClick={() => setActiveStageFocus("all")}
                className="font-medium text-indigo-300 hover:text-white hover:underline"
              >
                {tx("Show all phases", "सभी चरण दिखाएँ")}
              </button>
            )}
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {phases.map((p, idx) => {
              const m = phaseMetrics[idx];
              const isSelected = activeStageFocus === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveStageFocus(isSelected ? "all" : p.id)}
                  className={`group relative rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? "border-indigo-400 bg-white/15 ring-2 ring-indigo-400/30"
                      : "border-white/10 bg-white/[0.06] hover:border-white/25 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10.5px] font-bold text-indigo-300">PHASE {p.num}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                        m.pct === 100
                          ? "bg-emerald-500/20 text-emerald-300"
                          : m.pct > 0
                            ? "bg-amber-400/20 text-amber-200"
                            : "bg-white/10 text-slate-300"
                      }`}
                    >
                      {m.done}/{m.total}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[12.5px] font-semibold text-white">
                    {p.title.split("·")[0].trim()}
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all ${m.pct === 100 ? "bg-emerald-400" : "bg-indigo-400"}`}
                      style={{ width: `${m.pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top 4 Live Telemetry Tiles */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={tx("Roadmap Completion", "रोडमैप प्रगति")}
          value={`${overallPct}%`}
          hint={tx(`${completedTasks} of ${totalTasks} structured tasks`, `${totalTasks} में से ${completedTasks} कार्य पूर्ण`)}
          icon={GitBranch}
          accent="indigo"
          loading={loading}
        />
        <StatTile
          label={tx("Verified Skills", "सत्यापित कौशल")}
          value={skills.length}
          hint={tx(`Across ${skillsByCategory.length || 1} skill categories`, `${skillsByCategory.length || 1} श्रेणियों में`)}
          icon={Layers}
          accent="emerald"
          loading={loading}
          href="/resume"
        />
        <StatTile
          label={tx("Priority Market Gaps", "प्रमुख कौशल कमियाँ")}
          value={rankedGaps.length}
          hint={
            missingTop[0]
              ? tx(`Top demand: ${missingTop[0].skill}`, `शीर्ष माँग: ${missingTop[0].skill}`)
              : tx("Profile aligns well", "प्रोफ़ाइल अच्छी तरह मेल खाती है")
          }
          icon={Target}
          accent="amber"
          loading={loading}
          href="/skills"
        />
        <StatTile
          label={tx("Active Pipeline", "सक्रिय पाइपलाइन")}
          value={apps.length}
          hint={tx(`${interviewCount} interview · ${offerCount} offer`, `${interviewCount} साक्षात्कार · ${offerCount} ऑफ़र`)}
          icon={Briefcase}
          accent="slate"
          loading={loading}
          href="/tracker"
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          {aiPlan && (
            <div className="atoms-card border-[#c7d2fe] bg-gradient-to-br from-[#eef2ff]/80 via-white to-white p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#3b5bff] text-white">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#0f172a]">
                      {tx("AI 4-Week Execution Blueprint", "AI 4-सप्ताह कार्ययोजना")}
                    </h3>
                    <p className="font-mono text-[10.5px] text-[#64748b]">
                      {tx("Grounded in your profile via Ollama Orchestrator", "Ollama ऑर्केस्ट्रेटर द्वारा आपके प्रोफ़ाइल पर आधारित")}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/assistant?thread=${aiPlan.conversation_id}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11.5px] font-medium text-[#3b5bff] hover:bg-indigo-50"
                >
                  {tx("Open Thread", "चैट खोलें")} <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="whitespace-pre-wrap text-[13px] leading-[1.7] text-[#1e293b]">{aiPlan.reply}</div>
            </div>
          )}

          {visiblePhases.map((phase) => {
            const m = phaseMetrics.find((x) => x.id === phase.id) || { done: 0, total: phase.tasks.length, pct: 0 };
            const isExpanded = expandedPhases[phase.id] !== false;
            const isComplete = m.pct === 100;

            return (
              <div key={phase.id} className="atoms-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => togglePhase(phase.id)}
                  className="flex w-full items-center justify-between gap-4 border-b border-[#f1f5f9] p-5 text-left transition hover:bg-[#f8fafc]/70"
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-[12px] font-bold ${
                        isComplete ? "bg-emerald-500/15 text-emerald-700" : phase.accent
                      }`}
                    >
                      {isComplete ? <CheckCircle2 className="h-4.5 w-4.5" /> : phase.num}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[15px] font-semibold text-[#0f172a]">{phase.title}</h2>
                        <span
                          className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold ${
                            isComplete
                              ? "bg-emerald-50 text-emerald-700"
                              : m.done > 0
                                ? "bg-indigo-50 text-[#3b5bff]"
                                : "bg-slate-100 text-[#475569]"
                          }`}
                        >
                          {isComplete
                            ? tx("COMPLETE", "पूर्ण")
                            : m.done > 0
                              ? tx("IN PROGRESS", "प्रगति पर")
                              : tx("UP NEXT", "आगामी")}
                        </span>
                        <span className="tnum font-mono text-[11px] font-medium text-[#64748b]">
                          {m.done}/{m.total}
                        </span>
                      </div>
                      <p className="mt-1 text-[12.5px] text-[#64748b]">{phase.subtitle}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-[#64748b]">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="space-y-3 p-5">
                    <div className="space-y-2.5">
                      {phase.tasks.map((task) => {
                        const done = isTaskDone(task);
                        return (
                          <div
                            key={task.id}
                            className={`flex flex-col justify-between gap-3 rounded-xl border p-3.5 transition sm:flex-row sm:items-center ${
                              done
                                ? "border-emerald-200/70 bg-emerald-50/40"
                                : "border-[#e5e7eb] bg-[#f8fafc]/70 hover:bg-white"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                onClick={() => toggleCheck(task.id, done)}
                                title={tx("Toggle step completion", "पूर्ण स्थिति बदलें")}
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                                  done
                                    ? "border-emerald-600 bg-emerald-600 text-white"
                                    : "border-[#cbd5e1] bg-white text-transparent hover:border-[#3b5bff]"
                                }`}
                              >
                                <Check className="h-3 w-3" />
                              </button>
                              <div>
                                <div
                                  className={`text-[13.5px] font-semibold ${
                                    done ? "text-emerald-950 line-through decoration-emerald-400/70" : "text-[#0f172a]"
                                  }`}
                                >
                                  {task.label}
                                </div>
                                <div className="mt-0.5 text-[12px] leading-relaxed text-[#475569]">{task.hint}</div>
                              </div>
                            </div>

                            {task.href && task.cta && (
                              <Link
                                href={task.href}
                                className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg border border-[#e2e8f0] bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#0f172a] transition hover:border-[#3b5bff]/40 hover:text-[#3b5bff] sm:self-center"
                              >
                                {task.cta} <ArrowRight className="h-3 w-3" />
                              </Link>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {phase.id === "skills" && missingTop.length > 0 && (
                      <div className="mt-3 rounded-xl border border-amber-200/70 bg-amber-50/50 p-4">
                        <div className="mb-2.5 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-amber-800">
                            <BookOpen className="h-3.5 w-3.5" />
                            {tx("Market-Ranked Upskilling Modules", "बाज़ार माँग अनुसार सीखने के मॉड्यूल")}
                          </span>
                          <span className="text-[11px] text-amber-700">
                            {tx("Sorted by live job frequency", "नौकरियों की संख्या के आधार पर")}
                          </span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {missingTop.slice(0, 6).map(({ skill, count }, idx) => (
                            <div
                              key={skill}
                              className="flex items-center justify-between rounded-xl border border-amber-200/70 bg-white px-3 py-2"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[10px] font-bold text-amber-700">#{idx + 1}</span>
                                  <span className="truncate text-[12.5px] font-semibold text-[#0f172a]">{skill}</span>
                                </div>
                                <div className="text-[10.5px] text-[#64748b]">
                                  {tx(`Requested in ${count} live match(es)`, `${count} लाइव नौकरियों में आवश्यक`)}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Link
                                  href={`/assistant?q=${encodeURIComponent(
                                    lang === "hi"
                                      ? `${skill} सीखने के लिए 7-दिन का व्यावहारिक अध्ययन और प्रोजेक्ट प्लान बताएं`
                                      : `Give me a concise 7-day hands-on study and mini-project plan to master ${skill} for job interviews`
                                  )}`}
                                  className="rounded-md bg-[#3b5bff]/10 px-2 py-1 text-[10.5px] font-semibold text-[#3b5bff] hover:bg-[#3b5bff]/20"
                                >
                                  {tx("Learn AI", "AI गाइड")}
                                </Link>
                                <Link
                                  href={`/discover?q=${encodeURIComponent(skill)}`}
                                  className="rounded-md border border-[#e2e8f0] px-2 py-1 text-[10.5px] font-medium text-[#475569] hover:text-[#0f172a]"
                                >
                                  {tx("Jobs", "नौकरियाँ")}
                                </Link>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {phase.id === "alignment" && recs.length > 0 && (
                      <div className="mt-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
                        <div className="mb-2.5 flex items-center justify-between">
                          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#3b5bff]">
                            {tx("Top Live Role Targets", "शीर्ष लक्षित लाइव नौकरियाँ")}
                          </span>
                          <Link href="/recommendations" className="text-[11.5px] font-medium text-[#3b5bff] hover:underline">
                            {tx("View all →", "सभी देखें →")}
                          </Link>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {recs.slice(0, 3).map((rec) => {
                            const fit = Math.round(rec.compatibility_probability * 100);
                            return (
                              <Link
                                key={rec.job.id}
                                href={`/jobs/${rec.job.id}`}
                                className="rounded-xl border border-[#e5e7eb] bg-white p-3 transition hover:border-[#3b5bff]/40"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate text-[12.5px] font-semibold text-[#0f172a]">{rec.job.title}</span>
                                  <span className="tnum shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700">
                                    {fit}%
                                  </span>
                                </div>
                                <div className="mt-0.5 truncate text-[11px] text-[#64748b]">{rec.job.company}</div>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {phase.id === "execution" && (
                      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        {[
                          { label: tx("Saved / Draft", "ड्राफ्ट"), count: draftCount, tone: "text-[#3b5bff] bg-[#3b5bff]/8" },
                          { label: tx("Applied", "आवेदित"), count: appliedCount, tone: "text-amber-700 bg-amber-50" },
                          { label: tx("Interviewing", "साक्षात्कार"), count: interviewCount, tone: "text-indigo-700 bg-indigo-50" },
                          { label: tx("Offers", "ऑफ़र"), count: offerCount, tone: "text-emerald-700 bg-emerald-50" },
                        ].map((stage) => (
                          <Link
                            key={stage.label}
                            href="/tracker"
                            className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2.5 text-center transition hover:border-[#cbd5e1] hover:bg-white"
                          >
                            <div className="text-[11px] font-medium text-[#64748b]">{stage.label}</div>
                            <div className={`tnum mt-1 inline-block rounded-lg px-2.5 py-0.5 font-mono text-[15px] font-bold ${stage.tone}`}>
                              {stage.count}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Structural Intelligence Sidebar (4 cols) */}
        <div className="space-y-4 lg:col-span-4">
          <div className="atoms-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-[#0f172a]">
                <Layers className="h-4 w-4 text-[#3b5bff]" />
                {tx("Skill Architecture by Category", "श्रेणीवार कौशल संरचना")}
              </h3>
              <Link href="/resume" className="text-[11.5px] font-medium text-[#3b5bff] hover:underline">
                {tx("Edit →", "बदलें →")}
              </Link>
            </div>

            <div className="mb-4 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3">
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="font-medium text-[#475569]">{tx("Profile Completeness", "प्रोफ़ाइल पूर्णता")}</span>
                <span className="tnum font-mono font-semibold text-[#0f172a]">{completeness}%</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#e2e8f0]">
                <div className="h-full rounded-full bg-[#3b5bff]" style={{ width: `${Math.min(100, completeness)}%` }} />
              </div>
            </div>

            {skillsByCategory.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#cbd5e1] p-4 text-center text-[12px] text-[#64748b]">
                <FileText className="mx-auto mb-1.5 h-4 w-4 text-[#94a3b8]" />
                {tx(
                  "Upload a resume in Resume Studio to build your categorized skill tree.",
                  "वर्गीकृत कौशल ट्री बनाने के लिए रिज्यूमे स्टूडियो में रिज्यूमे अपलोड करें।"
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {skillsByCategory.slice(0, 5).map(([category, items]) => (
                  <div key={category} className="rounded-xl border border-[#f1f5f9] bg-[#f8fafc]/80 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#3b5bff]">
                        {category.replace(/_/g, " ")}
                      </span>
                      <span className="tnum font-mono text-[10.5px] text-[#64748b]">{items.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {items.slice(0, 6).map((sk) => (
                        <span
                          key={sk.slug}
                          className="rounded-md border border-[#e2e8f0] bg-white px-2 py-0.5 text-[11px] font-medium text-[#0f172a]"
                        >
                          {sk.canonical_name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="atoms-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-[#0f172a]">
                <Target className="h-4 w-4 text-amber-600" />
                {tx("Gap Frequency Radar", "कमी आवृत्ति रडार")}
              </h3>
              <Link href="/skills" className="text-[11.5px] font-medium text-[#3b5bff] hover:underline">
                {tx("Full gap view →", "विस्तार देखें →")}
              </Link>
            </div>

            {missingTop.length === 0 ? (
              <p className="text-[12px] text-[#64748b]">
                {tx(
                  "Score live jobs in ML Matches to quantify market demand gaps.",
                  "बाज़ार माँग अंतर देखने के लिए ML मैच में नौकरियाँ स्कोर करें।"
                )}
              </p>
            ) : (
              <div className="space-y-2.5">
                {missingTop.slice(0, 6).map(({ skill, count }) => {
                  const maxCount = missingTop[0]?.count || 1;
                  const barW = Math.max(15, Math.round((count / maxCount) * 100));
                  return (
                    <Link
                      key={skill}
                      href={`/discover?q=${encodeURIComponent(skill)}`}
                      className="block rounded-xl border border-[#f1f5f9] bg-[#f8fafc] p-2.5 transition hover:border-amber-300 hover:bg-white"
                    >
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-semibold text-[#0f172a]">{skill}</span>
                        <span className="tnum font-mono text-[10.5px] text-amber-700">
                          {count} {tx("roles", "नौकरियाँ")}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-amber-100">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${barW}%` }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="atoms-card p-5">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0f172a]">
              <Circle className="h-3 w-3 fill-[#3b5bff] text-[#3b5bff]" />
              {tx("Next Structural Action", "अगला मुख्य कदम")}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[#64748b]">
              {tx(
                "Explore role-by-role skill trees in Roadmaps or sync fresh jobs to score against your resume.",
                "रोडमैप्स में रोल-आधारित स्किल ट्री देखें या नई नौकरियाँ सिंक कर स्कोर जांचें।"
              )}
            </p>
            <div className="mt-3.5 space-y-2">
              <Link
                href="/discover"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#0f172a] px-4 py-2.5 text-[12.5px] font-medium text-white transition hover:bg-[#1e293b]"
              >
                {tx("Explore Live Discovery", "लाइव डिस्कवरी खोलें")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/roadmaps"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-4 py-2 text-[12px] font-medium text-[#0f172a] transition hover:bg-[#f8fafc]"
              >
                {tx("Browse All Skill Roadmaps", "सभी 30 कौशल रोडमैप्स देखें")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </StudioShell>
  );
}
