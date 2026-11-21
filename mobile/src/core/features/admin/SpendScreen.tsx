import { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import {
  Building2,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Layers,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react-native";
import { del, get, post } from "../../api/client";
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  IconButton,
  ListSkeleton,
  Loading,
  Muted,
  Screen,
  SectionTitle,
  SelectSheet,
  Sheet,
  cx,
} from "../../ui";
import { useTheme } from "../../ui/theme";
import { toast } from "../../ui/toast";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

export default function SpendScreen() {
  const { c } = useTheme();
  const qc = useQueryClient();

  // All businesses for dropdown
  const businesses = useQuery({
    queryKey: ["businesses-spend"],
    queryFn: () => get<any>("/businesses?limit=200"),
  });
  const bizList: any[] = businesses.data?.businesses || [];

  // Filter states on main view
  const [filterBusiness, setFilterBusiness] = useState<string>("");
  const [filterProject, setFilterProject] = useState<string>("");

  // Select Sheets for main filter
  const [filterBizOpen, setFilterBizOpen] = useState(false);
  const [filterProjOpen, setFilterProjOpen] = useState(false);

  // Projects for the currently filtered business
  const filterProjects = useQuery({
    queryKey: ["spend-filter-projects", filterBusiness],
    queryFn: () => get<any>(`/business-projects?business=${filterBusiness}&limit=100`),
    enabled: !!filterBusiness,
  });
  const filterProjList: any[] = filterProjects.data?.projects || [];

  // Add spend form state
  const [showAdd, setShowAdd] = useState(false);
  const [formBusiness, setFormBusiness] = useState<string>("");
  const [formProject, setFormProject] = useState<string>("");
  const [formDate, setFormDate] = useState<Date>(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [formAmount, setFormAmount] = useState<string>("");
  const [formNote, setFormNote] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Inline dropdown states inside Add Spend sheet (avoids nested modal bug in React Native)
  const [bizDropdownOpen, setBizDropdownOpen] = useState(false);
  const [bizSearch, setBizSearch] = useState("");
  const [projDropdownOpen, setProjDropdownOpen] = useState(false);

  // Fetch projects for form's selected business
  const formProjects = useQuery({
    queryKey: ["spend-form-projects", formBusiness],
    queryFn: () => get<any>(`/business-projects?business=${formBusiness}&limit=100`),
    enabled: !!formBusiness,
  });
  const formProjList: any[] = formProjects.data?.projects || [];

  // Filtered business list for form inline search
  const filteredBizList = useMemo(() => {
    if (!bizSearch.trim()) return bizList;
    const q = bizSearch.toLowerCase();
    return bizList.filter(
      (b) =>
        b.name?.toLowerCase().includes(q) ||
        (b.city && b.city.toLowerCase().includes(q)) ||
        (b.state && b.state.toLowerCase().includes(q))
    );
  }, [bizList, bizSearch]);

  // Fetch spend records
  const spendRecordsQuery = useQuery({
    queryKey: ["spend-records", filterBusiness, filterProject],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (filterBusiness) params.business = filterBusiness;
      if (filterProject) params.project = filterProject;
      return get<{ records: any[] }>("/spend", params);
    },
  });
  const records = spendRecordsQuery.data?.records || [];

  // Fetch summary (overall or business-specific)
  const summary = useQuery({
    queryKey: ["spend-summary", filterBusiness, filterProject],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (filterBusiness) params.business = filterBusiness;
      if (filterProject) params.project = filterProject;
      return get<any>("/spend/summary", params);
    },
  });
  const totals = summary.data?.totals;
  const byProject: any[] = summary.data?.byProject || [];
  const byBusiness: any[] = summary.data?.byBusiness || [];

  function handleOpenDatePicker() {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: formDate,
        mode: "date",
        maximumDate: new Date(),
        onValueChange: (_event, date) => {
          if (date) setFormDate(date);
        },
        onDismiss: () => {},
      });
    } else {
      setShowDatePicker((prev) => !prev);
    }
  }

  function openAddSheet() {
    const defaultBiz = filterBusiness || bizList[0]?._id || "";
    setFormBusiness(defaultBiz);
    setFormProject(filterProject || "");
    setFormDate(new Date());
    setFormAmount("");
    setFormNote("");
    setBizDropdownOpen(false);
    setProjDropdownOpen(false);
    setBizSearch("");
    setShowDatePicker(false);
    setShowAdd(true);
  }

  async function handleSaveSpend() {
    if (!formBusiness) return toast.warn("Select a business");
    const amount = Number(formAmount);
    if (!amount || amount <= 0) return toast.warn("Enter a valid spend amount");

    setBusy(true);
    try {
      const entryDateStr = formDate.toISOString().slice(0, 10);
      await post("/spend", {
        business: formBusiness,
        project: formProject || undefined,
        level: formProject ? "PROJECT" : "BUSINESS",
        amount,
        entryDate: entryDateStr,
        note: formNote.trim() || undefined,
      });

      toast.success("Ad spend recorded", `₹${amount.toLocaleString("en-IN")} on ${entryDateStr}`);
      setShowAdd(false);
      qc.invalidateQueries({ queryKey: ["spend-records"] });
      qc.invalidateQueries({ queryKey: ["spend-summary"] });
    } catch (e: any) {
      toast.error("Couldn't record spend", e?.message);
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(id: string) {
    Alert.alert("Delete Spend Entry", "Are you sure you want to delete this recorded spend entry?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await del(`/spend/${id}`);
            toast.success("Spend entry deleted");
            qc.invalidateQueries({ queryKey: ["spend-records"] });
            qc.invalidateQueries({ queryKey: ["spend-summary"] });
          } catch (e: any) {
            toast.error("Failed to delete", e?.message);
          }
        },
      },
    ]);
  }

  const selectedBizObj = bizList.find((b) => b._id === filterBusiness);
  const selectedProjObj = filterProjList.find((p) => p._id === filterProject);

  const formBizObj = bizList.find((b) => b._id === formBusiness);
  const formProjObj = formProjList.find((p) => p._id === formProject);

  return (
    <Screen
      title="Ad Spends"
      subtitle="Track daily budgets, projects & CPL"
      right={
        <TouchableOpacity
          onPress={openAddSheet}
          className="flex-row items-center gap-1 rounded-full bg-brand-600 px-3.5 py-1.5 active:bg-brand-700"
          accessibilityLabel="Add spend"
        >
          <Plus size={16} color="#fff" />
          <Text className="text-xs font-bold text-white">Add spend</Text>
        </TouchableOpacity>
      }
    >
      {/* Filter Row: Business & Project */}
      <View className="mb-2.5 flex-row gap-2">
        {/* Business Filter */}
        <Pressable
          onPress={() => setFilterBizOpen(true)}
          className="flex-1 min-h-[46px] flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 active:bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
          accessibilityRole="button"
          accessibilityLabel="Filter by business"
        >
          <View className="flex-row items-center gap-1.5 flex-1 mr-1">
            <Building2 size={16} color={c.brand} />
            <Text className="text-[13px] font-semibold text-slate-800 dark:text-slate-200" numberOfLines={1}>
              {selectedBizObj ? selectedBizObj.name : "All Businesses"}
            </Text>
          </View>
          <ChevronDown size={14} color={c.faint} />
        </Pressable>

        {/* Project Filter */}
        <Pressable
          onPress={() => {
            if (!filterBusiness) {
              toast.info("Select a business first", "Choose a business to filter by its specific projects.");
              setFilterBizOpen(true);
            } else {
              setFilterProjOpen(true);
            }
          }}
          className={cx(
            "flex-1 min-h-[46px] flex-row items-center justify-between rounded-xl border px-3 py-2.5",
            filterBusiness
              ? "border-slate-200 bg-white active:bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
              : "border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40"
          )}
          accessibilityRole="button"
          accessibilityLabel="Filter by project"
        >
          <View className="flex-row items-center gap-1.5 flex-1 mr-1">
            <Layers size={16} color={filterBusiness ? "#D97706" : c.faint} />
            <Text
              className={cx(
                "text-[13px] font-semibold",
                filterBusiness
                  ? "text-slate-800 dark:text-slate-200"
                  : "text-slate-400 dark:text-slate-500"
              )}
              numberOfLines={1}
            >
              {filterBusiness
                ? selectedProjObj
                  ? selectedProjObj.name
                  : "All Projects"
                : "All Projects"}
            </Text>
          </View>
          <ChevronDown size={14} color={c.faint} />
        </Pressable>
      </View>

      {/* Active Filter Pill & Reset */}
      {(filterBusiness || filterProject) && (
        <View className="mb-3 flex-row items-center justify-between rounded-lg bg-brand-50/70 px-3 py-1.5 dark:bg-brand-950/40 border border-brand-100 dark:border-brand-900/40">
          <Text className="text-xs text-brand-700 dark:text-brand-300 font-medium">
            Active: <Text className="font-bold">{selectedBizObj?.name || "Business"}</Text>
            {selectedProjObj ? ` • ${selectedProjObj.name}` : ""}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setFilterBusiness("");
              setFilterProject("");
            }}
            hitSlop={8}
            className="px-1.5 py-0.5 rounded bg-brand-100/80 active:bg-brand-200 dark:bg-brand-900/60"
          >
            <Text className="text-[11px] font-bold text-brand-700 dark:text-brand-300">Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* KPI Tiles / Summary Banner */}
      {totals && (
        <View className="mb-4">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-[12px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {filterBusiness
                ? filterProject
                  ? `Project: ${selectedProjObj?.name || "Selected Project"}`
                  : `Total Business Spend: ${selectedBizObj?.name || "Business"}`
                : "Network Spend Overview"}
            </Text>
            {filterBusiness && (
              <Badge tone={filterProject ? "amber" : "brand"}>
                {filterProject ? "Project Filtered" : "Business + Projects"}
              </Badge>
            )}
          </View>

          <View className="flex-row flex-wrap gap-2.5">
            {[
              {
                label: filterBusiness
                  ? filterProject
                    ? "Project Spend"
                    : "Total Business Spend"
                  : "Total Network Spend",
                value: fmt(totals.amount),
                color: filterProject ? "#D97706" : "#4F46E5",
                sub: filterBusiness
                  ? filterProject
                    ? `Part of ₹${Number(totals.totalBusinessSpend || 0).toLocaleString("en-IN")} business budget`
                    : `🏢 ₹${Number(totals.businessLevelSpend || 0).toLocaleString("en-IN")} biz + 🏗️ ₹${Number(totals.projectLevelSpend || 0).toLocaleString("en-IN")} proj`
                  : `🏢 ₹${Number(totals.businessLevelSpend || 0).toLocaleString("en-IN")} biz + 🏗️ ₹${Number(totals.projectLevelSpend || 0).toLocaleString("en-IN")} proj`,
              },
              {
                label: filterProject ? "Project Leads" : "Total Leads",
                value: String(totals.leads || 0),
                color: "#0EA5E9",
              },
              {
                label: filterProject ? "Project CPL" : "Avg CPL",
                value: fmt(totals.cpl),
                color: "#D97706",
              },
              { label: "Cost / Won", value: fmt(totals.cpw), color: "#16A34A" },
            ].map((t) => (
              <View
                key={t.label}
                className="min-w-[46%] flex-1 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
              >
                <Text className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t.label}</Text>
                <Text className="mt-0.5 text-lg font-bold" style={{ color: t.color }}>
                  {t.value}
                </Text>
                {t.sub ? (
                  <Text className="mt-1 text-[10px] font-medium text-slate-400 dark:text-slate-500" numberOfLines={1}>
                    {t.sub}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ========================================================= */}
      {/* 1. ALL BUSINESSES VIEW: Show Business Summaries            */}
      {/* ========================================================= */}
      {!filterBusiness && (
        <View className="mb-5">
          <View className="mb-2 flex-row items-center justify-between">
            <View>
              <Text className="text-[13px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Business Spends Breakdown
              </Text>
              <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                Total = Business direct + all project spends. Tap a business to view details.
              </Text>
            </View>
          </View>

          {summary.isLoading ? (
            <ListSkeleton rows={3} />
          ) : byBusiness.length === 0 ? (
            <Card className="p-6 items-center justify-center">
              <Text className="text-sm text-slate-400">No business spends recorded yet.</Text>
            </Card>
          ) : (
            <View className="gap-2.5">
              {byBusiness.map((b: any) => (
                <Pressable
                  key={b.businessId}
                  onPress={() => {
                    setFilterBusiness(b.businessId);
                    setFilterProject("");
                  }}
                  className="rounded-2xl border border-slate-200 bg-white p-4 active:bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <Building2 size={16} color={c.brand} />
                        <Text className="text-[15px] font-bold text-slate-900 dark:text-white" numberOfLines={1}>
                          {b.name}
                        </Text>
                      </View>
                      {b.city ? (
                        <Text className="mt-0.5 text-xs text-slate-500">
                          {b.city}{b.state ? `, ${b.state}` : ""}
                        </Text>
                      ) : null}

                      {/* Breakdown Pills */}
                      <View className="mt-2.5 flex-row flex-wrap items-center gap-1.5">
                        <View className="rounded-md bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                          <Text className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                            🏢 Biz: ₹{Number(b.businessSpend || 0).toLocaleString("en-IN")}
                          </Text>
                        </View>
                        <View className="rounded-md bg-amber-50 px-2 py-0.5 dark:bg-amber-950/40">
                          <Text className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            🏗️ Proj ({b.projectCount || 0}): ₹{Number(b.projectSpend || 0).toLocaleString("en-IN")}
                          </Text>
                        </View>
                        <Text className="text-[11px] text-slate-400">
                          • {b.leads || 0} leads
                        </Text>
                      </View>
                    </View>

                    <View className="items-end">
                      <Text className="text-[11px] font-medium text-slate-400">Total Spend</Text>
                      <Text className="text-lg font-extrabold text-brand-600 dark:text-brand-300">
                        {fmt(b.totalSpend)}
                      </Text>
                      <View className="mt-2 flex-row items-center gap-0.5">
                        <Text className="text-xs font-semibold text-brand-600 dark:text-brand-400">
                          View details
                        </Text>
                        <ChevronRight size={13} color={c.brand} />
                      </View>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ========================================================= */}
      {/* 2. SPECIFIC BUSINESS VIEW: Projects Horizontal Scroll     */}
      {/* ========================================================= */}
      {filterBusiness && byProject.length > 0 && (
        <View className="mb-4">
          <View className="mb-2 flex-row items-center justify-between">
            <View>
              <Text className="text-[13px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Spends by Project ({byProject.length})
              </Text>
              <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                Tap a project to view its specific records & CPL
              </Text>
            </View>
            {filterProject && (
              <TouchableOpacity
                onPress={() => setFilterProject("")}
                className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800"
              >
                <Text className="text-[11px] font-bold text-brand-600 dark:text-brand-400">
                  All Projects
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1 px-1">
            <View className="flex-row gap-2 py-1">
              {/* General / Business Level Tile */}
              <Pressable
                onPress={() => setFilterProject("")}
                className={cx(
                  "min-w-[150px] p-3 rounded-2xl border",
                  !filterProject
                    ? "border-brand-500 bg-brand-50/60 dark:border-brand-500 dark:bg-brand-950/40"
                    : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                )}
              >
                <View className="flex-row items-center gap-1.5 mb-1">
                  <Building2 size={14} color={c.brand} />
                  <Text className="text-xs font-bold text-slate-900 dark:text-white" numberOfLines={1}>
                    Business Direct
                  </Text>
                </View>
                <Text className="text-base font-bold text-brand-600 dark:text-brand-300">
                  {fmt(totals?.businessLevelSpend || 0)}
                </Text>
                <Text className="mt-1 text-[10px] text-slate-500">General budget</Text>
              </Pressable>

              {/* Each Project Tile */}
              {byProject.map((p: any) => {
                const isSelected = filterProject === p.projectId;
                return (
                  <Pressable
                    key={p.projectId}
                    onPress={() => setFilterProject(isSelected ? "" : p.projectId)}
                    className={cx(
                      "min-w-[170px] p-3 rounded-2xl border",
                      isSelected
                        ? "border-amber-500 bg-amber-50/70 dark:border-amber-500 dark:bg-amber-950/40"
                        : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                    )}
                  >
                    <View className="flex-row items-center gap-1.5 mb-1">
                      <Layers size={14} color="#D97706" />
                      <Text className="text-xs font-bold text-slate-900 dark:text-white" numberOfLines={1}>
                        {p.name}
                      </Text>
                    </View>
                    <Text className="text-base font-bold text-amber-700 dark:text-amber-400">
                      {fmt(p.directSpend)}
                    </Text>
                    <Text className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                      {p.leads || 0} leads{p.cpl ? ` • CPL: ${fmt(p.cpl)}` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ========================================================= */}
      {/* SPEND ENTRIES LIST                                        */}
      {/* ========================================================= */}
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-[13px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {filterBusiness
            ? `Recorded Entries · ${selectedBizObj?.name || ""}${selectedProjObj ? ` (${selectedProjObj.name})` : ""}`
            : `Recent Recorded Spend Entries (${records.length})`}
        </Text>
      </View>

      {spendRecordsQuery.isLoading ? (
        <ListSkeleton rows={4} />
      ) : spendRecordsQuery.error ? (
        <EmptyState title="Couldn't load spend records" message={String((spendRecordsQuery.error as any)?.message)} />
      ) : !records.length ? (
        <EmptyState
          title="No spend recorded"
          message="Tap 'Add spend' above to record your first daily ad spend entry."
          action={
            <Button
              title="Record Ad Spend"
              onPress={openAddSheet}
              icon={<Plus size={16} color="#fff" />}
            />
          }
        />
      ) : (
        <View className="gap-2.5">
          {records.map((r: any) => {
            const entryDate = new Date(r.periodFrom || r.createdAt);
            const dateStr = entryDate.toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            });
            return (
              <Card key={r._id} className="p-3.5">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Badge tone="brand">
                        <CalendarIcon size={11} color="#4F46E5" /> {dateStr}
                      </Badge>
                      {r.level === "PROJECT" || r.project ? (
                        <Badge tone="amber">Project</Badge>
                      ) : (
                        <Badge tone="slate">Business Level</Badge>
                      )}
                    </View>

                    <Text className="mt-1.5 text-[15px] font-bold text-slate-900 dark:text-white">
                      {r.business?.name || "Business"}
                    </Text>

                    {r.project?.name ? (
                      <View className="mt-0.5 flex-row items-center gap-1">
                        <Layers size={13} color="#D97706" />
                        <Text className="text-[12px] font-medium text-amber-700 dark:text-amber-300">
                          {r.project.name}
                        </Text>
                      </View>
                    ) : (
                      <Muted className="text-xs">General / Business Wide</Muted>
                    )}

                    {r.note ? (
                      <Text className="mt-1 text-[12px] text-slate-600 dark:text-slate-300" numberOfLines={2}>
                        {r.note}
                      </Text>
                    ) : null}
                  </View>

                  <View className="items-end">
                    <Text className="text-lg font-bold text-brand-600 dark:text-brand-300">
                      {fmt(r.amount)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => confirmDelete(r._id)}
                      hitSlop={10}
                      className="mt-2.5 h-8 w-8 items-center justify-center rounded-lg bg-rose-50 active:bg-rose-100 dark:bg-rose-950/50"
                      accessibilityLabel="Delete entry"
                    >
                      <Trash2 size={15} color="#E11D48" />
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {/* ========================================================= */}
      {/* ADD SPEND BOTTOM SHEET                                    */}
      {/* ========================================================= */}
      <Sheet
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        title="Record Ad Spend"
        subtitle="Log a daily ad expenditure entry"
        footer={<Button title="Save Spend Entry" full loading={busy} onPress={handleSaveSpend} />}
      >
        {/* 1. Business Select Dropdown */}
        <View className="mb-3.5">
          <Text className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
            Business (Required)
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select Business"
            onPress={() => {
              setBizDropdownOpen((prev) => !prev);
              if (!bizDropdownOpen) setProjDropdownOpen(false);
            }}
            className={cx(
              "min-h-[46px] flex-row items-center justify-between rounded-xl border bg-white px-3.5 py-2.5 active:bg-slate-100 dark:bg-slate-900",
              bizDropdownOpen
                ? "border-brand-500 ring-1 ring-brand-500/20"
                : "border-slate-200 dark:border-slate-700"
            )}
          >
            <View className="flex-row items-center gap-2 flex-1 mr-1">
              <Building2 size={16} color={c.brand} />
              <Text
                className={cx(
                  "text-[14px]",
                  formBizObj ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-400"
                )}
                numberOfLines={1}
              >
                {formBizObj ? formBizObj.name : "Select a business…"}
              </Text>
            </View>
            {bizDropdownOpen ? (
              <ChevronUp size={18} color={c.brand} />
            ) : (
              <ChevronDown size={18} color={c.faint} />
            )}
          </Pressable>

          {/* Inline Expanded Business List */}
          {bizDropdownOpen && (
            <View className="mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
              {/* Search Bar */}
              <View className="border-b border-slate-100 bg-slate-50/80 px-3 py-2 flex-row items-center gap-2 dark:border-slate-800 dark:bg-slate-800/60">
                <Search size={15} color={c.muted} />
                <TextInput
                  value={bizSearch}
                  onChangeText={setBizSearch}
                  placeholder="Search businesses..."
                  placeholderTextColor={c.faint}
                  className="flex-1 py-0.5 text-[13px] text-slate-900 dark:text-white"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {bizSearch ? (
                  <Pressable onPress={() => setBizSearch("")} hitSlop={8}>
                    <X size={14} color={c.muted} />
                  </Pressable>
                ) : null}
              </View>

              {/* Business Items */}
              <ScrollView
                nestedScrollEnabled
                style={{ maxHeight: 210 }}
                keyboardShouldPersistTaps="handled"
              >
                {filteredBizList.length === 0 ? (
                  <View className="py-4 items-center">
                    <Text className="text-xs text-slate-400">No businesses found</Text>
                  </View>
                ) : (
                  filteredBizList.map((b) => {
                    const isSelected = formBusiness === b._id;
                    return (
                      <Pressable
                        key={b._id}
                        onPress={() => {
                          setFormBusiness(b._id);
                          setFormProject("");
                          setBizDropdownOpen(false);
                          setBizSearch("");
                        }}
                        className={cx(
                          "flex-row items-center justify-between border-b border-slate-100 px-3.5 py-2.5 active:bg-slate-100 dark:border-slate-800/60 dark:active:bg-slate-800",
                          isSelected ? "bg-brand-50/60 dark:bg-brand-950/40" : ""
                        )}
                      >
                        <View className="flex-1 mr-2">
                          <Text
                            className={cx(
                              "text-[14px]",
                              isSelected
                                ? "font-bold text-brand-700 dark:text-brand-300"
                                : "font-medium text-slate-800 dark:text-slate-200"
                            )}
                            numberOfLines={1}
                          >
                            {b.name}
                          </Text>
                          {b.city ? (
                            <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                              {b.city}{b.state ? `, ${b.state}` : ""}
                            </Text>
                          ) : null}
                        </View>
                        {isSelected && <Check size={16} color={c.brand} />}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>
          )}
        </View>

        {/* 2. Project Select Dropdown (Optional / If Need) */}
        <View className="mb-3.5">
          <Text className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
            Project (Optional)
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select Project"
            onPress={() => {
              if (!formBusiness) {
                toast.info("Select a business first", "Choose a business to see its available projects.");
                setBizDropdownOpen(true);
                return;
              }
              setProjDropdownOpen((prev) => !prev);
              if (!projDropdownOpen) setBizDropdownOpen(false);
            }}
            className={cx(
              "min-h-[46px] flex-row items-center justify-between rounded-xl border px-3.5 py-2.5",
              projDropdownOpen
                ? "border-amber-500 ring-1 ring-amber-500/20 bg-white dark:bg-slate-900"
                : formBusiness
                ? "border-slate-200 bg-white active:bg-slate-100 dark:border-slate-700 dark:bg-slate-900"
                : "border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50"
            )}
          >
            <View className="flex-row items-center gap-2 flex-1 mr-1">
              <Layers size={16} color="#D97706" />
              <Text
                className={cx(
                  "text-[14px]",
                  formProjObj
                    ? "font-semibold text-slate-900 dark:text-slate-100"
                    : "text-slate-500 dark:text-slate-400"
                )}
                numberOfLines={1}
              >
                {formProjObj ? formProjObj.name : "All Projects / General"}
              </Text>
            </View>
            {projDropdownOpen ? (
              <ChevronUp size={18} color="#D97706" />
            ) : (
              <ChevronDown size={18} color={c.faint} />
            )}
          </Pressable>

          {/* Inline Expanded Project List */}
          {projDropdownOpen && (
            <View className="mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
              <ScrollView
                nestedScrollEnabled
                style={{ maxHeight: 200 }}
                keyboardShouldPersistTaps="handled"
              >
                {/* General / All Projects option */}
                <Pressable
                  onPress={() => {
                    setFormProject("");
                    setProjDropdownOpen(false);
                  }}
                  className={cx(
                    "flex-row items-center justify-between border-b border-slate-100 px-3.5 py-2.5 active:bg-slate-100 dark:border-slate-800/60 dark:active:bg-slate-800",
                    !formProject ? "bg-amber-50/60 dark:bg-amber-950/40" : ""
                  )}
                >
                  <View className="flex-1 mr-2">
                    <Text
                      className={cx(
                        "text-[14px]",
                        !formProject
                          ? "font-bold text-amber-700 dark:text-amber-300"
                          : "font-medium text-slate-800 dark:text-slate-200"
                      )}
                    >
                      All Projects / General
                    </Text>
                    <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                      Record spend across entire business
                    </Text>
                  </View>
                  {!formProject && <Check size={16} color="#D97706" />}
                </Pressable>

                {formProjects.isLoading ? (
                  <View className="py-4 items-center">
                    <Loading />
                  </View>
                ) : formProjList.length === 0 ? (
                  <View className="px-3.5 py-3">
                    <Text className="text-xs text-slate-400">
                      No specific projects configured for this business.
                    </Text>
                  </View>
                ) : (
                  formProjList.map((p) => {
                    const isSelected = formProject === p._id;
                    return (
                      <Pressable
                        key={p._id}
                        onPress={() => {
                          setFormProject(p._id);
                          setProjDropdownOpen(false);
                        }}
                        className={cx(
                          "flex-row items-center justify-between border-b border-slate-100 px-3.5 py-2.5 active:bg-slate-100 dark:border-slate-800/60 dark:active:bg-slate-800",
                          isSelected ? "bg-amber-50/60 dark:bg-amber-950/40" : ""
                        )}
                      >
                        <View className="flex-1 mr-2">
                          <Text
                            className={cx(
                              "text-[14px]",
                              isSelected
                                ? "font-bold text-amber-700 dark:text-amber-300"
                                : "font-medium text-slate-800 dark:text-slate-200"
                            )}
                            numberOfLines={1}
                          >
                            {p.name}
                          </Text>
                          {p.stage ? (
                            <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                              {p.stage}
                            </Text>
                          ) : null}
                        </View>
                        {isSelected && <Check size={16} color="#D97706" />}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>
          )}
        </View>

        {/* 3. Entry Date Picker */}
        <View className="mb-3.5">
          <Text className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
            Entry Date
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select Entry Date"
            onPress={handleOpenDatePicker}
            className="min-h-[46px] flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-900"
          >
            <View className="flex-row items-center gap-2">
              <CalendarIcon size={16} color={c.brand} />
              <Text className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                {formDate.toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </Text>
            </View>
            <Text className="text-xs font-semibold text-brand-600">Change date</Text>
          </Pressable>

          {/* Quick Date Chips */}
          <View className="mt-2 flex-row gap-2">
            <TouchableOpacity
              onPress={() => setFormDate(new Date())}
              className="rounded-lg bg-slate-100 px-3 py-1.5 active:bg-slate-200 dark:bg-slate-800"
            >
              <Text className="text-xs font-medium text-slate-700 dark:text-slate-300">Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                const y = new Date();
                y.setDate(y.getDate() - 1);
                setFormDate(y);
              }}
              className="rounded-lg bg-slate-100 px-3 py-1.5 active:bg-slate-200 dark:bg-slate-800"
            >
              <Text className="text-xs font-medium text-slate-700 dark:text-slate-300">Yesterday</Text>
            </TouchableOpacity>
          </View>

          {/* iOS Inline Date Picker inside Sheet */}
          {showDatePicker && Platform.OS === "ios" && (
            <View className="mt-3 items-center rounded-2xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/80">
              <DateTimePicker
                value={formDate}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onValueChange={(_event, date) => {
                  if (date) setFormDate(date);
                }}
                onDismiss={() => setShowDatePicker(false)}
              />
              <TouchableOpacity
                onPress={() => setShowDatePicker(false)}
                className="mt-2 rounded-xl bg-brand-600 px-5 py-2 active:bg-brand-700"
              >
                <Text className="text-xs font-bold text-white">Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 4. Amount Spent (₹) */}
        <Field
          label="Amount Spent (₹)"
          value={formAmount}
          onChangeText={(v) => setFormAmount(v.replace(/[^0-9]/g, ""))}
          keyboardType="number-pad"
          placeholder="e.g. 5000"
        />

        {/* Quick Amount Chips */}
        <View className="mb-3.5 flex-row flex-wrap gap-1.5">
          {["5000", "10000", "25000", "50000"].map((v) => (
            <TouchableOpacity
              key={v}
              onPress={() => setFormAmount(v)}
              className="rounded-full bg-slate-100 px-3 py-1 active:bg-slate-200 dark:bg-slate-800"
            >
              <Text className="text-xs font-medium text-slate-700 dark:text-slate-300">
                ₹{Number(v).toLocaleString("en-IN")}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 5. Campaign Note */}
        <Field
          label="Campaign Name / Note (Optional)"
          value={formNote}
          onChangeText={setFormNote}
          placeholder="e.g. Meta Ads - 3BHK Launch Form"
        />
      </Sheet>

      {/* Select Sheets for Main Filter */}
      <SelectSheet
        visible={filterBizOpen}
        onClose={() => setFilterBizOpen(false)}
        title="Filter by Business"
        options={[
          { value: "", label: "All Businesses" },
          ...bizList.map((b) => ({
            value: b._id,
            label: b.name,
            description: b.city ? `${b.city}${b.state ? `, ${b.state}` : ""}` : undefined,
          })),
        ]}
        value={filterBusiness}
        onSelect={(bId) => {
          setFilterBusiness(bId);
          setFilterProject("");
        }}
      />

      <SelectSheet
        visible={filterProjOpen}
        onClose={() => setFilterProjOpen(false)}
        title={`Filter by Project (${selectedBizObj?.name || "All"})`}
        options={[
          { value: "", label: "All Projects" },
          ...filterProjList.map((p) => ({
            value: p._id,
            label: p.name,
            description: p.stage || undefined,
          })),
        ]}
        value={filterProject}
        onSelect={(pId) => setFilterProject(pId)}
      />
    </Screen>
  );
}
