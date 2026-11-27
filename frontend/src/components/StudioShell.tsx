"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  Briefcase,
  ChevronRight,
  Command,
  Compass,
  FileText,
  GitBranch,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { MedoMark } from "@/components/MedoLogo";
import { clearAuthSession, getStoredUser, getToken, isTokenExpired, User } from "@/lib/api";
import { LanguageToggle, useLanguage } from "@/lib/i18n";

const NAV_GROUPS = [
  {
    labelEn: "Command Center",
    labelHi: "कमांड सेंटर",
    items: [
      { href: "/", labelEn: "Home", labelHi: "होम", icon: Home },
      { href: "/dashboard", labelEn: "Dashboard", labelHi: "डैशबोर्ड", icon: LayoutDashboard },
      { href: "/assistant", labelEn: "AI Orchestrator", labelHi: "AI ऑर्केस्ट्रेटर", icon: Bot },
    ],
  },
  {
    labelEn: "Opportunities",
    labelHi: "अवसर",
    items: [
      { href: "/discover", labelEn: "Job Discovery", labelHi: "नौकरी खोजें", icon: Search },
      { href: "/recommendations", labelEn: "ML Matches", labelHi: "ML मिलान", icon: Sparkles },
      { href: "/tracker", labelEn: "Pipeline Tracker", labelHi: "आवेदन ट्रैकर", icon: Briefcase },
    ],
  },
  {
    labelEn: "Profile & Intelligence",
    labelHi: "प्रोफ़ाइल और विश्लेषण",
    items: [
      { href: "/resume", labelEn: "Resume Studio", labelHi: "रेज़्यूमे स्टूडियो", icon: FileText },
      { href: "/skills", labelEn: "Skill Gaps", labelHi: "कौशल अंतर", icon: Target },
      { href: "/roadmap", labelEn: "Career Roadmap", labelHi: "करियर रोडमैप", icon: GitBranch },
    ],
  },
  {
    labelEn: "Governance",
    labelHi: "सुरक्षा और नियंत्रण",
    items: [
      { href: "/profile", labelEn: "Preferences", labelHi: "प्राथमिकताएं", icon: Settings },
      { href: "/privacy", labelEn: "Privacy & Memory", labelHi: "गोपनीयता और मेमोरी", icon: ShieldCheck },
      { href: "/onboarding", labelEn: "Guided Setup", labelHi: "गाइडेड सेटअप", icon: Compass },
    ],
  },
];

const QUICK_ROUTES = NAV_GROUPS.flatMap((g) =>
  g.items.map((i) => ({ ...i, groupEn: g.labelEn, groupHi: g.labelHi }))
);

