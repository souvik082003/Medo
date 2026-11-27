import type { Metadata } from "next";
import { LanguageProvider } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Medo — AI Career Intelligence Studio",
  description:
    "AI-native career intelligence platform powered by ML compatibility scoring, hybrid retrieval, and multi-agent LangGraph orchestration.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f6f7f9] text-[#0f172a] antialiased selection:bg-[#3b5bff]/15 selection:text-[#0f172a]">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
