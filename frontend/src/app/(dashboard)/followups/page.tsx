"use client";

import { useEffect, useState } from "react";
import Topbar from "../../../components/Topbar";
import { api } from "../../../lib/api";
import { socket } from "../../../lib/socket";
import { CalendarClock, Check, X } from "lucide-react";

export default function Followups() {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [selected, setSelected] = useState<any>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const [list, summary] = await Promise.all([
      api("/followups"),
      api("/followups/stats"),
    ]);
    setItems(list.followups || []);
    setStats(summary);
  }
  useEffect(() => {
    load();
    const refresh = () => load();
    socket.on("followup_updated", refresh);
    return () => {
      socket.off("followup_updated", refresh);
    };
  }, []);

  async function complete() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await api(`/followups/${selected._id}/complete`, {
        method: "PATCH",
        body: JSON.stringify({ completionNote: note }),
      });
      setSelected(null);
      setNote("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Unable to complete follow-up");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Topbar
        title="Follow-ups"
        subtitle="Admin and sales follow-up activity, pending work and completion status."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Pending", stats.pending],
          ["Completed", stats.completed],
          ["Overdue", stats.overdue],
          ["Missed", stats.missed],
          ["Cancelled", stats.cancelled],
        ].map(([label, value]: any) => (
          <div
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <span className="text-xs text-slate-500">{label}</span>
            <b className="mt-1 block text-2xl text-slate-900">{value || 0}</b>
          </div>
        ))}
      </div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {["Lead", "Owner", "Type", "Scheduled", "Status", "Action"].map(
                  (x) => (
                    <th key={x} className="px-5 py-3 font-semibold">
                      {x}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr key={f._id} className="border-t border-slate-100">
                  <td className="px-5 py-4">
                    <b className="block text-slate-900">
                      {f.lead?.name || "Lead unavailable"}
                    </b>
                    <span className="mt-1 block text-[10px] text-slate-400">
                      {f.lead?.phone || f.lead?.email || "No contact details"}
                    </span>
                  </td>
                  <td className="px-5 py-4">{f.user?.name || "Unassigned"}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarClock size={14} />
                      {f.type}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {new Date(f.scheduledAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${f.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : f.status === "PENDING" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}
                    >
                      {f.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {f.status === "PENDING" ? (
                      <button
                        onClick={() => {
                          setSelected(f);
                          setNote("");
                          setError("");
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-2 font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        <Check size={14} /> Complete
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-emerald-600">
                        Completed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length && (
          <div className="p-10 text-center text-sm text-slate-500">
            No follow-ups found.
          </div>
        )}
      </section>
      {selected && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <div className="w-full max-w-xl rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Complete follow-up
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Confirm the action and optionally record what happened.
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="text-[10px] font-bold uppercase text-slate-400">
                  Lead
                </span>
                <b className="mt-1 block text-sm text-slate-900">
                  {selected.lead?.name || "Lead unavailable"}
                </b>
                <span className="text-xs text-slate-500">
                  {selected.lead?.phone || selected.lead?.email || "No contact"}
                </span>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="text-[10px] font-bold uppercase text-slate-400">
                  Scheduled
                </span>
                <b className="mt-1 block text-sm text-slate-900">
                  {new Date(selected.scheduledAt).toLocaleString()}
                </b>
                <span className="text-xs text-slate-500">
                  {selected.type} · {selected.user?.name || "Unassigned"}
                </span>
              </div>
            </div>
            {selected.notes && (
              <div className="mt-3 rounded-xl border border-slate-200 p-3">
                <span className="text-[10px] font-bold uppercase text-slate-400">
                  Existing notes
                </span>
                <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">
                  {selected.notes}
                </p>
              </div>
            )}
            <label className="mt-4 block text-xs font-semibold text-slate-700">
              Completion note
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="What happened on this follow-up?"
                className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
              />
            </label>
            {error && (
              <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </div>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setSelected(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={complete}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Completing..." : "Mark as complete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
