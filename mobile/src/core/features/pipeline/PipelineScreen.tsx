import { useState } from "react";
import { Dimensions, FlatList, Pressable, ScrollView, Text, View, RefreshControl } from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { ArrowRightLeft, CalendarClock } from "lucide-react-native";
import { get } from "../../api/client";
import { sendOrQueue } from "../../query";
import { ErrorState, Loading, ScoreChip, cx } from "../../ui";
import { useTheme } from "../../ui/theme";
import { toast } from "../../ui/toast";
import { STATUS_STYLE, inr, statusLabel, timeAgo } from "../../lib/leadMeta";
import { StatusSheet } from "../leads/sheets";

const COL_W = Math.min(300, Dimensions.get("window").width * 0.8);

/**
 * Kanban pipeline. On phones, drag-and-drop across a horizontal scroll is
 * error-prone, so long-press a card (or tap ⇄) to choose the destination stage.
 */
export default function PipelineScreen() {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["board"], queryFn: () => get<{ columns: { status: string; total: number; leads: any[] }[] }>("/leads/board", { perColumn: 40 }) });
  const [moving, setMoving] = useState<any | null>(null);

  async function move(lead: any, payload: { status: string; lostReason?: string; dealValue?: number }) {
    // Optimistic update
    qc.setQueryData(["board"], (old: any) => {
      if (!old) return old;
      const cols = old.columns.map((col: any) => ({ ...col, leads: col.leads.filter((l: any) => l._id !== lead._id), total: col.leads.some((l: any) => l._id === lead._id) ? col.total - 1 : col.total }));
      return { columns: cols.map((col: any) => (col.status === payload.status ? { ...col, total: col.total + 1, leads: [{ ...lead, status: payload.status }, ...col.leads] } : col)) };
    });
    const r = await sendOrQueue(`Status · ${lead.name}`, `/leads/${lead._id}/status`, "PATCH", payload);
    toast.success(r === "queued" ? "Saved offline" : `Moved to ${statusLabel(payload.status)}`);
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["lead", lead._id] });
  }

  if (q.isLoading) return <View className="flex-1 bg-slate-50 dark:bg-[#0B1120]" style={{ paddingTop: insets.top }}><Loading /></View>;
  if (q.error && !q.data) return <View className="flex-1 bg-slate-50 dark:bg-[#0B1120]" style={{ paddingTop: insets.top + 40 }}><ErrorState error={q.error} onRetry={() => q.refetch()} /></View>;

  const cols = q.data?.columns || [];
  const open = cols.filter((x) => !["WON", "LOST", "NOT_INTERESTED"].includes(x.status)).reduce((a, x) => a + x.total, 0);

  return (
    <View className="flex-1 bg-slate-50 dark:bg-[#0B1120]" style={{ paddingTop: insets.top + 8 }}>
      <View className="px-4 pb-3">
        <Text accessibilityRole="header" className="text-[28px] font-bold leading-9 text-slate-900 dark:text-white">Pipeline</Text>
        <Text className="text-[13px] text-slate-500">{open} open leads · tap Move or a card to manage stage</Text>
      </View>
      <ScrollView
        horizontal
        decelerationRate="fast"
        snapToInterval={COL_W + 12}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 124 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={c.brand} />}
      >
        {cols.map((col) => {
          const st = STATUS_STYLE[col.status];
          return (
            <View key={col.status} style={{ width: COL_W }} className="mr-3 rounded-2xl bg-slate-200/50 dark:bg-slate-900/60">
              <View className="flex-row items-center justify-between px-3 py-3">
                <View className="flex-row items-center gap-2">
                  <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: st.dot }} />
                  <Text className="text-[14px] font-bold text-slate-800 dark:text-slate-100">{statusLabel(col.status)}</Text>
                </View>
                <View className="rounded-full bg-white px-2 py-0.5 dark:bg-slate-800">
                  <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">{col.total}</Text>
                </View>
              </View>
              <FlatList
                data={col.leads}
                keyExtractor={(l) => l._id}
                scrollEnabled
                nestedScrollEnabled
                contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 8 }}
                ListEmptyComponent={<Text className="py-8 text-center text-xs text-slate-400">No leads</Text>}
                renderItem={({ item: l }) => (
                  <Pressable
                    onPress={() => router.push(`/leads/${l._id}`)}
                    onLongPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
                      setMoving(l);
                    }}
                    accessibilityRole="button"
                    accessibilityHint="Long press to move to another stage"
                    className="mb-2 rounded-xl border border-slate-200 bg-white p-3 active:opacity-80 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <View className="flex-row items-start justify-between gap-2">
                      <Text className="flex-1 text-[15px] font-semibold text-slate-900 dark:text-white" numberOfLines={1}>{l.name}</Text>
                      <ScoreChip score={l.score} />
                    </View>
                    <Text className="mt-0.5 text-[12px] text-slate-500" numberOfLines={1}>{l.businessProject?.name || "Unmapped"}</Text>
                    {l.nextFollowUpAt ? (
                      <View className="mt-1.5 flex-row items-center gap-1">
                        <CalendarClock size={12} color={new Date(l.nextFollowUpAt) < new Date() ? "#E11D48" : c.muted} />
                        <Text className={cx("text-[11px]", new Date(l.nextFollowUpAt) < new Date() ? "font-semibold text-rose-600" : "text-slate-500")}>
                          {new Date(l.nextFollowUpAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </Text>
                      </View>
                    ) : null}
                    {col.status === "WON" && l.dealValue ? <Text className="mt-1 text-[12px] font-semibold text-emerald-700">{inr(l.dealValue)}</Text> : null}
                    <View className="mt-2.5 flex-row items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                      <Text className="flex-1 text-[11px] text-slate-400" numberOfLines={1}>{l.assignedTo?.name || "Unassigned"} · {timeAgo(l.createdAt)}</Text>
                      <Pressable
                        onPress={() => setMoving(l)}
                        hitSlop={8}
                        accessibilityLabel={`Move ${l.name}`}
                        className="flex-row items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 dark:bg-slate-800"
                      >
                        <ArrowRightLeft size={12} color={c.brand} />
                        <Text className="text-[11px] font-semibold text-brand-600 dark:text-brand-300">Move</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                )}
              />
            </View>
          );
        })}
      </ScrollView>
      <StatusSheet visible={Boolean(moving)} current={moving?.status} onClose={() => setMoving(null)} onConfirm={(p) => move(moving, p)} />
    </View>
  );
}
