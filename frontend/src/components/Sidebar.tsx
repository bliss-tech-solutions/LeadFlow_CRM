"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  UserRound,
  LogOut,
  ShieldCheck,
  Building2,
} from "lucide-react";
import { getUser, logout } from "../lib/auth";

export default function Sidebar() {
  const path = usePathname();
  const user = getUser();

  const items = [
    ["/dashboard", "Dashboard", LayoutDashboard],
    ["/leads", "Leads", Users],
    ["/followups", "Follow-ups", CalendarClock],
    ...(user?.role !== "SALES"
      ? [
          ["/business", "Business Projects", Building2],
          ["/team", "Sales Team", UserRound],
          ["/audit", "Audit Log", ShieldCheck],
          ["/integration", "Meta Setup", ShieldCheck],
        ]
      : []),
  ];

  return (
    <aside
      className="flex h-screen w-[68px] flex-col overflow-hidden  border-r border-slate-200
        bg-slate-950
        px-2 py-3
        text-slate-300
        shadow-xl
        md:w-60 md:px-3 md:py-5
      "
    >
      {/* Logo */}
      <div
        className="
          flex shrink-0 items-center justify-center gap-3
          px-1 pb-5
          md:justify-start md:px-2 md:pb-7
        "
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500 text-sm font-extrabold text-white">
          LF
        </div>

        <div className="hidden min-w-0 md:block">
          <b className="block text-base text-white">LeadFlow</b>
          <span className="text-[10px] tracking-[0.18em] text-slate-500">
            CRM
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden scrollbar-none">
        {items.map(([href, label, Icon]) => {
          const active =
            path === href || (href !== "/dashboard" && path?.startsWith(href));

          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`
                group flex min-h-11 shrink-0 items-center justify-center gap-3
                rounded-xl px-2 text-sm transition
                md:justify-start md:px-3
                ${
                  active
                    ? "bg-indigo-500/15 text-white ring-1 ring-indigo-400/30"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }
              `}
            >
              <Icon size={19} className="shrink-0" />

              <span className="hidden truncate md:inline">{label}</span>
            </Link>
          );
        })}

        {user?.role !== "SALES" && (
          <div
            title="Transparency enabled"
            className="
              mt-3 flex min-h-11 shrink-0 items-center gap-2
              rounded-xl border border-slate-800
              px-2 text-xs text-slate-500
              md:justify-start md:px-3
            "
          >
            <ShieldCheck size={16} className="shrink-0" />

            <span className="hidden truncate md:inline">
              Transparency enabled
            </span>
          </div>
        )}
      </nav>

      {/* User / Logout */}
      <div
        className="
          mt-3 flex flex-col-reverse md:flex-row shrink-0 items-center justify-center gap-2
          border-t border-slate-800 pt-3
          md:justify-start md:px-1
        "
      >
        <div
          title={user?.name || "User"}
          className="
            grid h-9 w-9 shrink-0 place-items-center
            rounded-full bg-slate-800
            text-xs font-bold text-white
          "
        >
          {user?.name?.[0] || "U"}
        </div>

        <div className="hidden min-w-0 flex-1 md:block">
          <b className="block truncate text-xs text-white">{user?.name}</b>

          <small className="text-[10px] text-slate-500">{user?.role}</small>
        </div>

        <button
          onClick={logout}
          title="Logout"
          className="
            grid h-9 w-9 shrink-0 place-items-center
            rounded-lg text-slate-400
            transition hover:bg-white/5 hover:text-white
          "
        >
          <LogOut size={17} />
        </button>
      </div>
    </aside>
  );
}
