"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, KeyRound, Loader2, MessageSquare, QrCode, RefreshCw, Send, Smartphone, Unlink } from "lucide-react";
import Modal, { btn, field } from "../Modal";
import WhatsAppIcon from "../WhatsAppIcon";
import TemplateManager from "./TemplateManager";
import { api } from "../../lib/api";
import { socket } from "../../lib/socket";
import { OUTREACH_WA_ID, type Channel, type Template } from "./types";

type SmsSettings = { configured: boolean; source: "dashboard" | "env" | "none"; authKeyHint: string; senderId: string; webhookUrl: string };

type WaState = {
  enabled: boolean;
  status: string;
  qr?: string;
  phone: string;
  displayName: string;
  connectedBy: string;
  lastConnectedAt?: string;
  lastError?: string;
  sentToday: number;
  dailyLimit: number;
  queued: number;
};

const WA_STATUS: Record<string, { label: string; tone: string }> = {
  CONNECTED: { label: "Connected", tone: "bg-emerald-50 text-emerald-700" },
  CONNECTING: { label: "Connecting", tone: "bg-sky-50 text-sky-700" },
  QR: { label: "Waiting for scan", tone: "bg-amber-50 text-amber-700" },
  DISCONNECTED: { label: "Not connected", tone: "bg-slate-100 text-slate-600" },
  LOGGED_OUT: { label: "Logged out", tone: "bg-rose-50 text-rose-700" },
};

