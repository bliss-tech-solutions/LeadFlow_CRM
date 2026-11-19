"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { Loader2, Trophy, Timer, Target, IndianRupee, Users, PhoneCall, Copy } from "lucide-react";
import Topbar from "../../../components/Topbar";
import { api } from "../../../lib/api";
import { getUser } from "../../../lib/auth";
import { LEAD_STATUSES, statusLabel } from "../../../lib/leadMeta";

// Validated categorical slots (reference palette, light surface): 1 = blue, 3 = aqua.
const SERIES_LEADS = "#2a78d6";
const SERIES_WON = "#1baf7a";
const INK_MUTED = "#64748b";
const GRID = "#e2e8f0";

const RANGES = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
];

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days + 1);
  return d.toISOString().slice(0, 10);
}

function inr(n: number) {
  if (!n) return "₹0";
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 8px 24px rgba(15,23,42,.08)" },
  labelStyle: { color: "#0f172a", fontWeight: 600 },
  itemStyle: { color: "#334155" },
};

export default function AnalyticsPage() {
  const user = getUser();
  const isAdmin = user?.role === "ADMIN" || user?.role === "MANAGER";
  const isSales = user?.role === "SALES";

  const [range, setRange] = useState("30");
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [business, setBusiness] = useState("");
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAdmin) api("/businesses?limit=100").then((d) => setBusinesses(d.businesses || [])).catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    const q = new URLSearchParams({ from, to });
    if (business) q.set("business", business);
    setLoading(true);
    Promise.all([api(`/analytics/overview?${q}`), api(`/analytics/team?${q}`)])
      .then(([o, t]) => {
        setOverview(o);
        setTeam(t.team || []);
        setError("");
      })
      .catch((e) => setError(e?.message || "Could not load analytics"))
      .finally(() => setLoading(false));
  }, [from, to, business]);

  function pickRange(key: string) {
    setRange(key);
    setFrom(isoDaysAgo(Number(key)));
    setTo(new Date().toISOString().slice(0, 10));
  }

  const trend = useMemo(
    () =>
      (overview?.trend || []).map((d: any) => ({
        ...d,
        label: new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      })),
    [overview],
  );

  const funnel = useMemo(() => {
    const by = overview?.byStatus || {};
    const order = LEAD_STATUSES.filter((s) => s !== "LOST" && s !== "NOT_INTERESTED");
    const max = Math.max(1, ...order.map((s) => by[s] || 0));
    return order.map((s) => ({ status: s, count: by[s] || 0, pct: ((by[s] || 0) / max) * 100 }));
  }, [overview]);

  const t = overview?.totals;
  const kpis = [
    { label: "Leads", value: t?.leads ?? "–", Icon: Users },
    { label: "Conversion", value: t ? `${t.conversionRate}%` : "–", sub: t ? `${t.won} won` : "", Icon: Trophy },
    { label: "Contact rate", value: t ? `${t.contactRate}%` : "–", Icon: PhoneCall },
    {
      label: "Avg. first response",
      value: t?.avgFirstResponseMinutes != null ? `${t.avgFirstResponseMinutes} min` : "–",
      sub: t?.respondedWithin15Pct != null ? `${t.respondedWithin15Pct}% within 15 min` : "",
      Icon: Timer,
    },
    { label: "Revenue won", value: t ? inr(t.dealValue) : "–", Icon: IndianRupee },
    { label: "Repeat enquiries", value: t?.duplicates ?? "–", Icon: Copy },
  ];

  return (
    <div className="space-y-5">
      <Topbar title={isSales ? "My performance" : "Analytics"} subtitle="Where leads come from, how fast the team responds and what converts." />

      {/* Filters: one row above the charts */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => pickRange(r.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${range === r.key ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <input type="date" value={from} max={to} onChange={(e) => { setRange(""); setFrom(e.target.value); }} className="h-9 rounded-lg border border-slate-200 px-2 text-xs" aria-label="From" />
        <span className="text-xs text-slate-400">–</span>
        <input type="date" value={to} min={from} onChange={(e) => { setRange(""); setTo(e.target.value); }} className="h-9 rounded-lg border border-slate-200 px-2 text-xs" aria-label="To" />
        {isAdmin && (
          <select value={business} onChange={(e) => setBusiness(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs" aria-label="Business">
            <option value="">All businesses</option>
            {businesses.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        {loading && <Loader2 size={15} className="ml-auto animate-spin text-slate-400" />}
      </div>

      {error && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map(({ label, value, sub, Icon }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
              {label}
              <Icon size={14} className="text-slate-400" />
            </div>
            <b className="mt-2 block text-2xl font-bold tabular-nums text-slate-900">{value}</b>
            {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Trend */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Leads and wins per day</h2>
          <div className="mt-4 h-72">
            {trend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: INK_MUTED }} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: INK_MUTED }} tickLine={false} axisLine={false} />
                  <Tooltip {...tooltipStyle} cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: "#334155" }} />
                  <Line type="monotone" dataKey="leads" name="Leads" stroke={SERIES_LEADS} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} />
                  <Line type="monotone" dataKey="won" name="Won" stroke={SERIES_WON} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-sm text-slate-400">No leads in this period.</div>
            )}
          </div>
        </section>

        {/* Funnel */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Pipeline stages</h2>
            <Target size={16} className="text-slate-400" />
          </div>
          <div className="mt-4 space-y-2.5">
            {funnel.map((f) => (
              <div key={f.status} title={`${statusLabel(f.status)}: ${f.count}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">{statusLabel(f.status)}</span>
                  <b className="tabular-nums text-slate-900">{f.count}</b>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full" style={{ width: `${Math.max(f.count ? 3 : 0, f.pct)}%`, background: SERIES_LEADS }} />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
              <span>Lost / not interested</span>
              <b className="tabular-nums text-slate-900">{(overview?.byStatus?.LOST || 0) + (overview?.byStatus?.NOT_INTERESTED || 0)}</b>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Sources */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Leads by source</h2>
          <div className="mt-4 h-60">
            {overview?.bySource?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overview.bySource.map((s: any) => ({ ...s, source: String(s.source).replaceAll("_", " ") }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: INK_MUTED }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="source" width={90} tick={{ fontSize: 11, fill: "#334155" }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="count" name="Leads" fill={SERIES_LEADS} radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-sm text-slate-400">No data.</div>
            )}
          </div>
        </section>

        {/* Lost reasons */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Why leads are lost</h2>
          <div className="mt-4 h-60">
            {overview?.lostReasons?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overview.lostReasons} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: INK_MUTED }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="reason" width={140} tick={{ fontSize: 11, fill: "#334155" }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="count" name="Leads" fill={SERIES_LEADS} radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center px-6 text-center text-sm text-slate-400">No lost reasons recorded yet. They're captured whenever a lead is marked lost.</div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Campaigns */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Top campaigns</h2>
          <table className="mt-3 w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 font-semibold">Campaign</th>
                <th className="py-2 text-right font-semibold">Leads</th>
                <th className="py-2 text-right font-semibold">Won</th>
                <th className="py-2 text-right font-semibold">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.byCampaign || []).map((c: any) => (
                <tr key={c.campaign} className="border-t border-slate-100">
                  <td className="max-w-[220px] truncate py-2 text-slate-800" title={c.campaign}>
                    {c.campaign}
                  </td>
                  <td className="py-2 text-right tabular-nums">{c.count}</td>
                  <td className="py-2 text-right tabular-nums">{c.won}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{c.count ? Math.round((c.won / c.count) * 100) : 0}%</td>
                </tr>
              ))}
              {!overview?.byCampaign?.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    No campaign data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Projects */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Top projects</h2>
          <table className="mt-3 w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 font-semibold">Project</th>
                <th className="py-2 text-right font-semibold">Leads</th>
                <th className="py-2 text-right font-semibold">Won</th>
                <th className="py-2 text-right font-semibold">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.byProject || []).map((p: any) => (
                <tr key={p.projectId} className="border-t border-slate-100">
                  <td className="max-w-[220px] truncate py-2 text-slate-800">{p.name}</td>
                  <td className="py-2 text-right tabular-nums">{p.count}</td>
                  <td className="py-2 text-right tabular-nums">{p.won}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{p.count ? Math.round((p.won / p.count) * 100) : 0}%</td>
                </tr>
              ))}
              {!overview?.byProject?.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    No project data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      {/* Team leaderboard */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between p-5 pb-3">
          <div>
            <h2 className="font-semibold text-slate-900">{isSales ? "My numbers" : "Team leaderboard"}</h2>
            <p className="text-xs text-slate-500">Based on leads assigned in the selected period.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {["#", "Salesperson", "Assigned", "Contacted", "Won", "Conversion", "Avg. response", "Calls (connected)", "Follow-ups done / missed", "Revenue"].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.map((m, i) => (
                <tr key={m.userId} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-3">
                    <b className="text-slate-900">{m.name}</b>
                    {!m.isActive && <span className="ml-1.5 rounded bg-slate-100 px-1 text-[9px] text-slate-500">blocked</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{m.assigned}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {m.contacted} <span className="text-slate-400">({m.contactRate}%)</span>
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums">{m.won}</td>
                  <td className="px-4 py-3 tabular-nums">{m.conversionRate}%</td>
                  <td className={`px-4 py-3 tabular-nums ${m.avgResponseMinutes != null && m.avgResponseMinutes > 30 ? "font-semibold text-rose-600" : ""}`}>
                    {m.avgResponseMinutes != null ? `${m.avgResponseMinutes} min` : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {m.calls} <span className="text-slate-400">({m.connectedCalls})</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {m.followupsDone} / <span className={m.followupsMissed ? "font-semibold text-rose-600" : ""}>{m.followupsMissed}</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{inr(m.dealValue)}</td>
                </tr>
              ))}
              {!team.length && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    No salespeople in scope. {user?.role === "BUSINESS" && <Link href="/team" className="font-semibold text-indigo-600">Add sales staff</Link>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
