export const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "FOLLOW_UP",
  "SCHEDULED",
  "WON",
  "LOST",
  "NOT_INTERESTED",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const statusStyles: Record<string, string> = {
  NEW: "bg-sky-50 text-sky-700 ring-sky-200",
  CONTACTED: "bg-slate-100 text-slate-700 ring-slate-200",
  INTERESTED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  FOLLOW_UP: "bg-amber-50 text-amber-700 ring-amber-200",
  SCHEDULED: "bg-violet-50 text-violet-700 ring-violet-200",
  WON: "bg-green-100 text-green-800 ring-green-200",
  LOST: "bg-rose-50 text-rose-700 ring-rose-200",
  NOT_INTERESTED: "bg-red-50 text-red-700 ring-red-200",
};

export const statusAccent: Record<string, string> = {
  NEW: "border-t-sky-400",
  CONTACTED: "border-t-slate-400",
  INTERESTED: "border-t-emerald-400",
  FOLLOW_UP: "border-t-amber-400",
  SCHEDULED: "border-t-violet-400",
  WON: "border-t-green-500",
  LOST: "border-t-rose-400",
  NOT_INTERESTED: "border-t-red-400",
};

export const LOST_REASONS = [
  "Budget mismatch",
  "Location not suitable",
  "Bought elsewhere",
  "Not reachable",
  "Just browsing",
  "Wrong number / fake lead",
  "Timeline too long",
  "Financing issue",
  "Other",
];

export const MANUAL_SOURCES = [
  { value: "WALK_IN", label: "Walk-in" },
  { value: "REFERRAL", label: "Referral" },
  { value: "PHONE", label: "Phone enquiry" },
  { value: "WEBSITE", label: "Website" },
  { value: "MANUAL", label: "Other / manual" },
];

export function statusLabel(s?: string) {
  return String(s || "NEW").replaceAll("_", " ");
}

export function scoreTone(score?: number) {
  const v = Number(score || 0);
  if (v >= 70) return "bg-rose-50 text-rose-700 ring-rose-200";
  if (v >= 45) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

export function scoreLabel(score?: number) {
  const v = Number(score || 0);
  if (v >= 70) return "Hot";
  if (v >= 45) return "Warm";
  return "Cold";
}

/** Digits-only phone for tel: / wa.me style links. */
export function telHref(phone?: string) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : undefined;
}

export function timeAgo(date?: string | Date) {
  if (!date) return "—";
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(date).toLocaleDateString();
}
