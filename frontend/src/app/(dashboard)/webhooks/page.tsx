"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw, Eye, RefreshCw } from "lucide-react";
import Topbar from "../../../components/Topbar";
import Pagination from "../../../components/Pagination";
import Modal, { btn } from "../../../components/Modal";
import { api } from "../../../lib/api";
import { getUser } from "../../../lib/auth";

const statusTone: Record<string, string> = {
  PROCESSED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  DUPLICATE: "bg-slate-100 text-slate-600 ring-slate-200",
  FAILED: "bg-rose-50 text-rose-700 ring-rose-200",
  RECEIVED: "bg-sky-50 text-sky-700 ring-sky-200",
};

export default function WebhooksPage() {
  const isAdmin = getUser()?.role === "ADMIN";
  const [events, setEvents] = useState<any[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), limit: "20" });
      if (status) q.set("status", status);
      if (source) q.set("source", source);
      const d = await api(`/meta/events?${q}`);
      setEvents(d.events || []);
      setSummary(d.last24h || {});
      setMeta({ total: d.total, pages: d.pages });
    } catch (e: any) {
      setMessage(e?.message || "Could not load events");
    } finally {
      setLoading(false);
    }
  }, [page, status, source]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => setPage(1), [status, source]);

  async function replay(id: string) {
    setBusy(id);
    setMessage("");
    try {
      const r = await api(`/meta/events/${id}/replay`, { method: "POST" });
      setMessage(r.duplicate ? "Replayed — lead already existed (duplicate)." : "Replayed successfully — lead created.");
      await load();
    } catch (e: any) {
      setMessage(e?.message || "Replay failed");
    } finally {
      setBusy(null);
    }
  }

  async function view(id: string) {
    try {
      const d = await api(`/meta/events/${id}`);
      setDetail(d.event);
    } catch (e: any) {
      setMessage(e?.message || "Could not load event");
    }
  }

  return (
    <div className="space-y-5">
      <Topbar title="Webhook log" subtitle="Every Meta and LeadSync delivery is stored before processing. Failed events retry automatically and can be replayed." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {["PROCESSED", "DUPLICATE", "FAILED", "RECEIVED"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(status === s ? "" : s)}
            className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:shadow-md ${status === s ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-200"}`}
          >
            <span className="text-[11px] font-medium text-slate-500">{s.toLowerCase()} · 24h</span>
            <b className={`mt-1 block text-2xl font-bold tabular-nums ${s === "FAILED" && summary[s] ? "text-rose-600" : "text-slate-900"}`}>{summary[s] || 0}</b>
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs" aria-label="Status">
            <option value="">All statuses</option>
            {Object.keys(statusTone).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs" aria-label="Source">
            <option value="">All sources</option>
            <option value="META">Meta</option>
            <option value="LEADSYNC">LeadSync</option>
            <option value="TEST">Test</option>
          </select>
          <button onClick={load} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs text-slate-600 hover:bg-slate-50">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
        {message && <div className="border-b border-slate-100 bg-indigo-50 px-4 py-2 text-xs text-indigo-800">{message}</div>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {["Received", "Source", "Leadgen ID", "Page / Form", "Status", "Attempts", "Lead / Error", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e._id} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium">{e.source}</td>
                  <td className="px-4 py-3 font-mono text-[11px]">{e.leadgenId || "—"}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                    {e.pageId || "—"}
                    <span className="block">{e.formId || ""}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${statusTone[e.status]}`}>{e.status}</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{e.attempts}</td>
                  <td className="max-w-[280px] px-4 py-3">
                    {e.lead ? (
                      <Link href={`/leads/${e.lead._id}`} className="font-semibold text-indigo-600 hover:underline">
                        {e.lead.name}
                      </Link>
                    ) : (
                      <span className="line-clamp-2 text-rose-600">{e.error || "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      {isAdmin && (
                        <button onClick={() => view(e._id)} title="View payload" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
                          <Eye size={14} />
                        </button>
                      )}
                      {isAdmin && e.status === "FAILED" && (
                        <button onClick={() => replay(e._id)} disabled={busy === e._id} className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
                          {busy === e._id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Replay
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div className="p-6 text-center text-sm text-slate-500">Loading…</div>}
        {!loading && !events.length && <div className="p-10 text-center text-sm text-slate-500">No webhook events match.</div>}
        {!loading && <Pagination page={page} pages={meta.pages} total={meta.total} label="events" onChange={setPage} />}
      </section>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        size="lg"
        title="Webhook payload"
        subtitle={detail ? `${detail.source} · ${new Date(detail.createdAt).toLocaleString()}` : ""}
        footer={
          <button className={btn.secondary} onClick={() => setDetail(null)}>
            Close
          </button>
        }
      >
        <pre className="max-h-[60vh] overflow-auto rounded-xl bg-slate-950 p-4 text-[11px] leading-relaxed text-emerald-200">{detail ? JSON.stringify(detail.payload, null, 2) : ""}</pre>
      </Modal>
    </div>
  );
}
