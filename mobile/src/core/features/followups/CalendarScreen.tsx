import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  Building2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Phone,
  RotateCcw,
  X,
  XCircle,
} from "lucide-react-native";
import { get, patch } from "../../api/client";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  ListSkeleton,
  Muted,
  Screen,
  SelectSheet,
  cx,
} from "../../ui";
import { useTheme } from "../../ui/theme";
import { toast } from "../../ui/toast";
import { startCall } from "../calls/callFlow";
import { openWhatsApp } from "../whatsapp/Composer";
import { WhatsAppGlyph } from "../whatsapp/WhatsAppGlyph";
import { useCan } from "../../auth/permissions";

const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * CalendarScreen: Matches the LeadFlow CRM website calendar UI.
 * Features:
 * - Month navigation (Prev, Next, Today jump button)
 * - Project filter dropdown with Building2 icon
 * - Top summary KPI cards (Today's follow-ups, This month, Selected day)
 * - 7-day monthly grid with date badges showing follow-up counts
 * - Selected day agenda below with rich lead cards and quick actions
 *   (Call, WhatsApp, Reschedule, Complete, Cancel).
 */
export default function CalendarScreen() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const canWhatsApp = useCan("whatsapp.send");

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [selected, setSelected] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [selectedProject, setSelectedProject] = useState("");
  const [projectSheetOpen, setProjectSheetOpen] = useState(false);
  const [reschedule, setReschedule] = useState<{ id: string; date: Date; mode: "date" | "time" } | null>(null);

  // Projects list for dropdown
  const projectsQuery = useQuery({
    queryKey: ["calendar-projects-filter"],
    queryFn: () => get<{ projects: any[] }>("/business-projects", { limit: 100 }),
    staleTime: 5 * 60_000,
  });
  const projectList = projectsQuery.data?.projects || [];

  // Query events for the month
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);

  const calQuery = useQuery({
    queryKey: ["calendar", "month", start.toISOString(), selectedProject],
    queryFn: () => {
      const params: Record<string, string> = {
        start: start.toISOString(),
        end: end.toISOString(),
      };
      if (selectedProject) params.businessProject = selectedProject;
      return get<{ events: any[] }>("/followups/calendar", params);
    },
  });

  const byDay = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const e of calQuery.data?.events || []) {
      if (e.status === "CANCELLED") continue;
      const k = key(new Date(e.scheduledAt));
      m.set(k, [...(m.get(k) || []), e]);
    }
    return m;
  }, [calQuery.data]);

  // Calendar Grid Cells (Monday-first)
  const leadDays = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(leadDays).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  while (cells.length % 7) cells.push(null);

  const todayKeyStr = key(new Date());
  const selectedKeyStr = key(selected);
  const todayEvents = byDay.get(todayKeyStr) || [];
  const selectedDayEvents = (byDay.get(selectedKeyStr) || []).sort(
    (a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt),
  );
  const totalMonthEvents = [...byDay.values()].reduce((acc, v) => acc + v.length, 0);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["calendar"] });
    qc.invalidateQueries({ queryKey: ["followups"] });
    qc.invalidateQueries({ queryKey: ["my-day"] });
  };

  async function handleDone(id: string) {
    try {
      await patch(`/followups/${id}/complete`, {});
      toast.success("Follow-up completed");
      refreshAll();
    } catch (e: any) {
      toast.error("Couldn't complete", e?.message);
    }
  }

  async function handleCancel(id: string) {
    try {
      await patch(`/followups/${id}/cancel`, { reason: "Cancelled from calendar" });
      toast.success("Follow-up cancelled");
      refreshAll();
    } catch (e: any) {
      toast.error("Couldn't cancel", e?.message);
    }
  }

  async function handleDoReschedule(id: string, date: Date) {
    try {
      await patch(`/followups/${id}/reschedule`, { scheduledAt: date.toISOString() });
      toast.success("Rescheduled", date.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }));
      refreshAll();
    } catch (e: any) {
      toast.error("Couldn't reschedule", e?.message);
    }
  }

  function goToToday() {
    const now = new Date();
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    setSelected(d);
  }

  const selectedProjectObj = projectList.find((p) => p._id === selectedProject);

  return (
    <Screen
      title="Calendar"
      subtitle={`${month.toLocaleDateString(undefined, { month: "long", year: "numeric" })} · ${totalMonthEvents} follow-ups`}
    >
      {/* 1. Project Filter Pill with Building2 Icon */}
      <View className="mb-3 flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filter by Project"
          onPress={() => setProjectSheetOpen(true)}
          className={cx(
            "flex-row items-center gap-1.5 rounded-full border px-3.5 py-1.5",
            selectedProject
              ? "border-brand-500 bg-brand-50 dark:border-brand-600 dark:bg-brand-950"
              : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
          )}
        >
          <Building2 size={15} color={selectedProject ? "#4F46E5" : c.faint} />
          <Text
            className={cx(
              "text-[12px] font-semibold",
              selectedProject ? "text-brand-700 dark:text-brand-200" : "text-slate-700 dark:text-slate-300",
            )}
            numberOfLines={1}
          >
            {selectedProjectObj ? `Project: ${selectedProjectObj.name}` : "All Projects"}
          </Text>
          {selectedProject ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                setSelectedProject("");
              }}
              hitSlop={8}
              className="ml-1"
            >
              <X size={13} color="#4F46E5" />
            </Pressable>
          ) : (
            <Text className="text-slate-400">▾</Text>
          )}
        </Pressable>

        {/* Today Button */}
        <TouchableOpacity
          onPress={goToToday}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 active:bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
        >
          <Text className="text-xs font-semibold text-brand-600 dark:text-brand-300">Today</Text>
        </TouchableOpacity>
      </View>

      {/* 2. Top Summary KPI Cards (Website Parity) */}
      <View className="mb-3.5 flex-row gap-2.5">
        <View className="flex-1 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3 dark:border-indigo-900 dark:bg-indigo-950/40">
          <Text className="text-[11px] font-medium text-indigo-700 dark:text-indigo-300">Today's follow-ups</Text>
          <Text className="mt-1 text-2xl font-bold text-indigo-950 dark:text-indigo-100">
            {todayEvents.length}
          </Text>
        </View>

        <View className="flex-1 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
          <Text className="text-[11px] font-medium text-slate-600 dark:text-slate-400">This month</Text>
          <Text className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
            {calQuery.isLoading ? "—" : totalMonthEvents}
          </Text>
        </View>

        <View className="flex-1 rounded-2xl border border-amber-100 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <Text className="text-[11px] font-medium text-amber-700 dark:text-amber-300">Selected date</Text>
          <Text className="mt-1 text-2xl font-bold text-amber-950 dark:text-amber-100">
            {selectedDayEvents.length}
          </Text>
        </View>
      </View>

      {/* 3. Monthly Calendar Card */}
      <Card className="mb-4">
        {/* Navigation Bar */}
        <View className="mb-3 flex-row items-center justify-between">
          <IconButton
            icon={<ChevronLeft size={20} color={c.text} />}
            label="Previous month"
            onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          />
          <Text className="text-[16px] font-bold text-slate-900 dark:text-white">
            {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </Text>
          <IconButton
            icon={<ChevronRight size={20} color={c.text} />}
            label="Next month"
            onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          />
        </View>

        {/* Weekday labels */}
        <View className="flex-row border-b border-slate-100 pb-2 dark:border-slate-800">
          {WEEKDAYS.map((w) => (
            <Text key={w} className="flex-1 text-center text-[11px] font-bold text-slate-400">
              {w}
            </Text>
          ))}
        </View>

        {/* Days Grid */}
        <View className="mt-2 flex-row flex-wrap">
          {cells.map((d, i) => {
            if (!d) return <View key={`empty-${i}`} style={{ width: `${100 / 7}%` }} className="h-13" />;
            const k = key(d);
            const count = byDay.get(k)?.length || 0;
            const isSel = k === selectedKeyStr;
            const isToday = k === todayKeyStr;
            const isPast = d < new Date(new Date().setHours(0, 0, 0, 0));

            return (
              <Pressable
                key={k}
                onPress={() => setSelected(d)}
                accessibilityRole="button"
                accessibilityLabel={`${d.toDateString()}, ${count} follow-ups`}
                style={{ width: `${100 / 7}%` }}
                className="h-13 items-center justify-center py-1"
              >
                <View
                  className={cx(
                    "h-10 w-10 items-center justify-center rounded-2xl",
                    isSel
                      ? "bg-brand-600 shadow-sm"
                      : isToday
                      ? "border-2 border-brand-500 bg-brand-50 dark:bg-brand-950"
                      : "",
                  )}
                >
                  <Text
                    className={cx(
                      "text-[13px]",
                      isSel
                        ? "font-bold text-white"
                        : isToday
                        ? "font-bold text-brand-700 dark:text-brand-300"
                        : isPast
                        ? "text-slate-400"
                        : "font-semibold text-slate-800 dark:text-slate-200",
                    )}
                  >
                    {d.getDate()}
                  </Text>
                  {count > 0 ? (
                    <View
                      className={cx(
                        "absolute -right-1 -top-1 min-w-[17px] items-center rounded-full px-1",
                        isSel ? "bg-white" : "bg-amber-600",
                      )}
                    >
                      <Text className={cx("text-[9px] font-bold", isSel ? "text-brand-700" : "text-white")}>
                        {count}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* 4. Selected Day Agenda Section */}
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-[14px] font-bold text-slate-900 dark:text-white">
          {selected.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </Text>
        <Badge tone="brand">{selectedDayEvents.length} scheduled</Badge>
      </View>

      {calQuery.isLoading ? (
        <ListSkeleton rows={3} />
      ) : calQuery.error ? (
        <ErrorState error={calQuery.error} onRetry={() => calQuery.refetch()} />
      ) : !selectedDayEvents.length ? (
        <EmptyState
          title="No follow-ups for this day"
          message="Tap any date with a badge above to inspect its appointments."
          icon={<CalendarClock size={28} color={c.faint} />}
        />
      ) : (
        <View className="gap-2.5">
          {selectedDayEvents.map((f: any) => {
            const isDone = f.status === "COMPLETED";
            const overdue = f.status === "PENDING" && new Date(f.scheduledAt) < new Date();
            const lead = f.lead || {};
            const scheduledDate = new Date(f.scheduledAt);

            return (
              <Card
                key={f._id}
                className={cx("p-3.5", isDone && "opacity-70")}
                onPress={() => lead._id && router.push(`/leads/${lead._id}`)}
              >
                <View className="flex-row items-start gap-3">
                  <Avatar name={lead.name || "Lead"} size={40} />

                  <View className="flex-1">
                    <View className="flex-row items-center justify-between gap-1">
                      <Text className="text-[15px] font-semibold text-slate-900 dark:text-white" numberOfLines={1}>
                        {lead.name || "Lead"}
                      </Text>
                      <Text className={cx("text-[12px] font-bold", overdue ? "text-rose-600" : "text-slate-500")}>
                        {scheduledDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>

                    <View className="mt-0.5 flex-row items-center gap-1.5 flex-wrap">
                      {f.businessProject?.name || lead.businessProject?.name ? (
                        <View className="flex-row items-center gap-1">
                          <Building2 size={12} color="#4F46E5" />
                          <Text className="text-[12px] font-medium text-slate-600 dark:text-slate-300">
                            {f.businessProject?.name || lead.businessProject?.name}
                          </Text>
                        </View>
                      ) : null}
                      {f.user?.name ? (
                        <Text className="text-[12px] text-slate-400">· {f.user.name}</Text>
                      ) : null}
                    </View>

                    <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
                      {overdue ? <Badge tone="rose">Overdue</Badge> : isDone ? <Badge tone="emerald">Done</Badge> : null}
                      {f.type ? <Badge tone="slate">{String(f.type).toLowerCase()}</Badge> : null}
                    </View>
                  </View>
                </View>

                {f.notes ? (
                  <View className="mt-2.5 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60">
                    <Text className="text-[12px] text-slate-700 dark:text-slate-300" numberOfLines={2}>
                      💬 {f.notes}
                    </Text>
                  </View>
                ) : null}

                {!isDone && (
                  <View className="mt-3 flex-row gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                    {lead.phone ? (
                      <Pressable
                        onPress={() => startCall(lead)}
                        className="min-h-[36px] flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-brand-50 active:bg-brand-100 dark:bg-brand-900"
                      >
                        <Phone size={14} color="#4F46E5" />
                        <Text className="text-[12px] font-semibold text-brand-700 dark:text-brand-200">Call</Text>
                      </Pressable>
                    ) : null}

                    {canWhatsApp && lead.phone && lead._id ? (
                      <Pressable
                        onPress={() => openWhatsApp(lead._id)}
                        className="min-h-[36px] flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-wa-50 active:bg-wa-100 dark:bg-emerald-950"
                      >
                        <WhatsAppGlyph size={14} color="#059669" />
                        <Text className="text-[12px] font-semibold text-wa-700 dark:text-emerald-300">WhatsApp</Text>
                      </Pressable>
                    ) : null}

                    <Pressable
                      onPress={() =>
                        setReschedule({
                          id: f._id,
                          date: new Date(f.scheduledAt),
                          mode: "date",
                        })
                      }
                      className="min-h-[36px] flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-amber-50 active:bg-amber-100 dark:bg-amber-950"
                    >
                      <Clock size={14} color="#D97706" />
                      <Text className="text-[12px] font-semibold text-amber-700 dark:text-amber-300">Reschedule</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleDone(f._id)}
                      className="min-h-[36px] flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-emerald-50 active:bg-emerald-100 dark:bg-emerald-950"
                    >
                      <CheckCircle2 size={14} color="#059669" />
                      <Text className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">Done</Text>
                    </Pressable>
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      )}

      {/* Project Selector Sheet */}
      <SelectSheet
        visible={projectSheetOpen}
        onClose={() => setProjectSheetOpen(false)}
        title="Select Project"
        options={[
          { value: "", label: "All Projects" },
          ...projectList.map((p) => ({
            value: p._id,
            label: p.name,
            description: p.location || p.stage || undefined,
          })),
        ]}
        value={selectedProject}
        onSelect={(pId) => setSelectedProject(pId)}
      />

      {/* Reschedule Picker Modal */}
      {reschedule ? (
        <DateTimePicker
          value={reschedule.date}
          mode={reschedule.mode}
          minimumDate={new Date()}
          minuteInterval={15}
          onValueChange={(_e, d) => {
            if (!d) return setReschedule(null);
            if (reschedule.mode === "date") {
              setReschedule({ ...reschedule, date: d, mode: "time" });
            } else {
              const id = reschedule.id;
              setReschedule(null);
              void handleDoReschedule(id, d);
            }
          }}
          onDismiss={() => setReschedule(null)}
        />
      ) : null}
    </Screen>
  );
}
