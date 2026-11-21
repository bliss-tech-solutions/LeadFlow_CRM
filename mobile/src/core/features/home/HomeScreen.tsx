import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClock,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Inbox,
  Phone,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react-native";
import { get, patch } from "../../api/client";
import { useAuth } from "../../auth/store";
import { useCan } from "../../auth/permissions";
import { Avatar, Card, ErrorState, IconButton, Muted, Screen, ScoreChip, SectionTitle, Skeleton, Stat, StatusPill } from "../../ui";
import { useTheme } from "../../ui/theme";
import { toast } from "../../ui/toast";
import { timeAgo } from "../../lib/leadMeta";
import { startCall } from "../calls/callFlow";
import { openWhatsApp } from "../whatsapp/Composer";
import { WhatsAppGlyph } from "../whatsapp/WhatsAppGlyph";
import { NotificationBell } from "../today/TodayScreen";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function dayRange(offsetDays = 0) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offsetDays);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * Partner home: business (or personal) stats, a calendar card with today's
 * follow-ups, the next follow-ups and the latest leads.
 */
export default function HomeScreen() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const isOwner = user?.role === "BUSINESS";
  const canWhatsApp = useCan("whatsapp.send");

  const stats = useQuery({ queryKey: ["stats"], queryFn: () => get<any>("/leads/stats") });
  const day = useQuery({ queryKey: ["my-day"], queryFn: () => get<any>("/leads/my-day") });
  const latest = useQuery({ queryKey: ["leads", "latest"], queryFn: () => get<{ leads: any[] }>("/leads", { limit: 5, sort: "newest" }) });
  const week = useQuery({
    queryKey: ["calendar", "next7"],
    queryFn: () => {
      const { start } = dayRange(0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return get<{ events: any[] }>("/followups/calendar", { start: start.toISOString(), end: end.toISOString() });
    },
  });
  const projects = useQuery({ queryKey: ["projects-lite"], queryFn: () => get<{ projects: any[] }>("/business-projects", { limit: 100 }), enabled: isOwner });
  const meQuery = useQuery({ queryKey: ["me"], queryFn: () => get<any>("/auth/me") });
  const me = meQuery.data?.user;
  const businessName = me?.business?.name || (isOwner ? "Partner Business" : "Sales Workspace");

  const userName = user?.name?.trim();
  const isDuplicateName = userName && businessName && userName.toLowerCase() === businessName.toLowerCase();
  const displayName = !isDuplicateName && userName ? userName.split(" ")[0] : null;
  const greetingSubtitle = `${greeting()}`;

  const s = stats.data;
  const d = day.data?.stats;
  const pending = (week.data?.events || []).filter((e) => e.status === "PENDING").sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const today = dayRange(0);
  const todayCount = pending.filter((e) => new Date(e.scheduledAt) >= today.start && new Date(e.scheduledAt) < today.end).length;
  const upcoming = pending.filter((e) => new Date(e.scheduledAt) >= new Date()).slice(0, 5);
  const conversion = s?.total ? Math.round((s.won / s.total) * 1000) / 10 : 0;

  const refreshAll = () => {
    stats.refetch();
    day.refetch();
    latest.refetch();
    week.refetch();
    projects.refetch();
    meQuery.refetch();
  };

  async function done(id: string) {
    try {
      await patch(`/followups/${id}/complete`, {});
      toast.success("Follow-up done");
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["my-day"] });
    } catch (e: any) {
      toast.error("Couldn't complete", e?.message);
    }
  }

  // 7-day strip for the calendar card
  const strip = Array.from({ length: 7 }, (_, i) => {
    const { start, end } = dayRange(i);
    return { date: start, count: pending.filter((e) => new Date(e.scheduledAt) >= start && new Date(e.scheduledAt) < end).length };
  });

  return (
    <Screen
      headerNode={
        <View className="pr-1">
          <View className="mb-1 flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-full bg-brand-600 dark:bg-brand-400" />
            <Text className="text-[11px] font-bold tracking-wider uppercase text-brand-600 dark:text-brand-400">
              LeadFlow Partner
            </Text>
          </View>
          <Text
            className="text-[26px] font-extrabold leading-8 text-brand-600 dark:text-brand-400"
            numberOfLines={1}
          >
            {businessName}
          </Text>
          <Text className="mt-1 text-[13px] leading-4 text-slate-500 dark:text-slate-400" numberOfLines={1}>
            {greetingSubtitle}
          </Text>
        </View>
      }
      right={<NotificationBell />}
      refreshing={stats.isRefetching || day.isRefetching || meQuery.isRefetching}
      onRefresh={refreshAll}
    >
      {stats.error && !s ? <ErrorState error={stats.error} onRetry={refreshAll} /> : null}

      {/* Stats */}
      <View className="mt-2.5 flex-row gap-2.5">
        <Stat label={isOwner ? "Total leads" : "My leads"} value={s?.total ?? (stats.isLoading ? "…" : 0)} icon={<Users size={16} color="#4F46E5" />} onPress={() => router.push("/leads")} />
        <Stat label="New, not called" value={d?.uncontactedCount ?? s?.newCount ?? (day.isLoading || stats.isLoading ? "…" : 0)} icon={<Inbox size={16} color="#0EA5E9" />} tone="#0EA5E9" onPress={() => router.push("/leads?quick=uncontacted")} />
      </View>
      <View className="mt-2.5 flex-row gap-2.5">
        <Stat label="Interested" value={s?.interested ?? (stats.isLoading ? "…" : 0)} icon={<Sparkles size={16} color="#8B5CF6" />} tone="#8B5CF6" onPress={() => router.push("/leads?status=INTERESTED")} />
        <Stat label={`Won · ${conversion}%`} value={s?.won ?? (stats.isLoading ? "…" : 0)} icon={<Trophy size={16} color="#16A34A" />} tone="#16A34A" onPress={() => router.push("/leads?status=WON")} />
        <Stat label="Follow-ups" value={d?.overdueCount ?? s?.followups ?? (stats.isLoading ? "…" : 0)} icon={<AlarmClock size={16} color="#E11D48" />} tone="#E11D48" onPress={() => router.push("/followups")} />
      </View>

      {/* Calendar card */}
      <SectionTitle>Calendar</SectionTitle>
      <Card onPress={() => router.push("/calendar")}>
        <View className="flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-900">
            <CalendarDays size={24} color={c.brand} />
          </View>
          <View className="flex-1">
            <Text className="text-[16px] font-bold text-slate-900 dark:text-white">
              {week.isLoading ? "Loading…" : todayCount === 0 ? "No follow-ups today" : `${todayCount} follow-up${todayCount > 1 ? "s" : ""} today`}
            </Text>
            <Muted className="text-xs">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · tap to open the month</Muted>
          </View>
          <ChevronRight size={20} color={c.faint} />
        </View>
        <View className="mt-4 flex-row justify-between">
          {strip.map(({ date, count }, i) => (
            <View key={i} className="items-center" accessibilityLabel={`${date.toDateString()}: ${count} follow-ups`}>
              <Text className="text-[11px] text-slate-500">{date.toLocaleDateString(undefined, { weekday: "narrow" })}</Text>
              <View className={i === 0 ? "mt-1 h-9 w-9 items-center justify-center rounded-full bg-brand-600" : "mt-1 h-9 w-9 items-center justify-center rounded-full"}>
                <Text className={i === 0 ? "text-[14px] font-bold text-white" : "text-[14px] font-semibold text-slate-800 dark:text-slate-200"}>{date.getDate()}</Text>
              </View>
              <Text className={count ? "mt-1 text-[11px] font-bold text-brand-600 dark:text-brand-200" : "mt-1 text-[11px] text-slate-300 dark:text-slate-600"}>{count || "·"}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Upcoming follow-ups */}
      <SectionTitle right={<Pressable onPress={() => router.push("/followups")} hitSlop={8}><Text className="text-[13px] font-semibold text-brand-600">See all</Text></Pressable>}>
        Upcoming follow-ups
      </SectionTitle>
      {week.isLoading ? <Skeleton className="h-16" /> : null}
      {!week.isLoading && !upcoming.length ? (
        <Card className="flex-row items-center gap-3">
          <CheckCircle2 size={20} color="#16A34A" />
          <Muted>Nothing scheduled in the next 7 days.</Muted>
        </Card>
      ) : null}
      {upcoming.map((f) => (
        <Card key={f._id} className="mb-2 flex-row items-center gap-3" onPress={() => f.lead?._id && router.push(`/leads/${f.lead._id}`)}>
          <View className="w-14 items-center">
            <Text className="text-[13px] font-bold text-slate-900 dark:text-white">{new Date(f.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
            <Text className="text-[10px] text-slate-500">{new Date(f.scheduledAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-slate-900 dark:text-white" numberOfLines={1}>{f.lead?.name || "Lead"}</Text>
            <Muted className="text-xs">{String(f.type).toLowerCase()}{isOwner && f.user?.name ? ` · ${f.user.name}` : ""}</Muted>
          </View>
          {f.lead?.phone ? <IconButton tone="brand" icon={<Phone size={18} color="#4F46E5" />} label="Call" onPress={() => startCall(f.lead)} /> : null}
          <IconButton icon={<CheckCircle2 size={22} color="#16A34A" />} label="Mark done" onPress={() => done(f._id)} />
        </Card>
      ))}

      {/* Latest leads */}
      <SectionTitle right={<Pressable onPress={() => router.push("/leads")} hitSlop={8}><Text className="text-[13px] font-semibold text-brand-600">All leads</Text></Pressable>}>
        Latest leads
      </SectionTitle>
      {latest.isLoading ? <Skeleton className="h-16" /> : null}
      {latest.data && !latest.data.leads.length ? <Muted>No leads yet. New enquiries appear here instantly.</Muted> : null}
      {(latest.data?.leads || []).map((l) => (
        <Card key={l._id} className="mb-2 flex-row items-center gap-3" onPress={() => router.push(`/leads/${l._id}`)}>
          <Avatar name={l.name} size={40} />
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-slate-900 dark:text-white" numberOfLines={1}>{l.name}</Text>
            <Muted className="text-xs">{l.businessProject?.name || "Unmapped"} · {timeAgo(l.createdAt)}</Muted>
            <View className="mt-1.5 flex-row gap-1.5">
              <StatusPill status={l.status} />
              <ScoreChip score={l.score} />
            </View>
          </View>
          {l.phone ? <IconButton tone="brand" icon={<Phone size={18} color="#4F46E5" />} label={`Call ${l.name}`} onPress={() => startCall(l)} /> : null}
          {canWhatsApp && l.phone ? <IconButton tone="whatsapp" icon={<WhatsAppGlyph size={18} color="#059669" />} label={`WhatsApp ${l.name}`} onPress={() => openWhatsApp(l._id)} /> : null}
        </Card>
      ))}

      {/* Projects (owners) */}
      {isOwner && (projects.data?.projects || []).length ? (
        <>
          <SectionTitle right={<Pressable onPress={() => router.push("/projects")} hitSlop={8}><Text className="text-[13px] font-semibold text-brand-600">All projects</Text></Pressable>}>
            Your projects
          </SectionTitle>
          {(projects.data?.projects || []).slice(0, 3).map((p) => (
            <Card key={p._id} className="mb-2 flex-row items-center gap-3" onPress={() => router.push(`/projects/${p._id}`)}>
              <Building2 size={20} color={c.brand} />
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-slate-900 dark:text-white">{p.name}</Text>
                <Muted className="text-xs">{String(p.stage).toLowerCase()} · {p.location || "—"}</Muted>
              </View>
              <ChevronRight size={18} color={c.faint} />
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
