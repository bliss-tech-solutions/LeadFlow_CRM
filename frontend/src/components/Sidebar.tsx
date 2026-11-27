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
  Settings,
  CalendarDays,
  X,
  KanbanSquare,
  BarChart3,
  Sun,
  Webhook,
  Activity,
  IndianRupee,
  Database,
  type LucideIcon,
} from "lucide-react";
import { getUser, logout } from "../lib/auth";
import { useNav } from "../lib/nav";
import { navForRole } from "../lib/access";
import WhatsAppIcon from "./WhatsAppIcon";

const ICONS: Record<string, LucideIcon | typeof WhatsAppIcon> = {
  dashboard: LayoutDashboard,
  users: Users,
  clock: CalendarClock,
  calendar: CalendarDays,
  building: Building2,
  team: UserRound,
  shield: ShieldCheck,
  settings: Settings,
  kanban: KanbanSquare,
  chart: BarChart3,
  sun: Sun,
  webhook: Webhook,
  activity: Activity,
  rupee: IndianRupee,
  database: Database,
  whatsapp: WhatsAppIcon,
};

export default function Sidebar() {
  const path = usePathname();
  const user = getUser();
  const { mobileOpen, setMobileOpen } = useNav();
  const items = navForRole(user?.role);

  let lastSection: string | undefined;

  return (
    <>
      <div
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-300 lg:hidden ${
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-64 shrink-0 flex-col overflow-hidden border-r border-slate-800 bg-slate-950 px-3 py-4 text-slate-300 shadow-2xl transition-transform duration-300 ease-in-out lg:static lg:h-screen lg:w-60 lg:translate-x-0 lg:px-3 lg:py-5 lg:shadow-xl ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between px-2 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500 text-sm font-extrabold text-white shadow-sm">DS</div>
            <div className="min-w-0">
              <b className="block text-base font-bold leading-tight text-white">Data Scraper</b>
              <span className="text-[10px] tracking-[0.18em] text-slate-400">CRM</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="scrollbar-none flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-1">
          {items.map(({ href, label, icon, section }) => {
            const Icon = ICONS[icon] || LayoutDashboard;
            const active = path === href || (href !== "/dashboard" && href !== "/business-dashboard" && path?.startsWith(`${href}/`));
            const header = section && section !== lastSection ? section : null;
            lastSection = section;
            return (
              <div key={href}>
                {header && <div className="mb-1 mt-4 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{header}</div>}
                <Link
                  href={href}
                  title={label}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`group flex min-h-10 shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${
                    active ? "bg-indigo-500/20 text-white shadow-xs ring-1 ring-indigo-400/40" : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="mt-3 flex shrink-0 items-center justify-between gap-2 border-t border-slate-800/80 px-1 pt-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
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
              <div title={user?.name || "User"} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-bold text-white">
                {user?.name?.[0]?.toUpperCase() || "U"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <b className="block truncate text-xs text-white">{user?.name || "User"}</b>
              <small className="block truncate text-[10px] text-slate-400">{user?.role === "BUSINESS" ? "BUSINESS PARTNER" : user?.role || ""}</small>
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
