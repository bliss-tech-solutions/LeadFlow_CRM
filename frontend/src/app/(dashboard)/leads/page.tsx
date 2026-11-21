"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Topbar from "../../../components/Topbar";
import Pagination from "../../../components/Pagination";
import Modal, { btn, field } from "../../../components/Modal";
import StatusChangeModal from "../../../components/StatusChangeModal";
import ImportLeadsModal from "../../../components/ImportLeadsModal";
import WhatsAppSendDrawer from "../../../components/WhatsAppSendDrawer";
import WhatsAppIcon from "../../../components/WhatsAppIcon";
import { api, downloadFile } from "../../../lib/api";
import { getUser } from "../../../lib/auth";
import { socket } from "../../../lib/socket";
import { LEAD_STATUSES, statusStyles, statusLabel, scoreTone, telHref, timeAgo } from "../../../lib/leadMeta";
import {
  ExternalLink,
  Search,
  PauseCircle,
  X,
  Download,
  Loader2,
  UserRound,
  Sparkles,
  FileUp,
  Phone,
  KanbanSquare,
  Bookmark,
  BookmarkPlus,
  Tag,
  CheckSquare,
  Flame,
  Copy,
} from "lucide-react";

const EXCLUDED_TABLE_KEYS = new Set([
  "full_name", "name", "first_name", "last_name", "email", "phone_number", "phone", "contact", "lead_id", "leadgen_id", "id",
  "page_id", "page_name", "form_id", "form_name", "ad_id", "ad_name", "adset_id", "ad_set_id", "adgroup_id", "campaign_id",
  "campaign_name", "campaign", "ad_account_id", "ad_account_name", "created_at", "created_time", "platform", "raw_body", "form_data",
]);

function formatFieldName(value: string) {
  const cleaned = value.replaceAll("_", " ").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : value;
}

function formatFieldValue(val: any): string {
  if (val === null || val === undefined) return "";
  let str = Array.isArray(val) ? val.filter((v) => v !== null && v !== undefined).map(String).join(", ") : String(val);
  str = str.trim();
  if (!str || str.startsWith("{{") || str.toLowerCase() === "null") return "";
  if (str.includes("_") && !str.startsWith("http")) str = str.replaceAll("_", " ");
  return str;
}

function dynamicLeadFields(lead: any) {
  const result: Array<{ name: string; value: string }> = [];
  const seen = new Set<string>();
  const formData = lead?.meta?.formData || lead?.meta?.rawPayload?.form_data;
  if (formData && typeof formData === "object") {
    for (const [k, v] of Object.entries(formData)) {
      const lower = k.toLowerCase().trim();
      if (EXCLUDED_TABLE_KEYS.has(lower) || seen.has(lower)) continue;
      const val = formatFieldValue(v);
      if (val) {
        seen.add(lower);
        result.push({ name: formatFieldName(k), value: val });
      }
    }
  }
  for (const item of Array.isArray(lead?.meta?.fieldData) ? lead.meta.fieldData : []) {
    if (!item?.name) continue;
    const lower = String(item.name).toLowerCase().trim();
    if (EXCLUDED_TABLE_KEYS.has(lower) || seen.has(lower)) continue;
    const val = formatFieldValue(item.values);
    if (val) {
      seen.add(lower);
      result.push({ name: formatFieldName(String(item.name)), value: val });
    }
  }
  return result.slice(0, 3);
}

function projectLabel(l: any): string {
  const projName = l.businessProject?.name;
  const bizName = l.businessProject?.business?.name;
  if (projName && bizName && projName !== bizName) return `${projName} (${bizName})`;
  return projName || bizName || "Unmapped";
}

type Filters = {
  search: string;
  status: string;
  business: string;
  businessProject: string;
  assignedTo: string;
  dateFrom: string;
  dateTo: string;
  sort: string;
  city: string;
  product: string;
  quick: "" | "uncontacted" | "today" | "overdue" | "unassigned" | "hot";
};

