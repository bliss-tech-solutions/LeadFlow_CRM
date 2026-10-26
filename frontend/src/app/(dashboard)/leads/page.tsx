"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Topbar from "../../../components/Topbar";
import Pagination from "../../../components/Pagination";
import { api, downloadFile } from "../../../lib/api";
import { getUser } from "../../../lib/auth";
import { ExternalLink, Search, PauseCircle, X, Download, Loader2, UserRound } from "lucide-react";

const statuses = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "FOLLOW_UP",
  "SCHEDULED",
  "WON",
  "LOST",
  "NOT_INTERESTED",
];

const statusStyles: Record<string, string> = {
  NEW: "bg-sky-50 text-sky-700 ring-sky-200",
  CONTACTED: "bg-slate-100 text-slate-700 ring-slate-200",
  INTERESTED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  FOLLOW_UP: "bg-amber-50 text-amber-700 ring-amber-200",
  SCHEDULED: "bg-violet-50 text-violet-700 ring-violet-200",
  WON: "bg-green-100 text-green-800 ring-green-200",
  LOST: "bg-rose-50 text-rose-700 ring-rose-200",
  NOT_INTERESTED: "bg-red-50 text-red-700 ring-red-200",
};

const EXCLUDED_TABLE_KEYS = new Set([
  "full_name", "name", "first_name", "last_name",
  "email", "phone_number", "phone", "contact",
  "lead_id", "leadgen_id", "id",
  "page_id", "page_name", "form_id", "form_name",
  "ad_id", "ad_name", "adset_id", "ad_set_id", "adgroup_id",
  "campaign_id", "campaign_name", "campaign",
  "ad_account_id", "ad_account_name",
  "created_at", "created_time", "platform", "raw_body", "form_data"
]);

