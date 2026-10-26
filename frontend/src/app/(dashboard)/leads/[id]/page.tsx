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
  Download,
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
const EXCLUDED_FORM_KEYS = new Set([
  // System IDs / metadata to never show as form questions
  "lead_id",
  "leadgen_id",
  "id",
  "page_id",
  "page_name",
  "form_id",
  "form_name",
  "ad_id",
  "ad_name",
  "adset_id",
  "ad_set_id",
  "adset_name",
  "ad_set_name",
  "adgroup_id",
  "campaign_id",
  "campaign_name",
  "campaign",
  "ad_account_id",
  "ad_account_name",
  "account_id",
  "created_at",
  "created_time",
  "platform",
  "is_organic",
  "retailer_item_id",
  "form_data",
  "raw_body",
]);

const CONTACT_KEYS = new Set([
  "full_name",
  "name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "phone_number",
  "contact",
  "phone_no",
  "mobile",
  "mobile_number",
]);

function formatQuestionKey(key: string): string {
  const cleaned = key.replace(/_/g, " ").trim();
  if (!cleaned) return key;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function formatResponseValue(val: any): string {
  if (val === null || val === undefined) return "";
  let str = "";
  if (Array.isArray(val)) {
    str = val
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
      .map(String)
      .join(", ");
  } else if (typeof val === "object") {
    str = JSON.stringify(val);
  } else {
    str = String(val);
  }
  str = str.trim();
  if (!str || str.startsWith("{{") || str.toLowerCase() === "null") return "";
  if (str.includes("_") && !str.startsWith("http")) {
    str = str.replace(/_/g, " ");
  }
  return str;
}

function getAllFormFields(lead: any): Array<{ name: string; value: string }> {
  const result: Array<{ name: string; value: string }> = [];
  const seenKeys = new Set<string>();

  // 1. Add standard contact fields first (if present and valid)
  const nameVal = formatResponseValue(lead?.name);
  if (nameVal) {
    result.push({ name: "Full name", value: nameVal });
    CONTACT_KEYS.forEach((k) => seenKeys.add(k));
  }

  const emailVal = formatResponseValue(lead?.email);
  if (emailVal) {
    result.push({ name: "Email", value: emailVal });
    seenKeys.add("email");
  }

  const phoneVal = formatResponseValue(lead?.phone);
  if (phoneVal) {
    result.push({ name: "Phone number", value: phoneVal });
    seenKeys.add("phone");
    seenKeys.add("phone_number");
  }

  // 2. Extra form fields from formData
  const formData =
    lead?.meta?.formData ||
    lead?.meta?.rawPayload?.form_data ||
    lead?.meta?.rawPayload?.entry?.[0]?.changes?.[0]?.value?.form_data;

  if (formData && typeof formData === "object") {
    for (const [rawKey, rawVal] of Object.entries(formData)) {
      const lowerKey = rawKey.trim().toLowerCase();
      if (EXCLUDED_FORM_KEYS.has(lowerKey) || seenKeys.has(lowerKey)) continue;

      const formattedVal = formatResponseValue(rawVal);
      if (!formattedVal) continue;

      seenKeys.add(lowerKey);
      result.push({
        name: formatQuestionKey(rawKey),
        value: formattedVal,
      });
    }
  }

  // 3. Extra form fields from fieldData
  if (Array.isArray(lead?.meta?.fieldData)) {
    for (const item of lead.meta.fieldData) {
      if (!item?.name) continue;
      const rawKey = String(item.name);
      const lowerKey = rawKey.trim().toLowerCase();
      if (EXCLUDED_FORM_KEYS.has(lowerKey) || seenKeys.has(lowerKey)) continue;

      const formattedVal = formatResponseValue(item.values);
      if (!formattedVal) continue;

      seenKeys.add(lowerKey);
      result.push({
        name: formatQuestionKey(rawKey),
        value: formattedVal,
      });
    }
  }

  return result;
}

function fieldEntries(lead: any) {
  return getAllFormFields(lead);
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

  function downloadTransparencyTimeline() {
    if (!data?.activities || !data?.lead) return;
    const l = data.lead;
    const lines: string[] = [];
    lines.push("================================================================");
    lines.push("LEAD FLOW CRM - TRANSPARENCY AUDIT TIMELINE");
    lines.push("================================================================");
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push(`Lead Name: ${l.name || "N/A"}`);
    lines.push(`Phone: ${l.phone || "N/A"}`);
    lines.push(`Email: ${l.email || "N/A"}`);
    lines.push(`Status: ${l.status || "N/A"}`);
    lines.push(`Assigned Sales Rep: ${l.assignedTo?.name || "Unassigned"}`);
    if (l.businessProject) {
      lines.push(`Project: ${l.businessProject.name || "N/A"} (${l.businessProject.stage || "N/A"})`);
      if (l.businessProject.business?.name) lines.push(`Business Group: ${l.businessProject.business.name}`);
      if (l.businessProject.reraNumber) lines.push(`RERA: ${l.businessProject.reraNumber}`);
    }
    lines.push(`Total Recorded Events: ${data.activities.length}`);
    lines.push("================================================================\n");
    lines.push("EVENT HISTORY (Chronological):");
    lines.push("----------------------------------------------------------------");

    data.activities.forEach((act: any, idx: number) => {
      lines.push(`[#${idx + 1}] ${new Date(act.createdAt).toLocaleString()} | Actor: ${act.actor?.name || "System"}`);
      lines.push(`Title: ${act.title}`);
      if (act.description) lines.push(`Details: ${act.description}`);
      lines.push("----------------------------------------------------------------");
    });

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = (l.name || "lead").replace(/[^a-zA-Z0-9_-]/g, "_");
    a.download = `${safeName}_transparency_timeline_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
  const fields = getAllFormFields(lead);
  const project = lead.businessProject;
  return (
    <div className="space-y-5">
      <Topbar
        title="Lead detail"
        subtitle="Contact information, source mapping, project documents and transparent activity history."
      />
      {(!lead.assignedTo || !lead.assignedTo?._id) && currentUser?.role === "ADMIN" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
              <UserRound size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-900">
                Action Required: This lead is currently unassigned
              </h3>
              <p className="text-xs text-amber-700">
                This lead has not been assigned to any salesperson yet. Assign it to a salesperson for immediate follow-up.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setModal("assign")}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-amber-700"
          >
            <UserRound size={14} /> Assign Lead Now
          </button>
        </div>
      )}
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
            <div className="mt-5 grid gap-3 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3">
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
                    className="rounded-xl border border-slate-100 bg-white p-4 space-y-2.5 shadow-xs"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <b className="text-sm font-bold text-slate-900">
                            {product.customType || product.type}
                          </b>
                          {product.isPenthouse && (
                            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[9px] font-extrabold text-purple-700">
                              👑 Penthouse
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">Product Specification</span>
                      </div>
                      {product.priceRange && (
                        <span className="rounded-lg bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">
                          {product.priceRange}
                        </span>
                      )}
                    </div>

                    {(product.areaSqFt || product.units) && (
                      <div className="flex items-center gap-3 text-xs text-slate-600 pt-2 border-t border-slate-100">
                        {product.areaSqFt && (
                          <span className="font-medium">📏 {product.areaSqFt} sq.ft</span>
                        )}
                        {product.units && (
                          <span className="font-medium">🏢 {product.units} units</span>
                        )}
                      </div>
                    )}

                    {Object.keys(product.details || {}).length > 0 && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 pt-2 border-t border-slate-100">
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
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <h3 className="text-xs font-bold text-slate-700">
                  Project Documents ({project.documents?.length || 0})
                </h3>
                {project.documents?.length > 0 ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {project.documents.map((doc: any) => (
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
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">
                    No documents uploaded for this project yet.
                  </p>
                )}
              </div>
            </section>
          )}
          {fields.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">Lead form responses</h2>
                </div>
                <MessageSquare size={17} className="text-slate-500" />
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
                <h2 className="font-semibold text-slate-900">Transparency timeline</h2>
                <p className="text-xs text-slate-500">
                  {data.activities.length} recorded events
                </p>
              </div>
              <div className="flex items-center gap-2">
                {data.activities.length > 0 && (
                  <button
                    onClick={downloadTransparencyTimeline}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors shadow-xs"
                  >
                    <Download size={13} />
                    <span>Download Timeline</span>
                  </button>
                )}
                <Clock3 size={17} className="text-slate-400" />
              </div>
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
              <div>
                <h2 className="font-semibold text-slate-900">Meta source details</h2>
                {lead.businessProject && (
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600">
                    <Building2 size={11} />
                    {lead.businessProject.business?.name ? `${lead.businessProject.business.name} · ` : ""}
                    {lead.businessProject.name}
                  </span>
                )}
              </div>
              <Database size={16} className="text-slate-500" />
            </div>
            <div className="mt-4 space-y-2">
              {[
                [
                  "Page Name",
                  lead.meta?.pageName ||
                    lead.meta?.page_name ||
                    lead.meta?.rawPayload?.page_name ||
                    lead.meta?.rawPayload?.form_data?.page_name ||
                    lead.meta?.rawPayload?.entry?.[0]?.changes?.[0]?.value?.page_name,
                ],
                [
                  "Form Name",
                  lead.formName ||
                    lead.meta?.formName ||
                    lead.meta?.form_name ||
                    lead.meta?.rawPayload?.form_name ||
                    lead.meta?.rawPayload?.form_data?.form_name ||
                    lead.meta?.rawPayload?.entry?.[0]?.changes?.[0]?.value?.form_name,
                ],
                [
                  "Form ID",
                  lead.meta?.formId ||
                    lead.meta?.form_id ||
                    lead.meta?.rawPayload?.form_id ||
                    lead.meta?.rawPayload?.form_data?.form_id ||
                    lead.meta?.rawPayload?.entry?.[0]?.changes?.[0]?.value?.form_id,
                ],
                [
                  "Page ID",
                  lead.meta?.pageId ||
                    lead.meta?.page_id ||
                    lead.meta?.rawPayload?.page_id ||
                    lead.meta?.rawPayload?.form_data?.page_id ||
                    lead.meta?.rawPayload?.entry?.[0]?.id ||
                    lead.meta?.rawPayload?.entry?.[0]?.changes?.[0]?.value?.page_id,
                ],
                [
                  "Ad ID",
                  lead.meta?.adId ||
                    lead.meta?.ad_id ||
                    lead.meta?.rawPayload?.ad_id ||
                    lead.meta?.rawPayload?.form_data?.ad_id ||
                    lead.meta?.rawPayload?.entry?.[0]?.changes?.[0]?.value?.ad_id,
                ],
                [
                  "Meta Lead ID",
                  lead.metaLeadId ||
                    lead.meta?.leadgenId ||
                    lead.meta?.lead_id ||
                    lead.meta?.rawPayload?.leadgen_id ||
                    lead.meta?.rawPayload?.lead_id ||
                    lead.meta?.rawPayload?.entry?.[0]?.changes?.[0]?.value?.leadgen_id,
                ],
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
                  <div key={c._id} className="flex gap-2 border-l-2 border-slate-400">
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
                  <div key={f._id} className="rounded-xl bg-slate-50 p-3 border-l-2 border-slate-400">
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
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
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
