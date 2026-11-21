import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Activity, AlertTriangle, ChevronRight, Copy, Eye, FlaskConical, RotateCcw, Webhook } from "lucide-react-native";
import { get, post } from "../../api/client";
import { useCan } from "../../auth/permissions";
import { Badge, Button, Card, Chip, EmptyState, ErrorState, Field, ListSkeleton, Loading, Muted, Screen, SectionTitle, Segmented, Sheet, Stat, cx } from "../../ui";
import { useTheme } from "../../ui/theme";
import { toast } from "../../ui/toast";
import { API_URL } from "../../config";
import { formatDateTime, timeAgo } from "../../lib/leadMeta";
import { WhatsAppGlyph } from "../whatsapp/WhatsAppGlyph";

/* ------------------------------------------------------------------ */
/* Platform health                                                     */
/* ------------------------------------------------------------------ */

export function PlatformScreen() {
  const { c } = useTheme();
  const h = useQuery({ queryKey: ["admin-health"], queryFn: () => get<any>("/admin/health"), refetchInterval: 60_000 });
  const wa = useQuery({ queryKey: ["wa-sessions"], queryFn: () => get<{ sessions: any[] }>("/whatsapp/admin/sessions") });
  const d = h.data;

  return (
    <Screen back title="Platform" subtitle="Refreshes every minute" refreshing={h.isRefetching} onRefresh={() => { h.refetch(); wa.refetch(); }}>
      {h.isLoading ? <Loading /> : null}
      {h.error ? <ErrorState error={h.error} onRetry={() => h.refetch()} /> : null}
      {d ? (
        <>
          <View className="flex-row gap-2.5">
            <Stat label="Leads · 24h" value={d.leads.last24h} />
            <Stat label="Leads · 7d" value={d.leads.last7d} />
            <Stat label="Webhook failure" value={`${d.webhooks.failureRate}%`} tone={d.webhooks.failureRate > 5 ? "#E11D48" : "#16A34A"} icon={d.webhooks.failureRate > 5 ? <AlertTriangle size={16} color="#E11D48" /> : <Activity size={16} color="#16A34A" />} onPress={() => router.push("/webhooks")} />
          </View>
          <View className="mt-2.5 flex-row gap-2.5">
            <Stat label="Held" value={d.backlog.held} tone="#D97706" />
            <Stat label="Unassigned" value={d.backlog.unassigned} tone="#E11D48" />
            <Stat label="Unmapped" value={d.backlog.unmapped} tone="#64748B" />
          </View>

          <SectionTitle>Quick links</SectionTitle>
          <Card className="py-1">
            {[
              { href: "/webhooks", label: "Webhook log", icon: <Webhook size={18} color={c.brand} /> },
              { href: "/meta-setup", label: "Meta & LeadSync setup", icon: <FlaskConical size={18} color={c.brand} /> },
            ].map((x, i) => (
              <Pressable key={x.href} onPress={() => router.push(x.href as any)} className={cx("min-h-[52px] flex-row items-center gap-3", i === 0 && "border-b border-slate-100 dark:border-slate-800")}>
                {x.icon}
                <Text className="flex-1 text-[15px] text-slate-800 dark:text-slate-200">{x.label}</Text>
                <ChevronRight size={18} color={c.faint} />
              </Pressable>
            ))}
          </Card>

          <SectionTitle>Businesses · last 7 days</SectionTitle>
          <Card>
            {(d.perBusiness || []).length === 0 ? <Muted>No lead activity.</Muted> : null}
            {(d.perBusiness || []).map((b: any, i: number, arr: any[]) => (
              <Pressable key={b._id} onPress={() => router.push(`/businesses/${b._id}`)} className={cx("flex-row items-center py-2.5", i < arr.length - 1 && "border-b border-slate-100 dark:border-slate-800")}>
                <Text className="flex-1 text-[14px] font-medium text-slate-900 dark:text-white" numberOfLines={1}>{b.name}</Text>
                <Muted className="w-16 text-right text-xs">{b.leads} leads</Muted>
                <Muted className="w-14 text-right text-xs">{b.won} won</Muted>
                <Text className={cx("w-20 text-right text-xs", b.uncontacted > 5 ? "font-semibold text-rose-600" : "text-slate-500")}>{b.uncontacted} waiting</Text>
              </Pressable>
            ))}
          </Card>

          <SectionTitle>WhatsApp connections</SectionTitle>
          <Card>
            <Muted className="mb-2 text-xs">{d.whatsapp.enabled ? `${d.whatsapp.sent24h} sent · ${d.whatsapp.failed24h} failed in 24h` : "Disabled on this server"}</Muted>
            {(wa.data?.sessions || []).length === 0 ? <Muted>No business has linked WhatsApp yet.</Muted> : null}
            {(wa.data?.sessions || []).map((s: any) => (
              <View key={s._id} className="flex-row items-center gap-2 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
                <WhatsAppGlyph size={16} color={s.status === "CONNECTED" ? "#059669" : "#94A3B8"} />
                <Text className="flex-1 text-[14px] text-slate-800 dark:text-slate-200" numberOfLines={1}>{s.business?.name}</Text>
                <Text className={cx("text-xs", s.status === "CONNECTED" ? "font-semibold text-emerald-700" : s.status === "LOGGED_OUT" ? "text-rose-600" : "text-slate-500")}>
                  {s.status === "CONNECTED" ? `+${s.phone}` : s.status.toLowerCase().replace("_", " ")}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Webhook log                                                         */
/* ------------------------------------------------------------------ */

const TONE: Record<string, "emerald" | "slate" | "rose" | "brand"> = { PROCESSED: "emerald", DUPLICATE: "slate", FAILED: "rose", RECEIVED: "brand" };

export function WebhooksScreen() {
  const qc = useQueryClient();
  const canReplay = useCan("webhooks.replay");
  const [status, setStatus] = useState("");
  const [payload, setPayload] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const q = useInfiniteQuery({
    queryKey: ["webhooks", status],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => get<any>("/meta/events", { status: status || undefined, page: pageParam, limit: 20 }),
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  });
  const events = q.data?.pages.flatMap((p) => p.events) || [];
  const summary = q.data?.pages[0]?.last24h || {};

  async function replay(id: string) {
    setBusy(id);
    try {
      const r = await post<any>(`/meta/events/${id}/replay`);
      toast.success(r.duplicate ? "Replayed · lead already existed" : "Replayed · lead created");
      qc.invalidateQueries({ queryKey: ["webhooks"] });
    } catch (e: any) {
      toast.error("Replay failed", e?.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen back title="Webhook log" subtitle="Stored before processing · failures retry automatically" refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {["", "FAILED", "PROCESSED", "DUPLICATE"].map((s) => (
          <Chip key={s || "all"} label={s ? `${s.toLowerCase()} · ${summary[s] || 0}` : "All"} active={status === s} onPress={() => setStatus(s)} />
        ))}
      </ScrollView>
      <View className="mt-3">
        {q.isLoading ? <ListSkeleton /> : null}
        {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
        {q.data && !events.length ? <EmptyState title="No events" /> : null}
        {events.map((e: any) => (
          <Card key={e._id} className="mb-2">
            <View className="flex-row items-center gap-2">
              <Badge tone={TONE[e.status] || "slate"}>{e.status}</Badge>
              <Muted className="text-xs">{e.source} · {timeAgo(e.createdAt)} · {e.attempts} attempt{e.attempts === 1 ? "" : "s"}</Muted>
            </View>
            <Text className="mt-1.5 text-[13px] text-slate-700 dark:text-slate-300">Leadgen {e.leadgenId || "—"}</Text>
            {e.lead ? (
              <Pressable onPress={() => router.push(`/leads/${e.lead._id}`)}>
                <Text className="mt-0.5 text-[13px] font-semibold text-brand-600">{e.lead.name} →</Text>
              </Pressable>
            ) : e.error ? (
              <Text className="mt-0.5 text-[12px] text-rose-600" numberOfLines={2}>{e.error}</Text>
            ) : null}
            {canReplay ? (
              <View className="mt-2 flex-row gap-2">
                <Button title="Payload" size="sm" variant="secondary" icon={<Eye size={13} color="#475569" />} onPress={async () => setPayload((await get<any>(`/meta/events/${e._id}`)).event)} />
                {e.status === "FAILED" ? <Button title="Replay" size="sm" loading={busy === e._id} icon={<RotateCcw size={13} color="#fff" />} onPress={() => replay(e._id)} /> : null}
              </View>
            ) : null}
          </Card>
        ))}
        {q.hasNextPage ? <Button title="Load more" variant="ghost" loading={q.isFetchingNextPage} onPress={() => q.fetchNextPage()} /> : null}
      </View>
      <Sheet visible={Boolean(payload)} onClose={() => setPayload(null)} full title="Webhook payload" subtitle={payload ? formatDateTime(payload.createdAt) : undefined}>
        <ScrollView horizontal>
          <Text selectable className="rounded-xl bg-slate-950 p-3 font-mono text-[11px] leading-4 text-emerald-200">{payload ? JSON.stringify(payload.payload, null, 2) : ""}</Text>
        </ScrollView>
      </Sheet>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Integrations setup (Meta & LeadSync)                               */
/* ------------------------------------------------------------------ */

const LEADSYNC_TEMPLATE_JSON = `{
  "lead_id": "{{lead_id}}",
  "name": "{{full_name}}",
  "email": "{{email}}",
  "phone": "{{phone_number}}",
  "page_id": "{{page_id}}",
  "page_name": "{{page_name}}",
  "form_id": "{{form_id}}",
  "form_name": "{{form_name}}",
  "campaign_id": "{{campaign_id}}",
  "campaign_name": "{{campaign_name}}",
  "ad_id": "{{ad_id}}",
  "ad_name": "{{ad_name}}",
  "created_time": "{{created_time}}",
  "form_data": {
    "budget": "{{budget}}",
    "city": "{{city}}",
    "preferred_bhk": "{{preferred_bhk}}",
    "requirement": "{{requirement}}"
  }
}`;

export function MetaSetupScreen() {
  const { c } = useTheme();
  const [tab, setTab] = useState<"meta" | "leadsync">("meta");

  // Meta Form state
  const [metaForm, setMetaForm] = useState({ name: "Demo Meta Lead", email: "lead@example.com", phone: "+91 98765 00000", pageId: "", formId: "" });
  const [busyMeta, setBusyMeta] = useState(false);
  const metaWebhook = `${API_URL}/meta/webhook`;

  // LeadSync Form state
  const [lsForm, setLsForm] = useState({
    name: "Demo LeadSync Lead",
    email: "leadsync@example.com",
    phone: "+91 98765 43210",
    campaign: "LeadSync Campaign",
    pageId: "",
    formId: "",
    budget: "₹50L - ₹75L",
    city: "Mumbai",
  });
  const [busyLs, setBusyLs] = useState(false);
  const leadsyncWebhook = `${API_URL}/leadsync/webhook`;

  async function testMeta() {
    setBusyMeta(true);
    try {
      const r = await post<any>("/meta/test-lead", {
        name: metaForm.name,
        email: metaForm.email,
        phone: metaForm.phone,
        campaign: "Demo Meta Campaign",
        page_id: metaForm.pageId.trim() || undefined,
        form_id: metaForm.formId.trim() || undefined,
      });
      toast.success(r.duplicate ? "Duplicate lead" : "Test lead created", r.lead?.name);
      if (r.lead?._id) router.push(`/leads/${r.lead._id}`);
    } catch (e: any) {
      toast.error("Test failed", e?.message);
    } finally {
      setBusyMeta(false);
    }
  }

  async function testLeadSync() {
    setBusyLs(true);
    try {
      const r = await post<any>("/leadsync/test-lead", {
        name: lsForm.name,
        email: lsForm.email,
        phone: lsForm.phone,
        campaign_name: lsForm.campaign,
        page_id: lsForm.pageId.trim() || undefined,
        form_id: lsForm.formId.trim() || undefined,
        form_data: {
          budget: lsForm.budget,
          city: lsForm.city,
        },
      });
      toast.success(r.duplicate ? "Duplicate lead handled" : "LeadSync test lead created", r.lead?.name || lsForm.name);
      if (r.lead?._id) router.push(`/leads/${r.lead._id}`);
    } catch (e: any) {
      toast.error("LeadSync test failed", e?.message);
    } finally {
      setBusyLs(false);
    }
  }

  return (
    <Screen back title="Integrations & Webhooks" subtitle="Configure Meta or LeadSync Webhook ingest">
      <Segmented
        value={tab}
        onChange={(v) => setTab(v)}
        options={[
          { value: "meta", label: "Meta Webhook" },
          { value: "leadsync", label: "LeadSync Webhook API" },
        ]}
      />

      {tab === "meta" ? (
        <View className="mt-4">
          <SectionTitle>Meta Webhook Callback URL</SectionTitle>
          <Card>
            <Text selectable className="font-mono text-[13px] text-slate-800 dark:text-slate-200">{metaWebhook}</Text>
            <Button
              title="Copy URL"
              size="sm"
              variant="secondary"
              className="mt-3 self-start"
              icon={<Copy size={14} color={c.text} />}
              onPress={async () => {
                await Clipboard.setStringAsync(metaWebhook);
                toast.success("Webhook URL copied");
              }}
            />
            <Muted className="mt-3 text-xs">Verify token and app secret are verified server-side. Map Page ID & Form ID under each Project in Businesses to route leads automatically.</Muted>
          </Card>

          <SectionTitle>Send Meta Test Lead</SectionTitle>
          <Field label="Name" value={metaForm.name} onChangeText={(v) => setMetaForm((f) => ({ ...f, name: v }))} />
          <Field label="Email" value={metaForm.email} onChangeText={(v) => setMetaForm((f) => ({ ...f, email: v }))} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Phone" value={metaForm.phone} onChangeText={(v) => setMetaForm((f) => ({ ...f, phone: v }))} keyboardType="phone-pad" />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Field label="Page ID (Optional)" placeholder="e.g. 104928374" value={metaForm.pageId} onChangeText={(v) => setMetaForm((f) => ({ ...f, pageId: v }))} keyboardType="number-pad" />
            </View>
            <View className="flex-1">
              <Field label="Form ID (Optional)" placeholder="e.g. 892019283" value={metaForm.formId} onChangeText={(v) => setMetaForm((f) => ({ ...f, formId: v }))} keyboardType="number-pad" />
            </View>
          </View>
          <Button title="Create Meta test lead" full loading={busyMeta} icon={<FlaskConical size={16} color="#fff" />} onPress={testMeta} />
        </View>
      ) : (
        <View className="mt-4">
          <SectionTitle>LeadSync Webhook URL</SectionTitle>
          <Card>
            <Text selectable className="font-mono text-[13px] text-slate-800 dark:text-slate-200">{leadsyncWebhook}</Text>
            <View className="mt-3 flex-row gap-2">
              <Button
                title="Copy Webhook URL"
                size="sm"
                variant="secondary"
                icon={<Copy size={14} color={c.text} />}
                onPress={async () => {
                  await Clipboard.setStringAsync(leadsyncWebhook);
                  toast.success("LeadSync URL copied");
                }}
              />
            </View>
          </Card>

          <SectionTitle>LeadSync Header Authentication</SectionTitle>
          <Card>
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-xs font-semibold uppercase text-slate-500">Header Name</Text>
                <Text selectable className="font-mono text-sm font-bold text-slate-900 dark:text-white">x-leadsync-secret</Text>
              </View>
              <Button
                title="Copy Header"
                size="sm"
                variant="secondary"
                icon={<Copy size={13} color={c.text} />}
                onPress={async () => {
                  await Clipboard.setStringAsync("x-leadsync-secret");
                  toast.success("Header name copied");
                }}
              />
            </View>
            <Muted className="mt-2 text-xs">Configure the secret matching your server's LEADSYNC_WEBHOOK_SECRET environment variable.</Muted>
          </Card>

          <SectionTitle>LeadSync JSON Payload Template</SectionTitle>
          <Card>
            <Muted className="mb-2 text-xs">Paste this JSON into your LeadSync custom webhook payload setting. Variables in double braces will be auto-replaced by LeadSync.</Muted>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="rounded-xl bg-slate-950 p-3">
              <Text selectable className="font-mono text-[11px] leading-4 text-emerald-300">
                {LEADSYNC_TEMPLATE_JSON}
              </Text>
            </ScrollView>
            <Button
              title="Copy JSON Template"
              size="sm"
              variant="secondary"
              className="mt-3 self-start"
              icon={<Copy size={14} color={c.text} />}
              onPress={async () => {
                await Clipboard.setStringAsync(LEADSYNC_TEMPLATE_JSON);
                toast.success("JSON template copied");
              }}
            />
          </Card>

          <SectionTitle>Send LeadSync Test Lead</SectionTitle>
          <Field label="Name" value={lsForm.name} onChangeText={(v) => setLsForm((f) => ({ ...f, name: v }))} />
          <Field label="Email" value={lsForm.email} onChangeText={(v) => setLsForm((f) => ({ ...f, email: v }))} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Phone" value={lsForm.phone} onChangeText={(v) => setLsForm((f) => ({ ...f, phone: v }))} keyboardType="phone-pad" />
          <Field label="Campaign" value={lsForm.campaign} onChangeText={(v) => setLsForm((f) => ({ ...f, campaign: v }))} />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Field label="Page ID (Optional)" placeholder="e.g. 104928374" value={lsForm.pageId} onChangeText={(v) => setLsForm((f) => ({ ...f, pageId: v }))} keyboardType="number-pad" />
            </View>
            <View className="flex-1">
              <Field label="Form ID (Optional)" placeholder="e.g. 892019283" value={lsForm.formId} onChangeText={(v) => setLsForm((f) => ({ ...f, formId: v }))} keyboardType="number-pad" />
            </View>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Field label="Budget" value={lsForm.budget} onChangeText={(v) => setLsForm((f) => ({ ...f, budget: v }))} />
            </View>
            <View className="flex-1">
              <Field label="City" value={lsForm.city} onChangeText={(v) => setLsForm((f) => ({ ...f, city: v }))} />
            </View>
          </View>
          <Button title="Create LeadSync test lead" full loading={busyLs} icon={<FlaskConical size={16} color="#fff" />} onPress={testLeadSync} />
        </View>
      )}
    </Screen>
  );
}
