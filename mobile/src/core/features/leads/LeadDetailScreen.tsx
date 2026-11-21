import { useState, useMemo } from "react";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";
import { AlertOctagon, AtSign, CalendarClock, CalendarPlus, CheckCircle2, ChevronRight, Copy, FileText, Mail, MessageSquare, Phone, PhoneCall, Pin, Send, Trash2, UserRound } from "lucide-react-native";
import { del, get, patch, post } from "../../api/client";
import { useAuth } from "../../auth/store";
import { useCan } from "../../auth/permissions";
import { sendOrQueue } from "../../query";
import { Avatar, Badge, Button, Card, ErrorState, Field, IconButton, Loading, Muted, Screen, ScoreChip, SectionTitle, Sheet, StatusPill, cx } from "../../ui";
import { useTheme } from "../../ui/theme";
import { toast } from "../../ui/toast";
import { formAnswers, formatDateTime, inr, statusLabel, timeAgo } from "../../lib/leadMeta";
import { openCallLog, startCall } from "../calls/callFlow";
import { openWhatsApp } from "../whatsapp/Composer";
import { WhatsAppGlyph } from "../whatsapp/WhatsAppGlyph";
import { AssignSheet, StatusSheet } from "./sheets";
import { FollowupSheet } from "../followups/FollowupSheet";

