"use client";

import { useEffect, useState } from "react";
import Topbar from "../../../components/Topbar";
import { api } from "../../../lib/api";
import { socket } from "../../../lib/socket";
import { getUser } from "../../../lib/auth";
import {
  ArrowUpRight,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  PauseCircle,
  Radio,
  Save,
  Users,
} from "lucide-react";

function toLocalInput(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export default function Dashboard() {
  const user = getUser();
  const isAdmin = user?.role === "ADMIN";

  const [stats, setStats] = useState<any>({});
  const [followupStats, setFollowupStats] = useState<any>({});
  const [schedule, setSchedule] = useState<any>(null);
  const [capacity, setCapacity] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [form, setForm] = useState({
    enabled: false,
    holdFrom: "",
    holdUntil: "",
    timezone: "Asia/Kolkata",
  });
  const [saving, setSaving] = useState(false);
  const [capacitySaving, setCapacitySaving] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);

  async function load() {
    try {
      const baseRequests = [
        api("/leads/stats"),
        api("/leads?limit=6"),
        api("/followups/stats"),
      ];

      if (isAdmin) {
        const [s, l, f, d, c] = await Promise.all([
          ...baseRequests,
          api("/lead-delivery/schedule"),
          api("/lead-delivery/capacity"),
        ]);

        setStats(s || {});
        setLeads(l.leads || []);
        setFollowupStats(f || {});
        setSchedule(d || null);
        setForm({
          enabled: Boolean(d?.schedule?.enabled),
          holdFrom: toLocalInput(d?.schedule?.holdFrom),
          holdUntil: toLocalInput(d?.schedule?.holdUntil),
          timezone: d?.schedule?.timezone || "Asia/Kolkata",
        });
        setCapacity(c.capacity || []);
      } else {
        const [s, l, f] = await Promise.all(baseRequests);
        setStats(s || {});
        setLeads(l.leads || []);
        setFollowupStats(f || {});
      }
    } catch (error) {
      console.error("[dashboard] load failed", error);
    }
  }

  useEffect(() => {
    void load();

    const refresh = () => void load();
    socket.on("followup_updated", refresh);
    socket.on("new_lead", refresh);
    socket.on("lead_assigned", refresh);

    return () => {
      socket.off("followup_updated", refresh);
      socket.off("new_lead", refresh);
      socket.off("lead_assigned", refresh);
    };
  }, []);

  async function saveSchedule() {
    setSaving(true);

    try {
      if (form.enabled && (!form.holdFrom || !form.holdUntil)) {
        throw new Error("Select both hold start and hold end date/time");
      }

      await api("/lead-delivery/schedule", {
        method: "PUT",
        body: JSON.stringify({
          enabled: form.enabled,
          holdFrom: form.enabled ? new Date(form.holdFrom).toISOString() : null,
          holdUntil: form.enabled ? new Date(form.holdUntil).toISOString() : null,
          timezone: form.timezone,
        }),
      });

      await load();
    } catch (error: any) {
      alert(error?.message || "Unable to save delivery schedule");
    } finally {
      setSaving(false);
    }
  }

  async function updateCapacity(userId: string, value: string) {
    const limit = Number(value);

    if (!Number.isFinite(limit) || limit < 0) return;

    setCapacitySaving(userId);

    try {
      await api(`/users/${userId}/capacity`, {
        method: "PATCH",
        body: JSON.stringify({ dailyLeadLimit: Math.floor(limit) }),
      });
      await load();
    } catch (error: any) {
      alert(error?.message || "Unable to update capacity");
    } finally {
      setCapacitySaving(null);
    }
  }

  async function releaseNow() {
    setReleasing(true);

    try {
      await api("/lead-delivery/release", { method: "POST" });
      await load();
    } catch (error: any) {
      alert(error?.message || "Unable to release held leads");
    } finally {
      setReleasing(false);
    }
  }

  const total = stats.total || 0;
  const funnel = [
    ["New", stats.newCount || 0],
    ["Interested", stats.interested || 0],
    ["Follow-up", stats.followups || 0],
    ["Won", stats.won || 0],
  ];
  const heldCount = isAdmin ? stats.held || 0 : 0;
  const availableCapacity = capacity.reduce(
    (sum, item) => sum + Number(item.remaining || 0),
    0,
  );

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
    <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
      <Topbar
        title="Dashboard"
        subtitle={
          isAdmin
            ? "Workspace-wide lead flow, follow-ups, capacity and delivery controls."
            : "Your assigned leads, follow-ups and current sales activity."
        }
      />

      <div className="flex flex-row gap-5 w-full">
        {[
          [isAdmin ? "Released leads" : "My leads", total, Users],
          ["New leads", stats.newCount || 0, Clock3],
          ["Interested", stats.interested || 0, CheckCircle2],
          ["Won", stats.won || 0, ArrowUpRight],
          ...(isAdmin ? [["Held", heldCount, PauseCircle]] : []),
        ].map(([label, value, Icon]: any) => (
          <div key={label} className="rounded-2xl flex-1 border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{label}</span>
              <Icon size={17} />
            </div>
            <strong className="mt-2 block text-3xl font-bold text-slate-900">{value}</strong>
            <span className="mt-1 block text-[11px] text-slate-400">
              {isAdmin ? "Current workspace count" : "Assigned to you"}
            </span>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
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
              <div key={name} className="grid grid-cols-[90px_minmax(0,1fr)_40px] items-center gap-3 text-xs">
                <span className="text-slate-600">{name}</span>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full bg-indigo-500 ${barWidth(count)}`} />
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
                <b className="mt-1 block text-xl text-slate-900">{value || 0}</b>
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
                  <h2 className="font-semibold text-slate-900">Lead hold schedule</h2>
                </div>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-amber-900/80">
                  Choose the exact start and end date/time. Leads received during the window are stored but are not assigned, shown to sales, notified or sounded. The backend checks every 30 seconds and releases eligible leads after the end time.
                </p>
              </div>
              {schedule && (
                <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase ${schedule.holding ? "bg-amber-200 text-amber-900" : "bg-emerald-100 text-emerald-700"}`}>
                  {schedule.holding ? "Currently holding" : "Realtime delivery active"}
                </span>
              )}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="flex items-center gap-2 rounded-xl bg-white/80 p-3 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} className="h-4 w-4 accent-indigo-600" /> Enable hold
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Hold starts
                <input type="datetime-local" value={form.holdFrom} onChange={(event) => setForm({ ...form, holdFrom: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Hold ends
                <input type="datetime-local" value={form.holdUntil} onChange={(event) => setForm({ ...form, holdUntil: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Timezone
                <input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
              </label>
              <div className="flex items-end gap-2">
                <button disabled={saving} onClick={saveSchedule} className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  <Save size={15} /> {saving ? "Saving..." : "Save"}
                </button>
                <button disabled={releasing} onClick={releaseNow} title="Release held leads now" className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-50">
                  {releasing ? "..." : "Release"}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Salesperson lead capacity</h2>
                <p className="text-xs text-slate-500">Automatic assignments use the configured daily limit. Manual Admin assignment can exceed it.</p>
              </div>
              <span className="text-xs font-semibold text-indigo-600">{availableCapacity} automatic slots remaining</span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[720px] w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>{["Salesperson", "Today", "Daily limit", "Remaining", "Status", "Action"].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {capacity.map((item) => (
                    <tr key={item.userId} className="border-t border-slate-100">
                      <td className="px-4 py-3"><b className="text-slate-900">{item.name}</b><span className="mt-0.5 block text-[10px] text-slate-400">{item.email}</span></td>
                      <td className="px-4 py-3 font-semibold">{item.assignedToday}</td>
                      <td className="px-4 py-3"><input defaultValue={item.dailyLeadLimit} type="number" min="0" max="1000" className="w-24 rounded-lg border border-slate-200 px-2 py-1.5" onBlur={(event) => { if (Number(event.target.value) !== item.dailyLeadLimit) void updateCapacity(item.userId, event.target.value); }} /></td>
                      <td className="px-4 py-3 font-semibold text-indigo-700">{item.remaining}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.atCapacity ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{item.atCapacity ? "At capacity" : "Available"}</span></td>
                      <td className="px-4 py-3 text-slate-400">{capacitySaving === item.userId ? "Saving..." : "Automatic"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!capacity.length && <div className="p-8 text-center text-sm text-slate-500">No active salespeople found.</div>}
            </div>
          </section>
        </>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-semibold text-slate-900">Recent {isAdmin ? "released" : "assigned"} leads</h2>
          <p className="text-xs text-slate-500">{isAdmin ? "Workspace leads released for normal CRM work." : "Only leads assigned to you are shown."}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{["Lead", "Business", "Source", "Status", "Owner", "Score"].map((label) => <th key={label} className="px-5 py-3 font-semibold">{label}</th>)}</tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead._id} className="border-t border-slate-100">
                  <td className="px-5 py-3"><b className="text-slate-900">{lead.name}</b><span className="mt-1 block text-[10px] text-slate-400">{lead.phone || lead.email || "No contact"}</span></td>
                  <td className="px-5 py-3">{lead.businessProject?.name || "Unmapped"}</td>
                  <td className="px-5 py-3">{lead.source}</td>
                  <td className="px-5 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold">{lead.status}</span></td>
                  <td className="px-5 py-3">{lead.assignedTo?.name || "Unassigned"}</td>
                  <td className="px-5 py-3">{lead.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
