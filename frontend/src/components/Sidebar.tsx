
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
  type LucideIcon,
} from "lucide-react";
import { getUser, logout } from "../lib/auth";

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

export default function Sidebar() {
  const path = usePathname();
  const user = getUser();

  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
    { href: "/leads", label: "Leads", Icon: Users },
    { href: "/followups", label: "Follow-ups", Icon: CalendarClock },
    ...(user?.role !== "SALES"
      ? [
          { href: "/business", label: "Business Projects", Icon: Building2 },
          { href: "/team", label: "Sales Team", Icon: UserRound },
          { href: "/integration", label: "Meta Setup", Icon: ShieldCheck },
        ]
      : []),
    { href: "/settings", label: "Settings", Icon: Settings },
  ];

  return (
    <aside className="flex h-screen w-[68px] shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-slate-950 px-2 py-3 text-slate-300 shadow-xl md:w-60 md:px-3 md:py-5">
      {/* Logo */}
      <div className="flex shrink-0 items-center justify-center gap-3 px-1 pb-5 md:justify-start md:px-2 md:pb-7">
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
      <nav className="scrollbar-none flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden">
        {items.map(({ href, label, Icon }) => {
          const active =
            path === href ||
            (href !== "/dashboard" && path?.startsWith(`${href}/`));

          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-current={active ? "page" : undefined}
              className={`group flex min-h-11 shrink-0 items-center justify-center gap-3 rounded-xl px-2 text-sm transition md:justify-start md:px-3 ${
                active
                  ? "bg-indigo-500/15 text-white ring-1 ring-indigo-400/30"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon size={19} className="shrink-0" />
              <span className="hidden truncate md:inline">{label}</span>
            </Link>
          );
        })}

        {user?.role !== "SALES" && (
          <div
            title="Transparency enabled"
            className="mt-3 flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-slate-800 px-2 text-xs text-slate-500 md:justify-start md:px-3"
          >
            <ShieldCheck size={16} className="shrink-0" />
            <span className="hidden truncate md:inline">
              Transparency enabled
            </span>
          </div>
        )}
      </nav>

      {/* User / Logout */}
      <div className="mt-3 flex shrink-0 flex-col-reverse items-center justify-center gap-2 border-t border-slate-800 pt-3 md:flex-row md:justify-start md:px-1">
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

        <div className="hidden min-w-0 flex-1 md:block">
          <b className="block truncate text-xs text-white">
            {user?.name || "User"}
          </b>
          <small className="text-[10px] text-slate-500">
            {user?.role || ""}
          </small>
        </div>

        <button
          type="button"
          onClick={logout}
          title="Logout"
          aria-label="Logout"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white"
        >
          <LogOut size={17} />
        </button>
      </div>
    </aside>
  );
}