function formatFieldName(value: string) {
  const cleaned = value.replaceAll("_", " ").trim();
  if (!cleaned) return value;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
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

  const fields = Array.isArray(lead?.meta?.fieldData) ? lead.meta.fieldData : [];
  for (const item of fields) {
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

export default function Leads() {
  const currentUser = getUser();
  const isAdmin = currentUser?.role === "ADMIN";

  const [leads, setLeads] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState("");
  const [salesUsers, setSalesUsers] = useState<any[]>([]);
  const [assignModalLead, setAssignModalLead] = useState<any | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState("");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [businessProject, setBusinessProject] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    api("/business-projects?limit=100")
      .then((d) => setProjects(d.projects || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isAdmin) {
      api("/businesses")
        .then((d) => setBusinesses(d.businesses || []))
        .catch(() => {});
      api("/users?role=SALES")
        .then((d) => setSalesUsers(d.users || []))
        .catch(() => {});
    }
  }, [isAdmin]);

  function openAssignModal(lead: any) {
    setAssignModalLead(lead);
    setSelectedUserId("");
    setAssignError("");
  }

  function closeAssignModal() {
    setAssignModalLead(null);
    setSelectedUserId("");
    setAssignError("");
  }

  async function handleAssignSubmit() {
    if (!assignModalLead?._id) return;
    if (!selectedUserId) {
      setAssignError("Please select a salesperson");
      return;
    }
    setAssigning(true);
    setAssignError("");
    try {
      await api(`/leads/${assignModalLead._id}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ userId: selectedUserId }),
      });
      closeAssignModal();
      void load(page, q, status, businessProject);
    } catch (err: any) {
      setAssignError(err?.message || "Failed to assign lead");
    } finally {
      setAssigning(false);
    }
  }

  async function load(
    currentPage = page,
    currentSearch = q,
    currentStatus = status,
    currentBusiness = businessProject,
    currentBizGroup = selectedBusiness,
  ) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: "10",
      });
      if (currentSearch.trim()) params.set("search", currentSearch.trim());
      if (currentStatus) params.set("status", currentStatus);
      if (currentBizGroup) params.set("business", currentBizGroup);
      if (currentBusiness) params.set("businessProject", currentBusiness);
      const d = await api(`/leads?${params.toString()}`);
      setLeads(d.leads || []);
      setMeta({ total: d.total || 0, pages: d.pages || 1 });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [q, status, businessProject, selectedBusiness]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(page, q, status, businessProject, selectedBusiness);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [page, q, status, businessProject, selectedBusiness]);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("search", q.trim());
      if (status) params.set("status", status);
      if (selectedBusiness) params.set("business", selectedBusiness);
      if (businessProject) params.set("businessProject", businessProject);
      const queryStr = params.toString();
      await downloadFile(
        `/leads/export${queryStr ? `?${queryStr}` : ""}`,
        `leads-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (err: any) {
      setDownloadError(err?.message || "Failed to download leads Excel file");
    } finally {
      setDownloading(false);
    }
  }

  function clearAllFilters() {
    setQ("");
    setStatus("");
    setSelectedBusiness("");
    setBusinessProject("");
  }

  const hasActiveFilters = Boolean(q || status || businessProject || selectedBusiness);

  return (
    <div className="space-y-5">
      <Topbar
        title="Leads"
        subtitle="Released leads, ownership, source mapping and next action. Sorted by latest update."
      />
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 p-3 sm:p-4">
          <div className="flex h-10 w-full sm:w-auto sm:max-w-xs flex-1 min-w-[200px] items-center gap-2 rounded-xl border border-slate-200 px-3 text-slate-400">
            <Search size={15} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email, phone, Meta fields..."
              className="w-full text-sm outline-none"
            />
            {q && (
              <button onClick={() => setQ("")} className="text-slate-400 hover:text-slate-700">
                <X size={14} />
              </button>
            )}
          </div>

          {isAdmin && (
            <select
              value={selectedBusiness}
              onChange={(e) => {
                setSelectedBusiness(e.target.value);
                setBusinessProject("");
              }}
              className="h-10 w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none"
            >
              <option value="">All Businesses</option>
              {businesses.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={businessProject}
            onChange={(e) => setBusinessProject(e.target.value)}
            className="h-10 w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none"
          >
            <option value="">All Projects</option>
            {projects
              .filter((p) => !selectedBusiness || p.business?._id === selectedBusiness || p.business === selectedBusiness)
              .map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none"
          >
            <option value="">All statuses</option>
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="inline-flex h-10 w-full sm:w-auto items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            >
              <X size={13} /> Clear
            </button>
          )}

          <div className="w-full sm:w-auto sm:ml-auto flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex h-10 w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
              title="Download leads as Excel file"
            >
              {downloading ? (
                <Loader2 size={14} className="animate-spin text-slate-500" />
              ) : (
                <Download size={14} className="text-emerald-600" />
              )}
              {downloading ? "Exporting..." : "Download Excel"}
            </button>
          </div>
        </div>

        {downloadError && (
          <div className="flex items-center justify-between border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">
            <span>{downloadError}</span>
            <button onClick={() => setDownloadError("")} className="text-rose-500 hover:text-rose-700">
              <X size={14} />
            </button>
          </div>
        )}

        {isAdmin && leads.some((l) => !l.assignedTo || !l.assignedTo?._id) && (
          <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50/80 px-5 py-3 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-200 text-amber-800 text-[10px] font-bold">
                !
              </span>
              <span>
                <strong>Reminder:</strong> You have unassigned {leads.filter((l) => !l.assignedTo || !l.assignedTo?._id).length === 1 ? "lead" : "leads"} on this page. Assign them to a salesperson to start follow-ups.
              </span>
            </div>
          </div>
        )}

        {/* Mobile & Tablet Card View (< lg: vertical cards, no horizontal scrolling) */}
        <div className="block lg:hidden divide-y divide-slate-100">
          {leads.map((l) => {
            const extras = dynamicLeadFields(l);
            const isUnassigned = !l.assignedTo || !l.assignedTo?._id;
            return (
              <div key={l._id} className="p-4 space-y-3 bg-white hover:bg-slate-50/60 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/leads/${l._id}`}
                      className="font-bold text-sm text-slate-900 hover:text-indigo-600 block truncate"
                    >
                      {l.name || "Unnamed lead"}
                    </Link>
                    <span className="text-xs text-slate-500 block mt-0.5 truncate">
                      {l.phone || l.email || "No contact details"}
                    </span>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold shrink-0 ring-1 ${statusStyles[l.status] || "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                    {String(l.status || "NEW").replaceAll("_", " ")}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-slate-50 p-2.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Business</span>
                    <span className="font-semibold text-slate-800 truncate block mt-0.5">
                      {l.businessProject?.name || l.meta?.businessId || "Unmapped"}
                    </span>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Source</span>
                    <span className="font-semibold text-slate-800 truncate block mt-0.5">
                      {l.source || "—"}{l.campaign ? ` · ${l.campaign}` : ""}
                    </span>
                  </div>
                </div>

                {extras.length > 0 && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 text-xs space-y-1">
                    {extras.map((item) => (
                      <div key={item.name} className="flex justify-between items-baseline gap-2 py-0.5">
                        <span className="text-[11px] font-medium text-slate-500 truncate">{item.name}:</span>
                        <span className="text-[11px] font-semibold text-slate-800 text-right truncate">{item.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100/80">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {l.assignedTo?.name ? (
                      <span className="text-xs text-slate-600 truncate">
                        Assigned: <strong>{l.assignedTo.name}</strong>
                      </span>
                    ) : isAdmin && isUnassigned ? (
                      <button
                        type="button"
                        onClick={() => openAssignModal(l)}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 shadow-xs hover:bg-amber-100"
                      >
                        <UserRound size={12} className="text-amber-600" />
                        Assign
                      </button>
                    ) : (
                      <span className="text-xs font-medium text-amber-600">Unassigned</span>
                    )}
                    <span className="text-[10px] text-slate-400 ml-1">
                      {new Date(l.updatedAt || l.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <Link
                    href={`/leads/${l._id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 shrink-0"
                  >
                    Details <ExternalLink size={12} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table View (>= lg) */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="min-w-[1000px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {["Lead", "Business", "Source / Campaign", "Extra details", "Status", "Assigned", "Updated", ""].map((x) => (
                  <th key={x} className="px-5 py-3 font-semibold">{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const extras = dynamicLeadFields(l);
                const isUnassigned = !l.assignedTo || !l.assignedTo?._id;
                return (
                  <tr key={l._id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <b className="text-slate-900">{l.name || "Unnamed lead"}</b>
                      <span className="mt-1 block text-[10px] text-slate-400">{l.phone || l.email || "No contact details"}</span>
                    </td>
                    <td className="px-5 py-4">{l.businessProject?.name || l.meta?.businessId || "Unmapped"}</td>
                    <td className="px-5 py-4">
                      <span className="font-medium">{l.source || "—"}</span>
                      <span className="mt-1 block text-[10px] text-slate-400">{l.campaign || l.formName || "—"}</span>
                    </td>
                    <td className="max-w-[260px] px-5 py-4">
                      {extras.length ? (
                        <div className="space-y-1">
                          {extras.map((item: any) => (
                            <div key={item.name} className="truncate text-[10px]">
                              <span className="font-semibold text-slate-500">{item.name}:</span>{" "}
                              <span className="text-slate-700">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      ) : <span className="text-slate-400">No extra fields</span>}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${statusStyles[l.status] || "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                        {String(l.status || "NEW").replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {l.assignedTo?.name ? (
                        <span className="font-medium text-slate-800">{l.assignedTo.name}</span>
                      ) : isAdmin && isUnassigned ? (
                        <button
                          type="button"
                          onClick={() => openAssignModal(l)}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100 hover:text-amber-900"
                          title="Assign this unassigned lead"
                        >
                          <UserRound size={12} className="text-amber-600" />
                          Assign
                        </button>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-500">{new Date(l.updatedAt || l.createdAt).toLocaleString()}</td>
                    <td className="px-5 py-4">
                      <Link href={`/leads/${l._id}`} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-2 font-semibold text-indigo-700">
                        <ExternalLink size={13} /> Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {loading && <div className="p-8 text-center text-sm text-slate-500">Loading leads...</div>}
        {!loading && !leads.length && (
          <div className="p-10 text-center text-sm text-slate-500">
            <PauseCircle className="mx-auto mb-2" size={20} />
            No released leads match the current filters.
          </div>
        )}
        {!loading && <Pagination page={page} pages={meta.pages} total={meta.total} label="leads" onChange={setPage} />}
      </section>

      {/* Assign Lead Modal (Admin only) */}
      {assignModalLead && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Assign Lead</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Assign this lead to a salesperson for outreach and follow-up.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAssignModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs">
              <div className="flex justify-between py-0.5">
                <span className="text-slate-400">Lead Name:</span>
                <span className="font-semibold text-slate-800">{assignModalLead.name || "Unnamed lead"}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-slate-400">Contact:</span>
                <span className="text-slate-700">{assignModalLead.phone || assignModalLead.email || "—"}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-slate-400">Business / Project:</span>
                <span className="text-slate-700">{assignModalLead.businessProject?.name || assignModalLead.meta?.businessId || "—"}</span>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700">
                Select Salesperson
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Choose salesperson...</option>
                {salesUsers.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            {assignError && (
              <div className="mt-3 rounded-xl bg-rose-50 p-2.5 text-xs text-rose-700">
                {assignError}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeAssignModal}
                disabled={assigning}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssignSubmit}
                disabled={assigning || !selectedUserId}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50"
              >
                {assigning && <Loader2 size={13} className="animate-spin" />}
                {assigning ? "Assigning..." : "Confirm Assignment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
