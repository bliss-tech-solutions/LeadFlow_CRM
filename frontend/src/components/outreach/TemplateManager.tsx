"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { btn, field } from "../Modal";
import { api } from "../../lib/api";
import { CHANNEL_LABEL, renderPreview, type Channel, type Template } from "./types";

type Draft = { _id?: string; name: string; body: string; providerTemplateId: string; dltTemplateId: string };

const VARIABLES = ["name", "first_name"];

const BASIC_PRESETS: Record<Channel, { name: string; body: string }[]> = {
  WHATSAPP: [
    {
      name: "Quick introduction",
      body: `Hi {{first_name}},\n\nThank you for connecting with us. We wanted to check in and share the details you were looking for.\n\nPlease reply here if you have any questions or would like to schedule a quick call.`,
    },
    {
      name: "Follow-up check-in",
      body: `Hello {{first_name}},\n\nJust following up on our recent conversation. Let us know if you need any more information or would like to discuss the next steps.\n\nHappy to help whenever it's convenient for you.`,
    },
    {
      name: "Callback request",
      body: `Hi {{first_name}},\n\nWe tried reaching you on call. Please let us know a good time to connect, and we'll be glad to assist you with all the details.`,
    },
  ],
  SMS: [
    {
      name: "Quick introduction",
      body: "Hi {{first_name}}, thank you for connecting with us. Reply or call us back anytime if you need more details or assistance.",
    },
    {
      name: "Follow-up reminder",
      body: "Hello {{first_name}}, just following up on your enquiry. Please let us know a convenient time for a quick call to share the details.",
    },
    {
      name: "Callback request",
      body: "Hi {{first_name}}, we tried reaching you regarding your enquiry. Kindly share a suitable time so we can call you back.",
    },
  ],
};

/** List + editor for one channel's templates. Used inside the Setup panel. */
export default function TemplateManager({ channel, onChanged }: { channel: Channel; onChanged?: (templates: Template[]) => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await api(`/outreach/templates?channel=${channel}`);
      setTemplates(res.templates || []);
      onChanged?.(res.templates || []);
    } catch (e: any) {
      setError(e?.message || "Could not load templates");
    }
  }

  useEffect(() => {
    setDraft(null);
    setError("");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const { _id, ...rest } = draft;
      await api(_id ? `/outreach/templates/${_id}` : "/outreach/templates", { method: _id ? "PATCH" : "POST", body: JSON.stringify({ ...rest, channel }) });
      setDraft(null);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not save template");
    } finally {
      setBusy(false);
    }
  }

  async function adoptPreset(preset: { name: string; body: string }) {
    if (channel === "SMS") {
      // SMS requires an approved MSG91 template ID before saving
      setDraft({ name: preset.name, body: preset.body, providerTemplateId: "", dltTemplateId: "" });
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/outreach/templates", {
        method: "POST",
        body: JSON.stringify({ name: preset.name, body: preset.body, channel, providerTemplateId: "", dltTemplateId: "" }),
      });
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not add template");
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: Template) {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    try {
      await api(`/outreach/templates/${t._id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not delete template");
    }
  }

  const label = CHANNEL_LABEL[channel];

  return (
    <div className="rounded-2xl border border-slate-200">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <b className="block text-sm text-slate-900">{label} templates</b>
          <span className="text-xs text-slate-500">Use {"{{name}}"} or {"{{first_name}}"} to personalise.</span>
        </div>
        {!draft && (
          <button type="button" className={btn.primary} onClick={() => setDraft({ name: "", body: "", providerTemplateId: "", dltTemplateId: "" })}>
            <Plus size={14} /> New template
          </button>
        )}
      </div>

      <div className="p-4">
        {draft ? (
          <div className="space-y-3">
            {!draft._id && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2">
                <span className="text-[11px] font-semibold text-slate-500">Quick fill:</span>
                {BASIC_PRESETS[channel].map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => setDraft({ ...draft, name: p.name, body: p.body })}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            <label className="block text-xs font-semibold text-slate-600">
              Template name
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={field} placeholder="Site visit invite" />
            </label>

            {channel === "SMS" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-600">
                  MSG91 template ID
                  <input value={draft.providerTemplateId} onChange={(e) => setDraft({ ...draft, providerTemplateId: e.target.value })} className={field} placeholder="64f0c2…" />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  DLT template ID (optional)
                  <input value={draft.dltTemplateId} onChange={(e) => setDraft({ ...draft, dltTemplateId: e.target.value })} className={field} placeholder="1107…" />
                </label>
              </div>
            )}

            <label className="block text-xs font-semibold text-slate-600">
              Message {channel === "SMS" && <span className="font-normal text-slate-400">(same text as your DLT template, for preview)</span>}
              <textarea
                rows={channel === "SMS" ? 4 : 7}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                className={field}
                placeholder="Hi {{first_name}}, thank you for your interest…"
              />
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDraft({ ...draft, body: `${draft.body}{{${v}}}` })}
                  className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
                >
                  {`{{${v}}}`}
                </button>
              ))}
              {channel === "SMS" && <span className="text-[11px] text-slate-400">{draft.body.length} characters</span>}
            </div>
            {draft.body && (
              <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 whitespace-pre-wrap text-slate-700">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Preview</p>
                {renderPreview(draft.body)}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className={btn.secondary} onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="button" className={channel === "WHATSAPP" ? btn.whatsapp : btn.primary} disabled={busy} onClick={save}>
                {busy && <Loader2 size={14} className="animate-spin" />} Save template
              </button>
            </div>
          </div>
        ) : templates.length ? (
          <ul className="divide-y divide-slate-100">
            {templates.map((t) => (
              <li key={t._id} className="flex items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <b className="block text-sm text-slate-900">{t.name}</b>
                  {t.providerTemplateId && <span className="block text-[11px] text-slate-400">MSG91 ID: {t.providerTemplateId}</span>}
                  <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{t.body}</span>
                </div>
                <button
                  type="button"
                  title="Edit"
                  onClick={() => setDraft({ _id: t._id, name: t.name, body: t.body, providerTemplateId: t.providerTemplateId || "", dltTemplateId: t.dltTemplateId || "" })}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Pencil size={14} />
                </button>
                <button type="button" title="Delete" onClick={() => remove(t)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3 text-center text-xs text-slate-400">No {label} templates yet.</p>
        )}

        {!draft && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Basic ready-to-use {label} templates
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {BASIC_PRESETS[channel].map((p) => {
                const alreadyAdded = templates.some((t) => t.name.toLowerCase() === p.name.toLowerCase());
                return (
                  <div key={p.name} className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                    <div>
                      <b className="block text-xs text-slate-900">{p.name}</b>
                      <p className="mt-1 line-clamp-3 whitespace-pre-line text-[11px] leading-4 text-slate-500">{p.body}</p>
                    </div>
                    <div className="mt-2.5 flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busy || alreadyAdded}
                        onClick={() => void adoptPreset(p)}
                        className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {alreadyAdded ? "Added" : channel === "SMS" ? "Use template" : "Add"}
                      </button>
                      {!alreadyAdded && channel === "WHATSAPP" && (
                        <button
                          type="button"
                          onClick={() => setDraft({ name: p.name, body: p.body, providerTemplateId: "", dltTemplateId: "" })}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
