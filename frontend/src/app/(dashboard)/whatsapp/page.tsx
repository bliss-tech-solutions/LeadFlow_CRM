"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Smartphone,
  QrCode,
  LogOut,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  Star,
  CheckCheck,
  Check,
  AlertTriangle,
  Clock3,
  Ban,
  Settings2,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import Topbar from "../../../components/Topbar";
import Modal, { btn, field } from "../../../components/Modal";
import WhatsAppIcon from "../../../components/WhatsAppIcon";
import { api } from "../../../lib/api";
import { getUser } from "../../../lib/auth";
import { socket } from "../../../lib/socket";

type Status = {
  enabled: boolean;
  status: "DISCONNECTED" | "CONNECTING" | "QR" | "CONNECTED" | "LOGGED_OUT";
  qr?: string;
  phone?: string;
  displayName?: string;
  connectedBy?: string;
  lastConnectedAt?: string;
  lastError?: string;
  sentToday: number;
  dailyLimit: number;
  queued: number;
};

const badge: Record<string, string> = {
  CONNECTED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CONNECTING: "bg-sky-50 text-sky-700 ring-sky-200",
  QR: "bg-amber-50 text-amber-700 ring-amber-200",
  DISCONNECTED: "bg-slate-100 text-slate-600 ring-slate-200",
  LOGGED_OUT: "bg-rose-50 text-rose-700 ring-rose-200",
};

const msgIcon: Record<string, any> = { QUEUED: Clock3, SENDING: Loader2, SENT: Check, DELIVERED: CheckCheck, READ: CheckCheck, FAILED: AlertTriangle, CANCELLED: Ban };

/** Example values so owners can see how a ready-made template reads before using it. */
const SAMPLE_VALUES: Record<string, string> = {
  first_name: "Priya",
  name: "Priya Sharma",
  project: "Skyline Residency",
  location: "Baner, Pune",
  price: "• 2 BHK · 1100 sq.ft · ₹85L – 95L\n• 3 BHK · 1450 sq.ft · ₹1.2 Cr",
  rera: "P52100012345",
  business: "Your Business",
  business_phone: "+91 90000 00000",
  sales_name: "Rahul",
};

function samplePreview(body: string) {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key: string) => SAMPLE_VALUES[key.toLowerCase()] ?? "");
}