function SmsSetup({ onSaved }: { onSaved: () => void }) {
  const [s, setS] = useState<SmsSettings | null>(null);
  const [authKey, setAuthKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [senderId, setSenderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [testMobile, setTestMobile] = useState("");
  const [testTemplate, setTestTemplate] = useState("");
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api("/outreach/settings/sms")
      .then((r: SmsSettings) => {
        setS(r);
        setSenderId(r.senderId);
      })
      .catch((e) => setMsg({ ok: false, text: e?.message || "Could not load SMS settings" }));
  }, []);

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true);
    setMsg(null);
    try {
      const r: SmsSettings = await api("/outreach/settings/sms", {
        method: "PUT",
        body: JSON.stringify({ ...(authKey.trim() ? { authKey: authKey.trim() } : {}), senderId: senderId.trim(), ...extra }),
      });
      setS(r);
      setAuthKey("");
      setMsg({ ok: true, text: "SMS settings saved." });
      onSaved();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Could not save" });
    } finally {
      setBusy(false);
    }
  }

  async function newWebhook() {
    if (!window.confirm("Create a new webhook URL? The old one will stop working until you update it in MSG91.")) return;
    try {
      setS(await api("/outreach/settings/sms/webhook-token", { method: "POST" }));
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Could not create a new URL" });
    }
  }

  async function test() {
    setTesting(true);
    setMsg(null);
    try {
      const r = await api("/outreach/settings/sms/test", { method: "POST", body: JSON.stringify({ mobile: testMobile, templateId: testTemplate || templates[0]?._id }) });
      setMsg({ ok: true, text: r.message });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Test failed" });
    } finally {
      setTesting(false);
    }
  }

  async function copy() {
    if (!s?.webhookUrl) return;
    await navigator.clipboard.writeText(s.webhookUrl).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <b className="flex items-center gap-2 text-sm text-slate-900">
            <KeyRound size={15} className="text-indigo-500" /> MSG91 gateway
          </b>
          {s && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {s.configured ? (s.source === "env" ? "Connected (server env)" : "Connected") : "Not set up"}
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-600">
            Auth key {s?.authKeyHint && <span className="font-normal text-slate-400">· saved {s.authKeyHint}</span>}
            {/* Plain text field masked with CSS: a real type="password" makes the browser's
                password manager treat the page as a login form and autofill the saved login
                email into the Contact Data search box. */}
            <div className="relative">
              <input
                type="text"
                name="msg91-auth-key"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                value={authKey}
                onChange={(e) => setAuthKey(e.target.value)}
                className={`${field} pr-14 ${showKey ? "" : "[-webkit-text-security:disc]"}`}
                placeholder={s?.authKeyHint ? "Leave blank to keep the saved key" : "Paste your MSG91 auth key"}
              />
              {authKey && (
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 mt-0.5 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              )}
            </div>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Sender ID (DLT header)
            <input value={senderId} onChange={(e) => setSenderId(e.target.value.toUpperCase())} maxLength={11} className={field} placeholder="LDFLOW" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {s?.source === "dashboard" && (
            <button type="button" className={btn.secondary} disabled={busy} onClick={() => window.confirm("Remove the saved auth key?") && save({ removeAuthKey: true })}>
              Remove key
            </button>
          )}
          <button type="button" className={btn.primary} disabled={busy} onClick={() => save()}>
            {busy && <Loader2 size={14} className="animate-spin" />} Save
          </button>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-600">Delivery report webhook</p>
          <p className="mt-0.5 text-[11px] text-slate-500">In MSG91, add this URL as the delivery report webhook so statuses update to Delivered or Failed.</p>
          {s?.webhookUrl ? (
            <div className="mt-2 flex gap-2">
              <input readOnly value={s.webhookUrl} className={`${field} mt-0 bg-slate-50 font-mono text-[11px]`} onFocus={(e) => e.target.select()} />
              <button type="button" title="Copy" onClick={copy} className={btn.secondary}>
                {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              </button>
              <button type="button" title="New URL" onClick={newWebhook} className={btn.secondary}>
                <RefreshCw size={14} />
              </button>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-slate-400">Save your settings once to create the URL.</p>
          )}
        </div>
      </div>

      {s?.configured && (
        <div className="rounded-2xl border border-slate-200 p-4">
          <b className="mb-2 block text-sm text-slate-900">Send a test SMS</b>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={testMobile} onChange={(e) => setTestMobile(e.target.value)} placeholder="Your mobile number" className={`${field} mt-0 sm:w-44`} />
            <select value={testTemplate} onChange={(e) => setTestTemplate(e.target.value)} className={`${field} mt-0 flex-1`}>
              {!templates.length && <option value="">Create an SMS template first</option>}
              {templates.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button type="button" className={btn.primary} disabled={testing || !testMobile.trim() || !templates.length} onClick={test}>
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send test
            </button>
          </div>
        </div>
      )}

      {msg && <p className={`rounded-xl px-3 py-2 text-xs ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{msg.text}</p>}

      <TemplateManager channel="SMS" onChanged={setTemplates} />

      <details className="rounded-2xl border border-slate-200 p-4 text-xs leading-5 text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-800">How to set up MSG91 + DLT</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Register your company, sender ID (e.g. LDFLOW) and SMS templates on a DLT portal (Jio / Airtel / Vi). Variables are written as {"{#var#}"}.</li>
          <li>In MSG91 → SMS → Templates, add each DLT-approved template with its DLT template ID. Use ##name## or ##first_name## for the variables.</li>
          <li>Copy the MSG91 auth key (MSG91 → API) and paste it above with your sender ID.</li>
          <li>Paste the webhook URL above into MSG91 → Webhooks → SMS delivery report.</li>
          <li>Create the matching template here with the MSG91 template ID, then send a test SMS.</li>
        </ol>
      </details>
    </div>
  );
}

function WhatsAppSetup({ onChanged }: { onChanged: () => void }) {
  const [st, setSt] = useState<WaState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [limit, setLimit] = useState("");
  const [qrAt, setQrAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const changed = useRef(onChanged);
  changed.current = onChanged;

  const apply = useCallback((s: WaState) => {
    setSt(s);
    setLimit(String(s.dailyLimit));
    if (s.qr) setQrAt(Date.now());
  }, []);

  const load = useCallback(() => {
    api("/outreach/settings/whatsapp")
      .then(apply)
      .catch((e) => setError(e?.message || "Could not load WhatsApp"));
  }, [apply]);

  useEffect(() => {
    load();
  }, [load]);

  // Live QR codes and connection changes for our own number only (business numbers are ignored).
  useEffect(() => {
    const onQr = (p: any) => {
      if (p?.businessId !== OUTREACH_WA_ID) return;
      setSt((s) => (s ? { ...s, status: "QR", qr: p.qr } : s));
      setQrAt(Date.now());
    };
    const onStatus = (p: any) => {
      if (p?.businessId !== OUTREACH_WA_ID) return;
      load();
      changed.current();
    };
    const onOutreach = () => load();
    socket.on("whatsapp_qr", onQr);
    socket.on("whatsapp_status", onStatus);
    socket.on("outreach_updated", onOutreach);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      socket.off("whatsapp_qr", onQr);
      socket.off("whatsapp_status", onStatus);
      socket.off("outreach_updated", onOutreach);
      window.clearInterval(tick);
    };
  }, [load]);

  async function act(path: string, label: string, init: RequestInit = { method: "POST" }) {
    setBusy(label);
    setError("");
    try {
      apply(await api(`/outreach/settings/whatsapp${path}`, init));
      onChanged();
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setBusy("");
    }
  }

  const status = st?.status || "DISCONNECTED";
  const badge = WA_STATUS[status] || WA_STATUS.DISCONNECTED;
  const qrAge = Math.floor((now - qrAt) / 1000);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            <b className="flex items-center gap-2 text-sm text-slate-900">
              <WhatsAppIcon size={15} className="text-emerald-600" /> Data Scraper messaging WhatsApp
            </b>
            <span className="text-xs text-slate-500">A dedicated number used only for messages sent from Contact Data.</span>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.tone}`}>{badge.label}</span>
        </div>

        <div className="p-4">
          {!st && !error && <Loader2 size={18} className="mx-auto animate-spin text-slate-400" />}
          {st && !st.enabled && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">WhatsApp is turned off on this server (WA_ENABLED=false).</p>}

          {st?.enabled && status === "CONNECTED" && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Smartphone size={20} />
                </div>
                <div>
                  <b className="block text-sm text-slate-900">{st.phone ? `+${st.phone}` : "Connected"}</b>
                  <span className="text-xs text-slate-500">
                    {st.displayName ? `${st.displayName} · ` : ""}
                    {st.connectedBy ? `linked by ${st.connectedBy}` : "linked"}
                    {st.lastConnectedAt ? ` · since ${new Date(st.lastConnectedAt).toLocaleString("en-IN")}` : ""}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className={btn.secondary}
                disabled={!!busy}
                onClick={() => window.confirm("Disconnect this WhatsApp? Messages stop until you link a number again.") && act("/disconnect", "disconnect")}
              >
                {busy === "disconnect" ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />} Disconnect
              </button>
            </div>
          )}

          {st?.enabled && status === "QR" && (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="relative rounded-2xl border border-slate-200 bg-white p-2">
                {st.qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={st.qr} alt="WhatsApp QR code" width={220} height={220} className={`h-[220px] w-[220px] ${qrAge > 18 ? "opacity-50" : ""}`} />
                ) : (
                  <div className="grid h-[220px] w-[220px] place-items-center">
                    <Loader2 size={20} className="animate-spin text-slate-400" />
                  </div>
                )}
              </div>
              <div className="flex-1 text-sm text-slate-600">
                <b className="mb-2 block text-slate-900">Scan with the phone for this number</b>
                <ol className="list-decimal space-y-1 pl-4 text-xs leading-5">
                  <li>Open WhatsApp on the phone you want to use for messaging.</li>
                  <li>Tap Settings (or ⋮) → Linked devices → Link a device.</li>
                  <li>Point the camera at this QR code.</li>
                </ol>
                <p className="mt-2 text-[11px] text-slate-400">The code refreshes about every 20 seconds.</p>
                <button type="button" className={`${btn.secondary} mt-3`} disabled={!!busy} onClick={() => act("/cancel", "cancel")}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {st?.enabled && status === "CONNECTING" && (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 size={16} className="animate-spin" /> Connecting to WhatsApp…
            </p>
          )}

          {st?.enabled && (status === "DISCONNECTED" || status === "LOGGED_OUT") && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-slate-600">
                Link a WhatsApp number that belongs to Data Scraper. It is used only for Contact Data messages and is separate from every business&apos;s WhatsApp.
                {st.lastError && <span className="mt-1 block text-rose-600">{st.lastError}</span>}
              </p>
              <button type="button" className={btn.whatsapp} disabled={!!busy} onClick={() => act("/connect", "connect")}>
                {busy === "connect" ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />} Connect WhatsApp
              </button>
            </div>
          )}
        </div>
      </div>

      {st?.enabled && (
        <div className="rounded-2xl border border-slate-200 p-4">
          <b className="mb-3 block text-sm text-slate-900">Sending limits</b>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">Sent today</p>
              <b className="text-lg text-slate-900">
                {st.sentToday}
                <span className="text-xs font-medium text-slate-400"> / {st.dailyLimit}</span>
              </b>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">Waiting to send</p>
              <b className="text-lg text-slate-900">{st.queued}</b>
            </div>
            <label className="block text-xs font-semibold text-slate-600">
              Daily limit
              <div className="mt-1.5 flex gap-2">
                <input type="number" min={1} max={1000} value={limit} onChange={(e) => setLimit(e.target.value)} className={`${field} mt-0`} />
                <button
                  type="button"
                  className={btn.primary}
                  disabled={!!busy || !limit || Number(limit) === st.dailyLimit}
                  onClick={() => act("", "limit", { method: "PUT", body: JSON.stringify({ dailyLimit: Number(limit) }) })}
                >
                  {busy === "limit" ? <Loader2 size={14} className="animate-spin" /> : "Save"}
                </button>
              </div>
            </label>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-slate-500">
            Messages go out one at a time with a short random gap so the number isn&apos;t flagged for bulk sending. Keep the limit low (100–200/day) for a new number.
          </p>
          {st.queued > 0 && (
            <button
              type="button"
              className={`${btn.secondary} mt-3`}
              disabled={!!busy}
              onClick={() => window.confirm(`Cancel ${st.queued} waiting WhatsApp message(s)?`) && act("/clear-queue", "clear")}
            >
              Cancel waiting messages
            </button>
          )}
        </div>
      )}

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>}

      <TemplateManager channel="WHATSAPP" />
    </div>
  );
}

export default function SetupModal({ open, onClose, tab, onTab, onChanged }: { open: boolean; onClose: () => void; tab: Channel; onTab: (c: Channel) => void; onChanged: () => void }) {
  return (
    <Modal
      open={open}
      onClose={() => {
        onChanged();
        onClose();
      }}
      size="xl"
      title="Messaging setup"
      subtitle="Gateway settings and templates for SMS and WhatsApp."
    >
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(
          [
            ["SMS", "SMS", <MessageSquare key="s" size={15} />],
            ["WHATSAPP", "WhatsApp", <WhatsAppIcon key="w" size={15} />],
          ] as const
        ).map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => onTab(key)}
            className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
              tab === key
                ? key === "WHATSAPP"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>
      {open && (tab === "SMS" ? <SmsSetup onSaved={onChanged} /> : <WhatsAppSetup onChanged={onChanged} />)}
    </Modal>
  );
}
