import type { User } from "./auth";

export type Role = User["role"];

export type NavEntry = { href: string; label: string; icon: string; section?: string };

/**
 * Single source of truth for which screens each role can open.
 * The backend enforces the real permissions; this keeps the UI honest so users
 * never land on pages that would only return "forbidden".
 */
const NAV: Record<Role, NavEntry[]> = {
  ADMIN: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/leads", label: "Leads", icon: "users" },
    { href: "/pipeline", label: "Pipeline", icon: "kanban" },
    { href: "/followups", label: "Follow-ups", icon: "clock" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/analytics", label: "Analytics", icon: "chart" },
    { href: "/spend", label: "Ad Spend", icon: "rupee", section: "Insights" },
    { href: "/contacts", label: "Contact Data", icon: "database", section: "Insights" },
    { href: "/business", label: "Businesses", icon: "building", section: "Manage" },
    { href: "/team", label: "Sales Team", icon: "team", section: "Manage" },
    { href: "/integration", label: "Meta Setup", icon: "shield", section: "Platform" },
    { href: "/webhooks", label: "Webhook Log", icon: "webhook", section: "Platform" },
    { href: "/platform", label: "Platform Health", icon: "activity", section: "Platform" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  MANAGER: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/leads", label: "Leads", icon: "users" },
    { href: "/pipeline", label: "Pipeline", icon: "kanban" },
    { href: "/followups", label: "Follow-ups", icon: "clock" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/analytics", label: "Analytics", icon: "chart" },
    { href: "/spend", label: "Ad Spend", icon: "rupee", section: "Insights" },
    { href: "/contacts", label: "Contact Data", icon: "database", section: "Insights" },
    { href: "/business", label: "Businesses", icon: "building", section: "Manage" },
    { href: "/team", label: "Sales Team", icon: "team", section: "Manage" },
    { href: "/integration", label: "Meta Setup", icon: "shield", section: "Platform" },
    { href: "/webhooks", label: "Webhook Log", icon: "webhook", section: "Platform" },
    { href: "/platform", label: "Platform Health", icon: "activity", section: "Platform" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  BUSINESS: [
    { href: "/business-dashboard", label: "Partner Dashboard", icon: "dashboard" },
    { href: "/my-day", label: "My Day", icon: "sun" },
    { href: "/leads", label: "Project Leads", icon: "users" },
    { href: "/followups", label: "Follow-ups", icon: "clock" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/analytics", label: "Analytics", icon: "chart" },
    { href: "/business", label: "Projects & Portfolio", icon: "building", section: "Manage" },
    { href: "/team", label: "Sales Staff", icon: "team", section: "Manage" },
    { href: "/whatsapp", label: "WhatsApp", icon: "whatsapp", section: "Manage" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  SALES: [
    { href: "/my-day", label: "My Day", icon: "sun" },
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/leads", label: "My Leads", icon: "users" },
    { href: "/followups", label: "Follow-ups", icon: "clock" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/analytics", label: "My Performance", icon: "chart" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
};

/** Extra route prefixes reachable from inside pages (detail screens). */
const EXTRA: Record<Role, string[]> = {
  ADMIN: ["/leads/", "/business/", "/business-accounts", "/spend"],
  MANAGER: ["/leads/", "/business/", "/business-accounts", "/spend"],
  BUSINESS: ["/leads/", "/business/"],
  SALES: ["/leads/"],
};

export function navForRole(role?: Role): NavEntry[] {
  return role ? NAV[role] : [];
}

export function homeForRole(role?: Role) {
  if (role === "BUSINESS") return "/business-dashboard";
  if (role === "SALES") return "/my-day";
  return "/dashboard";
}

export function canAccessPath(role: Role | undefined, path: string) {
  if (!role) return false;
  const p = path.replace(/\/+$/, "") || "/";
  if (NAV[role].some((n) => p === n.href || p.startsWith(`${n.href}/`))) return true;
  return EXTRA[role].some((prefix) => p.startsWith(prefix));
}
