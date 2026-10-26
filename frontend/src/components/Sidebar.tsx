"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  UserRound,
  LogOut,
  ShieldCheck,
  Building2,
  Briefcase,
  Settings,
  type LucideIcon,
  CalendarDays,
  X,
} from "lucide-react";
import { getUser, logout } from "../lib/auth";
import { useNav } from "../lib/nav";

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

export default function Sidebar() {
  const path = usePathname();
  const user = getUser();
  const { mobileOpen, setMobileOpen } = useNav();

  const items: NavItem[] =
    user?.role === "BUSINESS"
      ? [
          {
            href: "/business-dashboard",
            label: "Partner Dashboard",
            Icon: LayoutDashboard,
          },
          { href: "/leads", label: "Project Leads", Icon: Users },
          { href: "/followups", label: "Follow-ups", Icon: CalendarClock },
          { href: "/calendar", label: "Calendar", Icon: CalendarDays },
          { href: "/business", label: "Projects & Portfolio", Icon: Building2 },
          { href: "/team", label: "Sales Staff", Icon: UserRound },
          { href: "/settings", label: "Settings", Icon: Settings },
        ]
      : [
          { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
          { href: "/leads", label: "Leads", Icon: Users },
          { href: "/followups", label: "Follow-ups", Icon: CalendarClock },
          { href: "/calendar", label: "Calendar", Icon: CalendarDays },
          ...(user?.role === "ADMIN" || user?.role === "MANAGER"
            ? [
                {
                  href: "/business",
                  label: "Businesses",
                  Icon: Building2,
                },
                { href: "/team", label: "Sales Team", Icon: UserRound },
                {
                  href: "/integration",
                  label: "Meta Setup",
                  Icon: ShieldCheck,
                },
              ]
            : []),
          { href: "/settings", label: "Settings", Icon: Settings },
        ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      <div
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-300 md:hidden ${
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Sidebar (Slide-over drawer on < md, fixed sidebar on >= md) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-64 shrink-0 flex-col overflow-hidden border-r border-slate-800 bg-slate-950 px-3 py-4 text-slate-300 shadow-2xl transition-transform duration-300 ease-in-out md:static md:h-screen md:w-60 md:translate-x-0 md:px-3 md:py-5 md:shadow-xl ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo and Mobile Close Button */}
        <div className="flex shrink-0 items-center justify-between px-2 pb-5 md:pb-7">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500 text-sm font-extrabold text-white shadow-sm">
              LF
            </div>

            <div className="min-w-0">
              <b className="block text-base font-bold text-white leading-tight">LeadFlow</b>
              <span className="text-[10px] tracking-[0.18em] text-slate-400">
                CRM
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white md:hidden transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation items */}
        <nav className="scrollbar-none flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden p-1">
          {items.map(({ href, label, Icon }) => {
            const active =
              path === href ||
              (href !== "/dashboard" &&
                href !== "/business-dashboard" &&
                path?.startsWith(`${href}/`));

            return (
              <Link
                key={href}
                href={href}
                title={label}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`group flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${
                  active
                    ? "bg-indigo-500/20 text-white ring-1 ring-indigo-400/40 shadow-xs"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={19} className="shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}

          {user?.role === "ADMIN" && (
            <div
              title="Transparency enabled"
              className="mt-3 flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-slate-800/80 px-3 text-xs text-slate-400"
            >
              <ShieldCheck size={16} className="shrink-0 text-emerald-400" />
              <span className="truncate">Transparency enabled</span>
            </div>
          )}
        </nav>

        {/* User / Logout */}
        <div className="mt-3 flex shrink-0 items-center justify-between gap-2 border-t border-slate-800/80 pt-3 px-1">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {user?.profilePhotoUrl ? (
              <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-800">
                <Image
                  src={user.profilePhotoUrl}
                  alt={user.name || "User profile"}
                  height={36}
                  width={36}
                  className="h-9 w-9 shrink-0 rounded-full border-2 border-indigo-600 bg-indigo-100 object-cover object-center shadow-sm"
                />
              </div>
            ) : (
              <div
                title={user?.name || "User"}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-bold text-white"
              >
                {user?.name?.[0]?.toUpperCase() || "U"}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <b className="block truncate text-xs text-white">
                {user?.name || "User"}
              </b>
              <small className="block truncate text-[10px] text-slate-400">
                {user?.role === "BUSINESS" ? "BUSINESS PARTNER" : user?.role || ""}
              </small>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            title="Logout"
            aria-label="Logout"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
    </>
  );
}
