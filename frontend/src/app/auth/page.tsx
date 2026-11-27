"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Bot, CheckCircle2, Layers, Search, ShieldCheck, Sparkles } from "lucide-react";
import { apiFetch, setAuthSession, TokenResponse } from "@/lib/api";

const HIGHLIGHTS = [
  {
    icon: Search,
    title: "Hybrid RRF + Cross-Encoder Retrieval",
    desc: "Live aggregation across 6 free job sources with vector + lexical fusion.",
  },
  {
    icon: Sparkles,
    title: "12-Feature Calibrated ML & LTR",
    desc: "Calibrated compatibility probabilities and transparent skill-gap explanations.",
  },
  {
    icon: Bot,
    title: "6-Agent LangGraph Orchestrator",
    desc: "Grounded Cited RAG with human-in-the-loop approval before external actions.",
  },
];

function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">(
    params.get("mode") === "register" ? "register" : "login"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDemoLogin = async () => {
    setError(null);
    setDemoLoading(true);
    try {
      const res = await apiFetch<TokenResponse>("/api/v1/auth/demo", {
        method: "POST",
      });
      setAuthSession(res);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo login failed");
    } finally {
      setDemoLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login";
      const body =
        mode === "register"
          ? { email, password, full_name: fullName }
          : { email, password };
      const res = await apiFetch<TokenResponse>(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setAuthSession(res);
      router.push(mode === "register" ? "/onboarding" : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-[#f6f7f9] lg:grid-cols-12">
      {/* Left Studio Brand Panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0f172a] p-10 text-white lg:col-span-5 lg:flex xl:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#3b5bff]/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-indigo-500/15 blur-3xl" />

        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#3b5bff] to-indigo-400 text-white shadow-md">
              <Layers className="h-4.5 w-4.5" />
            </div>
            <span className="text-[18px] font-semibold tracking-tight">Medo AI</span>
            <span className="rounded-md border border-white/15 bg-white/10 px-2 py-0.5 font-mono text-[10px] font-medium text-indigo-200">
              STUDIO
            </span>
          </Link>

          <h1 className="mt-10 text-3xl font-semibold leading-tight tracking-tight text-white">
            Evidence-backed career intelligence, engineered for precision.
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
            Keep resumes isolated per workspace, discover global &amp; regional roles cleanly, and inspect calibrated compatibility probabilities with verifiable evidence.
          </p>

          <div className="mt-8 space-y-4">
            {HIGHLIGHTS.map((h) => {
              const Icon = h.icon;
              return (
                <div
                  key={h.title}
                  className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xs"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#3b5bff]/25 text-indigo-300">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-[13.5px] font-semibold text-white">{h.title}</div>
                    <div className="mt-0.5 text-[12px] leading-relaxed text-slate-400">{h.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 border-t border-white/10 pt-5 text-[12px] text-slate-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>Argon2id credentials · Tenant-isolated pgvector &amp; RAG documents</span>
        </div>
      </div>

      {/* Right Interactive Auth Workspace */}
      <div className="atoms-grid-bg flex flex-col items-center justify-center px-5 py-12 lg:col-span-7">
        <Link href="/" className="mb-6 flex items-center gap-2.5 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#0f172a] to-[#3b5bff] text-white">
            <Layers className="h-4 w-4" />
          </div>
          <span className="text-[17px] font-semibold tracking-tight text-[#0f172a]">Medo AI</span>
        </Link>

        <div className="atoms-card w-full max-w-md p-7 shadow-xl shadow-slate-900/[0.05]">
          <div className="mb-5">
            <h2 className="text-[19px] font-semibold tracking-tight text-[#0f172a]">
              {mode === "register" ? "Create your workspace" : "Welcome back to Studio"}
            </h2>
            <p className="mt-1 text-[12.5px] text-[#64748b]">
              {mode === "register"
                ? "Set up your private AI career intelligence account."
                : "Sign in to access jobs, ML scores, and your AI orchestrator."}
            </p>
          </div>

          <div className="atoms-segmented mb-5 w-full">
            <button
              type="button"
              data-active={mode === "login"}
              onClick={() => setMode("login")}
              className="atoms-segmented-btn flex-1"
            >
              Sign In
            </button>
            <button
              type="button"
              data-active={mode === "register"}
              onClick={() => setMode("register")}
              className="atoms-segmented-btn flex-1"
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Rivera"
                  className="studio-input"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@example.com"
                className="studio-input"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="studio-input"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] font-medium text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || demoLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f172a] px-4 py-2.5 text-[13px] font-medium text-white shadow-xs transition hover:bg-[#1e293b] disabled:opacity-60"
            >
              {loading ? "Authenticating..." : mode === "register" ? "Create Workspace" : "Sign In"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#e2e8f0]" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">instant sandbox</span>
            <div className="h-px flex-1 bg-[#e2e8f0]" />
          </div>

          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={loading || demoLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#3b5bff]/30 bg-[#3b5bff]/[0.07] px-4 py-2.5 text-[13px] font-medium text-[#2948eb] transition hover:bg-[#3b5bff]/[0.13] disabled:opacity-60"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {demoLoading ? "Preparing Demo Workspace..." : "One-Click Demo Login (Aarav Mehta)"}
          </button>

          <div className="mt-5 flex items-center gap-2 border-t border-[#e5e7eb] pt-4 text-[11px] text-[#64748b]">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[#3b5bff]" />
            <span>Zero fabricated analytics · Explicit human approval gates</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-[#64748b]">Loading studio auth...</div>}>
      <AuthForm />
    </Suspense>
  );
}
