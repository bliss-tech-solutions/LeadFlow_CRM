"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Search, X, ChevronDown, ChevronRight } from "lucide-react";
import Topbar from "../../../components/Topbar";
import Pagination from "../../../components/Pagination";
import { api } from "../../../lib/api";

/** Shallow diff of before/after objects for readable change rows. */
function diff(before: any, after: any) {
  const b = before && typeof before === "object" ? before : {};
  const a = after && typeof after === "object" ? after : {};
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).filter((k) => !["_id", "__v", "updatedAt", "createdAt", "passwordHash"].includes(k));
  return keys
    .map((k) => ({ key: k, from: b[k], to: a[k] }))
    .filter((r) => JSON.stringify(r.from) !== JSON.stringify(r.to));
}

const short = (v: any) => {
  if (v === undefined || v === null || v === "") return "—";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
};

export default function AuditPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [entities, setEntities] = useState<string[]>([]);
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams({ page: String(page), limit: "25" });
    if (action.trim()) q.set("action", action.trim());
    if (entity) q.set("entity", entity);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    try {
      const d = await api(`/audit?${q}`);
      setRows(d.audit || []);
      setEntities(d.entities || []);
      setMeta({ total: d.total || 0, pages: d.pages || 1 });
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, action, entity, from, to]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(t);
  }, [load]);
  useEffect(() => setPage(1), [action, entity, from, to]);

  const hasFilters = Boolean(action || entity || from || to);

  return (
    <div className="space-y-5">
      <Topbar title="Audit log" subtitle="Who changed what, when — including logins as other users, settings and WhatsApp connections." />
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <div className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 text-slate-400 sm:max-w-xs">
            <Search size={14} />
            <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Action contains… e.g. ASSIGN" className="w-full text-xs text-slate-800 outline-none" />
          </div>
          <select value={entity} onChange={(e) => setEntity(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs" aria-label="Entity">
            <option value="">All entities</option>
            {entities.filter(Boolean).map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-xs" aria-label="From" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-xs" aria-label="To" />
          {hasFilters && (
            <button onClick={() => { setAction(""); setEntity(""); setFrom(""); setTo(""); }} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-50">
              <X size={13} /> Clear
            </button>
          )}
          <span className="ml-auto text-[11px] text-slate-400">{meta.total} events</span>
        </div>

        <div className="divide-y divide-slate-100">
          {rows.map((a) => {
            const changes = diff(a.before, a.after);
            const expanded = open === a._id;
            return (
              <div key={a._id}>
                <button onClick={() => setOpen(expanded ? null : a._id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50">
                  {expanded ? <ChevronDown size={14} className="mt-0.5 shrink-0 text-slate-400" /> : <ChevronRight size={14} className="mt-0.5 shrink-0 text-slate-400" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className={`text-xs ${/IMPERSONAT|BLOCK|DELETE|DISCONNECT/.test(a.action) ? "text-rose-700" : "text-slate-900"}`}>{a.action}</b>
                      <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-600">
                        {a.entity} · {String(a.entityId || "").slice(-6)}
                      </span>
                    </div>
                    <span className="mt-0.5 block text-[11px] text-slate-500">
                      {a.actor?.name || "System"}
                      {a.actor?.role ? ` (${a.actor.role})` : ""} · {new Date(a.createdAt).toLocaleString()}
                      {a.ip ? ` · ${a.ip}` : ""}
                    </span>
                  </div>
                  {changes.length > 0 && <span className="shrink-0 text-[10px] text-slate-400">{changes.length} change{changes.length > 1 ? "s" : ""}</span>}
                </button>
                {expanded && (
                  <div className="bg-slate-50 px-4 pb-4 pl-11">
                    {changes.length ? (
                      <table className="w-full text-left text-[11px]">
                        <thead className="text-slate-400">
                          <tr>
                            <th className="py-1 pr-3 font-semibold">Field</th>
                            <th className="py-1 pr-3 font-semibold">Before</th>
                            <th className="py-1 font-semibold">After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {changes.map((c) => (
                            <tr key={c.key} className="border-t border-slate-200/70 align-top">
                              <td className="py-1.5 pr-3 font-mono text-slate-600">{c.key}</td>
                              <td className="py-1.5 pr-3 font-mono text-rose-700 line-through decoration-rose-300">{short(c.from)}</td>
                              <td className="py-1.5 font-mono text-emerald-700">{short(c.to)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-[11px] text-slate-500">No field-level changes recorded for this event.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {loading && <div className="p-6 text-center text-sm text-slate-500">Loading…</div>}
        {!loading && !rows.length && (
          <div className="p-10 text-center text-sm text-slate-500">
            <ShieldCheck className="mx-auto mb-2" size={20} />
            No audit events match.
          </div>
        )}
        {!loading && <Pagination page={page} pages={meta.pages} total={meta.total} label="events" onChange={setPage} />}
      </section>
    </div>
  );
}
