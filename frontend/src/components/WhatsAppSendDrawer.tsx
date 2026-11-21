"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  X,
  Loader2,
  FileText,
  CheckCheck,
  Check,
  Clock3,
  AlertTriangle,
  Send,
  Smartphone,
  Ban,
} from "lucide-react";
import { api } from "../lib/api";
import { socket } from "../lib/socket";
import { getUser } from "../lib/auth";
import WhatsAppIcon from "./WhatsAppIcon";

type Props = {
  leadId: string | null;
  onClose: () => void;
  onSent?: () => void;
};

type Compose = {
  canSend: boolean;
  reason?: string;
  lead: { _id: string; name: string; phone?: string; whatsappOptOut?: boolean; lastWhatsAppAt?: string };
  normalizedPhone: string | null;
  project: { _id: string; name: string } | null;
  documents: { _id: string; name: string; category?: string; size?: number }[];
  templates: { _id: string; name: string; body: string; preview: string; isDefault?: boolean; defaultDocumentIds?: string[] }[];
  connection: { status: string; phone?: string; sentToday: number; dailyLimit: number; queued: number };
};

const statusMeta: Record<string, { label: string; tone: string; Icon: any }> = {
  QUEUED: { label: "Queued", tone: "text-slate-500", Icon: Clock3 },
  SENDING: { label: "Sending", tone: "text-sky-600", Icon: Loader2 },
  SENT: { label: "Sent", tone: "text-slate-600", Icon: Check },
  DELIVERED: { label: "Delivered", tone: "text-slate-700", Icon: CheckCheck },
  READ: { label: "Read", tone: "text-sky-600", Icon: CheckCheck },
  FAILED: { label: "Failed", tone: "text-rose-600", Icon: AlertTriangle },
  CANCELLED: { label: "Cancelled", tone: "text-slate-400", Icon: Ban },
};

function formatSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Slide-over composer to send a lead the business details + project documents
 * through the business's linked WhatsApp number.
 */
