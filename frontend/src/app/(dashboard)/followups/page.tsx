"use client";

import { useEffect, useState } from "react";
import Topbar from "../../../components/Topbar";
import Pagination from "../../../components/Pagination";
import { api, downloadFile } from "../../../lib/api";
import { socket } from "../../../lib/socket";
import { getUser } from "../../../lib/auth";
import {
  CalendarClock,
  Check,
  X,
  RotateCcw,
  Ban,
  Search,
  Clock3,
  Download,
  Loader2,
} from "lucide-react";

const statusStyles: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  MISSED: "bg-rose-50 text-rose-700 ring-rose-200",
  CANCELLED: "bg-slate-100 text-slate-600 ring-slate-200",
  RESCHEDULED: "bg-violet-50 text-violet-700 ring-violet-200",
};

function toLocalInput(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function todayInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function displayStatus(f: any) {
  if (f.status === "PENDING") {
    return new Date(f.scheduledAt).getTime() < Date.now() ? "OVERDUE" : "SCHEDULED";
  }
  if (f.status === "CANCELLED" && f.rescheduledAt) return "CANCELLED · RESCHEDULED";
  return f.status;
}

const displayStatusStyles: Record<string, string> = {
  SCHEDULED: "bg-amber-50 text-amber-700 ring-amber-200",
  OVERDUE: "bg-rose-50 text-rose-700 ring-rose-200",
  "CANCELLED · RESCHEDULED": "bg-slate-100 text-slate-700 ring-slate-200",
};

export default function Followups() {
  const currentUser = getUser();
  const isAdmin = currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER";
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [projects, setProjects] = useState<any[]>([]);
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [action, setAction] = useState<"complete" | "cancel" | "reschedule" | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [businessProject, setBusinessProject] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/business-projects?limit=100")
      .then((d) => setProjects(d.projects || []))
      .catch(() => {});
    if (isAdmin) {
      api("/businesses")
        .then((d) => setBusinesses(d.businesses || []))
        .catch(() => {});
    }
  }, [isAdmin]);

  async function load(
    currentPage = page,
    currentSearch = search,
    currentStatus = status,
    currentBusiness = businessProject,
    currentBizGroup = selectedBusiness,
  ) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: "10" });
      const statsParams = new URLSearchParams();
      if (currentSearch.trim()) params.set("search", currentSearch.trim());
      if (currentStatus) params.set("status", currentStatus);
      if (currentBizGroup) {
        params.set("business", currentBizGroup);
        statsParams.set("business", currentBizGroup);
      }
      if (currentBusiness) {
        params.set("businessProject", currentBusiness);
        statsParams.set("businessProject", currentBusiness);
      }
      const statsQuery = statsParams.toString();
      const [list, summary] = await Promise.all([
        api(`/followups?${params.toString()}`),
        api(`/followups/stats${statsQuery ? `?${statsQuery}` : ""}`),
      ]);
      setItems(list.followups || []);
      setMeta({ total: list.total || 0, pages: list.pages || 1 });
      setStats(summary || {});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [search, status, businessProject, selectedBusiness]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load(page, search, status, businessProject, selectedBusiness);
    }, 350);
    return () => clearTimeout(timer);
  }, [page, search, status, businessProject, selectedBusiness]);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      if (selectedBusiness) params.set("business", selectedBusiness);
      if (businessProject) params.set("businessProject", businessProject);
      const queryStr = params.toString();
      await downloadFile(
        `/followups/export${queryStr ? `?${queryStr}` : ""}`,
        `followups-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (err: any) {
      setDownloadError(err?.message || "Failed to download follow-ups Excel file");
    } finally {
      setDownloading(false);
    }
  }

  function clearAllFilters() {
    setSearch("");
    setStatus("");
    setSelectedBusiness("");
    setBusinessProject("");
  }

  const hasActiveFilters = Boolean(search || status || businessProject || selectedBusiness);

  useEffect(() => {
    const refresh = () => void load(page, search, status, businessProject, selectedBusiness);
    socket.on("followup_updated", refresh);
    socket.on("followup_reminder", refresh);
    return () => {
      socket.off("followup_updated", refresh);
      socket.off("followup_reminder", refresh);
    };
  }, [page, search, status, businessProject, selectedBusiness]);

  function openAction(item: any, nextAction: "complete" | "cancel" | "reschedule") {
    setSelected(item);
    setAction(nextAction);
    setNote("");
    setReason("");
    setScheduledAt(toLocalInput(item.scheduledAt));
    setError("");
  }

  function close() {
    setSelected(null);
    setAction(null);
    setNote("");
    setReason("");
    setScheduledAt("");
    setError("");
  }

  async function submit() {
    if (!selected || !action) return;
    setSaving(true);
    setError("");
    try {
      if (action === "complete") {
        await api(`/followups/${selected._id}/complete`, {
          method: "PATCH",
          body: JSON.stringify({ completionNote: note }),
        });
      }

      if (action === "cancel") {
        await api(`/followups/${selected._id}/cancel`, {
          method: "PATCH",
          body: JSON.stringify({ reason: reason || "Client cancelled or was unavailable." }),
        });
      }

      if (action === "reschedule") {
        const d = new Date(scheduledAt);
        if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
          throw new Error("Choose a future date and time.");
        }
        await api(`/followups/${selected._id}/reschedule`, {
          method: "PATCH",
          body: JSON.stringify({
            scheduledAt: d.toISOString(),
            reason: reason || "Client requested a new time.",
            notes: note || selected.notes || "",
          }),
        });
      }

      close();
      await load(page, search, status, businessProject);
    } catch (e: any) {
      setError(e?.message || "Unable to update follow-up");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Topbar
        title="Follow-ups"
        subtitle="Every scheduled action has an owner, reminder, outcome and transparent history."
      />

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Pending", stats.pending, "text-amber-700"],
          ["Completed", stats.completed, "text-emerald-700"],
          ["Overdue", stats.overdue, "text-rose-700"],
          ["Missed", stats.missed, "text-rose-700"],
          ["Cancelled", stats.cancelled, "text-slate-600"],
          ["Rescheduled", stats.rescheduled, "text-violet-700"],
        ].map(([label, value, color]: any) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xs text-slate-500">{label}</span>
            <b className={`mt-1 block text-2xl ${color}`}>{value || 0}</b>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 p-3 sm:p-4">
          <div className="flex h-10 w-full sm:w-auto sm:max-w-xs flex-1 min-w-[200px] items-center gap-2 rounded-xl border border-slate-200 px-3 text-slate-400">
            <Search size={15} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search lead, phone or email..."
              className="w-full text-sm outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-700">
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
            {["PENDING", "COMPLETED", "MISSED", "CANCELLED", "RESCHEDULED"].map((x) => (
              <option key={x}>{x}</option>
            ))}
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
              title="Download follow-ups as Excel file"
            >
              {downloading ? (
                <Loader2 size={14} className="animate-spin text-slate-500" />
              ) : (
                <Download size={14} className="text-emerald-600" />
              )}
              {downloading ? "Exporting..." : "Download Excel"}
            </button>
            <span className="hidden text-xs text-slate-400 sm:inline">10 per page</span>
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

        {/* Mobile & Tablet Card View (< lg: vertical cards, no horizontal scrolling) */}
        <div className="block lg:hidden divide-y divide-slate-100">
          {items.map((f) => {
            const dispStatus = displayStatus(f);
            return (
              <div key={f._id} className="p-4 space-y-3 bg-white hover:bg-slate-50/60 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <b className="block text-sm text-slate-900 truncate">{f.lead?.name || "Lead unavailable"}</b>
                    <span className="text-xs text-slate-400 block mt-0.5 truncate">
                      {f.lead?.phone || f.lead?.email || "No contact details"}
                    </span>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold shrink-0 ring-1 ${displayStatusStyles[dispStatus] || statusStyles[f.status] || statusStyles.CANCELLED}`}>
                    {dispStatus}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-slate-50 p-2.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Scheduled At</span>
                    <b className="text-slate-800 block text-xs mt-0.5">
                      {new Date(f.scheduledAt).toLocaleDateString()} {new Date(f.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </b>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Type & Project</span>
                    <span className="font-semibold text-slate-800 truncate block text-xs mt-0.5">
                      {f.type} · {f.lead?.businessProject?.name || "—"}
                    </span>
                  </div>
                </div>

                {(f.outcomeNote || f.cancellationReason || f.notes) && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 text-xs text-slate-600 line-clamp-2">
                    {f.outcomeNote || f.cancellationReason || f.notes}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100/80">
                  <span className="text-xs text-slate-500 truncate">
                    Owner: <strong className="text-slate-800">{f.user?.name || "Unassigned"}</strong>
                  </span>

                  {f.status === "PENDING" ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => openAction(f, "complete")}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                      >
                        <Check size={13} /> Complete
                      </button>
                      <button
                        onClick={() => openAction(f, "reschedule")}
                        className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition"
                        title="Reschedule"
                      >
                        <RotateCcw size={13} />
                      </button>
                      <button
                        onClick={() => openAction(f, "cancel")}
                        className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                        title="Cancel"
                      >
                        <Ban size={13} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-medium">History retained</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table View (>= lg) */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {["Lead", "Business", "Owner", "Type", "Scheduled", "Status", "History / note", "Action"].map((x) => (
                  <th key={x} className="px-5 py-3 font-semibold">{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr key={f._id} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <b className="block text-slate-900">{f.lead?.name || "Lead unavailable"}</b>
                    <span className="mt-1 block text-[10px] text-slate-400">{f.lead?.phone || f.lead?.email || "No contact details"}</span>
                  </td>
                  <td className="px-5 py-4 font-medium text-slate-700">
                    {f.lead?.businessProject?.name || "—"}
                  </td>
                  <td className="px-5 py-4">{f.user?.name || "Unassigned"}</td>
                  <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5"><CalendarClock size={14} />{f.type}</span></td>
                  <td className="px-5 py-4">
                    <b className="block text-slate-800">{new Date(f.scheduledAt).toLocaleDateString()}</b>
                    <span className="text-[10px] text-slate-500">{new Date(f.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${displayStatusStyles[displayStatus(f)] || statusStyles[f.status] || statusStyles.CANCELLED}`}>
                      {displayStatus(f)}
                    </span>
                    {f.rescheduledFrom && f.status === "PENDING" && (
                      <span className="mt-1 block text-[10px] font-semibold text-violet-600">New appointment from reschedule</span>
                    )}
                  </td>
                  <td className="max-w-[260px] px-5 py-4">
                    <span className="line-clamp-2 text-[11px] text-slate-500">
                      {f.outcomeNote || f.cancellationReason || f.notes || "No record added"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {f.status === "PENDING" ? (
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => openAction(f, "complete")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-2 font-semibold text-emerald-700"><Check size={13} /> Complete</button>
                        <button onClick={() => openAction(f, "reschedule")} className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-2 font-semibold text-violet-700"><RotateCcw size={13} /> Reschedule</button>
                        <button onClick={() => openAction(f, "cancel")} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-2 font-semibold text-rose-700"><Ban size={13} /> Cancel</button>
                      </div>
                    ) : (
                      <div>
                        <span className="text-[10px] font-semibold text-slate-400">History retained</span>
                        {f.status === "CANCELLED" && f.rescheduledAt && (
                          <span className="mt-1 block text-[10px] font-medium text-violet-600">A new follow-up was created from this cancellation.</span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && <div className="p-8 text-center text-sm text-slate-500">Loading follow-ups...</div>}
        {!loading && !items.length && <div className="p-10 text-center text-sm text-slate-500">No follow-ups match the current filters.</div>}
        {!loading && <Pagination page={page} pages={meta.pages} total={meta.total} label="follow-ups" onChange={setPage} />}
      </section>

      {selected && action && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <div className="w-full max-w-xl rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {action === "complete" ? "Complete follow-up" : action === "reschedule" ? "Reschedule follow-up" : "Cancel follow-up"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {selected.lead?.name} · {new Date(selected.scheduledAt).toLocaleString()}
                </p>
              </div>
              <button onClick={close} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>

            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <Clock3 size={14} /> Owner: {selected.user?.name || "Unassigned"}
              </div>
              {selected.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-600">{selected.notes}</p>}
            </div>

            {action === "reschedule" && (
              <label className="mt-4 block text-xs font-semibold text-slate-700">
                New date & time
                <input type="datetime-local" min={`${todayInput()}T00:00`} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              </label>
            )}

            {action === "complete" && (
              <label className="mt-4 block text-xs font-semibold text-slate-700">
                What happened?
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Client response, discussion, next action..." className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" />
              </label>
            )}

            {(action === "cancel" || action === "reschedule") && (
              <label className="mt-4 block text-xs font-semibold text-slate-700">
                {action === "cancel" ? "Cancellation reason" : "Reason / client request"}
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={action === "cancel" ? "Client cancelled, unavailable, etc." : "Client requested another time..."} className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" />
              </label>
            )}

            {action === "reschedule" && (
              <label className="mt-4 block text-xs font-semibold text-slate-700">
                Additional note
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional record..." className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              </label>
            )}

            {error && <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={close} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Back</button>
              {action === "cancel" && (
                <button
                  disabled={saving}
                  onClick={() => {
                    setAction("reschedule");
                    setError("");
                    setScheduledAt(toLocalInput(selected.scheduledAt));
                  }}
                  className="rounded-xl bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700"
                >
                  Reschedule instead
                </button>
              )}
              <button disabled={saving} onClick={submit} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? "Saving..." : action === "complete" ? "Complete & record" : action === "reschedule" ? "Reschedule" : "Cancel follow-up"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
