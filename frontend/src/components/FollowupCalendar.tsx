"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ArrowUpRight,
} from "lucide-react";
import { api } from "../lib/api";
import { socket } from "../lib/socket";

type Followup = {
  _id: string;
  scheduledAt: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const monthLabel = (date: Date) =>
  date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

export default function FollowupCalendar({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [month, setMonth] = useState(() => new Date());
  const [items, setItems] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = useMemo(() => dateKey(new Date()), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const from = new Date(month.getFullYear(), month.getMonth(), 1);
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 1);

    try {
      const data = await api(
        `/followups/calendar?from=${encodeURIComponent(
          from.toISOString(),
        )}&to=${encodeURIComponent(to.toISOString())}`,
      );

      setItems(data.followups || []);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to load follow-up counts.",
      );
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => void load();

    socket.on("followup_updated", refresh);
    socket.on("followup_reminder", refresh);

    return () => {
      socket.off("followup_updated", refresh);
      socket.off("followup_reminder", refresh);
    };
  }, [load]);

  const counts = useMemo(() => {
    const result: Record<string, number> = {};

    for (const item of items) {
      if (!item.scheduledAt) continue;

      const key = dateKey(new Date(item.scheduledAt));
      result[key] = (result[key] || 0) + 1;
    }

    return result;
  }, [items]);

  const totalCount = items.length;
  const todayCount = counts[today] || 0;

  const changeMonth = (delta: number) => {
    setMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + delta, 1),
    );
  };

  const goToToday = () => setMonth(new Date());

  return (
    <section
      className={`w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${
        compact ? "text-sm" : ""
      }`}
    >
      <div className="flex flex-col md:flex-row ">
        <div className="flex flex-col flex-1 justify-between">
          {/* Header */}
          <div className="flex flex-wrap flex-1 w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                <CalendarDays size={19} />
              </div>

              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight text-slate-900 sm:text-base">
                  Follow-up calendar
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {monthLabel(month)}
                  <span className="mx-1 text-slate-300">·</span>
                  {loading ? "Updating..." : `${totalCount} follow-ups`}
                </p>
              </div>
            </div>

            <Link
              href="/calendar"
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              Open calendar
              <ArrowUpRight size={14} />
            </Link>
          </div>
          {/* Month navigation */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3.5 sm:px-5">
            <h3 className="text-sm font-semibold text-slate-900">
              {monthLabel(month)}
            </h3>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={goToToday}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                Today
              </button>

              <button
                type="button"
                onClick={() => changeMonth(-1)}
                aria-label="Previous month"
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <ChevronLeft size={17} />
              </button>

              <button
                type="button"
                onClick={() => changeMonth(1)}
                aria-label="Next month"
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </div>
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:flex lg:flex-row gap-3 p-4 sm:px-5">
          <div className="min-w-40 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3.5 transition-colors hover:bg-indigo-50 sm:p-4">
            <p className="text-xs font-medium text-indigo-700">
              Today&apos;s follow-ups
            </p>
            <p className="mt-2 text-2xl font-bold leading-none tracking-tight text-indigo-950">
              {todayCount}
            </p>
          </div>

          <div className="min-w-40 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 transition-colors hover:bg-slate-50 sm:p-4">
            <p className="text-xs font-medium text-slate-600">This month</p>
            <p className="mt-2 text-2xl font-bold leading-none tracking-tight text-slate-950">
              {loading ? "—" : totalCount}
            </p>
          </div>
        </div>
      </div>
      {error && (
        <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700 sm:mx-5">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}
    </section>
  );
}
