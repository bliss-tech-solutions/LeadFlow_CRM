import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { AlertTriangle, Check, CheckCheck, Clock3, FileText, Send, Smartphone } from "lucide-react-native";
import { api, get } from "../../api/client";
import { Button, Sheet, cx, Loading } from "../../ui";
import { toast } from "../../ui/toast";
import { useTheme } from "../../ui/theme";
import { formatDateTime } from "../../lib/leadMeta";

const useComposer = create<{ leadId: string | null; open: (id: string) => void; close: () => void }>((set) => ({
  leadId: null,
  open: (leadId) => set({ leadId }),
  close: () => set({ leadId: null }),
}));

/** Open the WhatsApp composer for a lead from anywhere. */
export const openWhatsApp = (leadId: string) => useComposer.getState().open(leadId);

type Compose = {
  canSend: boolean;
  reason?: string;
  lead: { _id: string; name: string; phone?: string; whatsappOptOut?: boolean };
  normalizedPhone: string | null;
  project: { _id: string; name: string } | null;
  documents: { _id: string; name: string; category?: string; size?: number }[];
  templates: { _id: string; name: string; preview: string; isDefault?: boolean; defaultDocumentIds?: string[] }[];
  connection: { status: string; phone?: string; sentToday: number; dailyLimit: number; queued: number };
};

const STATUS_ICON: Record<string, any> = { QUEUED: Clock3, SENDING: Clock3, SENT: Check, DELIVERED: CheckCheck, READ: CheckCheck, FAILED: AlertTriangle };

/**
 * Bottom-sheet composer: template → editable message → documents → send.
 * Messages always go through the server queue and the business's linked number,
 * so daily limits and permissions are enforced server-side.
 */