const PRODUCT_TYPES = ["1BHK", "2BHK", "3BHK", "4BHK", "STUDIO", "PENTHOUSE", "COMMERCIAL_SHOP", "SHOWROOM", "OFFICE", "PLOT", "OTHER"];

const emptyFilters: Filters = {
  search: "",
  status: "",
  business: "",
  businessProject: "",
  assignedTo: "",
  dateFrom: "",
  dateTo: "",
  sort: "newest",
  city: "",
  product: "",
  quick: "",
};

function toParams(f: Filters) {
  const p = new URLSearchParams();
  if (f.search.trim()) p.set("search", f.search.trim());
  if (f.status) p.set("status", f.status);
  if (f.business) p.set("business", f.business);
  if (f.businessProject) p.set("businessProject", f.businessProject);
  if (f.assignedTo) p.set("assignedTo", f.assignedTo);
  if (f.dateFrom) p.set("dateFrom", f.dateFrom);
  if (f.dateTo) p.set("dateTo", f.dateTo);
  if (f.sort && f.sort !== "newest") p.set("sort", f.sort);
  if (f.city) p.set("city", f.city);
  if (f.product) p.set("product", f.product);
  if (f.quick === "uncontacted") p.set("uncontacted", "true");
  if (f.quick === "today") p.set("followup", "today");
  if (f.quick === "overdue") p.set("followup", "overdue");
  if (f.quick === "unassigned") p.set("unassigned", "true");
  if (f.quick === "hot") p.set("scoreMin", "70");
  return p;
}

