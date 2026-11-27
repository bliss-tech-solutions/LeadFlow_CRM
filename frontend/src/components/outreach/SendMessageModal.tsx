"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, MessageSquare, Send, Settings2 } from "lucide-react";
import Modal, { btn, field } from "../Modal";
import WhatsAppIcon from "../WhatsAppIcon";
import { api } from "../../lib/api";
import { CHANNELS, CHANNEL_LABEL, formatContactPhone, renderPreview, type Channel, type OutreachConfig, type Recipient, type Template } from "./types";

const ICON: Record<Channel, React.ReactNode> = {
  SMS: <MessageSquare size={15} />,
  WHATSAPP: <WhatsAppIcon size={15} />,
};

const NOT_READY: Record<Channel, string> = {
  SMS: "SMS gateway is not set up yet. Open Setup → SMS to add your MSG91 auth key.",
  WHATSAPP: "WhatsApp is turned off on this server.",
};

const WA_OFFLINE = "Data Scraper's messaging WhatsApp is not connected. Messages will wait in the queue until you connect it in Setup → WhatsApp.";

export default function SendMessageModal({
  open,
  onClose,
  recipients,
  config,
  channel,
  onChannel,
  onSetup,
  templatesVersion,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  recipients: Recipient[];
  config: OutreachConfig | null;
  channel: Channel;
  onChannel: (c: Channel) => void;
  onSetup: (channel: Channel) => void;
  templatesVersion: number;
  onSent: () => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setResult("");
    api("/outreach/templates")
      .then((res) => setTemplates(res.templates || []))
      .catch(() => setTemplates([]));
  }, [open, templatesVersion]);

  const list = useMemo(() => templates.filter((t) => t.channel === channel), [templates, channel]);

  useEffect(() => {
    const first = list.find((t) => t._id === templateId) || list[0];
    setTemplateId(first?._id || "");
    setBody(first?.body || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  function chooseTemplate(id: string) {
    setTemplateId(id);
    setBody(list.find((x) => x._id === id)?.body || "");
  }

  const reachable = useMemo(() => recipients.filter((r) => r.phone).length, [recipients]);

  const ready = config ? config.channels[channel] : true;
  const first = recipients[0];

  async function send() {
    setBusy(true);
    setError("");
    try {
      const out = await api("/outreach/send", {
        method: "POST",
        body: JSON.stringify({
          channel,
          templateId,
          body: channel === "WHATSAPP" ? body : undefined,
          recipients: recipients.map((r) => ({ kind: r.kind, id: r.id })),
        }),
      });
      setResult(
        `${out.queued} ${CHANNEL_LABEL[channel]} message${out.queued === 1 ? "" : "s"} queued${out.skipped ? ` · ${out.skipped} skipped` : ""}. Track them under Message status.${out.info ? ` ${out.info}` : ""}`
      );
      onSent();
    } catch (e: any) {
      setError(e?.message || "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={recipients.length === 1 ? `Message ${first?.name || "contact"}` : `Message ${recipients.length} contacts`}
      subtitle={recipients.length === 1 ? formatContactPhone(first?.phone) : "Bulk send · each contact gets a personalised copy"}
      footer={
        result ? (
          <button type="button" className={btn.primary} onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button type="button" className={btn.secondary} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={channel === "WHATSAPP" ? btn.whatsapp : btn.primary}
              disabled={busy || !ready || !templateId || !reachable || (channel === "WHATSAPP" && !body.trim())}
              onClick={send}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send {CHANNEL_LABEL[channel]}
              {recipients.length > 1 ? ` to ${reachable}` : ""}
            </button>
          </>
        )
      }
    >
      {result ? (
        <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> {result}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChannel(c)}
                className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${
                  channel === c
                    ? c === "WHATSAPP"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {ICON[c]} {CHANNEL_LABEL[c]}
              </button>
            ))}
          </div>

          {!ready && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {NOT_READY[channel]}
            </p>
          )}
          {ready && channel === "WHATSAPP" && config && !config.whatsappConnected && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {WA_OFFLINE}
            </p>
          )}
          {reachable < recipients.length && (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {recipients.length - reachable} of {recipients.length} will be skipped — no mobile number.
            </p>
          )}

          <div className="flex items-end gap-2">
            <label className="block flex-1 text-xs font-semibold text-slate-600">
              Template
              <select value={templateId} onChange={(e) => chooseTemplate(e.target.value)} className={field}>
                {!list.length && <option value="">No {CHANNEL_LABEL[channel]} templates yet</option>}
                {list.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={btn.secondary} onClick={() => onSetup(channel)}>
              <Settings2 size={14} /> {list.length ? "Templates" : "Create template"}
            </button>
          </div>

          {templateId && (
            <>
              <label className="block text-xs font-semibold text-slate-600">
                Message {channel === "SMS" && <span className="font-normal text-slate-400">(fixed by the DLT template)</span>}
                <textarea
                  rows={channel === "SMS" ? 4 : 6}
                  value={body}
                  readOnly={channel === "SMS"}
                  onChange={(e) => setBody(e.target.value)}
                  className={`${field} ${channel === "SMS" ? "bg-slate-50 text-slate-600" : ""}`}
                />
              </label>
              <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 whitespace-pre-wrap text-slate-700">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Preview for {first?.name || "contact"}</p>
                {renderPreview(body, first)}
              </div>
            </>
          )}
        </div>
      )}
      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>}
    </Modal>
  );
}
