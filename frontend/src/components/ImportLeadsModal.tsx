"use client";

import { useMemo, useState } from "react";
import { FileUp, Loader2, CheckCircle2 } from "lucide-react";
import Modal, { btn, field } from "./Modal";
import { api } from "../lib/api";

type Props = { open: boolean; onClose: () => void; onDone: () => void; projects: any[] };

const TARGETS = [
  { key: "name", label: "Name", guess: ["name", "full name", "full_name", "customer", "lead name"] },
  { key: "phone", label: "Phone", guess: ["phone", "mobile", "phone number", "phone_number", "contact", "whatsapp"] },
  { key: "email", label: "Email", guess: ["email", "e-mail", "email address"] },
  { key: "campaign", label: "Campaign", guess: ["campaign", "source", "campaign name"] },
  { key: "notes", label: "Notes", guess: ["notes", "note", "remarks", "comment", "requirement"] },
] as const;

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

export default function ImportLeadsModal({ open, onClose, onDone, projects }: Props) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [project, setProject] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  const headers = rows[0] || [];
  const body = rows.slice(1);

  function reset() {
    setFileName("");
    setRows([]);
    setMapping({});
    setError("");
    setResult(null);
  }

  async function onFile(file?: File) {
    reset();
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError("File is larger than 5 MB");
    const text = await file.text();
    const parsed = parseCsv(text.replace(/^﻿/, ""));
    if (parsed.length < 2) return setError("The file has no data rows");
    if (parsed.length > 1001) return setError("Import up to 1000 rows at a time");
    setFileName(file.name);
    setRows(parsed);
    const auto: Record<string, number> = {};
    TARGETS.forEach((t) => {
      const idx = parsed[0].findIndex((h) => (t.guess as readonly string[]).includes(h.trim().toLowerCase()));
      if (idx >= 0) auto[t.key] = idx;
    });
    setMapping(auto);
  }

  const preview = useMemo(
    () =>
      body.slice(0, 5).map((r) =>
        Object.fromEntries(TARGETS.map((t) => [t.key, mapping[t.key] !== undefined ? (r[mapping[t.key]] || "").trim() : ""])),
      ),
    [body, mapping],
  );

  async function submit() {
    setError("");
    if (mapping.phone === undefined && mapping.email === undefined) return setError("Map at least the Phone or Email column");
    setBusy(true);
    try {
      const payload = body.map((r) =>
        Object.fromEntries(TARGETS.map((t) => [t.key, mapping[t.key] !== undefined ? (r[mapping[t.key]] || "").trim().slice(0, t.key === "notes" ? 2000 : 160) : ""])),
      );
      const d = await api("/leads/import", {
        method: "POST",
        body: JSON.stringify({ businessProject: project, skipDuplicates, rows: payload }),
      });
      setResult(d);
      onDone();
    } catch (e: any) {
      setError(e?.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      size="lg"
      title="Import leads from CSV"
      subtitle="Bring in leads from spreadsheets, events or other tools. Duplicates are detected by phone/email."
      footer={
        result ? (
          <button className={btn.primary} onClick={() => { reset(); onClose(); }}>
            Done
          </button>
        ) : (
          <>
            <button className={btn.secondary} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className={btn.primary} onClick={submit} disabled={busy || !body.length}>
              {busy && <Loader2 size={13} className="animate-spin" />} Import {body.length ? `${body.length} rows` : ""}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 size={18} /> Imported <b>{result.created}</b> leads · {result.duplicates} duplicates skipped · {result.failed} failed
          </div>
          {result.errors?.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
              {result.errors.map((e: any) => (
                <div key={e.row}>
                  Row {e.row}: {e.message}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 transition hover:border-indigo-300 hover:bg-indigo-50/40">
            <FileUp size={22} className="text-indigo-500" />
            <span>
              {fileName ? (
                <>
                  <b className="text-slate-800">{fileName}</b> · {body.length} rows
                </>
              ) : (
                <>
                  <b className="text-slate-800">Choose a .csv file</b> — first row must contain column names
                </>
              )}
            </span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>

          {headers.length > 0 && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-700">
                  Project
                  <select value={project} onChange={(e) => setProject(e.target.value)} className={field}>
                    <option value="">{projects.length === 1 ? projects[0].name : "Select project"}</option>
                    {projects.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 self-end pb-3 text-xs text-slate-700">
                  <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                  Skip leads that already exist
                </label>
              </div>

              <div className="grid gap-2 sm:grid-cols-5">
                {TARGETS.map((t) => (
                  <label key={t.key} className="text-[11px] font-semibold text-slate-600">
                    {t.label}
                    <select
                      value={mapping[t.key] ?? ""}
                      onChange={(e) =>
                        setMapping((m) => {
                          const next = { ...m };
                          if (e.target.value === "") delete next[t.key];
                          else next[t.key] = Number(e.target.value);
                          return next;
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                    >
                      <option value="">—</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[520px] text-left text-[11px]">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      {TARGETS.map((t) => (
                        <th key={t.key} className="px-3 py-2 font-semibold">
                          {t.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {TARGETS.map((t) => (
                          <td key={t.key} className="max-w-[160px] truncate px-3 py-2 text-slate-700">
                            {(r as any)[t.key] || <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {error && <div className="rounded-xl bg-rose-50 p-2.5 text-xs text-rose-700">{error}</div>}
        </div>
      )}
    </Modal>
  );
}