export default function WhatsAppSendDrawer({ leadId, onClose, onSent }: Props) {
  const user = getUser();
  const [data, setData] = useState<Compose | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [body, setBody] = useState("");
  const [docIds, setDocIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function loadMessages(id: string) {
    try {
      const d = await api(`/whatsapp/leads/${id}/messages`);
      setMessages(d.messages || []);
    } catch {}
  }

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    setError("");
    setInfo("");
    setData(null);
    api(`/whatsapp/leads/${leadId}/compose`)
      .then((d: Compose) => {
        setData(d);
        const t = d.templates.find((x) => x.isDefault) || d.templates[0];
        if (t) {
          setTemplateId(t._id);
          setBody(t.preview);
          setDocIds((t.defaultDocumentIds || []).filter((id) => d.documents.some((doc) => doc._id === id)));
        }
      })
      .catch((e) => setError(e?.message || "Could not load WhatsApp composer"))
      .finally(() => setLoading(false));
    void loadMessages(leadId);
  }, [leadId]);

  // Live delivery / read receipts
  useEffect(() => {
    if (!leadId) return;
    const handler = (p: any) => {
      if (p?.leadId === leadId) void loadMessages(leadId);
    };
    socket.on("whatsapp_message", handler);
    return () => {
      socket.off("whatsapp_message", handler);
    };
  }, [leadId]);

  useEffect(() => {
    if (!leadId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [leadId, onClose]);

  const connected = data?.connection.status === "CONNECTED";
  const limitReached = data ? data.connection.sentToday >= data.connection.dailyLimit : false;
  const blockedReason = useMemo(() => {
    if (!data) return "";
    if (!data.canSend) return data.reason || "You cannot send WhatsApp messages for this lead.";
    if (data.lead.whatsappOptOut) return "This lead asked not to be contacted on WhatsApp.";
    if (!data.normalizedPhone) return "This lead does not have a valid phone number.";
    if (limitReached) return `Daily limit of ${data.connection.dailyLimit} messages reached to protect your number.`;
    return "";
  }, [data, limitReached]);

  function pickTemplate(id: string) {
    setTemplateId(id);
    const t = data?.templates.find((x) => x._id === id);
    if (t) {
      setBody(t.preview);
      if (t.defaultDocumentIds?.length) {
        setDocIds(t.defaultDocumentIds.filter((d) => data?.documents.some((doc) => doc._id === d)));
      }
    }
  }

  async function send() {
    if (!leadId) return;
    setSending(true);
    setError("");
    setInfo("");
    try {
      const r = await api(`/whatsapp/leads/${leadId}/send`, {
        method: "POST",
        body: JSON.stringify({ body, templateId: templateId === "default" ? "default" : templateId, documentIds: docIds }),
      });
      setInfo(r.info || "Queued");
      await loadMessages(leadId);
      onSent?.();
    } catch (e: any) {
      setError(e?.message || "Could not send");
    } finally {
      setSending(false);
    }
  }

  if (!leadId) return null;

  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-slate-950/40 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label="Send on WhatsApp" className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-emerald-600 px-5 py-4 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15">
              <WhatsAppIcon size={22} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold">{data?.lead.name || "Send on WhatsApp"}</h2>
              <p className="truncate text-xs text-emerald-50">
                {data?.normalizedPhone ? `+${data.normalizedPhone}` : data?.lead.phone || "—"}
                {data?.project ? ` · ${data.project.name}` : ""}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Preparing message…
            </div>
          )}

          {data && (
            <>
              {/* Connection banner */}
              <div
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${
                  connected ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                <Smartphone size={16} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  {connected ? (
                    <>
                      Sending from <b>+{data.connection.phone}</b> · {data.connection.sentToday}/{data.connection.dailyLimit} sent today
                    </>
                  ) : (
                    <>
                      WhatsApp is <b>not connected</b>. Messages will be queued and sent automatically once the business reconnects.
                      {user?.role === "BUSINESS" && (
                        <Link href="/whatsapp" className="ml-1 font-semibold underline">
                          Connect now
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </div>

              {blockedReason && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {blockedReason}
                </div>
              )}

              {/* Template */}
              <div>
                <span className="text-xs font-semibold text-slate-700">Template</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {data.templates.map((t) => (
                    <button
                      key={t._id}
                      type="button"
                      onClick={() => pickTemplate(t._id)}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${
                        templateId === t._id ? "border-emerald-500 bg-emerald-50 font-semibold text-emerald-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message — rendered from the chosen template, not editable */}
              <div className="block">
                <span className="text-xs font-semibold text-slate-700">Message preview</span>
                <div className="mt-1.5 min-h-[180px] whitespace-pre-wrap rounded-xl border border-slate-200 bg-[#f0fdf4] p-3 font-[system-ui] text-sm leading-relaxed text-slate-800">
                  {body}
                </div>
                <span className="mt-1 block text-[10px] text-slate-400">
                  Templates are written and approved by your LeadFlow admin — pick one above.
                </span>
              </div>

              {/* Documents */}
              <div>
                <span className="text-xs font-semibold text-slate-700">Attach project documents</span>
                {data.documents.length ? (
                  <div className="mt-2 space-y-1.5">
                    {data.documents.map((d) => {
                      const checked = docIds.includes(d._id);
                      return (
                        <label
                          key={d._id}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-xs transition ${
                            checked ? "border-emerald-400 bg-emerald-50/60" : "border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setDocIds((prev) => (checked ? prev.filter((x) => x !== d._id) : [...prev, d._id].slice(0, 10)))}
                            className="h-4 w-4 accent-emerald-600"
                          />
                          <FileText size={15} className="shrink-0 text-slate-400" />
                          <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{d.name}</span>
                          <span className="shrink-0 text-[10px] text-slate-400">
                            {String(d.category || "").replaceAll("_", " ")} {formatSize(d.size)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">No documents uploaded for this project yet.</p>
                )}
              </div>

              {error && <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
              {info && <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">{info}</div>}

              {/* History */}
              {messages.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-slate-700">Recent messages</span>
                  <div className="mt-2 space-y-2">
                    {messages.slice(0, 6).map((m) => {
                      const meta = statusMeta[m.status] || statusMeta.QUEUED;
                      return (
                        <div key={m._id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <p className="line-clamp-3 whitespace-pre-line text-xs text-slate-700">{m.body || "(documents only)"}</p>
                          {m.documents?.length > 0 && (
                            <p className="mt-1 text-[10px] text-slate-500">📎 {m.documents.map((d: any) => d.name).join(", ")}</p>
                          )}
                          <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                            <span>
                              {m.sentBy?.name || "—"} · {new Date(m.createdAt).toLocaleString()}
                            </span>
                            <span className={`inline-flex items-center gap-1 font-semibold ${meta.tone}`}>
                              <meta.Icon size={12} className={m.status === "SENDING" ? "animate-spin" : ""} /> {meta.label}
                            </span>
                          </div>
                          {m.status === "FAILED" && m.error && <p className="mt-1 text-[10px] text-rose-600">{m.error}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 p-4">
          <p className="mb-2 text-[10px] leading-snug text-slate-400">
            Messages are sent one at a time with natural delays to keep your number safe. Only message people who enquired about your project.
          </p>
          <button
            type="button"
            onClick={send}
            disabled={!data || sending || Boolean(blockedReason) || (!body.trim() && !docIds.length)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {sending ? "Queuing…" : `Send${docIds.length ? ` with ${docIds.length} document${docIds.length > 1 ? "s" : ""}` : ""}`}
          </button>
        </div>
      </aside>
    </div>
  );
}
