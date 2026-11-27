"use client";

import { useState } from "react";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import Modal, { btn, field } from "../Modal";
import { api } from "../../lib/api";
import { readSpreadsheet } from "../../lib/csv";

type Row = { name: string; phone: string };

/** Max rows per upload (matches the server). */
const MAX_ROWS = 5000;

// Only these two columns are read; every other column in the file is ignored.
// Meta lead exports use full_name / phone_number, so those win.
const GUESS = {
  name: ["full_name", "name", "customer_name", "contact_name", "lead_name"],
  phone: ["phone_number", "phone", "mobile", "mobile_no", "mobile_number", "contact_no", "contact_number", "phone_no", "whatsapp", "whatsapp_number", "number", "contact"],
};

const norm = (h: string) => h.trim().toLowerCase().replace(/^["']|["']$/g, "").replace(/[\s.\-]+/g, "_").replace(/_+$/, "");

/** First matching header, in order of preference. */
function pick(headers: string[], keys: string[]) {
  const n = headers.map(norm);
  for (const k of keys) {
    const i = n.indexOf(k);
    if (i >= 0) return i;
  }
  return -1;
}

export default function AddContactsModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [tab, setTab] = useState<"single" | "upload">("single");
  const [form, setForm] = useState<Row>({ name: "", phone: "" });
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  function close() {
    setForm({ name: "", phone: "" });
    setRows([]);
    setFileName("");
    setError("");
    setResult("");
    onClose();
  }

  async function onFile(file?: File) {
    setRows([]);
    setFileName("");
    setError("");
    setResult("");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError("File is larger than 5 MB");
    try {
      const parsed = await readSpreadsheet(file);
      if (parsed.length < 2) return setError("The file has no data rows");
      const headers = parsed[0];
      const iName = pick(headers, GUESS.name);
      const iPhone = pick(headers, GUESS.phone);
      if (iPhone < 0) return setError("Couldn't find a phone_number (or Mobile) column in the first row");
      const data = parsed
        .slice(1)
        .map((r) => ({ name: iName >= 0 ? (r[iName] || "").trim() : "", phone: (r[iPhone] || "").trim().replace(/^p:/i, "") }))
        .filter((r) => r.name || r.phone);
      if (data.length > MAX_ROWS) return setError(`This file has ${data.length.toLocaleString("en-IN")} rows. Upload at most ${MAX_ROWS.toLocaleString("en-IN")} at a time.`);
      setRows(data);
      setFileName(file.name);
    } catch {
      setError("Could not read this file. Save it as .xlsx or .csv and try again.");
    }
  }

  async function submitSingle() {
    setError("");
    if (!form.name.trim()) return setError("Name is required");
    if (!form.phone.trim()) return setError("Mobile number is required");
    setBusy(true);
    try {
      await api("/outreach/contacts", { method: "POST", body: JSON.stringify(form) });
      onDone();
      close();
    } catch (e: any) {
      setError(e?.message || "Could not add contact");
    } finally {
      setBusy(false);
    }
  }

  async function submitUpload() {
    setError("");
    setBusy(true);
    let added = 0;
    let duplicates = 0;
    let invalid = 0;
    try {
      for (let i = 0; i < rows.length; i += 1000) {
        const out = await api("/outreach/contacts/bulk", { method: "POST", body: JSON.stringify({ rows: rows.slice(i, i + 1000) }) });
        added += out.added || 0;
        duplicates += out.duplicates || 0;
        invalid += out.invalid || 0;
      }
      setResult(`${added} added${duplicates ? ` · ${duplicates} already existed` : ""}${invalid ? ` · ${invalid} skipped (no valid mobile number)` : ""}`);
      setRows([]);
      onDone();
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add contacts"
      subtitle="Contacts added here are for messaging only. They are not assigned to any business."
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={close}>
            {result ? "Done" : "Cancel"}
          </button>
          {tab === "single" ? (
            <button type="button" className={btn.primary} disabled={busy} onClick={submitSingle}>
              {busy && <Loader2 size={14} className="animate-spin" />} Add contact
            </button>
          ) : (
            <button type="button" className={btn.primary} disabled={busy || !rows.length} onClick={submitUpload}>
              {busy && <Loader2 size={14} className="animate-spin" />} Upload {rows.length ? `${rows.length} rows` : ""}
            </button>
          )}
        </>
      }
    >
      <div className="mb-4 flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
        {(["single", "upload"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setError("");
            }}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === t ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}
          >
            {t === "single" ? "Add one" : "Upload Excel / CSV"}
          </button>
        ))}
      </div>

      {tab === "single" ? (
        <div className="space-y-3">
          {(
            [
              ["name", "Name", "text", "Full name"],
              ["phone", "Mobile number", "tel", "98765 43210"],
            ] as const
          ).map(([key, label, type, ph]) => (
            <label key={key} className="block text-xs font-semibold text-slate-600">
              {label}
              <input
                type={type}
                value={form[key]}
                placeholder={ph}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className={field}
              />
            </label>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center hover:border-indigo-300">
            <FileUp size={22} className="text-indigo-500" />
            <span className="text-sm font-semibold text-slate-700">{fileName || "Choose an .xlsx or .csv file"}</span>
            <span className="text-xs text-slate-500">Reads only full_name and phone_number (or Name / Mobile). Max 5,000 rows. Rows without a valid number are skipped.</span>
            <input type="file" accept=".xlsx,.csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {rows.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Mobile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">{r.name}</td>
                      <td className="px-3 py-1.5">{r.phone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 5 && <p className="bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">+ {rows.length - 5} more rows</p>}
            </div>
          )}
          {result && (
            <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              <CheckCircle2 size={14} /> {result}
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>}
    </Modal>
  );
}
