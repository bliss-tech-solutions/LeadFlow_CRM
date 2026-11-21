"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlarmClock, CalendarCheck2, PhoneCall, Trophy, Timer, Inbox, Phone, Loader2, ArrowRight } from "lucide-react";
import Topbar from "../../../components/Topbar";
import WhatsAppSendDrawer from "../../../components/WhatsAppSendDrawer";
import WhatsAppIcon from "../../../components/WhatsAppIcon";
import { api } from "../../../lib/api";
import { getUser } from "../../../lib/auth";
import { socket } from "../../../lib/socket";
import { scoreTone, telHref, timeAgo } from "../../../lib/leadMeta";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function MyDayPage() {
  const user = getUser();
  const canWhatsApp = user?.role === "BUSINESS" || user?.role === "SALES";
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [waLead, setWaLead] = useState<string | null>(null);
  const [busyFollowup, setBusyFollowup] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api("/leads/my-day"));
    } catch (e: any) {
      setError(e?.message || "Could not load your day");
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    ["new_lead", "lead_updated", "followup_updated", "call_logged", "sla_warning"].forEach((e) => socket.on(e, refresh));
    return () => ["new_lead", "lead_updated", "followup_updated", "call_logged", "sla_warning"].forEach((e) => socket.off(e, refresh));
  }, [load]);

  async function completeFollowup(id: string) {
    setBusyFollowup(id);
    try {
      await api(`/followups/${id}/complete`, { method: "PATCH", body: JSON.stringify({}) });
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not complete follow-up");
    } finally {
      setBusyFollowup(null);
    }
  }

  const s = data?.stats;
  const cards = [
    { label: "Overdue follow-ups", value: s?.overdueCount, Icon: AlarmClock, tone: "text-rose-600 bg-rose-50" },
    { label: "Due today", value: s?.todayCount, Icon: CalendarCheck2, tone: "text-amber-600 bg-amber-50" },
    { label: "Waiting first contact", value: s?.uncontactedCount, Icon: Inbox, tone: "text-sky-600 bg-sky-50" },
    { label: `Past ${s?.slaMinutes ?? 15}-min SLA`, value: s?.slaBreached, Icon: Timer, tone: "text-violet-600 bg-violet-50" },
    { label: "Calls today", value: s?.callsToday, Icon: PhoneCall, tone: "text-indigo-600 bg-indigo-50" },
    { label: "Won this month", value: s?.wonThisMonth, Icon: Trophy, tone: "text-emerald-600 bg-emerald-50" },
  ];

  const FollowupRow = ({ f, overdue }: { f: any; overdue?: boolean }) => (
    <div className="flex items-center gap-3 py-3">
      <div className={`w-14 shrink-0 text-center text-[11px] font-semibold ${overdue ? "text-rose-600" : "text-slate-700"}`}>
        {new Date(f.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        {overdue && <span className="block text-[9px] font-normal">{timeAgo(f.scheduledAt)}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <Link href={`/leads/${f.lead?._id}`} className="block truncate text-sm font-semibold text-slate-900 hover:text-indigo-600">
          {f.lead?.name || "Lead"}
        </Link>
        <span className="block truncate text-[11px] text-slate-500">
          {String(f.type).replaceAll("_", " ")}
          {f.notes ? ` · ${f.notes}` : ""}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {telHref(f.lead?.phone) && (
          <a href={telHref(f.lead?.phone)} aria-label="Call" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
            <Phone size={14} />
          </a>
        )}
        {canWhatsApp && f.lead?.phone && (
          <button onClick={() => setWaLead(f.lead._id)} aria-label="WhatsApp" className="grid h-8 w-8 place-items-center rounded-lg text-emerald-600 hover:bg-emerald-50">
            <WhatsAppIcon size={15} />
          </button>
        )}
        <button
          onClick={() => completeFollowup(f._id)}
          disabled={busyFollowup === f._id}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
        >
          {busyFollowup === f._id ? <Loader2 size={12} className="animate-spin" /> : "Done"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <Topbar title={`${greeting()}, ${user?.name?.split(" ")[0] || ""}`} subtitle="Your focus list for today — clear the red items first." />
      {error && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(({ label, value, Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`grid h-9 w-9 place-items-center rounded-xl ${tone}`}>
              <Icon size={17} />
            </div>
            <b className="mt-3 block text-2xl font-bold tabular-nums text-slate-900">{value ?? "–"}</b>
            <span className="text-[11px] text-slate-500">{label}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3 items-start">
        <section className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold text-rose-700">
            <AlarmClock size={16} /> Overdue
          </h2>
          <div className="mt-2 divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
            {data?.overdue?.length ? data.overdue.map((f: any) => <FollowupRow key={f._id} f={f} overdue />) : <p className="py-6 text-center text-xs text-slate-500">Nothing overdue. 🎉</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <CalendarCheck2 size={16} className="text-amber-600" /> Later today
          </h2>
          <div className="mt-2 divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
            {data?.today?.length ? data.today.map((f: any) => <FollowupRow key={f._id} f={f} />) : <p className="py-6 text-center text-xs text-slate-500">No more follow-ups today.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <Inbox size={16} className="text-sky-600" /> Waiting for first contact
            </h2>
            <Link href="/leads" className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600">
              All <ArrowRight size={12} />
            </Link>
          </div>
          <div className="mt-2 divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
            {!data && (
              <div className="flex items-center justify-center py-6 text-slate-400">
                <Loader2 size={16} className="animate-spin" />
              </div>
            )}
            {data?.uncontacted?.length === 0 && <p className="py-6 text-center text-xs text-slate-500">Every new lead has been contacted.</p>}
            {data?.uncontacted?.map((l: any) => {
              const ageMin = (Date.now() - new Date(l.createdAt).getTime()) / 60000;
              const late = ageMin > (s?.slaMinutes ?? 15);
              return (
                <div key={l._id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/leads/${l._id}`} className="block truncate text-sm font-semibold text-slate-900 hover:text-indigo-600">
                      {l.name}
                    </Link>
                    <span className="block truncate text-[11px] text-slate-500">
                      {l.businessProject?.name || "Unmapped"} ·{" "}
                      <span className={late ? "font-semibold text-rose-600" : ""}>{timeAgo(l.createdAt)}</span>
                    </span>
                  </div>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ${scoreTone(l.score)}`}>{l.score}</span>
                  {telHref(l.phone) && (
                    <a href={telHref(l.phone)} aria-label={`Call ${l.name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                      <Phone size={14} />
                    </a>
                  )}
                  {canWhatsApp && l.phone && (
                    <button onClick={() => setWaLead(l._id)} aria-label={`WhatsApp ${l.name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100">
                      <WhatsAppIcon size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <WhatsAppSendDrawer leadId={waLead} onClose={() => setWaLead(null)} onSent={load} />
    </div>
  );
}
