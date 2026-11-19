"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Search, Flame, Phone, CalendarClock, Loader2, ListFilter, X } from "lucide-react";
import Topbar from "../../../components/Topbar";
import StatusChangeModal from "../../../components/StatusChangeModal";
import WhatsAppSendDrawer from "../../../components/WhatsAppSendDrawer";
import WhatsAppIcon from "../../../components/WhatsAppIcon";
import { api } from "../../../lib/api";
import { getUser } from "../../../lib/auth";
import { socket } from "../../../lib/socket";
import { statusAccent, statusLabel, scoreTone, telHref, timeAgo } from "../../../lib/leadMeta";

type Column = { status: string; total: number; leads: any[] };

export default function PipelinePage() {
  const role = getUser()?.role;
  const canManageTeam = role === "ADMIN" || role === "MANAGER" || role === "BUSINESS";
  const canWhatsApp = role === "BUSINESS" || role === "SALES";

  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [pending, setPending] = useState<{ leadId: string; status: string; name: string } | null>(null);
  const [waLead, setWaLead] = useState<string | null>(null);

  useEffect(() => {
    api("/business-projects?limit=100").then((d) => setProjects(d.projects || [])).catch(() => {});
    if (canManageTeam) api("/users?role=SALES&limit=100").then((d) => setSales(d.users || [])).catch(() => {});
  }, [canManageTeam]);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ perColumn: "40" });
      if (search.trim()) p.set("search", search.trim());
      if (project) p.set("businessProject", project);
      if (assignedTo) p.set("assignedTo", assignedTo);
      const d = await api(`/leads/board?${p}`);
      setColumns(d.columns || []);
      setError("");
    } catch (e: any) {
      setError(e?.message || "Could not load pipeline");
    } finally {
      setLoading(false);
    }
  }, [search, project, assignedTo]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    let t: number | undefined;
    const refresh = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => void load(), 800);
    };
    ["new_lead", "lead_updated", "leads_assigned"].forEach((e) => socket.on(e, refresh));
    return () => {
      ["new_lead", "lead_updated", "leads_assigned"].forEach((e) => socket.off(e, refresh));
      window.clearTimeout(t);
    };
  }, [load]);

  async function move(leadId: string, status: string, extra: { lostReason?: string; dealValue?: number } = {}) {
    // Optimistic move
    setColumns((cols) => {
      let moved: any = null;
      const next = cols.map((c) => {
        const idx = c.leads.findIndex((l) => l._id === leadId);
        if (idx >= 0) {
          moved = { ...c.leads[idx], status };
          return { ...c, total: c.total - 1, leads: c.leads.filter((l) => l._id !== leadId) };
        }
        return c;
      });
      return next.map((c) => (c.status === status && moved ? { ...c, total: c.total + 1, leads: [moved, ...c.leads] } : c));
    });
    try {
      await api(`/leads/${leadId}/status`, { method: "PATCH", body: JSON.stringify({ status, ...extra }) });
    } catch (e: any) {
      setError(e?.message || "Could not move lead");
      await load();
      throw e;
    }
  }

  function onDrop(status: string) {
    setOverCol(null);
    if (!dragId) return;
    const from = columns.find((c) => c.leads.some((l) => l._id === dragId));
    const lead = from?.leads.find((l) => l._id === dragId);
    setDragId(null);
    if (!lead || from?.status === status) return;
    if (["LOST", "NOT_INTERESTED", "WON"].includes(status)) {
      setPending({ leadId: lead._id, status, name: lead.name });
      return;
    }
    void move(lead._id, status).catch(() => {});
  }

  const totalOpen = columns.filter((c) => !["WON", "LOST", "NOT_INTERESTED"].includes(c.status)).reduce((a, c) => a + c.total, 0);
  const won = columns.find((c) => c.status === "WON");
  const wonValue = won?.leads.reduce((a, l) => a + (Number(l.dealValue) || 0), 0) || 0;

  return (
    <div className="space-y-4">
      <Topbar title="Pipeline" subtitle="Drag leads between stages. Lost and won deals ask for a reason or value." />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 text-slate-400 sm:max-w-xs">
          <Search size={14} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leads" className="w-full text-sm text-slate-800 outline-none" aria-label="Search pipeline" />
        </div>
        <ListFilter size={14} className="text-slate-400" />
        <select value={project} onChange={(e) => setProject(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs" aria-label="Project">
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
        {canManageTeam && (
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs" aria-label="Salesperson">
            <option value="">Everyone</option>
            {sales.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex items-center gap-4 text-xs text-slate-500">
          <span>
            Open: <b className="text-slate-900">{totalOpen}</b>
          </span>
          <span>
            Won: <b className="text-emerald-700">{won?.total ?? 0}</b>
            {wonValue > 0 && <span className="ml-1 text-slate-400">(₹{wonValue.toLocaleString("en-IN")} visible)</span>}
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-xl bg-rose-50 px-4 py-2 text-xs text-rose-700">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading pipeline…
        </div>
      ) : (
        <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-4 sm:mx-0 sm:px-0" style={{ scrollSnapType: "x proximity" }}>
          {columns.map((col) => (
            <div
              key={col.status}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(col.status);
              }}
              onDragLeave={() => setOverCol((c) => (c === col.status ? null : c))}
              onDrop={() => onDrop(col.status)}
              style={{ scrollSnapAlign: "start" }}
              className={`flex max-h-[calc(100vh-230px)] w-[280px] shrink-0 flex-col rounded-2xl border-t-4 bg-slate-100/70 transition ${statusAccent[col.status]} ${
                overCol === col.status ? "ring-2 ring-indigo-400" : ""
              }`}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <b className="text-xs uppercase tracking-wide text-slate-700">{statusLabel(col.status)}</b>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">{col.total}</span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {col.leads.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-[11px] text-slate-400">Drop leads here</div>}
                {col.leads.map((l) => (
                  <div
                    key={l._id}
                    draggable
                    onDragStart={() => setDragId(l._id)}
                    onDragEnd={() => setDragId(null)}
                    className={`cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-xs transition hover:shadow-md active:cursor-grabbing ${dragId === l._id ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/leads/${l._id}`} className="min-w-0 truncate text-sm font-semibold text-slate-900 hover:text-indigo-600">
                        {l.name}
                      </Link>
                      <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ${scoreTone(l.score)}`}>
                        {Number(l.score) >= 70 && <Flame size={9} />}
                        {l.score ?? 0}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">{l.businessProject?.name || "Unmapped"}</p>
                    {l.nextFollowUpAt && (
                      <p className={`mt-1.5 inline-flex items-center gap-1 text-[10px] ${new Date(l.nextFollowUpAt) < new Date() ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                        <CalendarClock size={11} /> {new Date(l.nextFollowUpAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    )}
                    {l.status === "WON" && l.dealValue ? <p className="mt-1 text-[11px] font-semibold text-emerald-700">₹{Number(l.dealValue).toLocaleString("en-IN")}</p> : null}
                    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                      <span className="truncate text-[10px] text-slate-400">
                        {l.assignedTo?.name || "Unassigned"} · {timeAgo(l.createdAt)}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {telHref(l.phone) && (
                          <a href={telHref(l.phone)} aria-label={`Call ${l.name}`} className="grid h-6 w-6 place-items-center rounded-md text-slate-500 hover:bg-slate-100">
                            <Phone size={12} />
                          </a>
                        )}
                        {canWhatsApp && l.phone && (
                          <button onClick={() => setWaLead(l._id)} aria-label={`WhatsApp ${l.name}`} className="grid h-6 w-6 place-items-center rounded-md text-emerald-600 hover:bg-emerald-50">
                            <WhatsAppIcon size={13} />
                          </button>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
                {col.total > col.leads.length && (
                  <Link href={`/leads?status=${col.status}`} className="block py-1 text-center text-[11px] font-semibold text-indigo-600 hover:underline">
                    +{col.total - col.leads.length} more in list view
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <StatusChangeModal
        open={Boolean(pending)}
        status={pending?.status || null}
        leadName={pending?.name}
        onClose={() => setPending(null)}
        onConfirm={async ({ status, lostReason, dealValue }) => {
          if (pending) await move(pending.leadId, status, { lostReason, dealValue });
        }}
      />
      <WhatsAppSendDrawer leadId={waLead} onClose={() => setWaLead(null)} />
    </div>
  );
}
