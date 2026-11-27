"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Globe } from "lucide-react";

export type AppLanguage = "en" | "hi";

const LANG_STORAGE_KEY = "medo_ui_lang";

interface LanguageContextValue {
  lang: AppLanguage;
  setLang: (next: AppLanguage) => void;
  toggleLang: () => void;
  tx: (en: string, hi: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  setLang: () => {},
  toggleLang: () => {},
  tx: (en) => en,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<AppLanguage>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === "hi" || saved === "en") {
        setLangState(saved);
        document.documentElement.lang = saved;
      }
    } catch {
      /* ignore SSR/storage guards */
    }
  }, []);

  const setLang = (next: AppLanguage) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
      document.documentElement.lang = next;
    } catch {
      /* ignore */
    }
  };

  const toggleLang = () => setLang(lang === "en" ? "hi" : "en");
  const tx = (en: string, hi: string) => (lang === "hi" ? hi : en);

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, tx }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useLanguage();

  return (
    <div
      className="inline-flex items-center rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-0.5 shadow-2xs"
      role="group"
      aria-label="Language switcher"
    >
      {!compact && <Globe className="mx-1.5 h-3.5 w-3.5 text-[#64748b]" />}
      <button
        type="button"
        onClick={() => setLang("en")}
        className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
          lang === "en"
            ? "bg-white text-[#0f172a] shadow-2xs ring-1 ring-[#e2e8f0]"
            : "text-[#64748b] hover:text-[#0f172a]"
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("hi")}
        className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
          lang === "hi"
            ? "bg-[#3b5bff] text-white shadow-2xs"
            : "text-[#64748b] hover:text-[#0f172a]"
        }`}
      >
        हिंदी
      </button>
    </div>
  );
}
