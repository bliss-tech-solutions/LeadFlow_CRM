"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import Pagination from "../Pagination";
import { api } from "../../lib/api";
import { socket } from "../../lib/socket";
import { CHANNELS, CHANNEL_LABEL, formatContactPhone, type Channel } from "./types";

type Message = {
  _id: string;
  channel: Channel;
  name: string;
  to: string;
  body: string;
  status: "QUEUED" | "SENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "SKIPPED";
  error?: string;
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
  sentBy?: { name?: string };
  template?: { name?: string };
};

const STATUSES = ["QUEUED", "SENDING", "SENT", "DELIVERED", "READ", "FAILED", "SKIPPED"] as const;

const STATUS_TONE: Record<Message["status"], string> = {
  QUEUED: "bg-slate-100 text-slate-600",
  SENDING: "bg-sky-50 text-sky-600",
  SENT: "bg-sky-50 text-sky-700",
  DELIVERED: "bg-emerald-50 text-emerald-700",
  READ: "bg-indigo-50 text-indigo-700",
  FAILED: "bg-rose-50 text-rose-700",
  SKIPPED: "bg-amber-50 text-amber-700",
};

export default function MessageStatus({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<{ messages: Message[]; total: number; page: number; pages: number } | null>(null);
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState<"" | Channel>("");
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (channel) params.set("channel", channel);
      if (status) params.set("status", status);
      if (q) params.set("q", q);
      setData(await api(`/outreach/messages?${params}`));
      setError("");
    } catch (e: any) {
      setError(e?.message || "Could not load messages");
    } finally {
      setLoading(false);
    }
  }, [page, channel, status, q]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setPage(1);
      setQ(filter.trim());
    }, 350);
    return () => window.clearTimeout(t);
  }, [filter]);

  // Live status: SMS batches and the WhatsApp queue both push updates.
  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => {
      if (timer === undefined)
        timer = window.setTimeout(() => {
          timer = undefined;
          void load();
        }, 1000);
    };
    socket.on("outreach_updated", refresh);
    socket.on("whatsapp_message", refresh);
    return () => {
      socket.off("outreach_updated", refresh);
      socket.off("whatsapp_message", refresh);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [load]);

  const select = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <b className="text-sm text-slate-900">Sent messages</b>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value as "" | Channel);
              setPage(1);
            }}
            className={select}
          >
            <option value="">All channels</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className={select}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Name or number"
              className="w-44 rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-xs outline-none focus:border-indigo-400"
            />
          </div>
          <button type="button" onClick={() => void load()} title="Refresh" className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      {error && <div className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-600">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Sent</th>
              <th className="px-4 py-2.5 font-semibold">Name</th>
              <th className="px-4 py-2.5 font-semibold">To</th>
              <th className="px-4 py-2.5 font-semibold">Channel</th>
              <th className="px-4 py-2.5 font-semibold">Message</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.messages.length ? (
              data.messages.map((m) => (
                <tr key={m._id} className="align-top hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                    {new Date(m.createdAt).toLocaleString("en-IN")}
                    {m.sentBy?.name && <span className="block text-[10px] text-slate-400">by {m.sentBy.name}</span>}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">{m.name || "—"}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-slate-600">{m.to ? formatContactPhone(m.to) : "—"}</td>
                  <td className="px-4 py-2.5 text-xs font-semibold text-slate-600">{CHANNEL_LABEL[m.channel]}</td>
                  <td className="max-w-xs px-4 py-2.5 text-xs text-slate-500">
                    {m.template?.name && <b className="block text-slate-700">{m.template.name}</b>}
                    <span className="line-clamp-2">{m.body}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[m.status]}`}>{m.status.charAt(0) + m.status.slice(1).toLowerCase()}</span>
                    {m.error && <span className="mt-1 block max-w-[180px] text-[10px] leading-4 text-rose-500">{m.error}</span>}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                  {loading ? <Loader2 size={20} className="mx-auto animate-spin" /> : "No messages sent yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={data?.page || page} pages={data?.pages || 1} total={data?.total || 0} label="messages" onChange={setPage} />
    </section>
  );
}
