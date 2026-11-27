"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Layers, ShieldCheck, Sparkles } from "lucide-react";
import { apiFetch, setAuthSession, TokenResponse } from "@/lib/api";

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
    <div className="atoms-grid-bg flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-6 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#171716] text-white">
          <Layers className="h-4 w-4" />
        </div>
        <span className="text-[17px] font-semibold tracking-tight">Medo AI</span>
      </Link>

      <div className="atoms-card w-full max-w-md p-6 shadow-xl shadow-black/[0.04]">
        <div className="mb-5 flex items-center justify-between">
          <div className="atoms-segmented w-full">
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
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#52525b]">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Alex Rivera"
                className="w-full rounded-lg border border-black/10 bg-[#fafafa] px-3.5 py-2 text-[14px] outline-none focus:border-[#4267ff] focus:bg-white"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-[12px] font-medium text-[#52525b]">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@example.com"
              className="w-full rounded-lg border border-black/10 bg-[#fafafa] px-3.5 py-2 text-[14px] outline-none focus:border-[#4267ff] focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-[#52525b]">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full rounded-lg border border-black/10 bg-[#fafafa] px-3.5 py-2 text-[14px] outline-none focus:border-[#4267ff] focus:bg-white"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || demoLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#171716] px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-[#272726] disabled:opacity-60"
          >
            {loading ? "Authenticating..." : mode === "register" ? "Create Workspace" : "Sign In"}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-black/[0.08]" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-[#a1a1aa]">or</span>
          <div className="h-px flex-1 bg-black/[0.08]" />
        </div>

        <button
          type="button"
          onClick={handleDemoLogin}
          disabled={loading || demoLoading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#4267ff]/30 bg-[#4267ff]/[0.06] px-4 py-2.5 text-[13px] font-medium text-[#2b4eff] transition hover:bg-[#4267ff]/[0.12] disabled:opacity-60"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {demoLoading ? "Preparing Demo Workspace..." : "One-Click Demo Login (Aarav Mehta)"}
        </button>

        <div className="mt-5 flex items-center gap-2 border-t border-black/[0.06] pt-4 text-[11px] text-[#71717a]">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[#4267ff]" />
          <span>Argon2id password hashing · Isolated per-user workspaces & documents</span>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-[#71717a]">Loading...</div>}>
      <AuthForm />
    </Suspense>
  );
}