export default function Leads() {
  const currentUser = getUser();
  const role = currentUser?.role;
  const isAdmin = role === "ADMIN" || role === "MANAGER";
  const canManageTeam = isAdmin || role === "BUSINESS";
  const canWhatsApp = role === "BUSINESS" || role === "SALES";

  const [leads, setLeads] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [salesUsers, setSalesUsers] = useState<any[]>([]);
  const [views, setViews] = useState<any[]>([]);
  const [productOptions, setProductOptions] = useState<string[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);

  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTarget, setAssignTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [statusChange, setStatusChange] = useState<{ status: string; ids: string[] } | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagValue, setTagValue] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [waLead, setWaLead] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [remapping, setRemapping] = useState(false);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState("");

  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api("/leads/views").then((d) => setViews(d.views || [])).catch(() => {});
    api("/leads/product-options").then((d) => setProductOptions(d.products || [])).catch(() => {});
    if (isAdmin) api("/businesses?limit=100").then((d) => setBusinesses(d.businesses || [])).catch(() => {});
    if (isAdmin) api("/meta-data/cities").then((d) => setCityOptions(d.cities || [])).catch(() => {});
    if (canManageTeam) api("/users?role=SALES&limit=100").then((d) => setSalesUsers(d.users || [])).catch(() => {});
  }, [isAdmin, canManageTeam]);

  // Scoped to the chosen business so the list can't miss projects past the 100 cap.
  useEffect(() => {
    const qs = filters.business ? `?business=${filters.business}&limit=100` : "?limit=100";
    api(`/business-projects${qs}`).then((d) => setProjects(d.projects || [])).catch(() => {});
  }, [filters.business]);

  const load = useCallback(
    async (p = page, f = filters) => {
      setLoading(true);
      try {
        const params = toParams(f);
        params.set("page", String(p));
        params.set("limit", "15");
        const d = await api(`/leads?${params.toString()}`);
        setLeads(d.leads || []);
        setMeta({ total: d.total || 0, pages: d.pages || 1 });
      } catch (e: any) {
        setBanner({ tone: "err", text: e?.message || "Could not load leads" });
      } finally {
        setLoading(false);
      }
    },
    [page, filters],
  );

  useEffect(() => setPage(1), [filters]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(page, filters), 300);
    return () => window.clearTimeout(t);
  }, [page, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime refresh when leads change elsewhere
  useEffect(() => {
    let t: number | undefined;
    const refresh = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => void load(), 800);
    };
    const events = ["new_lead", "lead_updated", "leads_assigned"];
    events.forEach((e) => socket.on(e, refresh));
    return () => {
      events.forEach((e) => socket.off(e, refresh));
      window.clearTimeout(t);
    };
  }, [load]);

  const allOnPageSelected = leads.length > 0 && leads.every((l) => selected.has(l._id));
  const toggleAll = () =>
    setSelected((s) => {
      const next = new Set(s);
      if (allOnPageSelected) leads.forEach((l) => next.delete(l._id));
      else leads.forEach((l) => next.add(l._id));
      return next;
    });
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function runBulk(body: Record<string, unknown>) {
    const ids = [...selected];
    const r = await api("/leads/bulk", { method: "POST", body: JSON.stringify({ ids, ...body }) });
    setBanner({ tone: "ok", text: `Updated ${r.updated} lead${r.updated === 1 ? "" : "s"}${r.skipped ? ` · ${r.skipped} skipped (not eligible)` : ""}.` });
    setSelected(new Set());
    await load();
  }

  async function confirmAssign() {
    if (!assignTarget || !assignUserId) return;
    setAssigning(true);
    try {
      if (assignTarget.ids.length === 1 && selected.size === 0) {
        await api(`/leads/${assignTarget.ids[0]}/assign`, { method: "PATCH", body: JSON.stringify({ userId: assignUserId }) });
        setBanner({ tone: "ok", text: "Lead assigned." });
        await load();
      } else {
        await runBulk({ action: "assign", userId: assignUserId });
      }
      setAssignTarget(null);
      setAssignUserId("");
    } catch (e: any) {
      setBanner({ tone: "err", text: e?.message || "Assignment failed" });
    } finally {
      setAssigning(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const q = toParams(filters).toString();
      await downloadFile(`/leads/export${q ? `?${q}` : ""}`, `leads-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e: any) {
      setBanner({ tone: "err", text: e?.message || "Export failed" });
    } finally {
      setDownloading(false);
    }
  }

  async function handleRemap() {
    setRemapping(true);
    try {
      const r = await api("/leads/remap", { method: "POST" });
      setBanner({ tone: "info", text: r.message || `Remapped ${r.remappedCount} leads.` });
      await load();
    } catch (e: any) {
      setBanner({ tone: "err", text: e?.message || "Remap failed" });
    } finally {
      setRemapping(false);
    }
  }

  async function saveView() {
    if (!viewName.trim()) return;
    try {
      const filtersObj = Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Record<string, string>;
      const d = await api("/leads/views", { method: "POST", body: JSON.stringify({ name: viewName.trim(), filters: filtersObj }) });
      setViews((v) => [...v, d.view]);
      setSaveViewOpen(false);
      setViewName("");
    } catch (e: any) {
      setBanner({ tone: "err", text: e?.message || "Could not save view" });
    }
  }

  async function deleteView(id: string) {
    await api(`/leads/views/${id}`, { method: "DELETE" }).catch(() => {});
    setViews((v) => v.filter((x) => x._id !== id));
  }

  const hasActiveFilters = useMemo(() => JSON.stringify(filters) !== JSON.stringify(emptyFilters), [filters]);
  const projectOptions = projects.filter((p) => !filters.business || String(p.business?._id || p.business) === filters.business);
  const eligibleForAssign = salesUsers.filter((s) => s.isActive !== false);

  const quickChips: { key: Filters["quick"]; label: string; show: boolean }[] = [
    { key: "uncontacted", label: "Not contacted", show: true },
    { key: "today", label: "Follow-up today", show: true },
    { key: "overdue", label: "Overdue", show: true },
    { key: "hot", label: "🔥 Hot (70+)", show: true },
    { key: "unassigned", label: "Unassigned", show: canManageTeam },
  ];

  return (
    <div className="space-y-5">
      <Topbar
        title={role === "SALES" ? "My leads" : "Leads"}
        subtitle="Every enquiry, its owner and the next action — in one place."
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Primary toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 p-3 sm:p-4">
          <div className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 text-slate-400 sm:max-w-sm">
            <Search size={15} />
            <input
              value={filters.search}
              onChange={(e) => setF("search", e.target.value)}
              placeholder="Search name, phone, email, campaign, tag…"
              className="w-full text-sm text-slate-800 outline-none"
              aria-label="Search leads"
            />
            {filters.search && (
              <button onClick={() => setF("search", "")} aria-label="Clear search" className="text-slate-400 hover:text-slate-700">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {isAdmin && (
              <Link href="/pipeline" className={btn.secondary}>
                <KanbanSquare size={14} /> Pipeline
              </Link>
            )}
            {canManageTeam && (
              <button onClick={() => setImportOpen(true)} className={btn.secondary}>
                <FileUp size={14} /> Import CSV
              </button>
            )}
            <button onClick={handleDownload} disabled={downloading} className={btn.secondary} title="Export the current view to Excel">
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} className="text-emerald-600" />} Export
            </button>
            {isAdmin && (
              <button onClick={handleRemap} disabled={remapping} className={btn.secondary} title="Link unmapped leads to matching projects">
                {remapping ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-indigo-600" />} Remap
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-3 py-3 sm:px-4">
          {isAdmin && (
            <select
              value={filters.business}
              onChange={(e) => setFilters((f) => ({ ...f, business: e.target.value, businessProject: "" }))}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
              aria-label="Business"
            >
              <option value="">All businesses</option>
              {businesses.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {isAdmin && (
            <select value={filters.city} onChange={(e) => setF("city", e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700" aria-label="City">
              <option value="">All cities</option>
              {cityOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <select value={filters.businessProject} onChange={(e) => setF("businessProject", e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700" aria-label="Project">
            <option value="">All projects</option>
            {projectOptions.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
          <select value={filters.status} onChange={(e) => setF("status", e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700" aria-label="Status">
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
          {canManageTeam && (
            <select value={filters.assignedTo} onChange={(e) => setF("assignedTo", e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700" aria-label="Salesperson">
              <option value="">All salespeople</option>
              {salesUsers.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <input type="date" value={filters.dateFrom} onChange={(e) => setF("dateFrom", e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs" aria-label="From date" />
            <span>–</span>
            <input type="date" value={filters.dateTo} onChange={(e) => setF("dateTo", e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs" aria-label="To date" />
          </div>
          <select value={filters.sort} onChange={(e) => setF("sort", e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700" aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="score">Highest score</option>
            <option value="followup">Next follow-up</option>
            <option value="product">Product (A–Z)</option>
            <option value="price_desc">Price (high–low)</option>
          </select>
          <select
            value={filters.product}
            onChange={(e) => setF("product", e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
            aria-label="Product"
          >
            <option value="">All products</option>
            {(productOptions.length ? productOptions : PRODUCT_TYPES).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {isAdmin && (
            <button
              onClick={async () => {
                const qs = toParams(filters);
                qs.set("groupBy", "product");
                await downloadFile(`/reports/leads.pdf?${qs}`, `leads-${new Date().toISOString().slice(0,10)}.pdf`);
              }}
              title="Download PDF report"
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              <Download size={13} /> PDF
            </button>
          )}
          {hasActiveFilters && (
            <button onClick={() => setFilters(emptyFilters)} className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs text-slate-500 hover:bg-white hover:text-slate-800">
              <X size={13} /> Clear
            </button>
          )}
        </div>

        {/* Quick chips + saved views */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-2.5 sm:px-4">
          {quickChips
            .filter((c) => c.show)
            .map((c) => (
              <button
                key={c.key}
                onClick={() => setF("quick", filters.quick === c.key ? "" : c.key)}
                className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                  filters.quick === c.key ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {c.label}
              </button>
            ))}
          <span className="mx-1 hidden h-4 w-px bg-slate-200 sm:block" />
          {views.map((v) => (
            <span key={v._id} className="group inline-flex items-center rounded-full border border-slate-200 bg-white text-[11px] text-slate-600">
              <button onClick={() => setFilters({ ...emptyFilters, ...v.filters })} className="inline-flex items-center gap-1 py-1 pl-2.5 pr-1 hover:text-indigo-700">
                <Bookmark size={11} /> {v.name}
              </button>
              <button onClick={() => deleteView(v._id)} aria-label={`Delete view ${v.name}`} className="rounded-full px-1.5 py-1 text-slate-300 hover:text-rose-600">
                <X size={11} />
              </button>
            </span>
          ))}
          {hasActiveFilters && (
            <button onClick={() => setSaveViewOpen(true)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50">
              <BookmarkPlus size={12} /> Save view
            </button>
          )}
          <span className="ml-auto text-[11px] text-slate-400">{meta.total} leads</span>
        </div>

        {banner && (
          <div
            className={`flex items-center justify-between px-4 py-2 text-xs ${
              banner.tone === "err" ? "bg-rose-50 text-rose-700" : banner.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-indigo-50 text-indigo-800"
            }`}
          >
            <span>{banner.text}</span>
            <button onClick={() => setBanner(null)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-indigo-100 bg-indigo-600 px-4 py-2.5 text-xs text-white">
            <CheckSquare size={15} />
            <b>{selected.size} selected</b>
            <select
              value=""
              onChange={(e) => e.target.value && setStatusChange({ status: e.target.value, ids: [...selected] })}
              className="h-8 rounded-lg border-0 bg-white/15 px-2 text-xs text-white [&>option]:text-slate-800"
              aria-label="Change status of selected leads"
            >
              <option value="">Change status…</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
            {canManageTeam && (
              <button onClick={() => setAssignTarget({ ids: [...selected], label: `${selected.size} leads` })} className="inline-flex h-8 items-center gap-1 rounded-lg bg-white/15 px-2.5 hover:bg-white/25">
                <UserRound size={13} /> Assign
              </button>
            )}
            <button onClick={() => setTagOpen(true)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-white/15 px-2.5 hover:bg-white/25">
              <Tag size={13} /> Tag
            </button>
            <button onClick={() => setSelected(new Set())} className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-2 hover:bg-white/15">
              <X size={13} /> Clear
            </button>
          </div>
        )}

        {/* Mobile cards */}
        <div className="divide-y divide-slate-100 lg:hidden">
          {leads.map((l) => {
            const unassigned = !l.assignedTo?._id;
            return (
              <div key={l._id} className="space-y-2.5 bg-white p-3.5 transition hover:bg-slate-50/70 sm:p-4">
                <div className="flex items-start gap-2.5">
                  <input type="checkbox" checked={selected.has(l._id)} onChange={() => toggle(l._id)} className="mt-1 h-4 w-4 accent-indigo-600" aria-label={`Select ${l.name}`} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/leads/${l._id}`} className="block truncate text-sm font-bold text-slate-900 hover:text-indigo-600">
                      {l.name || "Unnamed lead"}
                    </Link>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{l.phone || l.email || "No contact details"}</span>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ${statusStyles[l.status] || statusStyles.CONTACTED}`}>{statusLabel(l.status)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="max-w-[220px] truncate rounded-lg bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{projectLabel(l)}</span>
                  <span className={`rounded-lg px-2 py-0.5 font-semibold ring-1 ${scoreTone(l.score)}`}>{l.score ?? 0}</span>
                  {l.duplicateOf && <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-amber-700">Repeat</span>}
                  <span className="ml-auto text-slate-400">{timeAgo(l.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                  <div className="min-w-0 text-xs text-slate-600">
                    {l.assignedTo?.name ? (
                      <span className="truncate">
                        Owner: <b>{l.assignedTo.name}</b>
                      </span>
                    ) : canManageTeam && unassigned ? (
                      <button onClick={() => setAssignTarget({ ids: [l._id], label: l.name })} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                        <UserRound size={12} /> Assign
                      </button>
                    ) : (
                      <span className="text-amber-600">Unassigned</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {telHref(l.phone) && (
                      <a href={telHref(l.phone)} aria-label={`Call ${l.name}`} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-700">
                        <Phone size={14} />
                      </a>
                    )}
                    {canWhatsApp && l.phone && (
                      <button onClick={() => setWaLead(l._id)} aria-label={`WhatsApp ${l.name}`} className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                        <WhatsAppIcon size={15} />
                      </button>
                    )}
                    <Link href={`/leads/${l._id}`} className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700">
                      Open <ExternalLink size={12} />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} className="h-4 w-4 accent-indigo-600" aria-label="Select all on page" />
                </th>
                {["Lead", "Project", "Source / Campaign", "Form details", "Status", "Score", "Owner", "Created", ""].map((x) => (
                  <th key={x} className="px-4 py-3 font-semibold">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const unassigned = !l.assignedTo?._id;
                const extras = dynamicLeadFields(l);
                return (
                  <tr key={l._id} className={`border-t border-slate-100 hover:bg-slate-50/70 ${selected.has(l._id) ? "bg-indigo-50/40" : ""}`}>
                    <td className="px-4 py-3.5">
                      <input type="checkbox" checked={selected.has(l._id)} onChange={() => toggle(l._id)} className="h-4 w-4 accent-indigo-600" aria-label={`Select ${l.name}`} />
                    </td>
                    <td className="px-4 py-3.5">
                      <Link href={`/leads/${l._id}`} className="font-bold text-slate-900 hover:text-indigo-600">
                        {l.name || "Unnamed lead"}
                      </Link>
                      <span className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                        {l.phone || l.email || "No contact details"}
                        {l.duplicateOf && (
                          <span title="Repeat enquiry" className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 text-amber-700">
                            <Copy size={9} /> repeat
                          </span>
                        )}
                      </span>
                      {l.tags?.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {l.tags.slice(0, 3).map((t: string) => (
                            <span key={t} className="rounded bg-slate-100 px-1.5 text-[9px] text-slate-600">
                              #{t}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3.5">{projectLabel(l)}</td>
                    <td className="px-4 py-3.5">
                      <span className="font-medium">{String(l.source || "—").replaceAll("_", " ")}</span>
                      <span className="mt-1 block max-w-[180px] truncate text-[10px] text-slate-400">{l.campaign || l.formName || "—"}</span>
                    </td>
                    <td className="max-w-[240px] px-4 py-3.5">
                      {extras.length ? (
                        <div className="space-y-1">
                          {extras.map((item) => (
                            <div key={item.name} className="truncate text-[10px]">
                              <span className="font-semibold text-slate-500">{item.name}:</span> <span className="text-slate-700">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${statusStyles[l.status] || statusStyles.CONTACTED}`}>{statusLabel(l.status)}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${scoreTone(l.score)}`}>
                        {Number(l.score) >= 70 && <Flame size={10} />} {l.score ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {l.assignedTo?.name ? (
                        <span className="font-medium text-slate-800">{l.assignedTo.name}</span>
                      ) : canManageTeam && unassigned ? (
                        <button onClick={() => setAssignTarget({ ids: [l._id], label: l.name })} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                          <UserRound size={12} /> Assign
                        </button>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-500" title={new Date(l.createdAt).toLocaleString()}>
                      {timeAgo(l.createdAt)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {telHref(l.phone) && (
                          <a href={telHref(l.phone)} title="Call" aria-label={`Call ${l.name}`} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                            <Phone size={14} />
                          </a>
                        )}
                        {canWhatsApp && l.phone && (
                          <button onClick={() => setWaLead(l._id)} title="Send on WhatsApp" aria-label={`WhatsApp ${l.name}`} className="grid h-8 w-8 place-items-center rounded-lg text-emerald-600 hover:bg-emerald-50">
                            <WhatsAppIcon size={16} />
                          </button>
                        )}
                        <Link href={`/leads/${l._id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1.5 font-semibold text-indigo-700 hover:bg-indigo-100">
                          <ExternalLink size={12} /> Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        )}
        {!loading && !leads.length && (
          <div className="p-12 text-center text-sm text-slate-500">
            <PauseCircle className="mx-auto mb-2 text-slate-300" size={26} />
            {hasActiveFilters ? "No leads match these filters." : "No leads yet. New Meta leads will appear here in real time."}
            {hasActiveFilters && (
              <button onClick={() => setFilters(emptyFilters)} className="mt-2 block w-full text-xs font-semibold text-indigo-600">
                Clear filters
              </button>
            )}
          </div>
        )}
        {!loading && <Pagination page={page} pages={meta.pages} total={meta.total} label="leads" onChange={setPage} />}
      </section>

      {/* Assign modal */}
      <Modal
        open={Boolean(assignTarget)}
        onClose={() => setAssignTarget(null)}
        size="sm"
        title="Assign to salesperson"
        subtitle={assignTarget?.label}
        footer={
          <>
            <button className={btn.secondary} onClick={() => setAssignTarget(null)} disabled={assigning}>
              Cancel
            </button>
            <button className={btn.primary} onClick={confirmAssign} disabled={assigning || !assignUserId}>
              {assigning && <Loader2 size={13} className="animate-spin" />} Assign
            </button>
          </>
        }
      >
        <label className="text-xs font-semibold text-slate-700">
          Salesperson
          <select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} className={field}>
            <option value="">Choose…</option>
            {eligibleForAssign.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name}
                {u.business?.name ? ` · ${u.business.name}` : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-[11px] text-slate-500">Only salespeople who work on the lead's project can receive it — others are skipped automatically.</p>
      </Modal>

      {/* Tag modal */}
      <Modal
        open={tagOpen}
        onClose={() => setTagOpen(false)}
        size="sm"
        title="Tag selected leads"
        footer={
          <>
            <button className={btn.secondary} onClick={() => setTagOpen(false)}>
              Cancel
            </button>
            <button
              className={btn.primary}
              disabled={!tagValue.trim()}
              onClick={async () => {
                try {
                  await runBulk({ action: "tag", tag: tagValue.trim().toLowerCase() });
                  setTagOpen(false);
                  setTagValue("");
                } catch (e: any) {
                  setBanner({ tone: "err", text: e?.message || "Tagging failed" });
                }
              }}
            >
              Add tag
            </button>
          </>
        }
      >
        <input value={tagValue} onChange={(e) => setTagValue(e.target.value)} maxLength={40} placeholder="e.g. site-visit-done" className={field} />
      </Modal>

      {/* Save view modal */}
      <Modal
        open={saveViewOpen}
        onClose={() => setSaveViewOpen(false)}
        size="sm"
        title="Save this view"
        subtitle="Quickly re-apply these filters later."
        footer={
          <>
            <button className={btn.secondary} onClick={() => setSaveViewOpen(false)}>
              Cancel
            </button>
            <button className={btn.primary} onClick={saveView} disabled={!viewName.trim()}>
              Save
            </button>
          </>
        }
      >
        <input value={viewName} onChange={(e) => setViewName(e.target.value)} maxLength={60} placeholder="e.g. Hot leads this week" className={field} />
      </Modal>

      <StatusChangeModal
        open={Boolean(statusChange)}
        status={statusChange?.status || null}
        count={statusChange?.ids.length}
        onClose={() => setStatusChange(null)}
        onConfirm={async ({ status, lostReason }) => {
          await runBulk({ action: "status", status, lostReason });
        }}
      />

      <ImportLeadsModal open={importOpen} onClose={() => setImportOpen(false)} projects={projects} onDone={() => void load(1)} />

      <WhatsAppSendDrawer leadId={waLead} onClose={() => setWaLead(null)} />
    </div>
  );
}
