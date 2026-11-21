export const LEAD_STATUSES = ["NEW", "CONTACTED", "INTERESTED", "FOLLOW_UP", "SCHEDULED", "WON", "LOST", "NOT_INTERESTED"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Status pill colors (bg + text), mirrored from the website's leadMeta. */
export const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  NEW: { bg: "bg-sky-50 dark:bg-sky-950", text: "text-sky-700 dark:text-sky-300", dot: "#0EA5E9" },
  CONTACTED: { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-700 dark:text-slate-300", dot: "#64748B" },
  INTERESTED: { bg: "bg-emerald-50 dark:bg-emerald-950", text: "text-emerald-700 dark:text-emerald-300", dot: "#10B981" },
  FOLLOW_UP: { bg: "bg-amber-50 dark:bg-amber-950", text: "text-amber-700 dark:text-amber-300", dot: "#F59E0B" },
  SCHEDULED: { bg: "bg-violet-50 dark:bg-violet-950", text: "text-violet-700 dark:text-violet-300", dot: "#8B5CF6" },
  WON: { bg: "bg-green-100 dark:bg-green-950", text: "text-green-800 dark:text-green-300", dot: "#16A34A" },
  LOST: { bg: "bg-rose-50 dark:bg-rose-950", text: "text-rose-700 dark:text-rose-300", dot: "#F43F5E" },
  NOT_INTERESTED: { bg: "bg-red-50 dark:bg-red-950", text: "text-red-700 dark:text-red-300", dot: "#EF4444" },
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

export const CALL_RESULTS = [
  { value: "CONNECTED", label: "Connected", icon: "phone-check" },
  { value: "NOT_PICKED", label: "Didn't pick up", icon: "phone-missed" },
  { value: "BUSY", label: "Busy", icon: "phone-busy" },
  { value: "CALLBACK_REQUESTED", label: "Call back later", icon: "phone-return" },
  { value: "WRONG_NUMBER", label: "Wrong number", icon: "phone-x" },
] as const;

export const FOLLOWUP_TYPES = ["CALL", "SITE VISIT", "ONLINE MEETING", "OFFLINE MEETING", "EMAIL"];

export const MANUAL_SOURCES = [
  { value: "WALK_IN", label: "Walk-in" },
  { value: "REFERRAL", label: "Referral" },
  { value: "PHONE", label: "Phone enquiry" },
  { value: "WEBSITE", label: "Website" },
  { value: "MANUAL", label: "Other" },
];

export const statusLabel = (s?: string) =>
  String(s || "NEW")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

export function scoreTone(score?: number) {
  const v = Number(score || 0);
  if (v >= 70) return { label: "Hot", bg: "bg-rose-50 dark:bg-rose-950", text: "text-rose-700 dark:text-rose-300" };
  if (v >= 45) return { label: "Warm", bg: "bg-amber-50 dark:bg-amber-950", text: "text-amber-700 dark:text-amber-300" };
  return { label: "Cold", bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-300" };
}

export function timeAgo(date?: string | Date | null) {
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

export function formatDateTime(date?: string | Date | null) {
  if (!date) return "—";
  return new Date(date).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function inr(n?: number) {
  const v = Number(n || 0);
  if (!v) return "₹0";
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export function initials(name?: string) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Digits for tel: links. */
export function telUrl(phone?: string) {
  const d = String(phone || "").replace(/[^\d+]/g, "");
  return d ? `tel:${d}` : null;
}

/** Meta form answers, excluding system/contact keys (same rules as the website). */
const EXCLUDED = new Set([
  "full_name", "name", "first_name", "last_name", "email", "phone_number", "phone", "contact", "lead_id", "leadgen_id", "id",
  "page_id", "page_name", "form_id", "form_name", "ad_id", "ad_name", "adset_id", "ad_set_id", "adgroup_id", "campaign_id",
  "campaign_name", "campaign", "ad_account_id", "created_at", "created_time", "platform", "raw_body", "form_data", "is_organic",
]);

export function formAnswers(lead: any): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  const seen = new Set<string>();
  const push = (k: string, v: any) => {
    const key = k.toLowerCase().trim();
    if (EXCLUDED.has(key) || seen.has(key)) return;
    const val = (Array.isArray(v) ? v.join(", ") : String(v ?? "")).trim();
    if (!val || val.startsWith("{{") || val === "null") return;
    seen.add(key);
    out.push({ name: k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), value: val.includes("_") && !val.startsWith("http") ? val.replace(/_/g, " ") : val });
  };
  const fd = lead?.meta?.formData || lead?.formData || lead?.meta?.rawPayload?.form_data;
  if (fd && typeof fd === "object") Object.entries(fd).forEach(([k, v]) => push(k, v));
  (lead?.meta?.fieldData || []).forEach((f: any) => f?.name && push(String(f.name), f.values));
  return out;
}
