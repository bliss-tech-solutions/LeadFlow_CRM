import { useEffect, useState, useCallback } from "react";
import { Alert, Image, Pressable, Switch, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCheck,
  Clock3,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react-native";
import { del, get, patch, post, put } from "../../api/client";
import { useAuth } from "../../auth/store";
import { Badge, Button, Card, ErrorState, Field, Loading, Muted, Screen, SectionTitle, Segmented, Sheet, cx } from "../../ui";
import { useTheme } from "../../ui/theme";
import { toast } from "../../ui/toast";
import { formatDateTime, timeAgo } from "../../lib/leadMeta";
import { WhatsAppGlyph } from "./WhatsAppGlyph";
import { getSocket } from "../../realtime/socket";

type Tab = "templates" | "settings" | "outbox";
const STATUS_ICON: Record<string, any> = {
  QUEUED: Clock3,
  SENDING: Clock3,
  SENT: Check,
  DELIVERED: CheckCheck,
  READ: CheckCheck,
  FAILED: AlertTriangle,
  CANCELLED: Ban,
};

function extractId(val: any): string | undefined {
  if (!val) return undefined;
  if (typeof val === "string") return val;
  if (typeof val === "object" && val._id) return String(val._id);
  if (typeof val === "object" && val.id) return String(val.id);
  return undefined;
}

/**
 * WhatsApp for a business.
 *  - Matches the website's exact logic:
 *    • Business Partner can connect WhatsApp directly in the app via live QR code scan
 *    • Realtime QR and status updates via Socket.IO + polling fallback
 *    • Message templates (Admin can create/edit/delete; Partner/Sales can view and select)
 *    • Device connection status, daily sending progress, and outbox logs
 */
export default function WhatsAppScreen({ businessId: propBusinessId }: { businessId?: string } = {}) {
  const params = useLocalSearchParams<{ id?: string }>();
  const { c } = useTheme();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const isAdmin = user?.role === "ADMIN" || user?.role === "MANAGER";
  const isOwner = user?.role === "BUSINESS";

  const rawBusiness = propBusinessId || (isAdmin ? params.id : user?.business);
  const businessId = extractId(rawBusiness);
  const scope = isAdmin && businessId ? { business: businessId } : undefined;

  const [tab, setTab] = useState<Tab>("templates");
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [liveQr, setLiveQr] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ["wa-status", businessId],
    queryFn: () => get<any>("/whatsapp/status", scope),
    refetchInterval: (q) => {
      const st = q.state.data?.status;
      return st === "QR" || st === "CONNECTING" ? 3000 : 25_000;
    },
  });

  const templates = useQuery({
    queryKey: ["wa-templates", businessId],
    queryFn: () => get<any>("/whatsapp/templates", scope),
    staleTime: 60_000,
  });

  const settings = useQuery({
    queryKey: ["biz-settings", businessId],
    queryFn: () => get<{ settings: any }>(`/businesses/${businessId}/settings`),
    enabled: Boolean(businessId) && (isAdmin || isOwner),
  });

  const outbox = useQuery({
    queryKey: ["wa-outbox", businessId],
    queryFn: () => get<{ messages: any[] }>("/whatsapp/messages", { limit: 30, ...(scope || {}) }),
    enabled: isOwner && tab === "outbox",
  });

  const st = status.data;
  const connected = st?.status === "CONNECTED";
  const isConnecting = st?.status === "CONNECTING";
  const isWaitingQr = st?.status === "QR";
  const qrImage = liveQr || st?.qr;

  // Realtime Socket listeners (same as website)
  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    const onQr = (p: any) => {
      if (p?.qr) setLiveQr(p.qr);
      qc.invalidateQueries({ queryKey: ["wa-status", businessId] });
    };

    const onStatus = () => {
      setLiveQr(null);
      qc.invalidateQueries({ queryKey: ["wa-status", businessId] });
    };

    const onMsg = () => {
      qc.invalidateQueries({ queryKey: ["wa-outbox", businessId] });
      qc.invalidateQueries({ queryKey: ["wa-status", businessId] });
    };

    s.on("whatsapp_qr", onQr);
    s.on("whatsapp_status", onStatus);
    s.on("whatsapp_message", onMsg);

    return () => {
      s.off("whatsapp_qr", onQr);
      s.off("whatsapp_status", onStatus);
      s.off("whatsapp_message", onMsg);
    };
  }, [businessId, qc]);

  const refreshAll = useCallback(() => {
    status.refetch();
    templates.refetch();
    settings.refetch();
    outbox.refetch();
  }, [status, templates, settings, outbox]);

  // Connect WhatsApp session -> generates live QR code
  async function handleConnect() {
    setActionBusy(true);
    try {
      const res = await post<any>("/whatsapp/connect");
      if (res?.qr) setLiveQr(res.qr);
      toast.info("WhatsApp Started", "Scan the QR code with WhatsApp on your phone.");
      refreshAll();
    } catch (e: any) {
      toast.error("Could not start session", e?.message);
    } finally {
      setActionBusy(false);
    }
  }

  // Cancel pairing
  async function handleCancel() {
    setActionBusy(true);
    try {
      await post<any>("/whatsapp/cancel");
      setLiveQr(null);
      toast.info("Pairing cancelled");
      refreshAll();
    } catch (e: any) {
      toast.error("Could not cancel", e?.message);
    } finally {
      setActionBusy(false);
    }
  }

  // Disconnect active session
  function handleDisconnect() {
    Alert.alert(
      "Disconnect WhatsApp?",
      "Queued messages will wait until you reconnect. You can link again anytime with QR scan.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setActionBusy(true);
            try {
              await post<any>("/whatsapp/disconnect");
              setLiveQr(null);
              toast.success("WhatsApp disconnected");
              refreshAll();
            } catch (e: any) {
              toast.error("Could not disconnect", e?.message);
            } finally {
              setActionBusy(false);
            }
          },
        },
      ]
    );
  }

  const list: any[] = templates.data?.templates || [];
  const presets: any[] = templates.data?.presets || [];
  const variables: { key: string; label: string }[] = templates.data?.variables || [];
  const shown = list.length
    ? list
    : presets.map((p, i) => ({ _id: `preset:${p.key}`, name: p.name, body: p.body, isDefault: i === 0, preset: true }));

  const invalidateTemplates = () => qc.invalidateQueries({ queryKey: ["wa-templates", businessId] });

  async function adopt(key: string) {
    if (!isAdmin) return;
    try {
      await post(`/whatsapp/templates/presets/${key}?business=${businessId}`);
      toast.success("Template added");
      invalidateTemplates();
    } catch (e: any) {
      toast.error("Couldn't add template", e?.message);
    }
  }

  async function saveTemplate() {
    if (!isAdmin || !editing?.name?.trim() || !editing?.body?.trim()) return;
    setSaving(true);
    try {
      const payload = { name: editing.name.trim(), body: editing.body, isDefault: Boolean(editing.isDefault) };
      if (editing._id && !editing._id.startsWith("preset:")) {
        await put(`/whatsapp/templates/${editing._id}?business=${businessId}`, payload);
      } else {
        await post(`/whatsapp/templates?business=${businessId}`, payload);
      }
      toast.success("Template saved");
      setEditing(null);
      invalidateTemplates();
    } catch (e: any) {
      toast.error("Couldn't save", e?.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeTemplate(t: any) {
    if (!isAdmin) return;
    Alert.alert("Delete template?", t.name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await del(`/whatsapp/templates/${t._id}?business=${businessId}`);
            invalidateTemplates();
          } catch (e: any) {
            toast.error("Couldn't delete", e?.message);
          }
        },
      },
    ]);
  }

  async function saveSetting(key: string, value: unknown) {
    qc.setQueryData(["biz-settings", businessId], (old: any) => ({ settings: { ...(old?.settings || {}), [key]: value } }));
    try {
      await patch(`/businesses/${businessId}/settings`, { [key]: value });
    } catch (e: any) {
      toast.error("Couldn't save", e?.message);
      settings.refetch();
    }
  }

  if (status.isLoading && !st) {
    return (
      <Screen back title="WhatsApp">
        <Loading />
      </Screen>
    );
  }

  if (status.error && !st) {
    return (
      <Screen back title="WhatsApp">
        <ErrorState error={status.error} onRetry={() => status.refetch()} />
      </Screen>
    );
  }

  const tabs: { value: Tab; label: string }[] = [
    { value: "templates", label: "Templates" },
    ...(isAdmin || isOwner ? [{ value: "settings" as Tab, label: "Settings" }] : []),
    ...(isOwner ? [{ value: "outbox" as Tab, label: "Outbox" }] : []),
  ];
  const s = settings.data?.settings;
  const usagePct = st ? Math.min(100, Math.round((st.sentToday / Math.max(1, st.dailyLimit)) * 100)) : 0;

  return (
    <Screen back title="WhatsApp" refreshing={status.isRefetching} onRefresh={refreshAll}>
      {/* 1. CONNECTED STATE */}
      {connected ? (
        <Card className="mt-1 border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20">
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900">
              <WhatsAppGlyph size={26} color="#059669" />
            </View>
            <View className="flex-1">
              <Text className="text-[17px] font-bold text-slate-900 dark:text-white">+{st.phone}</Text>
              <Muted className="text-xs">
                {st.displayName ? `${st.displayName} · ` : ""}Linked device active
              </Muted>
            </View>
            <Badge tone="emerald">Connected</Badge>
          </View>

          <View className="mt-4 rounded-xl bg-white p-3.5 dark:bg-slate-900">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">Today's limit</Text>
              <Text className="text-xs font-bold text-slate-900 dark:text-white">
                {st.sentToday} / {st.dailyLimit} sent
              </Text>
            </View>
            <View className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <View
                className={`h-full rounded-full ${usagePct > 85 ? "bg-rose-500" : "bg-emerald-500"}`}
                style={{ width: `${usagePct}%` }}
              />
            </View>
            {st.queued > 0 ? (
              <Muted className="mt-2 text-xs">{st.queued} message(s) queued for delivery</Muted>
            ) : null}
            {st.lastConnectedAt ? (
              <Muted className="mt-1 text-[11px]">Connected since {formatDateTime(st.lastConnectedAt)}</Muted>
            ) : null}
          </View>

          {isOwner ? (
            <View className="mt-3 flex-row justify-end">
              <Button
                title="Disconnect"
                size="sm"
                variant="ghost"
                icon={<LogOut size={14} color={c.danger} />}
                loading={actionBusy}
                onPress={handleDisconnect}
              />
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* 2. QR CODE PAIRING STATE (Active QR Code for Partner) */}
      {!connected && isWaitingQr ? (
        <Card className="mt-1 border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <QrCode size={20} color="#D97706" />
              <Text className="text-[16px] font-bold text-slate-900 dark:text-white">Scan with WhatsApp</Text>
            </View>
            <Badge tone="amber">Waiting for scan</Badge>
          </View>

          <View className="mt-4 items-center justify-center rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
            {qrImage ? (
              <Image
                source={{ uri: qrImage }}
                style={{ width: 240, height: 240 }}
                resizeMode="contain"
              />
            ) : (
              <View className="h-[240px] w-[240px] items-center justify-center">
                <Loader2 size={32} color={c.brand} className="animate-spin" />
                <Muted className="mt-2 text-xs">Generating QR code…</Muted>
              </View>
            )}
          </View>

          <View className="mt-4 rounded-xl bg-white/80 p-3.5 dark:bg-slate-900/80">
            <Text className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300">Quick Pairing Steps</Text>
            <Text className="mt-1.5 text-[13px] leading-5 text-slate-700 dark:text-slate-300">
              1. Open <Text className="font-semibold">WhatsApp</Text> or <Text className="font-semibold">WhatsApp Business</Text> on your phone{"\n"}
              2. Tap <Text className="font-semibold">Settings</Text> (or ⋮ menu) → <Text className="font-semibold">Linked devices</Text>{"\n"}
              3. Tap <Text className="font-semibold">Link a device</Text> and scan this screen
            </Text>
            <Muted className="mt-2 text-[11px]">QR refreshes automatically every ~20 seconds.</Muted>
          </View>

          <View className="mt-3 flex-row justify-end">
            <Button
              title="Cancel pairing"
              size="sm"
              variant="secondary"
              loading={actionBusy}
              onPress={handleCancel}
            />
          </View>
        </Card>
      ) : null}

      {/* 3. CONNECTING SPINNER STATE */}
      {!connected && isConnecting && !isWaitingQr ? (
        <Card className="mt-1 items-center py-8">
          <Loader2 size={32} color={c.brand} className="animate-spin" />
          <Text className="mt-3 text-[16px] font-semibold text-slate-900 dark:text-white">Connecting to WhatsApp…</Text>
          <Muted className="mt-1 text-xs">Preparing secure linked device session</Muted>
          <Button
            title="Cancel"
            size="sm"
            variant="ghost"
            className="mt-4"
            loading={actionBusy}
            onPress={handleCancel}
          />
        </Card>
      ) : null}

      {/* 4. DISCONNECTED / OFFLINE STATE */}
      {!connected && !isConnecting && !isWaitingQr ? (
        <Card className="mt-1 border-slate-200 p-5 dark:border-slate-800">
          <View className="items-center text-center">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950">
              <Smartphone size={28} color="#059669" />
            </View>
            <Text className="mt-3 text-[17px] font-bold text-slate-900 dark:text-white">
              {isOwner ? "Connect your business WhatsApp" : "WhatsApp is offline"}
            </Text>
            <Muted className="mt-1.5 text-center text-xs leading-5">
              {isOwner
                ? "Scan a QR code from the phone with your business number — exactly like WhatsApp Web. Your phone remains the owner."
                : "The business owner connects the team WhatsApp number using QR scan."}
            </Muted>

            {st?.lastError ? (
              <View className="mt-3 rounded-lg bg-rose-50 px-3 py-2 dark:bg-rose-950/40">
                <Text className="text-xs text-rose-600 dark:text-rose-300">{st.lastError}</Text>
              </View>
            ) : null}

            {isOwner ? (
              <Button
                title="Show QR Code"
                variant="whatsapp"
                className="mt-4"
                icon={<QrCode size={16} color="#fff" />}
                loading={actionBusy}
                onPress={handleConnect}
              />
            ) : null}
          </View>
        </Card>
      ) : null}

      {/* Safety info card */}
      <Card className="mt-3 flex-row items-start gap-3 bg-slate-50/80 dark:bg-slate-900/60">
        <ShieldCheck size={18} color="#059669" />
        <Text className="flex-1 text-xs leading-5 text-slate-600 dark:text-slate-400">
          Uses WhatsApp's official Linked Devices protocol. Messages queue automatically and send with natural human-like pauses up to {st?.dailyLimit ?? 150} daily.
        </Text>
      </Card>

      {/* Tabs */}
      {tabs.length > 1 ? (
        <View className="mt-4">
          <Segmented value={tab} onChange={setTab} options={tabs} />
        </View>
      ) : null}

      {/* Tab: Templates */}
      {tab === "templates" && (
        <View className="mt-2">
          <SectionTitle
            right={
              isAdmin ? (
                <Button
                  title="New"
                  size="sm"
                  icon={<Plus size={14} color="#fff" />}
                  onPress={() =>
                    setEditing({
                      name: "",
                      body: presets[0]?.body || "",
                      isDefault: !list.length,
                    })
                  }
                />
              ) : undefined
            }
          >
            Message templates
          </SectionTitle>

          {!isAdmin ? (
            <Muted className="mb-2 text-xs">
              Approved message templates for client communication. Select any template when messaging a lead to autofill client and project details.
            </Muted>
          ) : null}

          {templates.isLoading ? <Loading /> : null}
          {templates.error ? <ErrorState error={templates.error} onRetry={() => templates.refetch()} /> : null}

          {shown.map((t: any) => (
            <Card key={t._id} className="mb-2.5">
              <View className="flex-row items-center gap-2">
                <Text className="flex-1 text-[15px] font-semibold text-slate-900 dark:text-white">{t.name}</Text>
                {t.isDefault ? (
                  <Badge tone="amber" icon={<Star size={9} color="#B45309" />}>
                    Default
                  </Badge>
                ) : null}
                {t.preset ? <Badge>Ready-made</Badge> : null}
              </View>

              <View className="mt-2.5 rounded-xl bg-[#ECFDF5] p-3.5 dark:bg-emerald-950/40">
                <Text className="text-[13px] leading-5 text-slate-700 dark:text-slate-300" numberOfLines={8}>
                  {t.body}
                </Text>
              </View>

              {isAdmin && !t.preset ? (
                <View className="mt-2.5 flex-row justify-end gap-2">
                  <Button
                    title="Edit"
                    size="sm"
                    variant="secondary"
                    icon={<Pencil size={13} color={c.text} />}
                    onPress={() => setEditing({ ...t })}
                  />
                  <Button
                    title="Delete"
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 size={13} color={c.danger} />}
                    onPress={() => removeTemplate(t)}
                  />
                </View>
              ) : null}
            </Card>
          ))}

          {isAdmin && presets.length ? (
            <>
              <SectionTitle>Add a ready-made template</SectionTitle>
              {presets.map((p: any) => (
                <Card key={p.key} className="mb-2 flex-row items-center gap-3">
                  <Sparkles size={18} color="#059669" />
                  <View className="flex-1">
                    <Text className="text-[14px] font-semibold text-slate-900 dark:text-white">{p.name}</Text>
                    <Muted className="text-xs">{p.description}</Muted>
                  </View>
                  <Button title="Add" size="sm" variant="whatsapp" onPress={() => adopt(p.key)} />
                </Card>
              ))}
            </>
          ) : null}
        </View>
      )}

      {/* Tab: Settings */}
      {tab === "settings" && (
        <View className="mt-2">
          <SectionTitle>Team & automation</SectionTitle>
          {!isAdmin ? (
            <Muted className="mb-2 text-xs">Configured by your LeadFlow admin. Contact them to request changes.</Muted>
          ) : null}

          {settings.isLoading ? <Loading /> : null}
          {s ? (
            <Card>
              <View className="min-h-[56px] flex-row items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                <Text className="flex-1 text-[15px] text-slate-800 dark:text-slate-200">Sales staff can send WhatsApp</Text>
                {isAdmin ? (
                  <Switch
                    value={Boolean(s.salesCanSendWhatsApp)}
                    onValueChange={(v) => saveSetting("salesCanSendWhatsApp", v)}
                    trackColor={{ true: "#059669", false: c.border }}
                  />
                ) : (
                  <Text className="font-semibold text-slate-900 dark:text-white">
                    {s.salesCanSendWhatsApp ? "Yes" : "No"}
                  </Text>
                )}
              </View>

              <View className="min-h-[56px] flex-row items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
                <Text className="flex-1 text-[15px] text-slate-800 dark:text-slate-200">Daily email summary</Text>
                {isAdmin ? (
                  <Switch
                    value={Boolean(s.dailyDigest)}
                    onValueChange={(v) => saveSetting("dailyDigest", v)}
                    trackColor={{ true: c.brand, false: c.border }}
                  />
                ) : (
                  <Text className="font-semibold text-slate-900 dark:text-white">{s.dailyDigest ? "On" : "Off"}</Text>
                )}
              </View>

              <Text className="mb-2 mt-3 text-[13px] font-semibold text-slate-700 dark:text-slate-300">First-contact SLA</Text>
              {isAdmin ? (
                <View className="flex-row flex-wrap gap-2">
                  {[5, 10, 15, 30, 60].map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => saveSetting("slaMinutes", m)}
                      className={cx(
                        "rounded-full border px-3.5 py-2",
                        s.slaMinutes === m ? "border-brand-600 bg-brand-600" : "border-slate-200 dark:border-slate-700"
                      )}
                    >
                      <Text
                        className={cx(
                          "text-[13px]",
                          s.slaMinutes === m ? "font-semibold text-white" : "text-slate-700 dark:text-slate-300"
                        )}
                      >
                        {m} min
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text className="text-[15px] text-slate-900 dark:text-white">{s.slaMinutes ?? 15} minutes</Text>
              )}
            </Card>
          ) : null}
        </View>
      )}

      {/* Tab: Outbox */}
      {tab === "outbox" && (
        <View className="mt-2">
          <SectionTitle>Recent messages</SectionTitle>
          {outbox.isLoading ? <Loading /> : null}
          {outbox.data && !outbox.data.messages.length ? <Muted>No messages sent yet.</Muted> : null}
          {(outbox.data?.messages || []).map((m: any) => {
            const Icon = STATUS_ICON[m.status] || Clock3;
            return (
              <Card key={m._id} className="mb-2">
                <View className="flex-row items-center gap-2">
                  <Text className="flex-1 text-[14px] font-semibold text-slate-900 dark:text-white" numberOfLines={1}>
                    {m.lead?.name || "Lead"}
                  </Text>
                  <Icon size={14} color={m.status === "READ" ? "#0284C7" : m.status === "FAILED" ? "#E11D48" : c.faint} />
                  <Text className="text-[11px] text-slate-500">{String(m.status).toLowerCase()}</Text>
                </View>
                <Text className="mt-1 text-[13px] text-slate-600 dark:text-slate-300" numberOfLines={2}>
                  {m.body || `${m.documents?.length || 0} document(s)`}
                </Text>
                <Muted className="mt-1 text-[11px]">
                  {m.sentBy?.name || "System"} · {timeAgo(m.createdAt)}
                  {m.error ? ` · ${m.error}` : ""}
                </Muted>
              </Card>
            );
          })}
        </View>
      )}

      {/* Admin Template Editor Sheet */}
      {isAdmin ? (
        <Sheet
          visible={Boolean(editing)}
          onClose={() => setEditing(null)}
          full
          title={editing?._id && !editing._id.startsWith("preset:") ? "Edit template" : "New template"}
          subtitle="Tap a variable to add it to the message."
          footer={
            <Button
              title="Save template"
              full
              loading={saving}
              onPress={saveTemplate}
              disabled={!editing?.name?.trim() || !editing?.body?.trim()}
            />
          }
        >
          {editing ? (
            <>
              <Field
                label="Name"
                value={editing.name}
                onChangeText={(v) => setEditing({ ...editing, name: v })}
                maxLength={80}
                placeholder="e.g. Site visit invite"
              />
              <View className="mb-3 flex-row flex-wrap gap-1.5">
                {variables.map((v) => (
                  <Pressable
                    key={v.key}
                    onPress={() => setEditing({ ...editing, body: `${editing.body}{{${v.key}}}` })}
                    className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 dark:border-brand-900 dark:bg-brand-900"
                  >
                    <Text className="text-[11px] text-brand-700 dark:text-brand-200">{`{{${v.key}}}`}</Text>
                  </Pressable>
                ))}
              </View>
              <Field
                label="Message"
                value={editing.body}
                onChangeText={(v) => setEditing({ ...editing, body: v })}
                multiline
                maxLength={4000}
                className="min-h-[220px]"
              />
              <View className="flex-row items-center gap-3">
                <Text className="flex-1 text-[15px] text-slate-800 dark:text-slate-200">Use as default</Text>
                <Switch
                  value={Boolean(editing.isDefault)}
                  onValueChange={(v) => setEditing({ ...editing, isDefault: v })}
                  trackColor={{ true: c.brand, false: c.border }}
                />
              </View>
            </>
          ) : null}
        </Sheet>
      ) : null}
    </Screen>
  );
}
