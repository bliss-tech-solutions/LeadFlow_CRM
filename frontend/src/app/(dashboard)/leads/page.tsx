"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Topbar from "../../../components/Topbar";
import Pagination from "../../../components/Pagination";
import { api } from "../../../lib/api";
import { ExternalLink, Search, PauseCircle, X } from "lucide-react";

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

function formatFieldName(value: string) {
  return value.replaceAll("_", " ").replace(/\w/g, (m) => m.toUpperCase());
}

function dynamicLeadFields(lead: any) {
  const fields = Array.isArray(lead?.meta?.fieldData) ? lead.meta.fieldData : [];
  return fields
    .filter((item: any) => item?.name && item.name.toLowerCase() !== "full_name")
    .slice(0, 3)
    .map((item: any) => ({
      name: formatFieldName(String(item.name)),
      value: Array.isArray(item.values) ? item.values.join(", ") : String(item.values ?? ""),
    }))
    .filter((item: any) => item.value);
}

export default function Leads() {
  const [leads, setLeads] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);

  async function load(currentPage = page, currentSearch = q, currentStatus = status) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: "10",
      });
      if (currentSearch.trim()) params.set("search", currentSearch.trim());
      if (currentStatus) params.set("status", currentStatus);
      const d = await api(`/leads?${params.toString()}`);
      setLeads(d.leads || []);
      setMeta({ total: d.total || 0, pages: d.pages || 1 });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [q, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(page, q, status);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [page, q, status]);

  return (
    <div className="space-y-5">
      <Topbar
        title="Leads"
        subtitle="Released leads, ownership, source mapping and next action. Sorted by latest update."
      />
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
          <div className="flex h-10 w-full max-w-sm items-center gap-2 rounded-xl border border-slate-200 px-3 text-slate-400">
            <Search size={15} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email, phone, Meta fields..."
              className="w-full text-sm outline-none"
            />
            {q && (
              <button onClick={() => setQ("")} className="text-slate-400 hover:text-slate-700">
                <X size={14} />
              </button>
            )}
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
          >
            <option value="">All statuses</option>
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
          <span className="ml-auto text-xs text-slate-400">10 leads per page</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {["Lead", "Business", "Source / Campaign", "Extra details", "Status", "Assigned", "Updated", ""].map((x) => (
                  <th key={x} className="px-5 py-3 font-semibold">{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const extras = dynamicLeadFields(l);
                return (
                  <tr key={l._id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <b className="text-slate-900">{l.name || "Unnamed lead"}</b>
                      <span className="mt-1 block text-[10px] text-slate-400">{l.phone || l.email || "No contact details"}</span>
                    </td>
                    <td className="px-5 py-4">{l.businessProject?.name || l.meta?.businessId || "Unmapped"}</td>
                    <td className="px-5 py-4">
                      <span className="font-medium">{l.source || "—"}</span>
                      <span className="mt-1 block text-[10px] text-slate-400">{l.campaign || l.formName || "—"}</span>
                    </td>
                    <td className="max-w-[260px] px-5 py-4">
                      {extras.length ? (
                        <div className="space-y-1">
                          {extras.map((item: any) => (
                            <div key={item.name} className="truncate text-[10px]">
                              <span className="font-semibold text-slate-500">{item.name}:</span>{" "}
                              <span className="text-slate-700">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      ) : <span className="text-slate-400">No extra fields</span>}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${statusStyles[l.status] || "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                        {String(l.status || "NEW").replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-4">{l.assignedTo?.name || "Unassigned"}</td>
                    <td className="px-5 py-4 text-slate-500">{new Date(l.updatedAt || l.createdAt).toLocaleString()}</td>
                    <td className="px-5 py-4">
                      <Link href={`/leads/${l._id}`} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-2 font-semibold text-indigo-700">
                        <ExternalLink size={13} /> Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {loading && <div className="p-8 text-center text-sm text-slate-500">Loading leads...</div>}
        {!loading && !leads.length && (
          <div className="p-10 text-center text-sm text-slate-500">
            <PauseCircle className="mx-auto mb-2" size={20} />
            No released leads match the current filters.
          </div>
        )}
        {!loading && <Pagination page={page} pages={meta.pages} total={meta.total} label="leads" onChange={setPage} />}
      </section>
    </div>
  );
}
