"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Topbar from "../../../../components/Topbar";
import { api } from "../../../../lib/api";
import { getUser } from "../../../../lib/auth";
import {
  Phone,
  CalendarPlus,
  UserRound,
  FileText,
  CheckCircle2,
  X,
  Clock3,
  Database,
  MessageSquare,
  ExternalLink,
  Building2,
} from "lucide-react";

const callResults = [
  "CONNECTED",
  "NOT_PICKED",
  "BUSY",
  "WRONG_NUMBER",
  "CALLBACK_REQUESTED",
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
const timeOptions = Array.from(
  { length: 48 },
  (_, i) =>
    `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
);
function todayString() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function fieldEntries(lead: any) {
  return Array.isArray(lead?.meta?.fieldData)
    ? lead.meta.fieldData
        .filter((x: any) => x?.name)
        .map((x: any) => ({
          name: String(x.name).replaceAll("_", " "),
          value: Array.isArray(x.values)
            ? x.values.join(", ")
            : String(x.values ?? ""),
        }))
    : [];
}

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const currentUser = getUser();
  const [data, setData] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [modal, setModal] = useState<"call" | "followup" | "assign" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [form, setForm] = useState<any>({
    result: "CONNECTED",
    scheduledDate: todayString(),
    scheduledTime: "10:00",
    notes: "",
    userId: "",
    type: "CALL",
  });
  async function load() {
    const d = await api(`/leads/${id}`);
    setData(d);
    if (currentUser?.role === "ADMIN" && !users.length) {
      try {
        const u = await api("/users");
        setUsers(u.users || []);
      } catch {}
    }
  }
  useEffect(() => {
    if (id) load();
  }, [id]);
  function close() {
    setModal(null);
    setError("");
    setForm({
      result: "CONNECTED",
      scheduledDate: todayString(),
      scheduledTime: "10:00",
      notes: "",
      userId: "",
      type: "CALL",
    });
  }
  async function openProjectDocument(document: any) {
    try {
      const projectId = lead?.businessProject?._id || lead?.businessProject;
      if (!projectId || !document?._id) return;
      const d = await api(
        `/business-projects/${projectId}/documents/${document._id}/url`,
      );
      window.open(d.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setError(e?.message || "Unable to open document");
    }
  }
  async function save() {
    setError("");
    try {
      if (modal === "call")
        await api(`/leads/${id}/calls`, {
          method: "POST",
          body: JSON.stringify(form),
        });
      if (modal === "followup") {
        const d = new Date(`${form.scheduledDate}T${form.scheduledTime}`);
        if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now())
          throw new Error("Choose a future date and time");
        await api(`/leads/${id}/followups`, {
          method: "POST",
          body: JSON.stringify({
            type: form.type,
            notes: form.notes,
            scheduledAt: d.toISOString(),
          }),
        });
      }
      if (modal === "assign") {
        if (!form.userId) throw new Error("Select a salesperson");
        await api(`/leads/${id}/assign`, {
          method: "PATCH",
          body: JSON.stringify({ userId: form.userId }),
        });
      }
      close();
      load();
    } catch (e: any) {
      setError(e?.message || "Unable to save change");
    }
  }
  if (!data)
    return (
      <div>
        <Topbar title="Lead" />
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Loading lead...
        </div>
      </div>
    );
  const lead = data.lead;
  const fields = fieldEntries(lead);
  const project = lead.businessProject;
  return (
    <div className="space-y-5">
      <Topbar
        title="Lead detail"
        subtitle="Contact information, source mapping, project documents and transparent activity history."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_380px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${statusStyles[lead.status] || "bg-slate-100 text-slate-600 ring-slate-200"}`}
                  >
                    {String(lead.status || "NEW").replaceAll("_", " ")}
                  </span>
                  {lead.deliveryStatus === "HELD" && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">
                      HELD
                    </span>
                  )}{" "}
                  {lead.source === "META" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold">
                      <Database size={12} /> Meta
                    </span>
                  )}
                </div>
                <h2 className="mt-3 text-2xl font-bold text-slate-900">
                  {lead.name}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {lead.email || "No email"} · {lead.phone || "No phone"}
                </p>
              </div>
              <select
                value={lead.status}
                onChange={async (e) => {
                  await api(`/leads/${id}/status`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: e.target.value }),
                  });
                  load();
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"
              >
                <option value="">Status</option>
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={() => setModal("call")}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-xs font-semibold text-white"
              >
                <Phone size={14} /> Log call
              </button>
              <button
                onClick={() => setModal("followup")}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-3.5 py-2.5 text-xs font-semibold text-indigo-700"
              >
                <CalendarPlus size={14} /> Schedule follow-up
              </button>
              {currentUser?.role === "ADMIN" && (
                <button
                  onClick={() => setModal("assign")}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700"
                >
                  <UserRound size={14} /> Assign
                </button>
              )}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Owner", lead.assignedTo?.name || "Unassigned"],
                ["Score", `${lead.score}/100`],
                ["Created", new Date(lead.createdAt).toLocaleString()],
                [
                  "Next follow-up",
                  lead.nextFollowUpAt
                    ? new Date(lead.nextFollowUpAt).toLocaleString()
                    : "Not scheduled",
                ],
                ["Form", lead.formName || "—"],
                ["Campaign", lead.campaign || "—"],
              ].map(([a, b]) => (
                <div key={a} className="rounded-xl bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    {a}
                  </span>
                  <b className="mt-1 block text-xs text-slate-900">{b}</b>
                </div>
              ))}
            </div>
          </section>
          {project && (
            <section className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-white text-indigo-600">
                  <Building2 size={17} />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900">
                    {project.name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {project.stage} ·{" "}
                    {project.developerGroup || "Developer group not added"}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(project.products || []).map((product: any, index: number) => (
                  <div
                    key={index}
                    className="rounded-xl border border-slate-100 bg-white p-4"
                  >
                    <b className="text-sm text-slate-900">
                      {product.customType || product.type}
                    </b>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {Object.entries(product.details || {}).map(
                        ([key, value]) => (
                          <div key={key}>
                            <span className="text-[10px] font-semibold uppercase text-slate-400">
                              {key}
                            </span>
                            <p className="break-words text-xs text-slate-700">
                              {String(value) || "—"}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <h3 className="text-xs font-bold text-slate-700">
                  Client-shareable documents
                </h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {project.documents?.length > 0
                    ? project.documents.map((doc: any) => (
                        <button
                          key={doc._id}
                          onClick={() => openProjectDocument(doc)}
                          className="flex items-center gap-3 rounded-xl bg-white p-3 text-left hover:ring-1 hover:ring-indigo-200"
                        >
                          <FileText size={16} className="text-indigo-600" />
                          <span className="min-w-0 flex-1">
                            <b className="block truncate text-xs text-slate-900">
                              {doc.name}
                            </b>
                            <small className="text-[10px] text-slate-500">
                              {doc.category}
                            </small>
                          </span>
                          <ExternalLink size={13} className="text-slate-400" />
                        </button>
                      ))
                    : [
                        "Project Brochure (Demo)",
                        "Price Sheet (Demo)",
                        "Floor Plan (Demo)",
                      ].map((name) => (
                        <div
                          key={name}
                          className="flex items-center gap-3 rounded-xl border border-dashed border-indigo-200 bg-white p-3"
                        >
                          <FileText size={16} className="text-indigo-400" />
                          <span>
                            <b className="block text-xs text-slate-700">
                              {name}
                            </b>
                            <small className="text-[10px] text-slate-400">
                              Demo placeholder · admin can upload the real file
                            </small>
                          </span>
                        </div>
                      ))}
                </div>
              </div>
            </section>
          )}
          {fields.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">Lead form responses</h2>
                  <p className="text-xs text-slate-500">
                    Original Meta form answers
                  </p>
                </div>
                <MessageSquare size={17} />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {fields.map((f: any) => (
                  <div
                    key={f.name}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                  >
                    <span className="text-[10px] font-bold uppercase text-slate-400">
                      {f.name}
                    </span>
                    <strong className="mt-1 block text-xs text-slate-800">
                      {f.value || "—"}
                    </strong>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Transparency timeline</h2>
                <p className="text-xs text-slate-500">
                  {data.activities.length} events
                </p>
              </div>
              <Clock3 size={17} />
            </div>
            <div className="mt-5 max-h-[50vh] overflow-y-scroll">
              {data.activities.map((a: any, i: number) => (
                <div key={a._id} className="flex gap-3">
                  <div className="flex w-7 flex-col items-center">
                    <div className="z-10 grid h-7 w-7 place-items-center rounded-full bg-indigo-50 text-indigo-600 ring-4 ring-white">
                      <CheckCircle2 size={14} />
                    </div>
                    {i < data.activities.length - 1 && (
                      <div className="w-px flex-1 bg-indigo-100" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-6">
                    <b className="block text-sm text-slate-900">{a.title}</b>
                    <p className="mt-1 text-xs text-slate-600">
                      {a.description || "No additional details"}
                    </p>
                    <span className="mt-1 block text-[10px] text-slate-400">
                      {a.actor?.name || "System"} ·{" "}
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Meta source</h2>
              <Database size={16} />
            </div>
            <div className="mt-4 space-y-2">
              {[
                ["Business", lead.meta?.businessId || project?.name],
                ["Page ID", lead.meta?.pageId],
                ["Ad account", lead.meta?.adAccountId],
                ["Campaign ID", lead.meta?.campaignId],
                ["Ad set ID", lead.meta?.adSetId],
                ["Ad ID", lead.meta?.adId],
                ["Form ID", lead.meta?.formId],
                ["Meta lead ID", lead.metaLeadId],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-0"
                >
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    {k}
                  </span>
                  <strong className="max-w-[210px] break-all text-right text-[11px] text-slate-700">
                    {v || "—"}
                  </strong>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Calls</h2>
            <div className="mt-3 space-y-3">
              {data.calls.length ? (
                data.calls.map((c: any) => (
                  <div key={c._id} className="flex gap-2">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-600">
                      <Phone size={13} />
                    </div>
                    <div>
                      <b className="block text-xs">{c.result}</b>
                      <span className="block text-[10px] text-slate-500">
                        {c.user?.name} ·{" "}
                        {new Date(c.createdAt).toLocaleString()}
                      </span>
                      {c.notes && (
                        <span className="block text-xs text-slate-600">
                          {c.notes}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">No calls logged.</p>
              )}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Follow-ups</h2>
            <div className="mt-3 space-y-3">
              {data.followups.length ? (
                data.followups.map((f: any) => (
                  <div key={f._id} className="rounded-xl bg-slate-50 p-3">
                    <b className="text-xs">
                      {f.type} · {f.status}
                    </b>
                    <span className="mt-1 block text-[10px] text-slate-500">
                      {new Date(f.scheduledAt).toLocaleString()}
                    </span>
                    {f.notes && (
                      <span className="mt-1 block text-xs text-slate-600">
                        {f.notes}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">No follow-ups.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
      {modal && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-bold text-slate-900">
                  {modal === "call"
                    ? "Log call"
                    : modal === "followup"
                      ? "Schedule follow-up"
                      : "Assign lead"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Save explicitly; closing the modal does not change data.
                </p>
              </div>
              <button
                onClick={close}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            {modal === "call" && (
              <>
                <label className="mt-5 block text-xs font-semibold">
                  Result
                  <select
                    value={form.result}
                    onChange={(e) =>
                      setForm({ ...form, result: e.target.value })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  >
                    {callResults.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label className="mt-4 block text-xs font-semibold">
                  Notes
                  <textarea
                    value={form.notes}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                    rows={4}
                    className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm"
                  />
                </label>
              </>
            )}
            {modal === "followup" && (
              <>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold">
                    Date
                    <input
                      type="date"
                      min={todayString()}
                      value={form.scheduledDate}
                      onChange={(e) =>
                        setForm({ ...form, scheduledDate: e.target.value })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                    />
                  </label>
                  <label className="text-xs font-semibold">
                    Time
                    <select
                      value={form.scheduledTime}
                      onChange={(e) =>
                        setForm({ ...form, scheduledTime: e.target.value })
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                    >
                      {timeOptions.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="mt-4 block text-xs font-semibold">
                  Type
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  >
                    <option>CALL</option>
                    <option>EMAIL</option>
                    <option>SITE VISIT</option>
                    <option>OFFLINE MEETING</option>
                    <option>ONLINE MEETING</option>
                  </select>
                </label>
                <label className="mt-4 block text-xs font-semibold">
                  Notes
                  <textarea
                    value={form.notes}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                    rows={3}
                    className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm"
                  />
                </label>
              </>
            )}
            {modal === "assign" && (
              <label className="mt-5 block text-xs font-semibold">
                Salesperson
                <select
                  value={form.userId}
                  onChange={(e) => setForm({ ...form, userId: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                >
                  {" "}
                  <option value="">Select salesperson</option>
                  {users
                    .filter((u) => u.role === "SALES")
                    .map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.name} · {u.email}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {error && (
              <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
                {error}
              </div>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={close}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={save}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                {modal === "followup" ? "Schedule follow-up" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
