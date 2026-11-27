"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  Briefcase,
  Compass,
  FileText,
  GitBranch,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { clearAuthSession, getStoredUser, getToken, User } from "@/lib/api";

const NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Career Dashboard", icon: LayoutDashboard },
      { href: "/assistant", label: "AI Career Assistant", icon: Bot },
      { href: "/discover", label: "Job Discovery", icon: Search },
      { href: "/recommendations", label: "Recommendations", icon: Sparkles },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/resume", label: "Resume Intelligence", icon: FileText },
      { href: "/skills", label: "Skill-Gap Analysis", icon: Target },
      { href: "/roadmap", label: "Career Roadmap", icon: GitBranch },
      { href: "/tracker", label: "Application Tracker", icon: Briefcase },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/onboarding", label: "Onboarding", icon: Compass },
      { href: "/profile", label: "Profile & Preferences", icon: Settings },
      { href: "/privacy", label: "Privacy & Memory", icon: ShieldCheck },
    ],
  },
];

export function StudioShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const tok = getToken();
    if (!tok) {
      router.replace("/auth");
      return;
    }
    setUser(getStoredUser());
  }, [router]);

  const handleLogout = () => {
    clearAuthSession();
    router.push("/auth");
  };

  const sidebarBody = (
    <div className="flex h-full flex-col justify-between bg-white px-3 py-4">
      <div className="space-y-6">
        <Link href="/" className="flex items-center gap-2.5 px-2.5 py-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#171716] text-white">
            <Layers className="h-4 w-4" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tracking-tight text-[#171716]">Medo</span>
            <span className="rounded border border-[#4267ff]/25 bg-[#4267ff]/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#4267ff]">
              AI
            </span>
          </div>
        </Link>

        <nav className="space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="mb-1.5 px-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-[#71717a]">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                        active
                          ? "bg-[#171716] text-white shadow-xs"
                          : "text-[#52525b] hover:bg-black/[0.04] hover:text-[#171716]"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t border-black/[0.07] pt-3">
        {user && (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-black/[0.03] px-2.5 py-2">
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold text-[#171716]">{user.full_name}</div>
              <div className="truncate font-mono text-[11px] text-[#71717a]">{user.email}</div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="rounded-md p-1.5 text-[#71717a] transition hover:bg-black/[0.06] hover:text-[#171716]"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#fafafa]">
      {/* Desktop Sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-black/[0.08] bg-white lg:block">
        <div className="sticky top-0 h-screen overflow-y-auto">{sidebarBody}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 w-64 border-r border-black/10 bg-white">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1 text-[#52525b]"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarBody}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-black/[0.07] bg-white/85 px-5 py-3.5 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-black/10 p-1.5 text-[#171716] lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-[16px] font-semibold tracking-tight text-[#171716]">{title}</h1>
              {subtitle && <p className="text-[12px] text-[#71717a]">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2.5">{actions}</div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
