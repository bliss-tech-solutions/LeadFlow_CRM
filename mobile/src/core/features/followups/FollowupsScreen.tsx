import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  AlertOctagon,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Phone,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
  XCircle,
} from "lucide-react-native";
import { get, patch, post } from "../../api/client";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  ListSkeleton,
  Muted,
  Screen,
  SelectSheet,
  Sheet,
  StatusPill,
  cx,
} from "../../ui";
import { useTheme } from "../../ui/theme";
import { toast } from "../../ui/toast";
import { startCall } from "../calls/callFlow";
import { openWhatsApp } from "../whatsapp/Composer";
import { WhatsAppGlyph } from "../whatsapp/WhatsAppGlyph";
import { useCan } from "../../auth/permissions";

type QuickStatus = "ALL" | "PENDING" | "TODAY" | "OVERDUE" | "DONE" | "RESCHEDULED";

const STATUS_CHIPS: { key: QuickStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "TODAY", label: "Today" },
  { key: "OVERDUE", label: "Overdue" },
  { key: "DONE", label: "Done" },
  { key: "RESCHEDULED", label: "Rescheduled" },
];

const CANCEL_REASONS = [
  "Client requested cancellation",
  "Client not reachable / no answer",
  "Mark as Fake Lead",
  "Bought elsewhere / not interested",
  "Duplicate follow-up",
  "Other reason",
];

/**
 * FollowupsScreen: Shows follow-ups formatted as lead section cards
 * with search, Project filter (with Building2 icon), status chips, and quick actions
 * (Done/Complete, Reschedule, Cancel, Call, WhatsApp).
 */