export function StudioShell({
  title,
  subtitle,
  actions,
  fullWidth = false,
  noPadding = false,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  fullWidth?: boolean;
  noPadding?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { tx } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");

  useEffect(() => {
    const tok = getToken();
    if (!tok) {
      router.replace("/auth");
      return;
    }
    if (isTokenExpired(tok)) {
      clearAuthSession();
      router.replace("/auth?reason=expired");
      return;
    }
    setUser(getStoredUser());
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((p) => !p);
      } else if (e.key === "Escape") {
        setCmdOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleLogout = () => {
    clearAuthSession();
    router.push("/auth");
  };

  const initials = (user?.full_name || "M")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const filteredRoutes = QUICK_ROUTES.filter((r) =>
    `${r.labelEn} ${r.labelHi} ${r.groupEn} ${r.groupHi}`
      .toLowerCase()
      .includes(cmdQuery.trim().toLowerCase())
  );

  const sidebarBody = (compact: boolean) => (
    <div className="flex h-full flex-col justify-between bg-white px-2.5 py-4">
      <div className="space-y-5">
        <div className={`flex items-center ${compact ? "justify-center" : "justify-between px-2"}`}>
          <Link href="/" className="flex items-center gap-2.5">
            <MedoMark size={32} className="shadow-xs" />
            {!compact && (
              <div className="flex items-center gap-1.5">
                <span className="text-[15.5px] font-bold tracking-tight text-[#0f172a]">Medo</span>
                <span className="rounded-md bg-[#3b5bff]/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#3b5bff]">
                  {tx("STUDIO", "स्टूडियो")}
                </span>
              </div>
            )}
          </Link>
          {!compact && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              title={tx("Collapse sidebar", "साइडबार छोटा करें")}
              className="hidden rounded-lg p-1 text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0f172a] lg:inline-flex"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {!compact ? (
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="flex w-full items-center justify-between rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1.5 text-[12px] text-[#64748b] transition hover:border-[#cbd5e1] hover:text-[#0f172a]"
          >
            <span className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5" /> {tx("Jump to...", "तुरंत खोलें...")}
            </span>
            <kbd className="rounded border border-[#cbd5e1] bg-white px-1.5 py-0.5 font-mono text-[10px] text-[#64748b]">
              ⌘K
            </kbd>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            title={tx("Expand sidebar", "साइडबार खोलें")}
            className="mx-auto hidden rounded-lg border border-[#e2e8f0] p-2 text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0f172a] lg:flex"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        <nav className="space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.labelEn}>
              {!compact && (
                <div className="mb-1 px-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-[#94a3b8]">
                  {tx(group.labelEn, group.labelHi)}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const label = tx(item.labelEn, item.labelHi);
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={compact ? label : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={`group flex items-center ${
                        compact ? "justify-center px-2 py-2.5" : "justify-between px-2.5 py-2"
                      } rounded-xl text-[13px] font-medium transition-all ${
                        active
                          ? "bg-[#3b5bff]/10 text-[#2948eb] shadow-2xs ring-1 ring-[#3b5bff]/20"
                          : "text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            active ? "text-[#3b5bff]" : "text-[#64748b] group-hover:text-[#0f172a]"
                          }`}
                        />
                        {!compact && <span>{label}</span>}
                      </span>
                      {!compact && active && <span className="h-1.5 w-1.5 rounded-full bg-[#3b5bff]" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t border-[#e5e7eb] pt-3">
        {user && (
          <div
            className={`flex items-center ${
              compact ? "justify-center" : "justify-between gap-2 px-2.5 py-2"
            } rounded-xl border border-[#e5e7eb] bg-[#f8fafc]`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0f172a] font-mono text-[11px] font-semibold text-white">
                {initials}
              </div>
              {!compact && (
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-[#0f172a]">{user.full_name}</div>
                  <div className="truncate font-mono text-[10px] text-[#64748b]">{user.email}</div>
                </div>
              )}
            </div>
            {!compact && (
              <button
                onClick={handleLogout}
                title={tx("Sign out", "लॉग आउट")}
                className="rounded-lg p-1.5 text-[#64748b] transition hover:bg-[#e2e8f0]/70 hover:text-[#0f172a]"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#f6f7f9] text-[#0f172a]">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden shrink-0 border-r border-[#e5e7eb] bg-white transition-all duration-200 lg:block ${
          collapsed ? "w-[68px]" : "w-60"
        }`}
      >
        <div className="thin-scroll sticky top-0 h-screen overflow-y-auto">{sidebarBody(collapsed)}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-900/35 backdrop-blur-xs" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 w-64 border-r border-[#e5e7eb] bg-white shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1 text-[#64748b] hover:bg-[#f1f5f9]"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarBody(false)}
          </div>
        </div>
      )}

      {/* Command Palette Modal */}
      {cmdOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/35 px-4 pt-24 backdrop-blur-xs">
          <div className="atoms-card w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center gap-2.5 border-b border-[#e5e7eb] px-4 py-3">
              <Command className="h-4 w-4 text-[#3b5bff]" />
              <input
                autoFocus
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
                placeholder={tx("Jump to workspace page...", "पेज खोजें...")}
                className="flex-1 bg-transparent text-[13.5px] outline-none"
              />
              <button
                onClick={() => setCmdOpen(false)}
                className="rounded-md border border-[#e2e8f0] px-1.5 py-0.5 font-mono text-[10px] text-[#64748b]"
              >
                ESC
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {filteredRoutes.map((route) => {
                const Icon = route.icon;
                return (
                  <button
                    key={route.href}
                    type="button"
                    onClick={() => {
                      setCmdOpen(false);
                      setCmdQuery("");
                      router.push(route.href);
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] transition hover:bg-[#f1f5f9]"
                  >
                    <span className="flex items-center gap-2.5 font-medium text-[#0f172a]">
                      <Icon className="h-4 w-4 text-[#3b5bff]" />
                      {tx(route.labelEn, route.labelHi)}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-[#64748b]">
                      {tx(route.groupEn, route.groupHi)} <ChevronRight className="h-3 w-3" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7eb] bg-white/90 px-5 py-3 backdrop-blur-md lg:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-[#e2e8f0] p-1.5 text-[#0f172a] hover:bg-[#f1f5f9] lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#64748b]">
                <Link href="/dashboard" className="hover:text-[#0f172a]">
                  {tx("Medo Studio", "मेडो स्टूडियो")}
                </Link>
                <ChevronRight className="h-3 w-3" />
                <span className="truncate text-[#3b5bff]">{title}</span>
              </div>
              <h1 className="truncate text-[17px] font-semibold tracking-tight text-[#0f172a]">{title}</h1>
              {subtitle && <p className="hidden truncate text-[12px] text-[#64748b] sm:block">{subtitle}</p>}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <LanguageToggle />
            {actions}
          </div>
        </header>

        <main
          className={`mx-auto w-full flex-1 ${fullWidth ? "max-w-[1440px]" : "max-w-7xl"} ${
            noPadding ? "" : "px-5 py-6 lg:px-7"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