export default function WhatsAppPage() {
  const user = getUser();
  const businessId = typeof user?.business === "string" ? user.business : user?.business?._id;

  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qrAge, setQrAge] = useState(0);

  const [templates, setTemplates] = useState<any[]>([]);
  const [variables, setVariables] = useState<{ key: string; label: string }[]>([]);
  const [defaultBody, setDefaultBody] = useState("");
  const [presets, setPresets] = useState<{ key: string; name: string; description: string; body: string }[]>([]);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [settings, setSettings] = useState<any>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState("");

  const [outbox, setOutbox] = useState<any[]>([]);
  const [outboxFilter, setOutboxFilter] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      setSt(await api("/whatsapp/status"));
    } catch (e: any) {
      setError(e?.message || "Could not load WhatsApp status");
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    const d = await api("/whatsapp/templates");
    setTemplates(d.templates || []);
    setVariables(d.variables || []);
    setDefaultBody(d.defaultBody || "");
    setPresets(d.presets || []);
  }, []);

  async function adoptPreset(key: string) {
    setAdopting(key);
    setError("");
    try {
      await api(`/whatsapp/templates/presets/${key}`, { method: "POST" });
      await loadTemplates();
    } catch (e: any) {
      setError(e?.message || "Could not add template");
    } finally {
      setAdopting(null);
    }
  }

  const loadOutbox = useCallback(async () => {
    const d = await api(`/whatsapp/messages?limit=15${outboxFilter ? `&status=${outboxFilter}` : ""}`).catch(() => ({ messages: [] }));
    setOutbox(d.messages || []);
  }, [outboxFilter]);

  useEffect(() => {
    void loadStatus();
    void loadTemplates().catch(() => {});
    if (businessId) api(`/businesses/${businessId}/settings`).then((d) => setSettings(d.settings)).catch(() => {});
  }, [loadStatus, loadTemplates, businessId]);

  useEffect(() => {
    void loadOutbox();
  }, [loadOutbox]);

  // Live QR + status + receipts
  useEffect(() => {
    const onQr = (p: any) => {
      setSt((s) => (s ? { ...s, status: "QR", qr: p.qr } : s));
      setQrAge(0);
    };
    const onStatus = () => void loadStatus();
    const onMsg = () => void loadOutbox();
    socket.on("whatsapp_qr", onQr);
    socket.on("whatsapp_status", onStatus);
    socket.on("whatsapp_message", onMsg);
    return () => {
      socket.off("whatsapp_qr", onQr);
      socket.off("whatsapp_status", onStatus);
      socket.off("whatsapp_message", onMsg);
    };
  }, [loadStatus, loadOutbox]);

  // Fallback polling while pairing (in case the socket is reconnecting)
  useEffect(() => {
    if (st?.status !== "QR" && st?.status !== "CONNECTING") return;
    const t = window.setInterval(() => {
      setQrAge((a) => a + 3);
      void loadStatus();
    }, 3000);
    return () => window.clearInterval(t);
  }, [st?.status, loadStatus]);

  async function act(path: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError("");
    try {
      setSt(await api(path, { method: "POST" }));
    } catch (e: any) {
      setError(e?.message || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    if (!editing) return;
    setError("");
    try {
      const payload = { name: editing.name, body: editing.body, isDefault: Boolean(editing.isDefault) };
      if (editing._id) await api(`/whatsapp/templates/${editing._id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await api("/whatsapp/templates", { method: "POST", body: JSON.stringify(payload) });
      setEditing(null);
      await loadTemplates();
    } catch (e: any) {
      setError(e?.message || "Could not save template");
    }
  }

  async function deleteTemplate(t: any) {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    await api(`/whatsapp/templates/${t._id}`, { method: "DELETE" }).catch(() => {});
    await loadTemplates();
  }

  function insertVariable(key: string) {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el || !editing) return;
    const start = el.selectionStart ?? editing.body.length;
    const end = el.selectionEnd ?? start;
    const next = editing.body.slice(0, start) + token + editing.body.slice(end);
    setEditing({ ...editing, body: next });
    window.setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  }

  async function saveSettings() {
    if (!businessId || !settings) return;
    setSavingSettings(true);
    setSettingsMsg("");
    try {
      const d = await api(`/businesses/${businessId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          slaMinutes: Number(settings.slaMinutes) || 15,
          autoReassignHours: Number(settings.autoReassignHours) || 0,
          salesCanSendWhatsApp: Boolean(settings.salesCanSendWhatsApp),
          dailyDigest: Boolean(settings.dailyDigest),
          assignmentStrategy: settings.assignmentStrategy || "LEAST_LOADED",
        }),
      });
      setSettings(d.settings);
      setSettingsMsg("Saved");
      window.setTimeout(() => setSettingsMsg(""), 2500);
    } catch (e: any) {
      setSettingsMsg(e?.message || "Could not save");
    } finally {
      setSavingSettings(false);
    }
  }

  const connected = st?.status === "CONNECTED";
  const usagePct = st ? Math.min(100, Math.round((st.sentToday / Math.max(1, st.dailyLimit)) * 100)) : 0;

  return (
    <div className="space-y-5">
      <Topbar title="WhatsApp" subtitle="Link your business WhatsApp and send project details to leads in one click." />

      {st && !st.enabled && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">WhatsApp integration is disabled on this server. Contact your administrator.</div>
      )}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Connection */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                <WhatsAppIcon size={24} />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Linked device</h2>
                <p className="text-xs text-slate-500">Uses WhatsApp's "Linked devices" — no paid API, your phone stays the owner.</p>
              </div>
            </div>
            {st && <span className={`rounded-full px-3 py-1 text-[11px] font-bold ring-1 ${badge[st.status] || badge.DISCONNECTED}`}>{st.status === "QR" ? "WAITING FOR SCAN" : st.status.replace("_", " ")}</span>}
          </div>

          {!st && (
            <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Checking connection…
            </div>
          )}

          {st && connected && (
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Number</span>
                  <b className="mt-1 block text-sm text-slate-900">+{st.phone}</b>
                  {st.displayName && <span className="text-[11px] text-slate-500">{st.displayName}</span>}
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Connected since</span>
                  <b className="mt-1 block text-sm text-slate-900">{st.lastConnectedAt ? new Date(st.lastConnectedAt).toLocaleString() : "—"}</b>
                  {st.connectedBy && <span className="text-[11px] text-slate-500">by {st.connectedBy}</span>}
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Today</span>
                  <b className="mt-1 block text-sm text-slate-900">
                    {st.sentToday} / {st.dailyLimit}
                  </b>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full rounded-full ${usagePct > 85 ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${usagePct}%` }} />
                  </div>
                  {st.queued > 0 && <span className="mt-1 block text-[11px] text-slate-500">{st.queued} in queue</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/leads" className={btn.whatsapp}>
                  <WhatsAppIcon size={15} /> Message leads
                </Link>
                <button onClick={() => act("/whatsapp/disconnect", "Disconnect WhatsApp? Queued messages will wait until you reconnect.")} disabled={busy} className={btn.secondary}>
                  <LogOut size={14} /> Disconnect
                </button>
              </div>
            </div>
          )}

          {st && !connected && st.status !== "QR" && (
            <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-200 p-8 text-center">
              <Smartphone size={36} className="text-slate-300" />
              <div>
                <h3 className="font-semibold text-slate-900">{st.status === "CONNECTING" ? "Connecting to WhatsApp…" : "Connect your business WhatsApp"}</h3>
                <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                  We'll show a QR code. Scan it from the phone that has your business number — just like WhatsApp Web. You stay signed in until you disconnect.
                </p>
                {st.lastError && <p className="mt-2 text-xs text-rose-600">{st.lastError}</p>}
              </div>
              <button onClick={() => act("/whatsapp/connect")} disabled={busy || st.status === "CONNECTING" || !st.enabled} className={btn.whatsapp}>
                {busy || st.status === "CONNECTING" ? <Loader2 size={15} className="animate-spin" /> : <QrCode size={15} />}
                {st.status === "CONNECTING" ? "Starting…" : "Show QR code"}
              </button>
            </div>
          )}

          {st && st.status === "QR" && (
            <div className="mt-6 grid items-center gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
              <div className="mx-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                {st.qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={st.qr} alt="WhatsApp QR code" width={276} height={276} className={`h-[276px] w-[276px] transition ${qrAge > 18 ? "opacity-60" : ""}`} />
                ) : (
                  <div className="grid h-[276px] w-[276px] place-items-center text-slate-400">
                    <Loader2 className="animate-spin" />
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Scan with your phone</h3>
                <ol className="mt-3 space-y-2 text-sm text-slate-600">
                  <li>1. Open <b>WhatsApp</b> (or WhatsApp Business) on your phone</li>
                  <li>
                    2. Tap <b>⋮ Menu</b> or <b>Settings</b> → <b>Linked devices</b>
                  </li>
                  <li>
                    3. Tap <b>Link a device</b> and point your phone at this code
                  </li>
                </ol>
                <p className="mt-3 text-xs text-slate-500">The code refreshes automatically every ~20 seconds.</p>
                <button onClick={() => act("/whatsapp/cancel")} disabled={busy} className={`${btn.secondary} mt-4`}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Safety */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-600" />
            <h2 className="font-semibold text-slate-900">Keep your number safe</h2>
          </div>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
            <li>• This uses WhatsApp's linked-device feature, which is not an official business API. WhatsApp may restrict numbers that look like spam.</li>
            <li>• Prefer a dedicated <b>WhatsApp Business</b> number for your team.</li>
            <li>• Only message people who enquired about your project. Respect opt-outs (mark the lead "opted out").</li>
            <li>
              • LeadFlow sends one message at a time with natural pauses and stops at <b>{st?.dailyLimit ?? 150}</b> messages a day.
            </li>
            <li>• Personalise templates — identical bulk text is the most common reason for bans.</li>
          </ul>
        </section>
      </div>

      {/* Templates */}
      <section id="templates" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Message templates</h2>
            <p className="text-xs text-slate-500">Reusable intros with lead and project details filled in automatically.</p>
          </div>
          <button onClick={() => setEditing({ name: "", body: defaultBody, isDefault: templates.length === 0 })} className={btn.primary}>
            <Plus size={14} /> New template
          </button>
        </div>
        {/* Ready-made templates */}
        {presets.length > 0 && (
          <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-emerald-600" />
              <b className="text-sm text-slate-900">Ready-made templates</b>
              <span className="text-xs text-slate-500">— pick one, then edit it to match your voice.</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {presets.map((p) => {
                const added = templates.some((t) => t.name === p.name);
                return (
                  <div key={p.key} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                    <b className="text-sm text-slate-900">{p.name}</b>
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">{p.description}</p>
                    <div className="mt-3 flex-1 rounded-lg bg-[#e7fbe9] p-3">
                      <p className="line-clamp-[9] whitespace-pre-line text-[11px] leading-relaxed text-slate-700">
                        {samplePreview(p.body)}
                      </p>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => adoptPreset(p.key)}
                        disabled={adopting === p.key}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {adopting === p.key ? <Loader2 size={13} className="animate-spin" /> : added ? <CheckCircle2 size={13} /> : <Plus size={13} />}
                        {added ? "Add again" : "Use this"}
                      </button>
                      <button
                        onClick={() => setEditing({ name: p.name, body: p.body, isDefault: templates.length === 0 })}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil size={12} /> Customise first
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <h3 className="mt-6 text-xs font-bold uppercase tracking-wide text-slate-400">Your templates</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.length === 0 && (
            <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500 md:col-span-2 xl:col-span-3">
              You haven't saved any templates yet. Until you do, your team can choose from the three ready-made templates above when sending.
            </p>
          )}
          {templates.map((t) => (
            <div key={t._id} className="flex flex-col rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <b className="truncate text-sm text-slate-900">{t.name}</b>
                {t.isDefault && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    <Star size={10} /> Default
                  </span>
                )}
              </div>
              <p className="mt-2 line-clamp-5 flex-1 whitespace-pre-line text-xs text-slate-600">{t.body}</p>
              <div className="mt-3 flex gap-1.5">
                <button onClick={() => setEditing({ ...t })} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                  <Pencil size={12} /> Edit
                </button>
                <button onClick={() => deleteTemplate(t)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] text-slate-500 hover:bg-rose-50 hover:text-rose-600">
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Team & automation settings */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Settings2 size={17} className="text-indigo-600" />
            <h2 className="font-semibold text-slate-900">Team & automation</h2>
          </div>
          {!settings ? (
            <p className="mt-4 text-xs text-slate-500">Loading settings…</p>
          ) : (
            <div className="mt-4 space-y-4">
              <label className="flex items-start justify-between gap-4">
                <span>
                  <b className="block text-sm text-slate-800">Sales staff can send WhatsApp</b>
                  <span className="text-xs text-slate-500">Salespeople message their own leads through this number.</span>
                </span>
                <input type="checkbox" checked={Boolean(settings.salesCanSendWhatsApp)} onChange={(e) => setSettings({ ...settings, salesCanSendWhatsApp: e.target.checked })} className="mt-1 h-5 w-5 accent-emerald-600" />
              </label>
              <label className="block">
                <b className="block text-sm text-slate-800">First-contact SLA (minutes)</b>
                <span className="text-xs text-slate-500">Alert the salesperson if a new lead isn't contacted in time; escalate to you at 2×.</span>
                <input type="number" min={1} max={1440} value={settings.slaMinutes ?? 15} onChange={(e) => setSettings({ ...settings, slaMinutes: e.target.value })} className={field} />
              </label>
              <label className="block">
                <b className="block text-sm text-slate-800">Auto-reassign untouched leads after (hours)</b>
                <span className="text-xs text-slate-500">0 turns it off. Moves the lead to the next available salesperson.</span>
                <input type="number" min={0} max={168} value={settings.autoReassignHours ?? 0} onChange={(e) => setSettings({ ...settings, autoReassignHours: e.target.value })} className={field} />
              </label>
              <label className="block">
                <b className="block text-sm text-slate-800">Lead distribution</b>
                <select value={settings.assignmentStrategy || "LEAST_LOADED"} onChange={(e) => setSettings({ ...settings, assignmentStrategy: e.target.value })} className={field}>
                  <option value="LEAST_LOADED">Least loaded first (balanced by today's count)</option>
                  <option value="ROUND_ROBIN">Strict round robin (take turns)</option>
                </select>
              </label>
              <label className="flex items-start justify-between gap-4">
                <span>
                  <b className="block text-sm text-slate-800">Daily email summary</b>
                  <span className="text-xs text-slate-500">8 AM: new leads, wins, uncontacted and overdue follow-ups.</span>
                </span>
                <input type="checkbox" checked={Boolean(settings.dailyDigest)} onChange={(e) => setSettings({ ...settings, dailyDigest: e.target.checked })} className="mt-1 h-5 w-5 accent-indigo-600" />
              </label>
              <div className="flex items-center justify-end gap-3">
                {settingsMsg && <span className="text-xs text-slate-500">{settingsMsg}</span>}
                <button onClick={saveSettings} disabled={savingSettings} className={btn.primary}>
                  {savingSettings && <Loader2 size={13} className="animate-spin" />} Save settings
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Outbox */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Outbox</h2>
            <div className="flex items-center gap-2">
              <select value={outboxFilter} onChange={(e) => setOutboxFilter(e.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-xs" aria-label="Filter messages">
                <option value="">All</option>
                <option value="QUEUED">Queued</option>
                <option value="SENT">Sent</option>
                <option value="DELIVERED">Delivered</option>
                <option value="READ">Read</option>
                <option value="FAILED">Failed</option>
              </select>
              <button onClick={() => loadOutbox()} aria-label="Refresh" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
          <div className="mt-3 divide-y divide-slate-100">
            {outbox.length === 0 && <p className="py-6 text-center text-xs text-slate-500">No messages yet.</p>}
            {outbox.map((m) => {
              const Icon = msgIcon[m.status] || Clock3;
              return (
                <div key={m._id} className="flex items-start gap-3 py-3">
                  <Icon size={15} className={`mt-0.5 shrink-0 ${m.status === "READ" ? "text-sky-600" : m.status === "FAILED" ? "text-rose-600" : "text-slate-400"} ${m.status === "SENDING" ? "animate-spin" : ""}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/leads/${m.lead?._id}`} className="truncate text-xs font-semibold text-slate-900 hover:text-indigo-600">
                        {m.lead?.name || "Lead"}
                      </Link>
                      <span className="shrink-0 text-[10px] text-slate-400">{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="truncate text-xs text-slate-500">{m.body || `${m.documents?.length || 0} document(s)`}</p>
                    <span className="text-[10px] text-slate-400">
                      {m.sentBy?.name} · {m.status.toLowerCase()}
                      {m.error ? ` · ${m.error}` : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Template editor */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing?._id ? "Edit template" : "New template"}
        subtitle="Click a variable to insert it at the cursor."
        footer={
          <>
            <button className={btn.secondary} onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className={btn.primary} onClick={saveTemplate} disabled={!editing?.name?.trim() || !editing?.body?.trim()}>
              Save template
            </button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700">
              Name
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={80} placeholder="e.g. Site visit invite" className={field} />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {variables.map((v) => (
                <button key={v.key} type="button" onClick={() => insertVariable(v.key)} title={v.label} className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-mono text-[11px] text-indigo-700 hover:bg-indigo-100">
                  {`{{${v.key}}}`}
                </button>
              ))}
            </div>
            <textarea
              ref={bodyRef}
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              rows={12}
              maxLength={4000}
              className="w-full rounded-xl border border-slate-200 bg-[#f0fdf4] p-3 text-sm leading-relaxed outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={Boolean(editing.isDefault)} onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })} className="h-4 w-4 accent-amber-500" />
              Use as the default template
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
