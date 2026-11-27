"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Topbar from "../../../components/Topbar";
import { api } from "../../../lib/api";
import { socket } from "../../../lib/socket";
import { getUser, isAuthError, type User } from "../../../lib/auth";
import {
  ArrowUpRight,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  PauseCircle,
  Radio,
  Save,
  Users,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import FollowupCalendar from "../../../components/FollowupCalendar";
import { DEMO_DASHBOARD, demoKpis, demoPerformance, formatAxis, formatCount } from "../../../lib/demoDashboard";

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

function toLocalInput(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(() =>
    typeof window !== "undefined" ? getUser() : null,
  );
  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
    const currentUser = getUser();
    if (currentUser) setUser(currentUser);
    if (currentUser?.role === "BUSINESS") {
      router.replace("/business-dashboard");
    }
  }, [router]);

  const [stats, setStats] = useState<any>({});
  const [overview, setOverview] = useState<any>(null);
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [perfRange, setPerfRange] = useState("3m");
  const [perfData, setPerfData] = useState<any>(null);
  const [perfBusiness, setPerfBusiness] = useState("");
  const [perfProject, setPerfProject] = useState("");
  const [perfBusinesses, setPerfBusinesses] = useState<any[]>([]);
  const [perfProjects, setPerfProjects] = useState<any[]>([]);
  const [followupStats, setFollowupStats] = useState<any>({});
  const [schedule, setSchedule] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [form, setForm] = useState({
    enabled: false,
    holdFrom: "",
    holdUntil: "",
    timezone: "Asia/Kolkata",
  });
  const [saving, setSaving] = useState(false);
  const [releasing, setReleasing] = useState(false);

  async function load(admin = isAdmin) {
    try {
      const baseRequests = [
        api("/leads/stats"),
        api("/leads?limit=6"),
        api("/followups/stats"),
      ];

      if (admin) {
        const [s, l, f, d, ov] = await Promise.all([
          ...baseRequests,
          api("/lead-delivery/schedule"),
          api("/admin/overview"),
        ]);

        setStats(s || {});
        setLeads(l?.leads || []);
        setFollowupStats(f || {});
        setSchedule(d || null);
        setOverview(ov || null);
        setForm({
          enabled: Boolean(d?.schedule?.enabled),
          holdFrom: toLocalInput(d?.schedule?.holdFrom),
          holdUntil: toLocalInput(d?.schedule?.holdUntil),
          timezone: d?.schedule?.timezone || "Asia/Kolkata",
        });
      } else {
        const [s, l, f] = await Promise.all(baseRequests);
        setStats(s || {});
        setLeads(l?.leads || []);
        setFollowupStats(f || {});
      }
    } catch (error) {
      if (!isAuthError(error)) {
        console.error("[dashboard] load failed", error);
      }
    }
  }

  useEffect(() => {
    if (!user || user.role === "BUSINESS") return;

    const admin = user.role === "ADMIN";
    void load(admin);

    let timer: NodeJS.Timeout | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void load(admin);
      }, 400);
    };

    socket.on("followup_updated", refresh);
    socket.on("new_lead", refresh);
    socket.on("lead_updated", refresh);
    socket.on("call_logged", refresh);

    return () => {
      if (timer) clearTimeout(timer);
      socket.off("followup_updated", refresh);
      socket.off("new_lead", refresh);
      socket.off("lead_updated", refresh);
      socket.off("call_logged", refresh);
    };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!isAdmin) return;
    if (DEMO_DASHBOARD) {
      setPerfData(demoPerformance(perfRange, [selectedCity, perfBusiness, perfProject].filter(Boolean).join("|")));
      return;
    }
    const qs = new URLSearchParams({ range: perfRange });
    if (selectedCity) qs.set("city", selectedCity);
    if (perfBusiness) qs.set("business", perfBusiness);
    if (perfProject) qs.set("project", perfProject);
    api(`/analytics/performance?${qs}`).then((d) => setPerfData(d)).catch(() => {});
  }, [isAdmin, perfRange, selectedCity, perfBusiness, perfProject]);

  useEffect(() => {
    if (!isAdmin) return;
    api("/businesses?limit=200").then((d) => setPerfBusinesses(d?.businesses || [])).catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !perfBusiness) { setPerfProjects([]); return; }
    api(`/business-projects?business=${perfBusiness}&limit=100`)
      .then((d) => setPerfProjects(d?.projects || []))
      .catch(() => setPerfProjects([]));
  }, [isAdmin, perfBusiness]);

  if (user?.role === "BUSINESS") {
    return (
      <div className="grid min-h-[60vh] place-items-center text-sm text-slate-500">
        Loading partner dashboard...
      </div>
    );
  }

  async function saveSchedule() {
    setSaving(true);

    try {
      const data = await api("/lead-delivery/schedule", {
        method: "PUT",
        body: JSON.stringify({
          enabled: form.enabled,
          holdFrom: form.holdFrom ? new Date(form.holdFrom).toISOString() : null,
          holdUntil: form.holdUntil ? new Date(form.holdUntil).toISOString() : null,
          timezone: form.timezone,
        }),
      });

      setSchedule(data);
      setForm({
        enabled: Boolean(data?.schedule?.enabled),
        holdFrom: toLocalInput(data?.schedule?.holdFrom),
        holdUntil: toLocalInput(data?.schedule?.holdUntil),
        timezone: data?.schedule?.timezone || "Asia/Kolkata",
      });
      await load();
    } catch (error: any) {
      alert(error?.message || "Failed to update lead hold schedule.");
    } finally {
      setSaving(false);
    }
  }

  async function releaseNow() {
    setReleasing(true);
    try {
      await api("/lead-delivery/release", { method: "POST" });
      await load();
    } catch (error: any) {
      alert(error?.message || "Failed to release held leads.");
    } finally {
      setReleasing(false);
    }
  }

  const total = stats.total || 0;
  // Demo figures (see lib/demoDashboard.ts) for the lead KPI cards, or the real workspace counts.
  const demo = isAdmin && DEMO_DASHBOARD ? demoKpis() : null;
  const kpi = {
    leadsThisMonth: demo ? demo.leadsThisMonth : overview?.summary?.leadsThisMonth ?? 0,
    leadsToday: demo ? demo.leadsToday : overview?.summary?.leadsToday ?? 0,
    released: demo ? demo.releasedLeads : total,
    newLeads: demo ? demo.newLeads : stats.newCount || 0,
  };
  const funnel = [
    ["New", stats.newCount || 0],
    ["Interested", stats.interested || 0],
    ["Follow-up", stats.followups || 0],
    ["Won", stats.won || 0],
  ];
  const heldCount = isAdmin ? stats.held || 0 : 0;

  function barWidth(count: number) {
    if (!total) return "w-1/12";
    const ratio = count / total;
    if (ratio >= 0.875) return "w-full";
    if (ratio >= 0.75) return "w-5/6";
    if (ratio >= 0.625) return "w-3/4";
    if (ratio >= 0.5) return "w-1/2";
    if (ratio >= 0.375) return "w-5/12";
    if (ratio >= 0.25) return "w-1/3";
    if (ratio >= 0.125) return "w-1/4";
    return "w-1/12";
  }

  return (
    <div className="space-y-5 pb-10">
      <Topbar
        title="Dashboard"
        subtitle={
          isAdmin
            ? "Workspace-wide lead flow, follow-ups and delivery controls."
            : "Your assigned leads, follow-ups and current sales activity."
        }
      />

      {/* Admin client KPIs */}
      {isAdmin && (overview?.summary || demo) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 w-full">
          {[
            ["Total clients", overview?.summary?.totalClients ?? 0, Building2, "indigo"],
            ["Active clients", overview?.summary?.activeClients ?? 0, CheckCircle2, "green"],
            ["Leads this month", kpi.leadsThisMonth, ArrowUpRight, "sky"],
            ["Leads today", kpi.leadsToday, Radio, "amber"],
          ].map(([label, value, Icon, tone]: any) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className={`flex items-center justify-between text-xs ${tone === "indigo" ? "text-indigo-600" : tone === "green" ? "text-green-600" : tone === "sky" ? "text-sky-600" : "text-amber-600"}`}>
                <span className="font-medium">{label}</span>
                <Icon size={17} />
              </div>
              <strong className="mt-2 block truncate text-2xl sm:text-3xl font-bold text-slate-900">{formatCount(value)}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 lg:gap-5 w-full">
        {[
          [isAdmin ? "Released leads" : "My leads", kpi.released, Users],
          ["New leads", kpi.newLeads, Clock3],
          ["Interested", stats.interested || 0, CheckCircle2],
          ["Won", stats.won || 0, ArrowUpRight],
          ...(isAdmin ? [["Held", heldCount, PauseCircle]] : []),
        ].map(([label, value, Icon]: any) => (
          <div
            key={label}
            className="rounded-2xl flex-1 border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{label}</span>
              <Icon size={17} />
            </div>
            <strong className="mt-2 block truncate text-2xl sm:text-3xl font-bold text-slate-900">
              {formatCount(value)}
            </strong>
            <span className="mt-1 block text-[11px] text-slate-400">
              {isAdmin ? "Current workspace count" : "Assigned to you"}
            </span>
          </div>
        ))}
      </div>

      {/* Admin city overview */}
      {isAdmin && overview && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">City overview</h2>
              <p className="text-xs text-slate-500">
                Clients: <strong>{overview.summary?.totalClients}</strong> total,{" "}
                <strong>{overview.summary?.activeClients}</strong> active
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCity("")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${!selectedCity ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                All
              </button>
              {(overview.cities as string[]).map((c: string) => {
                const d = overview.byCity?.find((x: any) => x.city === c);
                if (!d) return null;
                return (
                  <button
                    key={c}
                    onClick={() => setSelectedCity(c === selectedCity ? "" : c)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${selectedCity === c ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  >
                    {c} <span className="opacity-70">({d.leads})</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {((selectedCity
              ? overview.byCity?.filter((x: any) => x.city === selectedCity)
              : overview.byCity) ?? []).map((item: any) => (
              <div key={item.city} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="font-medium text-sm text-slate-800">{item.city}</div>
                <div className="mt-1 flex gap-3 text-xs text-slate-500">
                  <span><strong className="text-slate-800">{item.leads}</strong> leads</span>
                  <span><strong className="text-green-700">{item.won}</strong> won</span>
                </div>
                {item.clients > 0 && (
                  <div className="mt-0.5 text-xs text-slate-400">{item.clients} client{item.clients !== 1 ? "s" : ""}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Admin monthly performance graph */}
      {isAdmin && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">Lead performance</h2>
              <p className="text-xs text-slate-500">
                {selectedCity ? `${selectedCity} · ` : ""}New leads vs. won over time
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={perfBusiness}
                onChange={(e) => { setPerfBusiness(e.target.value); setPerfProject(""); }}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
                aria-label="Business"
              >
                <option value="">All businesses</option>
                {perfBusinesses.map((b: any) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
              {perfBusiness && (
                <select
                  value={perfProject}
                  onChange={(e) => setPerfProject(e.target.value)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
                  aria-label="Project"
                >
                  <option value="">All projects</option>
                  {perfProjects.map((p: any) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              )}
            </div>
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {[
                { key: "1m", label: "1M" },
                { key: "3m", label: "3M" },
                { key: "6m", label: "6M" },
                { key: "1y", label: "1Y" },
                { key: "2y", label: "2Y" },
              ].map((r) => (
                <button
                  key={r.key}
                  onClick={() => setPerfRange(r.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${perfRange === r.key ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {perfData?.data?.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={perfData.data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2a78d6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2a78d6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gWon" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1baf7a" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#1baf7a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={formatAxis} width={52} />
                <Tooltip
                  formatter={(v: any) => formatCount(v)}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 8px 24px rgba(15,23,42,.08)" }}
                  labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="leads" stroke="#2a78d6" strokeWidth={2} fill="url(#gLeads)" name="Leads" />
                <Area type="monotone" dataKey="won" stroke="#1baf7a" strokeWidth={2} fill="url(#gWon)" name="Won" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-56 items-center justify-center text-sm text-slate-400">No data for this range yet.</div>
          )}
        </section>
      )}

      {/* Calendar section  */}
      <FollowupCalendar />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)] items-start">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Lead funnel</h2>
              <p className="text-xs text-slate-500">
                {isAdmin ? "Workspace funnel" : "Your assigned lead funnel"}
              </p>
            </div>
            <Radio size={18} className="text-indigo-500" />
          </div>
          <div className="mt-5 space-y-4">
            {funnel.map(([name, count]: any) => (
              <div
                key={name}
                className="grid grid-cols-[90px_minmax(0,1fr)_40px] items-center gap-3 text-xs"
              >
                <span className="text-slate-600">{name}</span>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full bg-indigo-500 ${barWidth(count)}`}
                  />
                </div>
                <b className="text-right text-slate-900">{count}</b>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Follow-up status</h2>
              <p className="text-xs text-slate-500">
                {isAdmin ? "All follow-ups" : "Your follow-ups"}
              </p>
            </div>
            <CalendarCheck size={18} className="text-indigo-500" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ["Pending", followupStats.pending],
              ["Completed", followupStats.completed],
              ["Overdue", followupStats.overdue],
              ["Missed", followupStats.missed],
            ].map(([label, value]: any) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3">
                <span className="text-xs text-slate-500">{label}</span>
                <b className="mt-1 block text-xl text-slate-900">
                  {value || 0}
                </b>
              </div>
            ))}
          </div>
        </section>
      </div>

      {isAdmin && (
        <>
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <PauseCircle size={18} className="text-amber-700" />
                  <h2 className="font-semibold text-slate-900">
                    Lead hold schedule
                  </h2>
                </div>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-amber-900/80">
                  Choose the exact start and end date/time. Leads received
                  during the window are stored but are not assigned, shown to
                  sales, notified or sounded. The backend checks every 30
                  seconds and releases eligible leads after the end time.
                </p>
              </div>
              {schedule && (
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase ${
                      schedule.state === "ACTIVE"
                        ? "bg-amber-200 text-amber-900"
                        : schedule.state === "SCHEDULED"
                          ? "bg-violet-100 text-violet-700"
                          : schedule.state === "EXPIRED"
                            ? "bg-slate-200 text-slate-700"
                            : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {schedule.state === "ACTIVE"
                      ? "● Hold active"
                      : schedule.state === "SCHEDULED"
                        ? "● Hold scheduled"
                        : schedule.state === "EXPIRED"
                          ? "● Schedule expired — delivery active"
                          : "● No hold — delivery active"}
                  </span>
                  {schedule.state === "SCHEDULED" && schedule.holdFrom && (
                    <span className="text-[10px] font-semibold text-violet-700">
                      Starts {new Date(schedule.holdFrom).toLocaleString()}
                    </span>
                  )}
                  {schedule.state === "ACTIVE" && schedule.holdUntil && (
                    <span className="text-[10px] font-semibold text-amber-800">
                      Holding until {new Date(schedule.holdUntil).toLocaleString()}
                    </span>
                  )}
                  {schedule.state === "EXPIRED" && schedule.holdUntil && (
                    <span className="text-[10px] font-semibold text-slate-500">
                      Ended {new Date(schedule.holdUntil).toLocaleString()}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
              <label className="flex items-center gap-2 rounded-xl bg-white/80 p-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) =>
                    setForm({ ...form, enabled: event.target.checked })
                  }
                  className="h-4 w-4 accent-indigo-600"
                />{" "}
                Enable hold
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Hold starts
                <input
                  type="datetime-local"
                  value={form.holdFrom}
                  onChange={(event) =>
                    setForm({ ...form, holdFrom: event.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Hold ends
                <input
                  type="datetime-local"
                  value={form.holdUntil}
                  onChange={(event) =>
                    setForm({ ...form, holdUntil: event.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Timezone
                <input
                  value={form.timezone}
                  onChange={(event) =>
                    setForm({ ...form, timezone: event.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                />
              </label>
              <div className="flex items-end gap-2">
                <button
                  disabled={saving}
                  onClick={saveSchedule}
                  className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Save size={15} /> {saving ? "Saving..." : "Save"}
                </button>
                <button
                  disabled={releasing}
                  onClick={releaseNow}
                  title="Release held leads now"
                  className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  {releasing ? "..." : "Release"}
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-semibold text-slate-900">
            Recent {isAdmin ? "released" : "assigned"} leads
          </h2>
          <p className="text-xs text-slate-500">
            {isAdmin
              ? "Workspace leads released for normal CRM work."
              : "Only leads assigned to you are shown."}
          </p>
        </div>
        {/* Mobile Card View (< lg: vertical cards, no horizontal scroll) */}
        <div className="block lg:hidden divide-y divide-slate-100">
          {leads.map((lead) => (
            <div key={lead._id} className="p-4 space-y-2.5 bg-white">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/leads/${lead._id}`}
                    className="font-bold text-sm text-slate-900 hover:text-indigo-600 block truncate"
                  >
                    {lead.name}
                  </Link>
                  <span className="text-[11px] text-slate-400 block mt-0.5 truncate">
                    {lead.phone || lead.email || "No contact"}
                  </span>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold shrink-0 ring-1 ${statusStyles[lead.status] || "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                  {String(lead.status || "NEW").replaceAll("_", " ")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Page Name</span>
                  <span className="text-slate-800 text-xs font-semibold truncate block mt-0.5">
                    {lead.meta?.pageName ||
                      lead.meta?.page_name ||
                      lead.meta?.rawPayload?.page_name ||
                      lead.meta?.rawPayload?.form_data?.page_name ||
                      lead.meta?.rawPayload?.entry?.[0]?.changes?.[0]?.value?.page_name ||
                      lead.businessProject?.name ||
                      "—"}
                  </span>
                </div>
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Assigned To</span>
                  <span className="text-slate-800 text-xs font-semibold truncate block mt-0.5">
                    {lead.assignedTo?.name ? (
                      lead.assignedTo.name
                    ) : (
                      <span className="text-amber-600 font-semibold">Not assigned</span>
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100/80">
                <span className="text-[10px] text-slate-400">Source: {lead.source}</span>
                <Link
                  href={`/leads/${lead._id}`}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  View lead →
                </Link>
              </div>
            </div>
          ))}
          {!leads.length && (
            <div className="p-8 text-center text-xs text-slate-500">
              No recent leads available.
            </div>
          )}
        </div>

        {/* Desktop Table View (>= lg) */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="min-w-[680px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {["Lead", "Page name", "Source", "Status", "Assigned to", "Action"].map(
                  (label) => (
                    <th key={label} className="px-5 py-3 font-semibold">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead._id} className="border-t border-slate-100 hover:bg-slate-50/60 transition">
                  <td className="px-5 py-3">
                    <b className="text-slate-900 block font-semibold">{lead.name}</b>
                    <span className="mt-0.5 block text-[10px] text-slate-400">
                      {lead.phone || lead.email || "No contact"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {lead.meta?.pageName ||
                      lead.meta?.page_name ||
                      lead.meta?.rawPayload?.page_name ||
                      lead.meta?.rawPayload?.form_data?.page_name ||
                      lead.meta?.rawPayload?.entry?.[0]?.changes?.[0]?.value?.page_name ||
                      lead.businessProject?.name ||
                      "—"}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{lead.source}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${statusStyles[lead.status] || "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                      {String(lead.status || "NEW").replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {lead.assignedTo?.name ? (
                      <span className="font-medium text-slate-800">{lead.assignedTo.name}</span>
                    ) : (
                      <span className="font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full text-[10px]">Not assigned</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/leads/${lead._id}`}
                      className="font-semibold text-indigo-600 hover:text-indigo-800"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!leads.length && (
            <div className="p-8 text-center text-xs text-slate-500">
              No recent leads available.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
