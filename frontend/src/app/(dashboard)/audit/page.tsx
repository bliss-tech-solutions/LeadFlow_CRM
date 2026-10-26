"use client";
import { useEffect, useState } from "react";
import Topbar from "../../../components/Topbar";
import { api } from "../../../lib/api";
import { ShieldCheck } from "lucide-react";
export default function Audit() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    api("/audit")
      .then((d) => setRows(d.audit || []))
      .catch(() => setRows([]));
  }, []);
  return (
    <div className="space-y-5">
      <Topbar
        title="Audit log"
        subtitle="A durable record of important CRM changes."
      />
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Mobile Card View (< lg) */}
        <div className="block lg:hidden divide-y divide-slate-100">
          {rows.map((a) => (
            <div key={a._id} className="p-4 space-y-2 bg-white">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <b className="text-slate-900 block text-xs font-bold">{a.action}</b>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    {a.entity} · {a.entityId?.slice(-8)}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">
                  {new Date(a.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 text-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">By: {a.actor?.name || "System"}</span>
                <p className="mt-1 font-mono text-[10px] text-slate-600 break-all">
                  {JSON.stringify(a.before || {})} → {JSON.stringify(a.after || {})}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View (>= lg) */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {["Action", "Entity", "Actor", "Time", "Before / after"].map(
                  (x) => (
                    <th key={x} className="px-5 py-3 font-semibold">
                      {x}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a._id} className="border-t border-slate-100">
                  <td className="px-5 py-3 font-semibold">{a.action}</td>
                  <td className="px-5 py-3">
                    {a.entity} · {a.entityId?.slice(-8)}
                  </td>
                  <td className="px-5 py-3">{a.actor?.name || "System"}</td>
                  <td className="px-5 py-3">
                    {new Date(a.createdAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-[10px] text-slate-500">
                    {JSON.stringify(a.before || {})} →{" "}
                    {JSON.stringify(a.after || {})}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className="p-10 text-center text-sm text-slate-500">
            <ShieldCheck className="mx-auto mb-2" size={20} />
            No audit events yet.
          </div>
        )}
      </section>
    </div>
  );
}