type Tab = "details" | "notes" | "timeline";

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const isAdmin = me?.role === "ADMIN" || me?.role === "MANAGER";
  const canAssign = useCan("leads.assign");
  const canWhatsApp = useCan("whatsapp.send");

  const q = useQuery({ queryKey: ["lead", id], queryFn: () => get<any>(`/leads/${id}`), enabled: Boolean(id) });
  const wa = useQuery({ queryKey: ["wa-messages", id], queryFn: () => get<{ messages: any[] }>(`/whatsapp/leads/${id}/messages`), enabled: Boolean(id) });

  const [tab, setTab] = useState<Tab>("details");
  const [sheet, setSheet] = useState<null | "status" | "assign" | "followup" | "note">(null);
  const [note, setNote] = useState("");
  const [mentions, setMentions] = useState<{ _id: string; name: string; role?: string }[]>([]);
  const [savingNote, setSavingNote] = useState(false);

  // Strictly fetches only lead-related sales and business persons
  const mentionQuery = useQuery({
    queryKey: ["lead-mentionable", id],
    queryFn: () => get<{ users: any[] }>(`/leads/${id}/mentionable-users`),
    enabled: Boolean(id) && sheet === "note",
  });

  const lead = q.data?.lead;
  const activities: any[] = q.data?.activities || [];
  const calls: any[] = q.data?.calls || [];
  const followups: any[] = q.data?.followups || [];
  const notes: any[] = q.data?.notes || [];
  const duplicate = q.data?.duplicate;
  const project = lead?.businessProject;
  const answers = lead ? formAnswers(lead) : [];
  const pendingFollowups = followups.filter((f: any) => f.status === "PENDING");

  const mentionCandidates = useMemo(() => {
    const map = new Map<string, { _id: string; name: string; role?: string }>();
    if (lead?.assignedTo && typeof lead.assignedTo === "object" && lead.assignedTo._id) {
      if (String(lead.assignedTo._id) !== me?.id) {
        map.set(String(lead.assignedTo._id), {
          _id: String(lead.assignedTo._id),
          name: lead.assignedTo.name,
          role: "Assigned Sales",
        });
      }
    }
    (mentionQuery.data?.users || []).forEach((u: any) => {
      if (u._id && !map.has(String(u._id)) && String(u._id) !== me?.id) {
        map.set(String(u._id), {
          _id: String(u._id),
          name: u.name,
          role: u.role === "SALES" ? "Sales" : u.role === "BUSINESS" ? "Business Partner" : u.role,
        });
      }
    });
    return Array.from(map.values());
  }, [lead?.assignedTo, mentionQuery.data?.users, me?.id]);

  function toggleMention(u: { _id: string; name: string; role?: string }) {
    const isAlready = mentions.some((m) => m._id === u._id);
    if (isAlready) {
      setMentions((prev) => prev.filter((m) => m._id !== u._id));
      setNote((prev) => prev.replace(new RegExp(`@${u.name}\\s*`, "g"), "").trim());
    } else {
      setMentions((prev) => [...prev, u]);
      setNote((prev) => (prev.includes(`@${u.name}`) ? prev : `${prev ? `${prev} ` : ""}@${u.name} `));
    }
  }

  const unifiedTimeline = useMemo(() => {
    const items: any[] = [];
    activities.forEach((a: any) =>
      items.push({
        id: `act-${a._id}`,
        title: a.title,
        desc: a.description,
        actor: a.actor?.name || "System",
        time: a.createdAt,
        type: "activity",
      })
    );
    calls.forEach((c: any) =>
      items.push({
        id: `call-${c._id}`,
        title: `Call · ${statusLabel(c.result)}`,
        desc: c.notes || (c.durationSec ? `Duration: ${Math.max(1, Math.round(c.durationSec / 60))} min` : undefined),
        actor: c.user?.name ? `${c.user.name} (Sales)` : "Sales",
        time: c.createdAt,
        type: "call",
      })
    );
    followups.forEach((f: any) =>
      items.push({
        id: `fup-${f._id}`,
        title: `${String(f.type || "Follow-up").toUpperCase()} · ${f.status === "COMPLETED" ? "Completed" : "Scheduled"}`,
        desc: f.notes,
        actor: f.user?.name ? `${f.user.name} (Sales)` : "Sales",
        time: f.scheduledAt || f.createdAt,
        type: "followup",
      })
    );
    return items.sort((a, b) => +new Date(b.time) - +new Date(a.time));
  }, [activities, calls, followups]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["lead", id] });
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
    qc.invalidateQueries({ queryKey: ["lead-mentionable", id] });
  };

  if (q.isLoading) return <Screen back title="Lead"><Loading /></Screen>;
  if (q.error || !lead) return <Screen back title="Lead"><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;

  async function addNote() {
    if (!note.trim()) return;
    setSavingNote(true);
    try {
      const usedMentions = mentions.filter((m) => note.includes(`@${m.name}`)).map((m) => m._id);
      const r = await sendOrQueue(`Note · ${lead.name}`, `/leads/${id}/notes`, "POST", { body: note.trim(), mentions: usedMentions });
      toast.success(r === "queued" ? "Note saved offline" : "Note added");
      setNote("");
      setMentions([]);
      setSheet(null);
      refresh();
    } catch (e: any) {
      toast.error("Couldn't save note", e?.message);
    } finally {
      setSavingNote(false);
    }
  }

  async function openDoc(doc: any) {
    try {
      const r = await get<{ url: string }>(`/business-projects/${project._id}/documents/${doc._id}/url`);
      await WebBrowser.openBrowserAsync(r.url);
    } catch (e: any) {
      toast.error("Couldn't open document", e?.message);
    }
  }

  async function toggleFake(markAsFake: boolean) {
    try {
      await post(`/leads/${id}/mark-fake`, { isFake: markAsFake });
      toast.success(markAsFake ? "Marked as fake lead" : "Restored from fake status");
      refresh();
    } catch (e: any) {
      toast.error("Couldn't update fake status", e?.message);
    }
  }

  function confirmMarkFake() {
    Alert.alert(
      "Mark as Fake Lead?",
      "This will close all pending follow-ups and move this lead to Lost ('Fake lead').",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Mark Fake", style: "destructive", onPress: () => void toggleFake(true) },
      ],
    );
  }

  const ActionBtn = ({ icon, label, onPress, tone }: { icon: any; label: string; onPress: () => void; tone: string }) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} className="flex-1 items-center gap-1.5 py-1 active:opacity-70">
      <View className="h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: `${tone}1A` }}>
        {icon}
      </View>
      <Text className="text-[12px] font-medium text-slate-700 dark:text-slate-300">{label}</Text>
    </Pressable>
  );

  const facts: [string, string, (() => void) | undefined][] = [
    ["Assigned to", lead.assignedTo?.name ? `${lead.assignedTo.name} (Sales)` : "Not assigned yet", canAssign ? () => setSheet("assign") : undefined],
    ["Project", project?.name || "Not mapped to a project", project?._id ? () => router.push(`/projects/${project._id}`) : undefined],
    ["Enquired", formatDateTime(lead.createdAt), undefined],
    ["Next follow-up", lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : "Not scheduled", () => setSheet("followup")],
    ["Source", `${String(lead.source || "—").replace(/_/g, " ").toLowerCase()}${lead.campaign ? ` · ${lead.campaign}` : ""}`, undefined],
    ...(lead.status === "WON" && lead.dealValue ? ([["Deal value", inr(lead.dealValue), undefined]] as any) : []),
    ...(lead.lostReason && ["LOST", "NOT_INTERESTED"].includes(lead.status) ? ([["Lost reason", lead.lostReason, undefined]] as any) : []),
  ];

  return (
    <Screen back title="" refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {/* Hero */}
      <View className="items-center pb-4">
        <Avatar name={lead.name} size={72} />
        <Text className="mt-3 text-center text-[22px] font-bold text-slate-900 dark:text-white">{lead.name}</Text>
        <Pressable
          onLongPress={async () => {
            if (lead.phone) {
              await Clipboard.setStringAsync(lead.phone);
              toast.success("Phone number copied");
            }
          }}
        >
          <Text className="mt-1 text-[15px] text-slate-500">{lead.phone || lead.email || "No contact details"}</Text>
        </Pressable>
        <View className="mt-3 flex-row items-center gap-2">
          <Pressable onPress={() => setSheet("status")} accessibilityLabel={`Status ${statusLabel(lead.status)}. Tap to change.`} className="flex-row items-center gap-1">
            <StatusPill status={lead.status} />
          </Pressable>
          <ScoreChip score={lead.score} />
          {lead.isFake ? <Badge tone="rose">🚨 Fake Lead</Badge> : null}
        </View>
        <Text className="mt-2 text-xs font-medium text-slate-500">
          {lead.assignedTo?.name ? `Assigned to: ${lead.assignedTo.name} (Sales)` : "Not assigned yet"}
        </Text>
      </View>

      {/* Fake Lead Banner or Action */}
      {lead.isFake ? (
        <Card className="mb-3 flex-row items-center justify-between border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950">
          <View className="flex-1 flex-row items-center gap-2 mr-2">
            <AlertOctagon size={18} color="#E11D48" />
            <View className="flex-1">
              <Text className="text-[13px] font-bold text-rose-900 dark:text-rose-200">Flagged as Fake Lead</Text>
              <Text className="text-xs text-rose-700 dark:text-rose-300">Pending follow-ups cancelled. Excluded from pipeline.</Text>
            </View>
          </View>
          <Button title="Restore" variant="secondary" size="sm" onPress={() => void toggleFake(false)} />
        </Card>
      ) : (
        <Pressable
          onPress={confirmMarkFake}
          className="mb-3 flex-row w-40 mx-auto items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/70 py-2 active:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40"
        >
          <AlertOctagon size={14} color="#E11D48" />
          <Text className="text-xs font-semibold text-rose-700 dark:text-rose-300">Mark as fake lead</Text>
        </Pressable>
      )}

      {/* Actions */}
      <Card className="mb-3 flex-row px-2 py-3">
        {lead.phone ? <ActionBtn icon={<Phone size={22} color="#4F46E5" />} label="Call" tone="#4F46E5" onPress={() => startCall(lead)} /> : null}
        {canWhatsApp && lead.phone ? <ActionBtn icon={<WhatsAppGlyph size={22} color="#059669" />} label="WhatsApp" tone="#059669" onPress={() => openWhatsApp(lead._id)} /> : null}
        <ActionBtn icon={<CalendarPlus size={22} color="#D97706" />} label="Follow-up" tone="#D97706" onPress={() => setSheet("followup")} />
        <ActionBtn icon={<PhoneCall size={22} color="#0EA5E9" />} label="Log call" tone="#0EA5E9" onPress={() => openCallLog(lead)} />
        {lead.email ? <ActionBtn icon={<Mail size={22} color="#64748B" />} label="Email" tone="#64748B" onPress={() => Linking.openURL(`mailto:${lead.email}`)} /> : null}
      </Card>

      {duplicate ? (
        <Card className="mb-3 flex-row items-start gap-3 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950" onPress={() => router.push(`/leads/${duplicate._id}`)}>
          <Copy size={18} color="#B45309" />
          <View className="flex-1">
            <Text className="text-[14px] font-semibold text-amber-900 dark:text-amber-200">Repeat enquiry</Text>
            <Text className="mt-0.5 text-[13px] text-amber-800 dark:text-amber-300">
              Enquired before as {duplicate.name} on {new Date(duplicate.createdAt).toLocaleDateString()} ({statusLabel(duplicate.status).toLowerCase()}).
            </Text>
          </View>
          <ChevronRight size={18} color="#B45309" />
        </Card>
      ) : null}

      {/* Tabs */}
      <View className="mb-1 mt-1 flex-row gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800">
        {(["details", "notes", "timeline"] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} className={cx("min-h-[38px] flex-1 items-center justify-center rounded-lg", tab === t && "bg-white dark:bg-slate-700")}>
            <Text className={cx("text-[13px] font-semibold", tab === t ? "text-slate-900 dark:text-white" : "text-slate-500")}>
              {t === "details" ? "Details" : t === "notes" ? `Notes${notes.length ? ` (${notes.length})` : ""}` : `Timeline${unifiedTimeline.length ? ` (${unifiedTimeline.length})` : ""}`}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "details" && (
        <View>
          {/* Form answers first — what the person told us */}
          <SectionTitle>Form answers</SectionTitle>
          {answers.length ? (
            <Card>
              {answers.map((a, i) => (
                <View key={a.name} className={cx("py-2.5", i < answers.length - 1 && "border-b border-slate-100 dark:border-slate-800")}>
                  <Muted className="text-xs">{a.name}</Muted>
                  <Text className="mt-0.5 text-[15px] text-slate-900 dark:text-white">{a.value}</Text>
                </View>
              ))}
            </Card>
          ) : (
            <Muted>No extra answers on this enquiry.</Muted>
          )}

          <SectionTitle>Lead info</SectionTitle>
          <Card>
            {facts.map(([k, v, onPress], i) => (
              <Pressable key={k} disabled={!onPress} onPress={onPress} className={cx("min-h-[44px] flex-row items-center justify-between py-2", i < facts.length - 1 && "border-b border-slate-100 dark:border-slate-800")}>
                <Muted>{k}</Muted>
                <View className="max-w-[62%] flex-row items-center gap-1">
                  <Text className={cx("text-right text-[14px] font-medium", onPress ? "text-brand-600 dark:text-brand-200" : "text-slate-800 dark:text-slate-200")} numberOfLines={2}>
                    {v}
                  </Text>
                  {onPress ? <ChevronRight size={16} color={c.brand} /> : null}
                </View>
              </Pressable>
            ))}
            {lead.tags?.length ? (
              <View className="mt-2 flex-row flex-wrap gap-1.5">
                {lead.tags.map((t: string) => (
                  <Badge key={t}>#{t}</Badge>
                ))}
              </View>
            ) : null}
          </Card>

          {pendingFollowups.length ? (
            <>
              <SectionTitle>Upcoming follow-ups</SectionTitle>
              {pendingFollowups.map((f: any) => (
                <Card key={f._id} className="mb-2 flex-row items-center gap-3">
                  <CalendarClock size={20} color={new Date(f.scheduledAt) < new Date() ? "#E11D48" : "#D97706"} />
                  <View className="flex-1">
                    <Text className="text-[14px] font-semibold text-slate-900 dark:text-white">{String(f.type).toLowerCase().replace(/^\w/, (x: string) => x.toUpperCase())}</Text>
                    <Muted>{formatDateTime(f.scheduledAt)}{f.user?.name ? ` · ${f.user.name}` : ""}</Muted>
                  </View>
                  <IconButton
                    icon={<CheckCircle2 size={22} color="#16A34A" />}
                    label="Mark follow-up done"
                    onPress={async () => {
                      try {
                        await patch(`/followups/${f._id}/complete`, {});
                        toast.success("Follow-up completed");
                        refresh();
                      } catch (e: any) {
                        toast.error("Couldn't complete", e?.message);
                      }
                    }}
                  />
                </Card>
              ))}
            </>
          ) : null}

          {calls.length ? (
            <>
              <SectionTitle>Calls</SectionTitle>
              {calls.slice(0, 5).map((cl: any) => (
                <Card key={cl._id} className="mb-2 flex-row items-start gap-3">
                  <Phone size={18} color={cl.result === "CONNECTED" ? "#16A34A" : "#94A3B8"} />
                  <View className="flex-1">
                    <Text className="text-[14px] font-semibold text-slate-900 dark:text-white">{statusLabel(cl.result)}</Text>
                    <Muted className="text-xs">{cl.user?.name} · {timeAgo(cl.createdAt)}{cl.durationSec ? ` · ${Math.max(1, Math.round(cl.durationSec / 60))} min` : ""}</Muted>
                    {cl.notes ? <Text className="mt-1 text-[13px] text-slate-600 dark:text-slate-300">{cl.notes}</Text> : null}
                  </View>
                </Card>
              ))}
            </>
          ) : null}

          {wa.data?.messages?.length ? (
            <>
              <SectionTitle>WhatsApp</SectionTitle>
              {wa.data.messages.slice(0, 3).map((m: any) => (
                <Card key={m._id} className="mb-2 bg-emerald-50/60 dark:bg-emerald-950/40">
                  <Text className="text-[14px] text-slate-800 dark:text-slate-200" numberOfLines={3}>{m.body || "(documents)"}</Text>
                  <Muted className="mt-1 text-xs">{m.sentBy?.name} · {timeAgo(m.createdAt)} · {String(m.status).toLowerCase()}</Muted>
                </Card>
              ))}
            </>
          ) : null}

          {project?.documents?.length ? (
            <>
              <SectionTitle>Project documents</SectionTitle>
              {project.documents.map((d: any) => (
                <Card key={d._id} className="mb-2 flex-row items-center gap-3" onPress={() => openDoc(d)}>
                  <FileText size={20} color={c.brand} />
                  <View className="flex-1">
                    <Text className="text-[14px] font-medium text-slate-900 dark:text-white" numberOfLines={1}>{d.name}</Text>
                    <Muted className="text-xs">{String(d.category || "").replace(/_/g, " ").toLowerCase()}</Muted>
                  </View>
                  <ChevronRight size={18} color={c.faint} />
                </Card>
              ))}
            </>
          ) : null}

          {/* Meta technical details: admins only (the API doesn't send them to others) */}
          {isAdmin ? (
            <>
              <SectionTitle>Meta source (admin)</SectionTitle>
              <Card>
                {[
                  ["Form", lead.formName || lead.meta?.formName],
                  ["Form ID", lead.meta?.formId],
                  ["Page", lead.meta?.pageName || lead.meta?.pageId],
                  ["Ad ID", lead.meta?.adId],
                  ["Meta lead ID", lead.metaLeadId],
                ].map(([k, v], i, arr) => (
                  <View key={k} className={cx("flex-row justify-between py-2.5", i < arr.length - 1 && "border-b border-slate-100 dark:border-slate-800")}>
                    <Muted>{k}</Muted>
                    <Text selectable className="max-w-[60%] text-right text-[13px] text-slate-700 dark:text-slate-300" numberOfLines={2}>{v || "—"}</Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {canAssign && !lead.assignedTo ? (
            <Card className="mt-4 flex-row items-center gap-3 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950" onPress={() => setSheet("assign")}>
              <UserRound size={18} color="#B45309" />
              <Text className="flex-1 text-[14px] font-medium text-amber-900 dark:text-amber-200">Not assigned — tap to assign a salesperson</Text>
            </Card>
          ) : null}
        </View>
      )}

      {tab === "notes" && (
        <View className="pt-3">
          <Button title="Add note" icon={<MessageSquare size={18} color="#fff" />} onPress={() => setSheet("note")} full />
          {notes.length === 0 ? <Muted className="mt-6 text-center">No notes yet. Capture budget, requirements and objections.</Muted> : null}
          {notes.map((n: any) => (
            <Card key={n._id} className={cx("mt-2.5", n.pinned && "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/40")}>
              <Text className="text-[15px] leading-6 text-slate-800 dark:text-slate-200">{n.body}</Text>
              {n.mentions?.length ? (
                <View className="mt-2 flex-row flex-wrap gap-1.5">
                  {n.mentions.map((m: any) => (
                    <View key={m._id || m} className="flex-row items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 dark:bg-brand-950/60">
                      <AtSign size={11} color={c.brand} />
                      <Text className="text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                        {m.name || "Sales"}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <View className="mt-2 flex-row items-center justify-between">
                <Muted className="text-xs">{n.author?.name} · {timeAgo(n.createdAt)}</Muted>
                <View className="flex-row">
                  <IconButton
                    icon={<Pin size={16} color={n.pinned ? "#D97706" : c.faint} />}
                    label={n.pinned ? "Unpin" : "Pin"}
                    onPress={async () => {
                      await patch(`/leads/${id}/notes/${n._id}`, { pinned: !n.pinned }).catch(() => undefined);
                      refresh();
                    }}
                  />
                  {String(n.author?._id) === me?.id ? (
                    <IconButton
                      icon={<Trash2 size={16} color={c.faint} />}
                      label="Delete note"
                      onPress={async () => {
                        await del(`/leads/${id}/notes/${n._id}`).catch(() => undefined);
                        refresh();
                      }}
                    />
                  ) : null}
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}

      {tab === "timeline" && (
        <View className="pt-4">
          {!unifiedTimeline.length ? <Muted className="text-center">No activity or history recorded yet.</Muted> : null}
          {unifiedTimeline.map((item: any, i: number) => (
            <View key={item.id} className="flex-row gap-3">
              <View className="w-6 items-center">
                <View
                  className={cx(
                    "mt-1.5 h-2.5 w-2.5 rounded-full",
                    item.type === "call" ? "bg-sky-500" : item.type === "followup" ? "bg-amber-500" : "bg-brand-500"
                  )}
                />
                {i < unifiedTimeline.length - 1 ? <View className="w-px flex-1 bg-slate-200 dark:bg-slate-800" /> : null}
              </View>
              <View className="flex-1 pb-4">
                <Text className="text-[14px] font-medium text-slate-900 dark:text-white">{item.title}</Text>
                {item.desc ? <Text className="mt-0.5 text-[13px] text-slate-600 dark:text-slate-300">{item.desc}</Text> : null}
                <Muted className="mt-0.5 text-xs">{item.actor} · {formatDateTime(item.time)}</Muted>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Sheets */}
      <StatusSheet
        visible={sheet === "status"}
        current={lead.status}
        onClose={() => setSheet(null)}
        onConfirm={async ({ status, lostReason, dealValue }) => {
          const r = await sendOrQueue(`Status · ${lead.name}`, `/leads/${id}/status`, "PATCH", { status, lostReason, dealValue });
          toast.success(r === "queued" ? "Saved offline" : `Marked ${statusLabel(status).toLowerCase()}`);
          refresh();
        }}
      />
      <AssignSheet
        visible={sheet === "assign"}
        projectId={project?._id}
        onClose={() => setSheet(null)}
        onPick={async (userId) => {
          try {
            await patch(`/leads/${id}/assign`, { userId });
            toast.success("Lead assigned");
            refresh();
          } catch (e: any) {
            toast.error("Couldn't assign", e?.message);
          }
        }}
      />
      <FollowupSheet visible={sheet === "followup"} lead={lead} onClose={() => setSheet(null)} onSaved={refresh} />
      <Sheet
        visible={sheet === "note"}
        onClose={() => {
          setSheet(null);
          setMentions([]);
        }}
        title="Add note"
        subtitle="Mention sales reps or teammates to notify them."
        footer={<Button title="Save note" full icon={<Send size={16} color="#fff" />} loading={savingNote} disabled={!note.trim()} onPress={addNote} />}
      >
        <Field
          value={note}
          onChangeText={(val) => {
            setNote(val);
            setMentions((prev) => prev.filter((m) => val.includes(`@${m.name}`)));
          }}
          placeholder="What did you learn? Type @ or tap a person below to mention…"
          multiline
          autoFocus
          maxLength={4000}
          // Cap the growth so a long note never pushes the Save button off screen.
          style={{ maxHeight: 160 }}
        />

        <View className="mt-3">
          <View className="mb-2 flex-row items-center gap-1.5">
            <AtSign size={14} color={c.brand} />
            <Text className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Mention related sales / partner
            </Text>
          </View>
          {mentionQuery.isLoading && !mentionCandidates.length ? (
            <Text className="text-xs text-slate-400">Loading related team…</Text>
          ) : !mentionCandidates.length ? (
            <Text className="text-xs text-slate-400">No other related sales or business partners for this lead.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
              {mentionCandidates.map((u) => {
                const isSelected = mentions.some((m) => m._id === u._id);
                return (
                  <Pressable
                    key={u._id}
                    onPress={() => toggleMention(u)}
                    className={cx(
                      "mx-1 flex-row items-center gap-1.5 rounded-full px-3 py-1.5 border active:opacity-75",
                      isSelected
                        ? "border-brand-500 bg-brand-50 dark:border-brand-600 dark:bg-brand-950/70"
                        : "border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                    )}
                  >
                    <AtSign size={12} color={isSelected ? c.brand : c.faint} />
                    <Text className={cx(
                      "text-xs font-medium",
                      isSelected ? "font-semibold text-brand-700 dark:text-brand-300" : "text-slate-700 dark:text-slate-300"
                    )}>
                      {u.name} {u.role ? `(${u.role})` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        {mentions.length > 0 && (
          <View className="mt-3 flex-row flex-wrap items-center gap-1.5 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60">
            <Text className="text-[11px] font-medium text-slate-500">Will notify:</Text>
            {mentions.map((m) => (
              <View key={m._id} className="flex-row items-center gap-1 rounded-md bg-brand-100 px-2 py-0.5 dark:bg-brand-900/60">
                <Text className="text-xs font-semibold text-brand-700 dark:text-brand-200">@{m.name}</Text>
              </View>
            ))}
          </View>
        )}
      </Sheet>
    </Screen>
  );
}
