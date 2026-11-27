"use client";

import React from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export function Banner({
  tone = "success",
  message,
  onClose,
  className = "",
}: {
  tone?: "success" | "error" | "info";
  message: string;
  onClose?: () => void;
  className?: string;
}) {
  const styles =
    tone === "error"
      ? "border-red-200/90 bg-red-50/95 text-red-800"
      : tone === "info"
        ? "border-indigo-200/90 bg-indigo-50/90 text-indigo-900"
        : "border-emerald-200/90 bg-emerald-50/95 text-emerald-900";
  const Icon = tone === "error" ? AlertCircle : tone === "info" ? Info : CheckCircle2;

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-[12.5px] font-medium shadow-2xs ${styles} ${className}`}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <div className="atoms-card flex flex-col items-center justify-center border-dashed px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#3b5bff]/10 text-[#3b5bff]">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-3.5 text-[14.5px] font-semibold text-[#0f172a]">{title}</h3>
      <p className="mt-1 max-w-md text-[12.5px] leading-relaxed text-[#64748b]">{description}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#0f172a] px-4 py-2 text-[12.5px] font-medium text-white transition hover:bg-[#1e293b]"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionHref && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#0f172a] px-4 py-2 text-[12.5px] font-medium text-white transition hover:bg-[#1e293b]"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  accent = "indigo",
  href,
  loading = false,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "indigo" | "emerald" | "amber" | "slate";
  href?: string;
  loading?: boolean;
}) {
  const accentMap = {
    indigo: "bg-[#3b5bff]/10 text-[#3b5bff]",
    emerald: "bg-emerald-500/12 text-emerald-700",
    amber: "bg-amber-500/12 text-amber-700",
    slate: "bg-slate-900/8 text-slate-800",
  }[accent];

  const inner = (
    <div className="atoms-card atoms-card-hover flex h-full flex-col justify-between p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-[#64748b]">{label}</span>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${accentMap}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-2.5">
        {loading ? (
          <div className="skeleton h-7 w-20" />
        ) : (
          <div className="tnum text-2xl font-semibold tracking-tight text-[#0f172a]">{value}</div>
        )}
        {hint && <div className="mt-1 truncate text-[11.5px] text-[#64748b]">{hint}</div>}
      </div>
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}