export function WhatsAppComposer() {
  const leadId = useComposer((s) => s.leadId);
  const close = useComposer((s) => s.close);
  const qc = useQueryClient();
  const { c } = useTheme();

  const compose = useQuery({ queryKey: ["wa-compose", leadId], queryFn: () => get<Compose>(`/whatsapp/leads/${leadId}/compose`), enabled: Boolean(leadId), staleTime: 0 });
  const history = useQuery({ queryKey: ["wa-messages", leadId], queryFn: () => get<{ messages: any[] }>(`/whatsapp/leads/${leadId}/messages`), enabled: Boolean(leadId) });

  const [templateId, setTemplateId] = useState("");
  const [body, setBody] = useState("");
  const [docs, setDocs] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const d = compose.data;
    if (!d) return;
    const t = d.templates.find((x) => x.isDefault) || d.templates[0];
    if (t) {
      setTemplateId(t._id);
      setBody(t.preview);
      setDocs((t.defaultDocumentIds || []).filter((id) => d.documents.some((doc) => doc._id === id)));
    }
  }, [compose.data]);

  const d = compose.data;
  const connected = d?.connection.status === "CONNECTED";
  const blocked = useMemo(() => {
    if (!d) return "";
    if (!d.canSend) return d.reason || "You can't send WhatsApp messages for this lead.";
    if (d.lead.whatsappOptOut) return "This lead asked not to be contacted on WhatsApp.";
    if (!d.normalizedPhone) return "This lead has no valid phone number.";
    if (d.connection.sentToday >= d.connection.dailyLimit) return `Daily limit of ${d.connection.dailyLimit} reached — this protects your number.`;
    return "";
  }, [d]);

  async function send() {
    if (!leadId) return;
    setSending(true);
    try {
      const r = await api<{ info: string }>(`/whatsapp/leads/${leadId}/send`, { method: "POST", body: { body, templateId, documentIds: docs } });
      toast.success("Message queued", r.info);
      qc.invalidateQueries({ queryKey: ["wa-messages", leadId] });
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      close();
    } catch (e: any) {
      toast.error("Couldn't send", e?.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet
      visible={Boolean(leadId)}
      onClose={close}
      full
      title={d?.lead.name ? `WhatsApp · ${d.lead.name}` : "WhatsApp"}
      subtitle={d ? `${d.normalizedPhone ? `+${d.normalizedPhone}` : d.lead.phone || "No phone"}${d.project ? ` · ${d.project.name}` : ""}` : undefined}
      footer={
        <Button
          title={docs.length ? `Send with ${docs.length} document${docs.length > 1 ? "s" : ""}` : "Send"}
          variant="whatsapp"
          size="lg"
          full
          icon={<Send size={18} color="#fff" />}
          loading={sending}
          disabled={!d || Boolean(blocked) || (!body.trim() && !docs.length)}
          onPress={send}
        />
      }
    >
      {compose.isLoading && <Loading />}
      {compose.error && <Text className="py-6 text-center text-rose-600">{(compose.error as Error).message}</Text>}
      {d && (
        <View>
          <View className={cx("mb-3 flex-row items-start gap-2.5 rounded-xl p-3", connected ? "bg-emerald-50 dark:bg-emerald-950" : "bg-amber-50 dark:bg-amber-950")}>
            <Smartphone size={18} color={connected ? "#059669" : "#D97706"} />
            <Text className={cx("flex-1 text-[13px] leading-5", connected ? "text-emerald-800 dark:text-emerald-200" : "text-amber-800 dark:text-amber-200")}>
              {connected
                ? `Sending from +${d.connection.phone} · ${d.connection.sentToday}/${d.connection.dailyLimit} today`
                : "WhatsApp isn't connected. Your message will be queued and sent once the business owner links WhatsApp on the website."}
            </Text>
          </View>
          {blocked ? (
            <View className="mb-3 flex-row items-start gap-2 rounded-xl bg-rose-50 p-3 dark:bg-rose-950">
              <AlertTriangle size={16} color="#E11D48" />
              <Text className="flex-1 text-[13px] text-rose-700 dark:text-rose-300">{blocked}</Text>
            </View>
          ) : null}

          <Text className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">Template</Text>
          <View className="mb-3 flex-row flex-wrap gap-2">
            {d.templates.map((t) => (
              <Pressable
                key={t._id}
                onPress={() => {
                  setTemplateId(t._id);
                  setBody(t.preview);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: templateId === t._id }}
                className={cx("rounded-full border px-3.5 py-2", templateId === t._id ? "border-wa-600 bg-wa-50 dark:bg-emerald-950" : "border-slate-200 dark:border-slate-700")}
              >
                <Text className={cx("text-[13px]", templateId === t._id ? "font-semibold text-wa-700 dark:text-emerald-300" : "text-slate-700 dark:text-slate-300")}>{t.name}</Text>
              </Pressable>
            ))}
          </View>

          <Text className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">Message preview</Text>
          <View
            className="min-h-[180px] rounded-xl border border-slate-200 bg-[#ECFDF5] p-3 dark:border-slate-700 dark:bg-emerald-950/40"
            accessibilityLabel={`Message preview: ${body}`}
          >
            <Text selectable className="text-[15px] leading-6 text-slate-900 dark:text-slate-100">{body}</Text>
          </View>
          <Text className="mb-4 mt-1 text-[11px] text-slate-400">
            Templates are written and approved by your LeadFlow admin — pick one above.
          </Text>

          <Text className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">Attach documents</Text>
          {d.documents.length === 0 ? (
            <Text className="mb-3 text-[13px] text-slate-500">No documents uploaded for this project yet.</Text>
          ) : (
            d.documents.map((doc) => {
              const on = docs.includes(doc._id);
              return (
                <Pressable
                  key={doc._id}
                  onPress={() => setDocs((p) => (on ? p.filter((x) => x !== doc._id) : [...p, doc._id].slice(0, 10)))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  className={cx("mb-2 min-h-[52px] flex-row items-center gap-3 rounded-xl border px-3", on ? "border-wa-600 bg-wa-50 dark:bg-emerald-950" : "border-slate-200 dark:border-slate-700")}
                >
                  <View className={cx("h-5 w-5 items-center justify-center rounded-md border", on ? "border-wa-600 bg-wa-600" : "border-slate-300")}>{on ? <Check size={14} color="#fff" /> : null}</View>
                  <FileText size={18} color={c.muted} />
                  <View className="flex-1">
                    <Text className="text-[14px] text-slate-800 dark:text-slate-200" numberOfLines={1}>{doc.name}</Text>
                    {doc.category ? <Text className="text-[11px] text-slate-500">{doc.category.replace(/_/g, " ").toLowerCase()}</Text> : null}
                  </View>
                </Pressable>
              );
            })
          )}

          {history.data?.messages?.length ? (
            <View className="mt-4">
              <Text className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">Recent messages</Text>
              {history.data.messages.slice(0, 5).map((m: any) => {
                const Icon = STATUS_ICON[m.status] || Clock3;
                return (
                  <View key={m._id} className="mb-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                    <Text className="text-[13px] text-slate-700 dark:text-slate-300" numberOfLines={3}>{m.body || "(documents)"}</Text>
                    <View className="mt-1.5 flex-row items-center justify-between">
                      <Text className="text-[11px] text-slate-400">{m.sentBy?.name} · {formatDateTime(m.createdAt)}</Text>
                      <View className="flex-row items-center gap-1">
                        <Icon size={13} color={m.status === "READ" ? "#0284C7" : m.status === "FAILED" ? "#E11D48" : "#94A3B8"} />
                        <Text className="text-[11px] text-slate-500">{m.status.toLowerCase()}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
          <Text className="mt-3 text-[11px] leading-4 text-slate-400">Messages go out one at a time with natural pauses to keep the business number safe.</Text>
        </View>
      )}
    </Sheet>
  );
}
