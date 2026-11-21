"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Settings2, Sparkles, Star, Trash2 } from "lucide-react";
import Modal, { btn, field } from "./Modal";
import WhatsAppIcon from "./WhatsAppIcon";
import { api } from "../lib/api";

type Template = { _id: string; name: string; body: string; isDefault?: boolean };
type Preset = { key: string; name: string; description: string; body: string };

/**
 * Admin-only: manage one business's WhatsApp templates and automation settings.
 * Business owners and sales staff can only pick these templates when sending.
 */
export default function BusinessWhatsAppAdmin({ businessId }: { businessId: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [variables, setVariables] = useState<{ key: string; label: string }[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const q = `business=${encodeURIComponent(businessId)}`;

  const load = useCallback(async () => {
    const [t, s, st] = await Promise.all([
      api(`/whatsapp/templates?${q}`).catch(() => null),
      api(`/businesses/${businessId}/settings`).catch(() => null),
      api(`/whatsapp/status?${q}`).catch(() => null),
    ]);
    if (t) {
      setTemplates(t.templates || []);
      setPresets(t.presets || []);
      setVariables(t.variables || []);
    }
    if (s) setSettings(s.settings || {});
    if (st) setStatus(st);
  }, [businessId, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    window.setTimeout(() => setMsg(null), 3500);
  };

  async function adopt(key: string) {
    setBusy(key);
    try {
      await api(`/whatsapp/templates/presets/${key}?${q}`, { method: "POST" });
      await load();
      flash(true, "Template added");
    } catch (e: any) {
      flash(false, e?.message || "Could not add template");
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!editing?.name?.trim() || !editing?.body?.trim()) return;
    setBusy("save");
    try {
      const payload = JSON.stringify({ name: editing.name.trim(), body: editing.body, isDefault: Boolean(editing.isDefault) });
      if (editing._id) await api(`/whatsapp/templates/${editing._id}?${q}`, { method: "PUT", body: payload });
      else await api(`/whatsapp/templates?${q}`, { method: "POST", body: payload });
      setEditing(null);
      await load();
      flash(true, "Template saved");
    } catch (e: any) {
      flash(false, e?.message || "Could not save template");
    } finally {
      setBusy("");
    }
  }

  async function remove(t: Template) {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    await api(`/whatsapp/templates/${t._id}?${q}`, { method: "DELETE" }).catch(() => undefined);
    await load();
  }

  async function saveSetting(key: string, value: unknown) {
    setSettings((s: any) => ({ ...s, [key]: value }));
    try {
      await api(`/businesses/${businessId}/settings`, { method: "PATCH", body: JSON.stringify({ [key]: value }) });
    } catch (e: any) {
      flash(false, e?.message || "Could not save setting");
      void load();
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
            <WhatsAppIcon size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">WhatsApp templates & automation</h3>
            <p className="text-xs text-slate-500">
              {status?.status === "CONNECTED" ? `Linked number +${status.phone} · ${status.sentToday}/${status.dailyLimit} sent today` : "WhatsApp not linked yet — the business owner links it from their portal."}
            </p>
          </div>
        </div>
        <button className={btn.primary} onClick={() => setEditing({ name: "", body: presets[0]?.body || "", isDefault: templates.length === 0 })}>
          <Plus size={14} /> New template
        </button>
      </div>

      {msg && <div className={`rounded-xl p-2.5 text-xs ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{msg.text}</div>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {templates.length === 0 && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 md:col-span-2 xl:col-span-3">No templates yet. The team sees the three ready-made templates until you add one.</p>}
        {templates.map((t) => (
          <div key={t._id} className="flex flex-col rounded-xl border border-slate-200 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <b className="truncate text-sm text-slate-900">{t.name}</b>
              {t.isDefault && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  <Star size={10} /> Default
                </span>
              )}
            </div>
            <p className="mt-2 line-clamp-4 flex-1 whitespace-pre-line text-xs text-slate-600">{t.body}</p>
            <div className="mt-3 flex gap-1.5">
              <button onClick={() => setEditing({ ...t })} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                <Pencil size={12} /> Edit
              </button>
              <button onClick={() => remove(t)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] text-slate-500 hover:bg-rose-50 hover:text-rose-600">
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {presets.length > 0 && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Sparkles size={14} className="text-emerald-600" /> Add a ready-made template
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button key={p.key} disabled={busy === p.key} onClick={() => adopt(p.key)} title={p.description} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                {busy === p.key ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {settings && (
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Settings2 size={15} className="text-indigo-600" /> Team & automation
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
              Sales staff can send WhatsApp
              <input type="checkbox" checked={Boolean(settings.salesCanSendWhatsApp)} onChange={(e) => saveSetting("salesCanSendWhatsApp", e.target.checked)} className="h-4 w-4 accent-emerald-600" />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
              Daily email summary
              <input type="checkbox" checked={Boolean(settings.dailyDigest)} onChange={(e) => saveSetting("dailyDigest", e.target.checked)} className="h-4 w-4 accent-indigo-600" />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              First-contact SLA (minutes)
              <input type="number" min={1} max={1440} defaultValue={settings.slaMinutes ?? 15} onBlur={(e) => saveSetting("slaMinutes", Math.max(1, Math.min(1440, Number(e.target.value) || 15)))} className={field} />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Auto-reassign after (hours, 0 = off)
              <input type="number" min={0} max={168} defaultValue={settings.autoReassignHours ?? 0} onBlur={(e) => saveSetting("autoReassignHours", Math.max(0, Math.min(168, Number(e.target.value) || 0)))} className={field} />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Lead distribution
              <select value={settings.assignmentStrategy || "LEAST_LOADED"} onChange={(e) => saveSetting("assignmentStrategy", e.target.value)} className={field}>
                <option value="LEAST_LOADED">Balanced (least loaded)</option>
                <option value="ROUND_ROBIN">Round robin</option>
              </select>
            </label>
          </div>
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing?._id ? "Edit template" : "New template"}
        subtitle="Click a variable to add it at the end of the message."
        footer={
          <>
            <button className={btn.secondary} onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className={btn.primary} onClick={save} disabled={busy === "save" || !editing?.name?.trim() || !editing?.body?.trim()}>
              {busy === "save" && <Loader2 size={13} className="animate-spin" />} Save template
            </button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700">
              Name
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={80} className={field} />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {variables.map((v) => (
                <button key={v.key} type="button" title={v.label} onClick={() => setEditing({ ...editing, body: `${editing.body}{{${v.key}}}` })} className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-mono text-[11px] text-indigo-700 hover:bg-indigo-100">
                  {`{{${v.key}}}`}
                </button>
              ))}
            </div>
            <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={12} maxLength={4000} className="w-full rounded-xl border border-slate-200 bg-[#f0fdf4] p-3 text-sm outline-none focus:border-emerald-500" />
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={Boolean(editing.isDefault)} onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })} className="h-4 w-4 accent-amber-500" />
              Use as the default template
            </label>
          </div>
        )}
      </Modal>
    </section>
  );
}
