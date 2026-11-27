"use client";

import React, { useId } from "react";

export function MedoMark({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const bgId = `medo-bg-${uid}`;
  const wingLeftId = `medo-wl-${uid}`;
  const wingRightId = `medo-wr-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label="Medo Logo"
    >
      <defs>
        <linearGradient id={bgId} x1="2" y1="2" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#090D18" />
          <stop offset="52%" stopColor="#172554" />
          <stop offset="100%" stopColor="#3B5BFF" />
        </linearGradient>
        <linearGradient id={wingLeftId} x1="9" y1="10" x2="22" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#DBEAFE" />
        </linearGradient>
        <linearGradient id={wingRightId} x1="20" y1="11" x2="31" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
      </defs>

      {/* Precision Obsidian-Cobalt Squircle */}
      <rect width="40" height="40" rx="10.5" fill={`url(#${bgId})`} />
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="10" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />

      {/* Back Right Ascending Fold (cool cyan-blue depth plane) */}
      <path
        d="M20 22.8L27.4 12.1C28.15 11.02 29.85 11.55 29.85 12.86V27.6C29.85 28.43 29.18 29.1 28.35 29.1H25.75C24.92 29.1 24.25 28.43 24.25 27.6V20.9L21.05 25.45C20.54 26.17 19.46 26.17 18.95 25.45L20 22.8Z"
        fill={`url(#${wingRightId})`}
      />

      {/* Foreground Left & Summit Sculpted Ribbon (pure crisp white) */}
      <path
        d="M10.15 27.6V12.86C10.15 11.55 11.85 11.02 12.6 12.1L20 22.8L21.9 25.5C21.06 26.6 19.34 26.62 18.47 25.54L15.75 21.6V27.6C15.75 28.43 15.08 29.1 14.25 29.1H11.65C10.82 29.1 10.15 28.43 10.15 27.6Z"
        fill={`url(#${wingLeftId})`}
      />
    </svg>
  );
}
