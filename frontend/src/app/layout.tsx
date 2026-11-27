import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Medo — AI Career Intelligence Studio",
  description:
    "AI-native career intelligence platform powered by ML compatibility scoring, hybrid retrieval, and multi-agent LangGraph orchestration.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#fafafa] text-[#171716] antialiased selection:bg-[#4267ff]/15 selection:text-[#171716]">
        {children}
      </body>
    </html>
  );
}
