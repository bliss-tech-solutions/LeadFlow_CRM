"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Inbox, PauseCircle, Unlink, Webhook, RefreshCw, Loader2, Users } from "lucide-react";
import Topbar from "../../../components/Topbar";
import WhatsAppIcon from "../../../components/WhatsAppIcon";
import { api } from "../../../lib/api";

function Tile({ label, value, sub, Icon, tone = "text-slate-500 bg-slate-100", href }: any) {
  const body = (
    <div className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-500">{label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${tone}`}>
          <Icon size={15} />
        </span>
      </div>
      <b className="mt-2 block text-2xl font-bold tabular-nums text-slate-900">{value}</b>
      {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function PlatformPage() {
  const [d, setD] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [h, s] = await Promise.all([api("/admin/health"), api("/whatsapp/admin/sessions").catch(() => ({ sessions: [] }))]);
      setD(h);
      setSessions(s.sessions || []);
      setError("");
    } catch (e: any) {
      setError(e?.message || "Could not load platform health");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, []);

  const wh = d?.webhooks?.last24h || {};
  const failure = d?.webhooks?.failureRate ?? 0;

  return (
    <div className="space-y-5">
      <Topbar title="Platform health" subtitle="Ingestion, delivery backlog and integrations across every business. Refreshes every minute." />
      <div className="flex justify-end">
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
        </button>
      </div>
      {error && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Leads · last 24h" value={d?.leads?.last24h ?? "–"} sub={`${d?.leads?.last7d ?? "–"} in 7 days`} Icon={Inbox} tone="bg-indigo-50 text-indigo-600" />
        <Tile
          label="Webhook failure rate (24h)"
          value={`${failure}%`}
          sub={`${wh.FAILED || 0} failed · ${wh.PROCESSED || 0} processed`}
          Icon={failure > 5 ? AlertTriangle : CheckCircle2}
          tone={failure > 5 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}
          href="/webhooks"
        />
        <Tile label="Held leads" value={d?.backlog?.held ?? "–"} sub="Waiting for schedule / quota" Icon={PauseCircle} tone="bg-amber-50 text-amber-600" />
        <Tile
          label="Unassigned leads"
          value={d?.backlog?.unassigned ?? "–"}
          sub={`${d?.backlog?.unmapped ?? 0} not mapped to a project`}
          Icon={Unlink}
          tone={(d?.backlog?.unassigned || 0) > 0 ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"}
          href="/leads"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between p-5 pb-3">
            <h2 className="font-semibold text-slate-900">Businesses · last 7 days</h2>
            <Activity size={16} className="text-slate-400" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Business</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Leads</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Won</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Still uncontacted</th>
                </tr>
              </thead>
              <tbody>
                {(d?.perBusiness || []).map((b: any) => (
                  <tr key={b._id} className="border-t border-slate-100">
                    <td className="px-5 py-2.5">
                      <Link href={`/business/${b._id}`} className="font-semibold text-slate-900 hover:text-indigo-600">
                        {b.name}
                      </Link>
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{b.leads}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{b.won}</td>
                    <td className={`px-5 py-2.5 text-right tabular-nums ${b.uncontacted > 5 ? "font-semibold text-rose-600" : ""}`}>{b.uncontacted}</td>
                  </tr>
                ))}
                {!d?.perBusiness?.length && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                      No lead activity in the last 7 days.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <WhatsAppIcon size={17} className="text-emerald-600" />
              <h2 className="font-semibold text-slate-900">WhatsApp connections</h2>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {d?.whatsapp?.enabled === false ? "Disabled on this server." : `${d?.whatsapp?.sent24h ?? 0} sent · ${d?.whatsapp?.failed24h ?? 0} failed in 24h`}
            </p>
            <div className="mt-3 space-y-1.5">
              {sessions.length === 0 && <p className="text-xs text-slate-400">No business has linked WhatsApp yet.</p>}
              {sessions.map((s) => (
                <div key={s._id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <span className="truncate font-medium text-slate-800">{s.business?.name || "—"}</span>
                  <span className={`shrink-0 font-semibold ${s.status === "CONNECTED" ? "text-emerald-700" : s.status === "LOGGED_OUT" ? "text-rose-600" : "text-slate-500"}`}>
                    {s.status === "CONNECTED" ? `● +${s.phone}` : s.status.toLowerCase().replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-indigo-600" />
              <h2 className="font-semibold text-slate-900">Active accounts</h2>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {["ADMIN", "MANAGER", "BUSINESS", "SALES"].map((r) => (
                <div key={r} className="rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">{r === "BUSINESS" ? "Business owners" : r.charAt(0) + r.slice(1).toLowerCase()}</span>
                  <b className="block text-base tabular-nums text-slate-900">{d?.users?.[r] ?? 0}</b>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              {d?.businesses?.active ?? 0} active businesses · {d?.businesses?.inactive ?? 0} inactive
            </p>
          </section>

          <Link href="/webhooks" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50">
            <Webhook size={17} className="text-indigo-600" /> Open webhook log
          </Link>
        </div>
      </div>
    </div>
  );
}
