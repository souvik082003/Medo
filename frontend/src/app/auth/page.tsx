"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import { MedoMark } from "@/components/MedoLogo";
import { apiFetch, setAuthSession, TokenResponse } from "@/lib/api";
import { LanguageToggle, useLanguage } from "@/lib/i18n";

function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { tx } = useLanguage();
  const initialMode = params.get("mode") === "register" ? "register" : "login";
  const sessionExpired = params.get("reason") === "expired";

  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    setError(null);
    try {
      const res = await apiFetch<TokenResponse>("/api/v1/auth/demo", { method: "POST" });
      setAuthSession(res);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo login unavailable");
    } finally {
      setDemoLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const endpoint = mode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login";
      const body = mode === "register" ? { email, password, full_name: fullName } : { email, password };
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
    <div className="flex min-h-screen flex-col justify-between bg-[#fafafa] text-[#0f172a]">
      {/* Minimal Top Utility Bar */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#64748b] transition hover:text-[#0f172a]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {tx("Back to Medo", "होम पर वापस")}
        </Link>
        <LanguageToggle />
      </header>

      {/* Centered Editorial Auth Card */}
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-[390px]">
          <div className="mb-7 flex flex-col items-center text-center">
            <Link href="/" className="mb-4 inline-flex">
              <MedoMark size={40} />
            </Link>
            <h1 className="text-[22px] font-semibold tracking-tight text-[#0f172a]">
              {mode === "register"
                ? tx("Create your account", "नया खाता बनाएँ")
                : tx("Sign in to Medo", "Medo में साइन इन करें")}
            </h1>
            <p className="mt-1 text-[13px] text-[#64748b]">
              {mode === "register"
                ? tx("Start a private workspace for your career search.", "अपनी नौकरी खोज के लिए निजी वर्कस्पेस शुरू करें।")
                : tx("Welcome back. Enter your details below.", "जारी रखने के लिए अपना ईमेल और पासवर्ड दर्ज करें।")}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_12px_36px_-16px_rgba(15,23,42,0.12)] sm:p-7">
            {/* Subtle Underline Tabs */}
            <div className="mb-5 flex border-b border-[#e5e7eb] text-[13px] font-medium">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className={`-mb-px flex-1 border-b-2 pb-2.5 text-center transition ${
                  mode === "login"
                    ? "border-[#0f172a] font-semibold text-[#0f172a]"
                    : "border-transparent text-[#64748b] hover:text-[#0f172a]"
                }`}
              >
                {tx("Sign in", "साइन इन")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
                className={`-mb-px flex-1 border-b-2 pb-2.5 text-center transition ${
                  mode === "register"
                    ? "border-[#0f172a] font-semibold text-[#0f172a]"
                    : "border-transparent text-[#64748b] hover:text-[#0f172a]"
                }`}
              >
                {tx("Create account", "नया खाता")}
              </button>
            </div>

            {sessionExpired && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                {tx(
                  "Your session expired. Sign in again to continue.",
                  "आपका सत्र समाप्त हो गया है। कृपया फिर से लॉगिन करें।"
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div>
                  <label className="mb-1.5 block text-[12.5px] font-medium text-[#334155]">
                    {tx("Full name", "पूरा नाम")}
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Rivera"
                    className="w-full rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-[13.5px] text-[#0f172a] outline-none transition placeholder:text-[#94a3b8] focus:border-[#0f172a] focus:ring-2 focus:ring-[#0f172a]/10"
                  />
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-[12.5px] font-medium text-[#334155]">
                  {tx("Email", "ईमेल पता")}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-[13.5px] text-[#0f172a] outline-none transition placeholder:text-[#94a3b8] focus:border-[#0f172a] focus:ring-2 focus:ring-[#0f172a]/10"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[12.5px] font-medium text-[#334155]">
                  {tx("Password", "पासवर्ड")}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={tx("At least 8 characters", "कम से कम 8 अक्षर")}
                    className="w-full rounded-lg border border-[#d1d5db] bg-white py-2 pl-3 pr-9 text-[13.5px] text-[#0f172a] outline-none transition placeholder:text-[#94a3b8] focus:border-[#0f172a] focus:ring-2 focus:ring-[#0f172a]/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-[#94a3b8] hover:text-[#475569]"
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || demoLoading}
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#0f172a] px-4 text-[13.5px] font-medium text-white transition hover:bg-[#1e293b] disabled:opacity-60"
              >
                {loading
                  ? tx("Signing in...", "लॉगिन हो रहा है...")
                  : mode === "register"
                    ? tx("Continue", "आगे बढ़ें")
                    : tx("Sign in", "साइन इन करें")}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#e5e7eb]" />
              <span className="text-[11px] font-medium text-[#94a3b8]">{tx("or", "या")}</span>
              <div className="h-px flex-1 bg-[#e5e7eb]" />
            </div>

            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={loading || demoLoading}
              className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-[#d1d5db] bg-white px-4 text-[13px] font-medium text-[#0f172a] transition hover:bg-[#f8fafc] disabled:opacity-60"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0f172a] text-[10px] font-semibold text-white">
                A
              </span>
              <span>
                {demoLoading
                  ? tx("Opening workspace...", "वर्कस्पेस खुल रहा है...")
                  : tx("Continue with Demo Account", "डेमो खाते से जारी रखें")}
              </span>
            </button>
          </div>

          <p className="mt-5 text-center text-[12px] text-[#64748b]">
            {mode === "login" ? (
              <>
                {tx("New to Medo?", "नए उपयोगकर्ता हैं?")}{" "}
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className="font-medium text-[#0f172a] underline underline-offset-2 hover:text-[#3b5bff]"
                >
                  {tx("Create an account", "खाता बनाएँ")}
                </button>
              </>
            ) : (
              <>
                {tx("Already have an account?", "पहले से खाता है?")}{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="font-medium text-[#0f172a] underline underline-offset-2 hover:text-[#3b5bff]"
                >
                  {tx("Sign in", "साइन इन करें")}
                </button>
              </>
            )}
          </p>
        </div>
      </main>

      <footer className="py-5 text-center text-[11.5px] text-[#94a3b8]">
        {tx("Private per-user workspace · Local AI & Argon2id auth", "निजी वर्कस्पेस · सुरक्षित लोकल AI")}
      </footer>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#fafafa] p-8 text-center text-sm text-[#64748b]">Loading...</div>}>
      <AuthForm />
    </Suspense>
  );
}
