"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Topbar from "../../../components/Topbar";
import { api } from "../../../lib/api";
import { socket } from "../../../lib/socket";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  PhoneCall,
  Clock3,
  Building2,
  List,
  LayoutGrid,
  Filter,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthLabel = (d: Date) =>
  d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
const timeLabel = (value: string) =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

export default function CalendarPage() {
  const [month, setMonth] = useState(() => new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [businessProject, setBusinessProject] = useState("");
  const [selectedDay, setSelectedDay] = useState(dateKey(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"month" | "agenda">("month");
  const [eventFilter, setEventFilter] = useState<"ALL" | "CALL" | "FOLLOW_UP">(
    "ALL",
  );
  const requestSequence = useRef(0);

  const range = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const end = new Date(nextMonth);
    end.setDate(nextMonth.getDate() + ((7 - nextMonth.getDay()) % 7));
    return { start, end };
  }, [month]);

  useEffect(() => {
    api("/business-projects?limit=50")
      .then((d) => setProjects(d.projects || []))
      .catch(() => {});
  }, []);

  const loadEvents = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    });
    if (businessProject) params.set("businessProject", businessProject);
    try {
      const data = await api(`/followups/calendar?${params.toString()}`);
      if (requestId === requestSequence.current)
        setEvents(data.events || data.followups || []);
    } catch (e: any) {
      if (requestId === requestSequence.current)
        setError(e?.message || "Unable to load calendar events");
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [range, businessProject]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);
  useEffect(() => {
    const refresh = () => {
      void loadEvents();
    };
    socket.on("followup_updated", refresh);
    socket.on("followup_reminder", refresh);
    return () => {
      socket.off("followup_updated", refresh);
      socket.off("followup_reminder", refresh);
    };
  }, [loadEvents]);

  const days = useMemo(() => {
    const out: Date[] = [];
    const cursor = new Date(range.start);
    while (cursor < range.end) {
      out.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [range]);
  const grouped = useMemo(
    () =>
      events.reduce((acc: Record<string, any[]>, event) => {
        const k = dateKey(new Date(event.scheduledAt));
        (acc[k] ||= []).push(event);
        return acc;
      }, {}),
    [events],
  );
  const todayKey = dateKey(new Date());
  const filterEvents = (list: any[]) =>
    list.filter(
      (e) =>
        eventFilter === "ALL" ||
        (eventFilter === "CALL"
          ? e.eventType === "CALL"
          : e.eventType !== "CALL"),
    );
  const todayEvents = filterEvents(grouped[todayKey] || []);
  const selectedEvents = filterEvents(grouped[selectedDay] || []);
  const monthEvents = useMemo(
    () =>
      events
        .filter((e) => {
          const k = dateKey(new Date(e.scheduledAt));
          return (
            k >= dateKey(new Date(month.getFullYear(), month.getMonth(), 1)) &&
            k < dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 1))
          );
        })
        .filter(
          (e) =>
            eventFilter === "ALL" ||
            (eventFilter === "CALL"
              ? e.eventType === "CALL"
              : e.eventType !== "CALL"),
        )
        .sort(
          (a, b) =>
            new Date(a.scheduledAt).getTime() -
            new Date(b.scheduledAt).getTime(),
        ),
    [events, month, eventFilter],
  );

  function changeMonth(delta: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    setSelectedDay(dateKey(new Date(next.getFullYear(), next.getMonth(), 1)));
  }
  function goToday() {
    const now = new Date();
    setMonth(now);
    setSelectedDay(dateKey(now));
  }

  const stats = [
    {
      title: "Today's schedule",
      count: todayEvents.length,
      caption: "activities scheduled today",
      icon: CalendarDays,
      color: "indigo",
    },
    {
      title: "Calls today",
      count: todayEvents.filter((e) => e.eventType === "CALL").length,
      caption: "scheduled call follow-ups",
      icon: PhoneCall,
      color: "violet",
    },
    {
      title: "Other follow-ups",
      count: todayEvents.filter((e) => e.eventType !== "CALL").length,
      caption: "non-call activities today",
      icon: Clock3,
      color: "emerald",
    },
  ];

  return (
    <div className="space-y-5 pb-10">
      <Topbar
        title="Follow-up Calendar"
        subtitle="Plan your month, see daily activity counts, and open a lead directly from its scheduled follow-up."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {stats.map((s) => (
          <div
            key={s.title}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {s.title}
                </p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                  {s.count}
                </p>
                <p className="mt-1 text-xs text-slate-500">{s.caption}</p>
              </div>
              <span
                className={`grid h-10 w-10 place-items-center rounded-xl ${s.color === "violet" ? "bg-violet-100 text-violet-700" : s.color === "emerald" ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"}`}
              >
                <s.icon size={19} />
              </span>
            </div>
            {s.title === "Today's schedule" && (
              <button
                onClick={() => {
                  goToday();
                  setViewMode("agenda");
                }}
                className="mt-3 text-xs font-bold text-indigo-700 hover:text-indigo-900"
              >
                View today's schedule →
              </button>
            )}
          </div>
        ))}
      </div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-3 sm:p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => changeMonth(-1)}
              aria-label="Previous month"
              className="rounded-xl bg-indigo-600 p-2 text-white hover:bg-indigo-700"
            >
              <ChevronLeft size={18} />
            </button>
            <h2 className="min-w-[145px] text-center text-base font-bold text-slate-900 sm:min-w-[175px] sm:text-lg">
              {monthLabel(month)}
            </h2>
            <button
              onClick={() => changeMonth(1)}
              aria-label="Next month"
              className="rounded-xl bg-indigo-600 p-2 text-white hover:bg-indigo-700"
            >
              <ChevronRight size={18} />
            </button>
            <button
              onClick={goToday}
              className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
            >
              Today
            </button>
            <button
              onClick={() => void loadEvents()}
              aria-label="Refresh calendar"
              className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
            >
              <RefreshCw size={15} />
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-500">
              <Building2 size={15} />
              <select
                aria-label="Filter by business"
                value={businessProject}
                onChange={(e) => setBusinessProject(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none sm:max-w-56"
              >
                <option value="">All businesses</option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600">
              <Filter size={14} />
              <select
                aria-label="Filter event type"
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value as any)}
                className="bg-transparent text-sm outline-none"
              >
                <option value="ALL">All events</option>
                <option value="CALL">Calls only</option>
                <option value="FOLLOW_UP">Follow-ups only</option>
              </select>
            </label>
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                onClick={() => setViewMode("month")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${viewMode === "month" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
              >
                <LayoutGrid size={14} /> Month
              </button>
              <button
                onClick={() => setViewMode("agenda")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${viewMode === "agenda" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
              >
                <List size={14} /> Agenda
              </button>
            </div>
          </div>
        </div>
        {error && (
          <p
            role="alert"
            className="m-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 sm:m-4"
          >
            {error}
          </p>
        )}
        {loading && (
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-slate-400">
            <RefreshCw size={13} className="animate-spin" /> Loading this
            month's follow-ups…
          </div>
        )}
        {viewMode === "month" ? (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
            <div className="min-w-0 border-b border-slate-100 xl:border-b-0 xl:border-r">
              <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div
                    key={d}
                    className="py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:text-xs"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {days.map((day) => {
                  const key = dateKey(day);
                  const list = filterEvents(grouped[key] || []);
                  const inMonth = day.getMonth() === month.getMonth();
                  const selected = key === selectedDay;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDay(key)}
                      aria-pressed={selected}
                      className={`min-h-[78px] min-w-0 border-b border-r border-slate-100 p-1.5 text-left transition sm:min-h-[104px] sm:p-2 lg:min-h-[116px] ${inMonth ? "bg-white" : "bg-slate-50/70 text-slate-400"} ${selected ? "!bg-indigo-50 ring-2 ring-inset ring-indigo-500" : "hover:bg-indigo-50/50"}`}
                    >
                      <span
                        className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold sm:h-7 sm:w-7 ${key === todayKey ? "bg-indigo-600 text-white" : selected ? "bg-indigo-100 text-indigo-800" : "text-slate-700"}`}
                      >
                        {day.getDate()}
                      </span>
                      <div className="mt-1 space-y-1">
                        {list.slice(0, 2).map((e) => (
                          <span
                            key={e._id}
                            className={`block truncate rounded px-1 py-1 text-[9px] font-semibold sm:text-[10px] ${e.eventType === "CALL" ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"}`}
                          >
                            <span className="hidden sm:inline">
                              {timeLabel(e.scheduledAt)}{" "}
                            </span>
                            {e.lead?.name || "Lead"}
                          </span>
                        ))}
                        {list.length > 2 && (
                          <span className="block truncate px-1 text-[9px] font-bold text-slate-500">
                            +{list.length - 2} more
                          </span>
                        )}
                        {list.length > 0 && (
                          <span className="inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                            {list.length}{" "}
                            <span className="hidden sm:inline"> items</span>
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <DaySchedule
              selectedDay={selectedDay}
              selectedEvents={selectedEvents}
              loading={loading}
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {monthEvents.length ? (
              monthEvents.map((e) => <EventRow key={e._id} event={e} />)
            ) : (
              <EmptySchedule loading={loading} />
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <span>
            Showing {monthLabel(month)} · {monthEvents.length} activities
          </span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <i className="h-2 w-2 rounded-full bg-violet-400" /> Calls
            </span>
            <span className="flex items-center gap-1">
              <i className="h-2 w-2 rounded-full bg-emerald-400" /> Follow-ups
            </span>
          </span>
        </div>
      </section>
    </div>
  );
}

function DaySchedule({
  selectedDay,
  selectedEvents,
  loading,
}: {
  selectedDay: string;
  selectedEvents: any[];
  loading: boolean;
}) {
  const date = new Date(`${selectedDay}T12:00:00`);
  return (
    <aside className="min-w-0 p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            Daily agenda
          </p>
          <h3 className="mt-1 text-lg font-bold text-slate-900">
            {date.toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {selectedEvents.length} scheduled{" "}
            {selectedEvents.length === 1 ? "activity" : "activities"}
          </p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
          <CalendarDays size={19} />
        </span>
      </div>
      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">
          Loading time slots…
        </div>
      ) : selectedEvents.length ? (
        <div className="relative space-y-3 before:absolute before:bottom-3 before:left-[53px] before:top-3 before:w-px before:bg-slate-200">
          {[...selectedEvents]
            .sort(
              (a, b) =>
                new Date(a.scheduledAt).getTime() -
                new Date(b.scheduledAt).getTime(),
            )
            .map((e) => (
              <div key={e._id} className="relative flex min-w-0 gap-3">
                <div className="w-12 shrink-0 pt-3 text-right text-[11px] font-semibold tabular-nums text-slate-500">
                  {timeLabel(e.scheduledAt)}
                </div>
                <div
                  className={`z-10 mt-3 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-white ${e.eventType === "CALL" ? "bg-violet-500" : "bg-emerald-500"}`}
                />
                <EventCard event={e} />
              </div>
            ))}
        </div>
      ) : (
        <EmptySchedule loading={loading} />
      )}
    </aside>
  );
}
function EventCard({ event: e }: { event: any }) {
  return (
    <Link
      href={e.lead?._id ? `/leads/${e.lead._id}` : "/followups"}
      className="group min-w-0 flex-1 rounded-xl border border-slate-200 p-3 transition hover:border-indigo-300 hover:bg-indigo-50/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-sm font-bold text-slate-900 group-hover:text-indigo-700">
          {e.lead?.name || "Lead details unavailable"}
        </p>
        <ArrowUpRight size={15} className="shrink-0 text-slate-400" />
      </div>
      <p className="mt-1 truncate text-xs text-slate-500">
        {e.lead?.businessProject?.name || "No business mapped"} ·{" "}
        {e.type || "FOLLOW_UP"}
      </p>
      {e.notes && (
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">
          {e.notes}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-md px-2 py-1 text-[10px] font-semibold ${e.eventType === "CALL" ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"}`}
        >
          {e.eventType === "CALL" ? "Call" : "Follow-up"}
        </span>
        <span className="text-[10px] text-slate-400">
          {e.user?.name || "Unassigned"}
        </span>
      </div>
    </Link>
  );
}
function EventRow({ event }: { event: any }) {
  return (
    <div className="flex gap-3 p-4 transition hover:bg-indigo-50/30">
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${event.eventType === "CALL" ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"}`}
      >
        {event.eventType === "CALL" ? (
          <PhoneCall size={17} />
        ) : (
          <CalendarDays size={17} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-500">
          {new Date(event.scheduledAt).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}{" "}
          · {timeLabel(event.scheduledAt)}
        </p>
        <Link
          href={event.lead?._id ? `/leads/${event.lead._id}` : "/followups"}
          className="mt-1 block truncate text-sm font-bold text-slate-900 hover:text-indigo-700"
        >
          {event.lead?.name || "Lead"}
        </Link>
        <p className="mt-1 truncate text-xs text-slate-500">
          {event.lead?.businessProject?.name || "No business mapped"} ·{" "}
          {event.notes || event.type || "Scheduled activity"}
        </p>
      </div>
      <ChevronRight size={17} className="mt-3 shrink-0 text-slate-400" />
    </div>
  );
}
function EmptySchedule({ loading }: { loading: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
      <CalendarDays className="mx-auto text-slate-300" size={28} />
      <p className="mt-2 text-sm font-semibold text-slate-600">
        {loading ? "Loading schedule…" : "Nothing scheduled"}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        Select another day or adjust the filters.
      </p>
    </div>
  );
}
