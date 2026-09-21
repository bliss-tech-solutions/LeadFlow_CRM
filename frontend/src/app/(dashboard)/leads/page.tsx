"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Topbar from "../../../components/Topbar";
import { api } from "../../../lib/api";
import { ExternalLink, Search, PauseCircle } from "lucide-react";
const statuses = [
  "",
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "FOLLOW_UP",
  "SCHEDULED",
  "WON",
  "LOST",
  "NOT_INTERESTED",
];
export default function Leads() {
  const [leads, setLeads] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try {
      const d = await api(
        `/leads?limit=50&search=${encodeURIComponent(q)}&status=${status}`,
      );
      setLeads(d.leads || []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [status]);
  return (
    <div className="space-y-5">
      <Topbar
        title="Leads"
        subtitle="Released leads, ownership, source mapping and next action."
      />
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
          <div className="flex h-10 w-full max-w-sm items-center gap-2 rounded-xl border border-slate-200 px-3 text-slate-400">
            <Search size={15} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Search name, email, phone"
              className="w-full text-sm outline-none"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
          >
            <option value="">All statuses</option>
            {statuses.slice(1).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={load}
            className="h-10 rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white"
          >
            Search
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[950px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {[
                  "Lead",
                  "Business",
                  "Source / Campaign",
                  "Status",
                  "Assigned",
                  "Created",
                  "",
                ].map((x) => (
                  <th key={x} className="px-5 py-3 font-semibold">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l._id} className="border-t border-slate-100">
                  <td className="px-5 py-4">
                    <b className="text-slate-900">{l.name}</b>
                    <span className="mt-1 block text-[10px] text-slate-400">
                      {l.phone || l.email || "No contact details"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {l.businessProject?.name ||
                      l.meta?.businessId ||
                      "Unmapped"}
                  </td>
                  <td className="px-5 py-4">
                    {l.source}
                    <span className="mt-1 block text-[10px] text-slate-400">
                      {l.campaign || "—"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold">
                      {l.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {l.assignedTo?.name || "Unassigned"}
                  </td>
                  <td className="px-5 py-4">
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-4">
                    <Link
                      href={`/leads/${l._id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-2 font-semibold text-indigo-700"
                    >
                      <ExternalLink size={13} /> Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading leads...
          </div>
        )}
        {!loading && !leads.length && (
          <div className="p-10 text-center text-sm text-slate-500">
            <PauseCircle className="mx-auto mb-2" size={20} />
            No released leads match the current filters.
          </div>
        )}
      </section>
    </div>
  );
}
