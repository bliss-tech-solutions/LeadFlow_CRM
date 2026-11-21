"use client";

import { useEffect, useState, useCallback } from "react";
import Topbar from "../../../components/Topbar";
import { api } from "../../../lib/api";
import { getUser } from "../../../lib/auth";
import { IndianRupee, TrendingDown, Users, Trophy, Plus, Trash2, Search, Building2, Layers, HelpCircle, ChevronDown } from "lucide-react";

function fmt(n: number | null) {
  if (n == null) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function SpendPage() {
  const user = getUser();
  const isAdmin = user?.role === "ADMIN" || user?.role === "MANAGER";

  const [businesses, setBusinesses] = useState<any[]>([]);
  const [selBusiness, setSelBusiness] = useState("");
  const [selProject, setSelProject] = useState("");
  const [bizSearch, setBizSearch] = useState("");
  const [bizOpen, setBizOpen] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [summary, setSummary] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Add spend modal
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ projectId: "", amount: "", entryDate: todayISO(), note: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!selBusiness) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ business: selBusiness, from, to });
      if (selProject) qs.set("project", selProject);
      const [sum, rec] = await Promise.all([
        api(`/spend/summary?${qs}`),
        api(`/spend?business=${selBusiness}${selProject ? `&project=${selProject}` : ""}`),
      ]);
      setSummary(sum || null);
      setRecords(rec?.records || []);
    } finally {
      setLoading(false);
    }
  }, [selBusiness, selProject, from, to]);

  useEffect(() => {
    if (!isAdmin) return;
    api("/businesses").then((d) => setBusinesses(d?.businesses || [])).catch(() => {});
  }, [isAdmin]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selBusiness) { setProjects([]); return; }
    api(`/business-projects?business=${selBusiness}&limit=100`).then((d) => setProjects(d?.projects || [])).catch(() => setProjects([]));
  }, [selBusiness]);

  const selBusinessName = businesses.find((b) => b._id === selBusiness)?.name || "";
  const filteredBiz = businesses.filter((b) => b.name?.toLowerCase().includes(bizSearch.toLowerCase()));

  async function addSpend() {
    const amount = Number(form.amount);
    if (!selBusiness) return alert("Select a business first.");
    if (!amount || amount <= 0) return alert("Enter a valid amount.");
    if (!form.entryDate) return alert("Pick the date the amount was added.");
    setSaving(true);
    try {
      await api("/spend", {
        method: "POST",
        body: JSON.stringify({
          business: selBusiness,
          project: form.projectId || undefined,
          level: form.projectId ? "PROJECT" : "BUSINESS",
          amount,
          entryDate: form.entryDate,
          note: form.note || undefined,
        }),
      });
      setShowAdd(false);
      setForm({ projectId: "", amount: "", entryDate: todayISO(), note: "" });
      void load();
    } catch (e: any) {
      alert(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSpend(id: string) {
    if (!confirm("Delete this spend record?")) return;
    await api(`/spend/${id}`, { method: "DELETE" });
    void load();
  }

  if (!isAdmin) return <div className="p-8 text-slate-500">Access denied.</div>;

  const totals = summary?.totals;

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-start justify-between">
        <Topbar
          title="Ad Spend"
          subtitle="Track ad spend and cost per lead for each business and its projects."
        />
        {selBusiness && (
          <button
            onClick={() => setShowAdd(true)}
            className="ml-4 mt-1 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 shrink-0"
          >
            <Plus size={15} /> Add Spend
          </button>
        )}
      </div>

      {/* How it works */}
      <div className="flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs text-indigo-900">
        <HelpCircle size={15} className="mt-0.5 shrink-0 text-indigo-500" />
        <div>
          <strong>How it works:</strong> 1) Pick a business. 2) Add the ₹ amount you spent on ads and the date you added it — for the whole business or one project. 3) LeadFlow counts the leads that arrived for it and shows your <b>cost per lead (CPL)</b>, like Meta Ads Manager.
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {/* Searchable business combobox */}
        <div className="relative min-w-[240px]">
          <label className="mb-1 block text-xs font-semibold text-slate-600">Business</label>
          <button
            type="button"
            onClick={() => setBizOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
          >
            <span className="flex items-center gap-2 truncate">
              <Building2 size={14} className="text-slate-400" />
              {selBusinessName || "Select business…"}
            </span>
            <ChevronDown size={14} className="text-slate-400" />
          </button>
          {bizOpen && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
              <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                <Search size={14} className="text-slate-400" />
                <input
                  autoFocus
                  value={bizSearch}
                  onChange={(e) => setBizSearch(e.target.value)}
                  placeholder="Search business…"
                  className="w-full text-sm focus:outline-none"
                />
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {filteredBiz.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">No match.</div>}
                {filteredBiz.map((b: any) => (
                  <button
                    key={b._id}
                    onClick={() => { setSelBusiness(b._id); setSelProject(""); setBizOpen(false); setBizSearch(""); }}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-indigo-50 ${selBusiness === b._id ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-700"}`}
                  >
                    {b.name}
                    {b.city && <span className="ml-1 text-xs text-slate-400">· {b.city}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
      </div>

      {/* Project filter chips */}
      {selBusiness && projects.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Project:</span>
          <button
            onClick={() => setSelProject("")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${!selProject ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            All projects
          </button>
          {projects.map((p: any) => (
            <button
              key={p._id}
              onClick={() => setSelProject(p._id === selProject ? "" : p._id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${selProject === p._id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* KPI tiles */}
      {totals && (
        <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Overall — {selBusinessName}
          <span className="ml-2 font-normal text-xs text-slate-400">{new Date(from).toLocaleDateString("en-IN")} – {new Date(to).toLocaleDateString("en-IN")}</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total spent", value: fmt(totals.amount), Icon: IndianRupee, color: "text-indigo-600" },
            { label: "Total leads", value: totals.leads, Icon: Users, color: "text-sky-600" },
            { label: "Avg CPL", value: fmt(totals.cpl), Icon: TrendingDown, color: "text-amber-600" },
            { label: "Cost per won", value: fmt(totals.cpw), Icon: Trophy, color: "text-green-600" },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className={`flex items-center gap-1 text-xs font-medium ${color}`}>
                <Icon size={14} /> {label}
              </div>
              <strong className="mt-2 block text-2xl font-bold text-slate-900">{value}</strong>
            </div>
          ))}
        </div>
        </div>
      )}

      {/* Per-project leads & cost */}
      {selBusiness && summary?.byProject?.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
            <Layers size={15} className="text-indigo-500" />
            <h2 className="font-semibold text-slate-900">Leads &amp; cost by project</h2>
            <span className="text-xs text-slate-400">
              Project spend = money tagged to the project + a share of business-wide spend (split by lead volume)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  {["Project", "Direct ₹", "+ Allocated ₹", "Total ₹", "Leads", "CPL", "Won", "Conv %"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.byProject.map((p: any) => (
                  <tr key={p.projectId} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">{p.name}</td>
                    <td className="px-4 py-2 text-slate-600">{p.directSpend ? `₹${p.directSpend.toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-4 py-2 text-slate-400">{p.allocatedSpend ? `₹${p.allocatedSpend.toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-4 py-2 font-medium text-indigo-700">{p.amount ? `₹${p.amount.toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-4 py-2">{p.leads}</td>
                    <td className="px-4 py-2 font-medium text-amber-700">{fmt(p.cpl)}</td>
                    <td className="px-4 py-2 text-green-700">{p.won}</td>
                    <td className="px-4 py-2">{p.conversionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Table */}
      {summary?.rows?.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="font-semibold text-slate-900">Spend breakdown</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  {["Date", "Project", "Spent (₹)", "Leads", "CPL", "Won", "CPW", "Conv %", ""].map((h) => (
                    <th key={h} className="px-4 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.rows.map((row: any) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{new Date(row.periodFrom).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-2 font-medium text-slate-800">
                      {row.projectId ? projects.find((p: any) => p._id === row.projectId)?.name || "Project" : "Whole business"}
                      {row.note ? <span className="block text-[11px] font-normal text-slate-400">{row.note}</span> : null}
                    </td>
                    <td className="px-4 py-2 font-medium text-indigo-700">₹{row.amount.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-2">{row.leads}</td>
                    <td className="px-4 py-2 text-amber-700 font-medium">{fmt(row.cpl)}</td>
                    <td className="px-4 py-2 text-green-700">{row.won}</td>
                    <td className="px-4 py-2 text-green-700">{fmt(row.cpw)}</td>
                    <td className="px-4 py-2">{row.conversionRate}%</td>
                    <td className="px-4 py-2">
                      <button onClick={() => deleteSpend(row.id)} className="text-rose-400 hover:text-rose-600">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!selBusiness && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          Select a business to view spend data.
        </div>
      )}

      {selBusiness && !loading && (!summary?.rows?.length) && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          No spend records yet. Click "Add Spend" to get started.
        </div>
      )}

      {/* Add spend modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-semibold text-slate-900">Add ad spend</h3>
            <p className="mb-4 text-xs text-slate-500">{selBusinessName}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">Project</label>
                <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">Whole business (not one project)</option>
                  {projects.map((p: any) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Date the amount was added</label>
                <input type="date" value={form.entryDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Amount (₹)</label>
                <input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="e.g. 10000" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Note (optional)</label>
                <input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={addSpend} disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