export default function FollowupsScreen({ title = "Follow-ups" }: { title?: string }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const canWhatsApp = useCan("whatsapp.send");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [projectSheetOpen, setProjectSheetOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<QuickStatus>("ALL");

  // Reschedule state
  const [reschedule, setReschedule] = useState<{
    id: string;
    date: Date;
    mode: "date" | "time";
  } | null>(null);

  // Cancellation Sheet state
  const [cancelTarget, setCancelTarget] = useState<{
    id: string;
    leadId?: string;
    leadName?: string;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [markAsFakeOnCancel, setMarkAsFakeOnCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Fetch available projects for the Project filter dropdown
  const projectsQuery = useQuery({
    queryKey: ["followups-filter-projects"],
    queryFn: () => get<{ projects: any[] }>("/business-projects", { limit: 100 }),
    staleTime: 5 * 60_000,
  });
  const projectList = projectsQuery.data?.projects || [];

  // Top KPI stats
  const statsQuery = useQuery({
    queryKey: ["followups", "stats"],
    queryFn: () =>
      get<{
        pending?: number;
        completed?: number;
        overdue?: number;
        missed?: number;
        rescheduled?: number;
      }>("/followups/stats"),
  });

  // Fetch follow-ups list
  const followupsQuery = useQuery({
    queryKey: ["followups", "cards", statusFilter, selectedProject, debouncedSearch],
    queryFn: async () => {
      let apiStatus = "";
      if (statusFilter === "PENDING" || statusFilter === "TODAY" || statusFilter === "OVERDUE") {
        apiStatus = "PENDING";
      } else if (statusFilter === "DONE") {
        apiStatus = "COMPLETED";
      } else if (statusFilter === "RESCHEDULED") {
        apiStatus = "RESCHEDULED";
      }

      const params: Record<string, string> = {
        limit: "50",
      };
      if (apiStatus) params.status = apiStatus;
      if (selectedProject) params.businessProject = selectedProject;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

      const res = await get<{ followups: any[]; total: number }>("/followups", params);
      return res;
    },
  });

  const rawList = followupsQuery.data?.followups || [];

  // Filter client-side for TODAY and OVERDUE if selected
  const items = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 86400_000;

    return rawList.filter((f) => {
      const scheduledTime = new Date(f.scheduledAt).getTime();
      if (statusFilter === "TODAY") {
        return scheduledTime >= todayStart && scheduledTime < todayEnd;
      }
      if (statusFilter === "OVERDUE") {
        return f.status === "PENDING" && scheduledTime < now.getTime();
      }
      return true;
    });
  }, [rawList, statusFilter]);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["followups"] });
    qc.invalidateQueries({ queryKey: ["calendar"] });
    qc.invalidateQueries({ queryKey: ["my-day"] });
    qc.invalidateQueries({ queryKey: ["leads"] });
  };

  async function handleComplete(id: string) {
    try {
      await patch(`/followups/${id}/complete`, {});
      toast.success("Follow-up completed");
      refreshAll();
    } catch (e: any) {
      toast.error("Couldn't complete", e?.message);
    }
  }

  async function confirmCancelFollowup() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const reasonText = cancelReason.trim() || (markAsFakeOnCancel ? "Fake lead" : "Cancelled from app");
      await patch(`/followups/${cancelTarget.id}/cancel`, { reason: reasonText });

      if (markAsFakeOnCancel && cancelTarget.leadId) {
        await post(`/leads/${cancelTarget.leadId}/mark-fake`, { reason: reasonText });
        toast.success("Follow-up cancelled & lead flagged as fake");
      } else {
        toast.success("Follow-up cancelled");
      }

      setCancelTarget(null);
      setCancelReason("");
      setMarkAsFakeOnCancel(false);
      refreshAll();
    } catch (e: any) {
      toast.error("Couldn't cancel", e?.message);
    } finally {
      setCancelling(false);
    }
  }

  async function handleDoReschedule(id: string, date: Date) {
    try {
      await patch(`/followups/${id}/reschedule`, { scheduledAt: date.toISOString() });
      toast.success(
        "Rescheduled",
        date.toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      refreshAll();
    } catch (e: any) {
      toast.error("Couldn't reschedule", e?.message);
    }
  }

  const selectedProjectObj = projectList.find((p) => p._id === selectedProject);

  return (
    <Screen
      title={title}
      subtitle={
        followupsQuery.isLoading
          ? "Loading follow-ups…"
          : `${items.length} follow-up${items.length === 1 ? "" : "s"}`
      }
      scroll={false}
      padded={false}
    >
      <View className="px-4 pb-2">
        {/* Search Bar */}
        <View className="mb-2.5 min-h-[44px] flex-row items-center gap-2 rounded-xl bg-slate-200/70 px-3 dark:bg-slate-800">
          <Search size={18} color={c.muted} />
          <TextInput
            value={search}
            onChangeText={(t) => {
              setSearch(t);
              setDebouncedSearch(t);
            }}
            placeholder="Search lead name, phone, notes…"
            placeholderTextColor={c.faint}
            className="flex-1 text-[15px] text-slate-900 dark:text-white"
            returnKeyType="search"
          />
          {search ? (
            <Pressable
              onPress={() => {
                setSearch("");
                setDebouncedSearch("");
              }}
              hitSlop={10}
            >
              <X size={18} color={c.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Project Filter Pill with Building2 Icon */}
        <View className="mb-2.5 flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filter by Project"
            onPress={() => setProjectSheetOpen(true)}
            className={cx(
              "flex-row items-center gap-1.5 rounded-full border px-3 py-1.5",
              selectedProject
                ? "border-brand-500 bg-brand-50 dark:border-brand-600 dark:bg-brand-950"
                : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
            )}
          >
            <Building2 size={15} color={selectedProject ? "#4F46E5" : c.faint} />
            <Text
              className={cx(
                "text-[12px] font-semibold",
                selectedProject
                  ? "text-brand-700 dark:text-brand-200"
                  : "text-slate-700 dark:text-slate-300",
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
        </View>

        {/* Status Quick Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-1"
          contentContainerStyle={{ paddingRight: 16 }}
        >
          {STATUS_CHIPS.map((chip) => {
            const active = statusFilter === chip.key;
            return (
              <Chip
                key={chip.key}
                label={chip.label}
                active={active}
                onPress={() => setStatusFilter(chip.key)}
              />
            );
          })}
        </ScrollView>
      </View>

      {/* Follow-up Cards List (matching Leads section card styling) */}
      {followupsQuery.isLoading ? (
        <View className="px-4">
          <ListSkeleton rows={5} />
        </View>
      ) : followupsQuery.error && !items.length ? (
        <ErrorState error={followupsQuery.error} onRetry={() => followupsQuery.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          refreshControl={
            <RefreshControl
              refreshing={followupsQuery.isRefetching}
              onRefresh={() => void followupsQuery.refetch()}
              tintColor={c.brand}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={
                search || selectedProject || statusFilter !== "ALL"
                  ? "No follow-ups match"
                  : "No follow-ups scheduled"
              }
              message={
                search || selectedProject || statusFilter !== "ALL"
                  ? "Try clearing filters or search keywords."
                  : "Scheduled follow-up reminders will appear here."
              }
              icon={<CalendarClock size={28} color={c.faint} />}
              action={
                selectedProject || statusFilter !== "ALL" || search ? (
                  <Button
                    title="Clear filters"
                    variant="secondary"
                    onPress={() => {
                      setSelectedProject("");
                      setStatusFilter("ALL");
                      setSearch("");
                      setDebouncedSearch("");
                    }}
                  />
                ) : undefined
              }
            />
          }
          renderItem={({ item: f }) => {
            const lead = f.lead || {};
            const scheduledDate = new Date(f.scheduledAt);
            const isDone = f.status === "COMPLETED";
            const isCancelled = f.status === "CANCELLED";
            const isOverdue = f.status === "PENDING" && scheduledDate < new Date();
            const projectName =
              lead.businessProject?.name ||
              f.businessProject?.name ||
              selectedProjectObj?.name ||
              "";

            return (
              <Pressable
                onPress={() => lead._id && router.push(`/leads/${lead._id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${lead.name || "Lead"}, follow-up`}
                className="mb-2.5 rounded-2xl border border-slate-200 bg-white p-3.5 active:opacity-85 dark:border-slate-800 dark:bg-slate-900"
              >
                {/* Header row: Avatar, Lead Name, Scheduled Time, Badges */}
                <View className="flex-row items-start gap-3">
                  <Avatar name={lead.name || "Lead"} size={42} />

                  <View className="flex-1">
                    <View className="flex-row items-center justify-between gap-1">
                      <View className="flex-1 flex-row items-center gap-1.5 flex-wrap">
                        <Text
                          className="text-[16px] font-semibold text-slate-900 dark:text-white"
                          numberOfLines={1}
                        >
                          {lead.name || "Unnamed lead"}
                        </Text>
                        {lead.isFake ? <Badge tone="rose">🚨 Fake</Badge> : null}
                      </View>
                      <Text
                        className={cx(
                          "text-[12px] font-bold",
                          isOverdue ? "text-rose-600" : "text-slate-500",
                        )}
                      >
                        {scheduledDate.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>

                    {/* Project & Rep */}
                    <View className="mt-0.5 flex-row items-center gap-1.5 flex-wrap">
                      {projectName ? (
                        <View className="flex-row items-center gap-1">
                          <Building2 size={12} color="#4F46E5" />
                          <Text
                            className="text-[12px] font-medium text-slate-600 dark:text-slate-300"
                            numberOfLines={1}
                          >
                            {projectName}
                          </Text>
                        </View>
                      ) : null}
                      {f.user?.name ? (
                        <Text className="text-[12px] text-slate-400">
                          · Assigned: {f.user.name}
                        </Text>
                      ) : null}
                    </View>

                    {/* Date badge & Status pill */}
                    <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
                      <Badge tone={isOverdue ? "rose" : isDone ? "emerald" : "brand"}>
                        <Clock size={10} color={isOverdue ? "#E11D48" : "#4F46E5"} />{" "}
                        {scheduledDate.toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                        })}
                      </Badge>
                      {isOverdue ? (
                        <Badge tone="rose">Overdue</Badge>
                      ) : isDone ? (
                        <Badge tone="emerald">Done</Badge>
                      ) : isCancelled ? (
                        <Badge tone="slate">Cancelled</Badge>
                      ) : (
                        <Badge tone="amber">Pending</Badge>
                      )}
                      {f.type ? <Badge tone="slate">{String(f.type).toLowerCase()}</Badge> : null}
                    </View>
                  </View>
                </View>

                {/* Notes Bubble */}
                {f.notes ? (
                  <View className="mt-2.5 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60">
                    <Text className="text-[12px] text-slate-700 dark:text-slate-300" numberOfLines={2}>
                      💬 {f.notes}
                    </Text>
                  </View>
                ) : null}

                {/* Action Buttons (Done, Reschedule, Cancel, Call, WhatsApp) */}
                {!isDone && !isCancelled ? (
                  <View className="mt-3 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    {/* Primary Row: Complete, Reschedule, Cancel */}
                    <View className="flex-row gap-2">
                      <Pressable
                        onPress={() => handleComplete(f._id)}
                        accessibilityLabel="Complete Follow-up"
                        className="min-h-[38px] flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-emerald-50 active:bg-emerald-100 dark:bg-emerald-950/70"
                      >
                        <CheckCircle2 size={15} color="#059669" />
                        <Text className="text-[12px] font-bold text-emerald-700 dark:text-emerald-300">
                          Complete
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() =>
                          setReschedule({
                            id: f._id,
                            date: new Date(f.scheduledAt),
                            mode: "date",
                          })
                        }
                        accessibilityLabel="Reschedule"
                        className="min-h-[38px] flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-amber-50 active:bg-amber-100 dark:bg-amber-950/70"
                      >
                        <Clock size={15} color="#D97706" />
                        <Text className="text-[12px] font-bold text-amber-700 dark:text-amber-300">
                          Reschedule
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() =>
                          setCancelTarget({
                            id: f._id,
                            leadId: lead._id,
                            leadName: lead.name || "Lead",
                          })
                        }
                        accessibilityLabel="Cancel"
                        className="min-h-[38px] flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-rose-50 active:bg-rose-100 dark:bg-rose-950/70"
                      >
                        <XCircle size={15} color="#E11D48" />
                        <Text className="text-[12px] font-bold text-rose-700 dark:text-rose-300">
                          Cancel
                        </Text>
                      </Pressable>
                    </View>

                    {/* Secondary Row: Call & WhatsApp */}
                    {(lead.phone || (canWhatsApp && lead.phone)) && (
                      <View className="flex-row gap-2">
                        {lead.phone ? (
                          <Pressable
                            onPress={() => startCall(lead)}
                            accessibilityLabel={`Call ${lead.name}`}
                            className="min-h-[36px] flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-brand-50 active:bg-brand-100 dark:bg-brand-900/60"
                          >
                            <Phone size={14} color="#4F46E5" />
                            <Text className="text-[12px] font-semibold text-brand-700 dark:text-brand-200">
                              Call {lead.phone}
                            </Text>
                          </Pressable>
                        ) : null}

                        {canWhatsApp && lead.phone && lead._id ? (
                          <Pressable
                            onPress={() => openWhatsApp(lead._id)}
                            accessibilityLabel={`WhatsApp ${lead.name}`}
                            className="min-h-[36px] flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-wa-50 active:bg-wa-100 dark:bg-emerald-950/60"
                          >
                            <WhatsAppGlyph size={14} color="#059669" />
                            <Text className="text-[12px] font-semibold text-wa-700 dark:text-emerald-300">
                              WhatsApp
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    )}
                  </View>
                ) : isDone ? (
                  <View className="mt-3 flex-row items-center justify-between border-t border-slate-100 pt-2.5 dark:border-slate-800">
                    <View className="flex-row items-center gap-1.5">
                      <CheckCircle2 size={14} color="#059669" />
                      <Text className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        Completed
                      </Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        setReschedule({
                          id: f._id,
                          date: new Date(),
                          mode: "date",
                        })
                      }
                      className="rounded-lg bg-slate-100 px-2.5 py-1 active:bg-slate-200 dark:bg-slate-800"
                    >
                      <Text className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Follow up again
                      </Text>
                    </Pressable>
                  </View>
                ) : isCancelled ? (
                  <View className="mt-3 flex-row items-center justify-between border-t border-slate-100 pt-2.5 dark:border-slate-800">
                    <View className="flex-row items-center gap-1.5">
                      <XCircle size={14} color="#E11D48" />
                      <Text className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                        Cancelled
                      </Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        setReschedule({
                          id: f._id,
                          date: new Date(),
                          mode: "date",
                        })
                      }
                      className="rounded-lg bg-slate-100 px-2.5 py-1 active:bg-slate-200 dark:bg-slate-800"
                    >
                      <Text className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Reschedule
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
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

      {/* Cancel Follow-up Sheet */}
      <Sheet
        visible={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancel Follow-up"
        subtitle={`Lead: ${cancelTarget?.leadName || "Lead"}`}
        footer={
          <Button
            title="Confirm Cancel"
            variant="danger"
            full
            loading={cancelling}
            onPress={confirmCancelFollowup}
          />
        }
      >
        <Text className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
          Reason for cancellation
        </Text>
        <View className="mb-3 flex-row flex-wrap gap-1.5">
          {CANCEL_REASONS.map((r) => {
            const isFake = r === "Mark as Fake Lead";
            const active = cancelReason === r || (isFake && markAsFakeOnCancel);
            return (
              <Chip
                key={r}
                label={r}
                active={active}
                onPress={() => {
                  if (isFake) {
                    setMarkAsFakeOnCancel(!markAsFakeOnCancel);
                    setCancelReason("Fake lead");
                  } else {
                    setMarkAsFakeOnCancel(false);
                    setCancelReason(r);
                  }
                }}
              />
            );
          })}
        </View>

        {markAsFakeOnCancel && (
          <View className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/60">
            <View className="flex-row items-center gap-1.5">
              <AlertOctagon size={16} color="#E11D48" />
              <Text className="text-xs font-bold text-rose-800 dark:text-rose-200">
                Flag as Fake Lead
              </Text>
            </View>
            <Text className="mt-1 text-[11px] text-rose-700 dark:text-rose-300">
              This will also mark the entire lead as Lost ("Fake lead") and cancel any other reminders.
            </Text>
          </View>
        )}

        <Field
          label="Custom Note / Reason"
          value={cancelReason}
          onChangeText={setCancelReason}
          placeholder="e.g. Lead requested call after 2 weeks"
          multiline
        />
      </Sheet>
    </Screen>
  );
}
