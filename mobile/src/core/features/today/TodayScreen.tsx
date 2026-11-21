import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Bell, CalendarCheck2, CheckCircle2, Inbox, Phone, PhoneCall, Timer, Trophy } from "lucide-react-native";
import { get, patch } from "../../api/client";
import { useAuth } from "../../auth/store";
import { useCan } from "../../auth/permissions";
import { Avatar, Card, EmptyState, ErrorState, IconButton, Muted, Screen, ScoreChip, SectionTitle, Skeleton, Stat } from "../../ui";
import { useTheme } from "../../ui/theme";
import { toast } from "../../ui/toast";
import { timeAgo } from "../../lib/leadMeta";
import { startCall } from "../calls/callFlow";
import { openWhatsApp } from "../whatsapp/Composer";
import { WhatsAppGlyph } from "../whatsapp/WhatsAppGlyph";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function NotificationBell() {
  const { c } = useTheme();
  const q = useQuery({ queryKey: ["notifications", "count"], queryFn: () => get<{ unreadCount: number }>("/notifications", { limit: 1 }), refetchInterval: 60_000 });
  const n = q.data?.unreadCount || 0;
  return (
    <IconButton
      label={`Notifications${n ? `, ${n} unread` : ""}`}
      onPress={() => router.push("/notifications")}
      icon={
        <View>
          <Bell size={22} color={c.text} />
          {n ? (
            <View className="absolute -right-1.5 -top-1.5 min-w-[16px] items-center rounded-full bg-rose-600 px-1">
              <Text className="text-[10px] font-bold text-white">{n > 99 ? "99+" : n}</Text>
            </View>
          ) : null}
        </View>
      }
    />
  );
}

/** "Today": the daily focus list for salespeople and owners. */
export default function TodayScreen() {
  const user = useAuth((s) => s.user);
  const { c } = useTheme();
  const qc = useQueryClient();
  const canWhatsApp = useCan("whatsapp.send");
  const q = useQuery({ queryKey: ["my-day"], queryFn: () => get<any>("/leads/my-day") });
  const s = q.data?.stats;

  async function done(id: string) {
    try {
      await patch(`/followups/${id}/complete`, {});
      toast.success("Follow-up done");
      qc.invalidateQueries({ queryKey: ["my-day"] });
    } catch (e: any) {
      toast.error("Couldn't complete", e?.message);
    }
  }

  const FollowRow = ({ f, overdue }: { f: any; overdue?: boolean }) => (
    <Card className="mb-2 flex-row items-center gap-3" onPress={() => router.push(`/leads/${f.lead?._id}`)}>
      <View className="w-14 items-center">
        <Text className={overdue ? "text-[13px] font-bold text-rose-600" : "text-[13px] font-bold text-slate-900 dark:text-white"}>
          {new Date(f.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
        {overdue ? <Text className="text-[10px] text-rose-500">{timeAgo(f.scheduledAt)}</Text> : null}
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-slate-900 dark:text-white" numberOfLines={1}>{f.lead?.name || "Lead"}</Text>
        <Muted>{String(f.type).toLowerCase()}{f.notes ? ` · ${f.notes}` : ""}</Muted>
      </View>
      {f.lead?.phone ? <IconButton tone="brand" icon={<Phone size={18} color="#4F46E5" />} label="Call" onPress={() => startCall(f.lead)} /> : null}
      <IconButton icon={<CheckCircle2 size={22} color="#16A34A" />} label="Mark done" onPress={() => done(f._id)} />
    </Card>
  );

  return (
    <Screen title={`${greeting()}, ${user?.name?.split(" ")[0] || ""}`} subtitle="Clear the red items first." right={<NotificationBell />} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {q.error && !q.data ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}

      <View className="mt-1 flex-row gap-2.5">
        <Stat label="Overdue" value={s?.overdueCount ?? (q.isLoading ? "…" : 0)} icon={<AlarmClock size={16} color="#E11D48" />} tone="#E11D48" />
        <Stat label="Due today" value={s?.todayCount ?? (q.isLoading ? "…" : 0)} icon={<CalendarCheck2 size={16} color="#D97706" />} tone="#D97706" />
        <Stat label="New, uncalled" value={s?.uncontactedCount ?? (q.isLoading ? "…" : 0)} icon={<Inbox size={16} color="#0EA5E9" />} tone="#0EA5E9" onPress={() => router.push("/leads")} />
      </View>
      <View className="mt-2.5 flex-row gap-2.5">
        <Stat label={`Past ${s?.slaMinutes ?? 15}-min SLA`} value={s?.slaBreached ?? "–"} icon={<Timer size={16} color="#8B5CF6" />} tone="#8B5CF6" />
        <Stat label="Calls today" value={s?.callsToday ?? "–"} icon={<PhoneCall size={16} color="#4F46E5" />} />
        <Stat label="Won this month" value={s?.wonThisMonth ?? "–"} icon={<Trophy size={16} color="#16A34A" />} tone="#16A34A" />
      </View>

      {q.isLoading ? (
        <View className="mt-6 gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </View>
      ) : null}

      {q.data?.overdue?.length ? (
        <>
          <SectionTitle>Overdue</SectionTitle>
          {q.data.overdue.map((f: any) => <FollowRow key={f._id} f={f} overdue />)}
        </>
      ) : null}

      {q.data?.today?.length ? (
        <>
          <SectionTitle>Later today</SectionTitle>
          {q.data.today.map((f: any) => <FollowRow key={f._id} f={f} />)}
        </>
      ) : null}

      <SectionTitle right={<Pressable onPress={() => router.push("/leads")}><Text className="text-[13px] font-semibold text-brand-600">All leads</Text></Pressable>}>
        Waiting for first contact
      </SectionTitle>
      {q.data && !q.data.uncontacted?.length ? <EmptyState title="All caught up" message="Every new lead has been contacted. 🎉" icon={<CheckCircle2 size={28} color="#16A34A" />} /> : null}
      {q.data?.uncontacted?.map((l: any) => {
        const late = (Date.now() - new Date(l.createdAt).getTime()) / 60000 > (s?.slaMinutes ?? 15);
        return (
          <Card key={l._id} className="mb-2 flex-row items-center gap-3" onPress={() => router.push(`/leads/${l._id}`)}>
            <Avatar name={l.name} size={40} />
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-slate-900 dark:text-white" numberOfLines={1}>{l.name}</Text>
              <Text className={late ? "text-[13px] font-medium text-rose-600" : "text-[13px] text-slate-500"} numberOfLines={1}>
                {l.businessProject?.name || "Unmapped"} · {timeAgo(l.createdAt)}
              </Text>
            </View>
            <ScoreChip score={l.score} />
            {l.phone ? <IconButton tone="brand" icon={<Phone size={18} color="#4F46E5" />} label={`Call ${l.name}`} onPress={() => startCall(l)} /> : null}
            {canWhatsApp && l.phone ? <IconButton tone="whatsapp" icon={<WhatsAppGlyph size={18} color="#059669" />} label={`WhatsApp ${l.name}`} onPress={() => openWhatsApp(l._id)} /> : null}
          </Card>
        );
      })}
    </Screen>
  );
}
