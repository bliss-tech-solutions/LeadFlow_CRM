import { Pressable, Text, View, RefreshControl } from "react-native";
import { router } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlarmClock, AtSign, Bell, CheckCheck, PhoneCall, Timer, UserPlus } from "lucide-react-native";
import { get, patch } from "../../api/client";
import { Button, EmptyState, ErrorState, IconButton, ListSkeleton, cx } from "../../ui";
import { useTheme } from "../../ui/theme";
import { timeAgo } from "../../lib/leadMeta";
import { ChevronLeft } from "lucide-react-native";

function iconFor(type: string) {
  if (type.includes("LEAD")) return { Icon: UserPlus, color: "#4F46E5" };
  if (type.startsWith("FOLLOWUP")) return { Icon: AlarmClock, color: "#D97706" };
  if (type.startsWith("SLA")) return { Icon: Timer, color: "#E11D48" };
  if (type === "MENTION") return { Icon: AtSign, color: "#8B5CF6" };
  if (type === "CALL_LOGGED") return { Icon: PhoneCall, color: "#0EA5E9" };
  return { Icon: Bell, color: "#64748B" };
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ["notifications", "list"],
    initialPageParam: "" as string,
    queryFn: ({ pageParam }) => get<{ notifications: any[]; unreadCount: number; nextCursor: string | null }>("/notifications", { cursor: pageParam || undefined, limit: 30 }),
    getNextPageParam: (last) => last.nextCursor || undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.notifications) || [];
  const unread = q.data?.pages[0]?.unreadCount || 0;

  async function open(n: any) {
    if (!n.readAt) {
      patch(`/notifications/${n._id}/read`).then(() => qc.invalidateQueries({ queryKey: ["notifications"] })).catch(() => undefined);
    }
    if (n.entityType === "Lead" && n.entityId) router.push(`/leads/${n.entityId}`);
  }

  async function readAll() {
    await patch("/notifications/read-all").catch(() => undefined);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <View className="flex-1 bg-slate-50 dark:bg-[#0B1120]" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-1 px-2 pb-2">
        <IconButton icon={<ChevronLeft size={26} color={c.text} />} label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        <Text className="flex-1 text-xl font-bold text-slate-900 dark:text-white">Notifications</Text>
        {unread ? <Button title="Mark all read" variant="ghost" size="sm" icon={<CheckCheck size={16} color="#4F46E5" />} onPress={readAll} /> : null}
      </View>
      {q.isLoading ? (
        <View className="px-4"><ListSkeleton /></View>
      ) : q.error && !items.length ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(n) => n._id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 124 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} tintColor={c.brand} />}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          ListEmptyComponent={<EmptyState title="You're all caught up" message="New leads, reminders and mentions will show up here." icon={<Bell size={28} color={c.faint} />} />}
          renderItem={({ item: n }) => {
            const { Icon, color } = iconFor(String(n.type));
            return (
              <Pressable onPress={() => open(n)} accessibilityRole="button" className={cx("mb-2 flex-row gap-3 rounded-2xl border p-3.5 active:opacity-80", n.readAt ? "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" : "border-brand-200 bg-brand-50 dark:border-brand-900 dark:bg-brand-900/40")}>
                <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}1A` }}>
                  <Icon size={18} color={color} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="flex-1 text-[14px] font-semibold text-slate-900 dark:text-white" numberOfLines={1}>{n.title}</Text>
                    <Text className="text-[11px] text-slate-400">{timeAgo(n.createdAt)}</Text>
                  </View>
                  <Text className="mt-0.5 text-[13px] leading-5 text-slate-600 dark:text-slate-300" numberOfLines={3}>{n.message}</Text>
                </View>
                {!n.readAt ? <View className="mt-1.5 h-2 w-2 rounded-full bg-brand-600" /> : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
