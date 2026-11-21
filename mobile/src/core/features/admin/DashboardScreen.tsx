import { useState } from "react";
import { Switch, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Building2, CheckCircle2, ChevronDown, Inbox, PauseCircle, Trophy, Users } from "lucide-react-native";
import { get, post, put } from "../../api/client";
import { useAuth } from "../../auth/store";
import { Button, Card, ErrorState, Muted, Screen, SectionTitle, SelectSheet, Sheet, Stat, cx } from "../../ui";
import { useTheme } from "../../ui/theme";
import { toast } from "../../ui/toast";
import { NotificationBell } from "../today/TodayScreen";
import { TrendChart } from "../analytics/AnalyticsScreen";
import { formatDateTime, statusLabel } from "../../lib/leadMeta";

/** Cities always shown on the home screen; the rest sit behind a picker. */
const MAIN_CITIES = ["Ahmedabad", "Vadodara", "Pune"];

/** Admin home: platform KPIs, delivery hold window, salesperson capacity. */
export default function DashboardScreen() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const user = useAuth((s) => s.user);
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => get<any>("/leads/stats") });
  const health = useQuery({ queryKey: ["admin-health"], queryFn: () => get<any>("/admin/health"), refetchInterval: 60_000 });
  const schedule = useQuery({ queryKey: ["delivery-schedule"], queryFn: () => get<any>("/lead-delivery/schedule") });
  const capacity = useQuery({ queryKey: ["capacity"], queryFn: () => get<{ capacity: any[] }>("/lead-delivery/capacity") });
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: () => get<any>("/admin/overview") });

  const PERF_RANGES = ["1m", "3m", "6m", "1y", "2y"] as const;
  const [perfRange, setPerfRange] = useState<(typeof PERF_RANGES)[number]>("1m");
  const [perfBusiness, setPerfBusiness] = useState("");
  const [perfProject, setPerfProject] = useState("");
  const [pick, setPick] = useState<null | "city" | "business" | "project">(null);
  const [otherCity, setOtherCity] = useState("");

  const perf = useQuery({
    queryKey: ["perf", perfRange, perfBusiness, perfProject],
    queryFn: () =>
      get<any>("/analytics/performance", {
        range: perfRange,
        business: perfBusiness || undefined,
        project: perfProject || undefined,
      }),
  });
  const businesses = useQuery({ queryKey: ["businesses-perf"], queryFn: () => get<any>("/businesses", { limit: 200 }), staleTime: 5 * 60_000 });
  const perfProjects = useQuery({
    queryKey: ["projects-perf", perfBusiness],
    queryFn: () => get<any>("/business-projects", { business: perfBusiness, limit: 100 }),
    enabled: !!perfBusiness,
    staleTime: 5 * 60_000,
  });

  const [holdOpen, setHoldOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [from, setFrom] = useState(new Date());
  const [until, setUntil] = useState(new Date(Date.now() + 10 * 3600_000));
  const [picker, setPicker] = useState<null | { which: "from" | "until"; mode: "date" | "time" }>(null);
  const [busy, setBusy] = useState(false);

  function openHold() {
    const s = schedule.data?.schedule;
    setEnabled(Boolean(s?.enabled));
    if (s?.holdFrom) setFrom(new Date(s.holdFrom));
    if (s?.holdUntil) setUntil(new Date(s.holdUntil));
    setHoldOpen(true);
  }

  async function saveHold() {
    if (enabled && until <= from) return toast.warn("End must be after start");
    setBusy(true);
    try {
      await put("/lead-delivery/schedule", { enabled, holdFrom: from.toISOString(), holdUntil: until.toISOString(), timezone: "Asia/Kolkata" });
      toast.success(enabled ? "Hold window saved" : "Hold window disabled");
      setHoldOpen(false);
      qc.invalidateQueries({ queryKey: ["delivery-schedule"] });
    } catch (e: any) {
      toast.error("Couldn't save", e?.message);
    } finally {
      setBusy(false);
    }
  }

  async function releaseNow() {
    try {
      const r = await post<{ released: number; held: boolean }>("/lead-delivery/release");
      toast.success(r.held ? "Still inside the hold window" : `Released ${r.released} lead(s)`);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error("Couldn't release", e?.message);
    }
  }

  const s = stats.data;
  const h = health.data;
  const st = schedule.data;

  const cityRows: any[] = overview.data?.byCity || [];
  const allCities: string[] = overview.data?.cities || [];
  const otherCityOptions = allCities.filter((x) => !MAIN_CITIES.includes(x));
  const businessList: any[] = businesses.data?.businesses || [];
  const projectList: any[] = perfProjects.data?.projects || [];
  const businessName = businessList.find((b) => b._id === perfBusiness)?.name || "";
  const projectName = projectList.find((p) => p._id === perfProject)?.name || "";

  return (
    <Screen title={`Hi, ${user?.name?.split(" ")[0] || ""}`} subtitle="Platform overview" right={<NotificationBell />} refreshing={stats.isRefetching} onRefresh={() => { stats.refetch(); health.refetch(); schedule.refetch(); capacity.refetch(); }}>
      {stats.error && !s ? <ErrorState error={stats.error} onRetry={() => stats.refetch()} /> : null}
      {/* Headline lead numbers */}
      <View className="mt-1 flex-row gap-2.5">
        <Stat label="Today's leads" value={overview.data?.summary?.leadsToday ?? "…"} icon={<Inbox size={16} color="#4F46E5" />} onPress={() => router.push("/leads")} />
        <Stat label="Total leads" value={s?.total ?? "…"} icon={<Users size={16} color="#0EA5E9" />} tone="#0EA5E9" onPress={() => router.push("/leads")} />
      </View>
      <View className="mt-2.5 flex-row gap-2.5">
        <Stat label="Held" value={h?.backlog?.held ?? "…"} icon={<PauseCircle size={16} color="#D97706" />} tone="#D97706" />
        <Stat label="Won" value={s?.won ?? "…"} icon={<Trophy size={16} color="#16A34A" />} tone="#16A34A" />
      </View>

      {/* Clients overview */}
      <SectionTitle>Clients</SectionTitle>
      <View className="flex-row gap-2.5">
        <Stat label="Total clients" value={overview.data?.summary?.totalClients ?? "…"} icon={<Building2 size={16} color="#4F46E5" />} onPress={() => router.push("/businesses")} />
        <Stat label="Active clients" value={overview.data?.summary?.activeClients ?? "…"} icon={<CheckCircle2 size={16} color="#16A34A" />} tone="#16A34A" onPress={() => router.push("/businesses")} />
      </View>

      {/* Leads by city — the main cities, plus one picked from the rest */}
      <SectionTitle>Leads by city</SectionTitle>
      <Card>
        <View className="flex-row flex-wrap gap-2">
          {[...MAIN_CITIES, ...(otherCity && !MAIN_CITIES.includes(otherCity) ? [otherCity] : [])].map((cityName) => {
            const item = cityRows.find((x: any) => x.city === cityName);
            return (
              <View key={cityName} className="min-w-[30%] flex-1 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <Text className="text-[11px] font-semibold text-slate-700 dark:text-slate-300" numberOfLines={1}>{cityName}</Text>
                <Text className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{item?.leads ?? 0}</Text>
                <Text className="text-[11px] text-green-600">{item?.won ?? 0} won</Text>
              </View>
            );
          })}
        </View>
        {otherCityOptions.length > 0 && (
          <TouchableOpacity
            onPress={() => setPick("city")}
            className="mt-3 flex-row items-center justify-center gap-1 rounded-lg border border-slate-200 py-2 dark:border-slate-700"
          >
            <Text className="text-[12px] font-semibold text-indigo-600">
              {otherCity && !MAIN_CITIES.includes(otherCity) ? `Showing ${otherCity} — change` : "Show another city"}
            </Text>
            <ChevronDown size={14} color={c.brand} />
          </TouchableOpacity>
        )}
      </Card>

      {/* Performance graph */}
      <SectionTitle>Lead performance</SectionTitle>
      <Card>
        <View className="mb-3 flex-row gap-2">
          <TouchableOpacity
            onPress={() => setPick("business")}
            className="flex-1 flex-row items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
          >
            <Text className="flex-1 text-[12px] text-slate-700 dark:text-slate-300" numberOfLines={1}>
              {businessName || "All businesses"}
            </Text>
            <ChevronDown size={14} color={c.faint} />
          </TouchableOpacity>
          {perfBusiness ? (
            <TouchableOpacity
              onPress={() => setPick("project")}
              className="flex-1 flex-row items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
            >
              <Text className="flex-1 text-[12px] text-slate-700 dark:text-slate-300" numberOfLines={1}>
                {projectName || "All projects"}
              </Text>
              <ChevronDown size={14} color={c.faint} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View className="flex-row gap-1 mb-3">
          {PERF_RANGES.map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => setPerfRange(r)}
              className={cx("flex-1 items-center rounded-lg py-1.5", perfRange === r ? "bg-indigo-600" : "bg-slate-100 dark:bg-slate-800")}
            >
              <Text className={cx("text-[11px] font-semibold", perfRange === r ? "text-white" : "text-slate-600 dark:text-slate-300")}>{r.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {perf.data?.data?.length > 0 ? (
          <TrendChart
            width={width - 64}
            data={perf.data.data.map((d: any) => ({ label: d.period, leads: d.leads, won: d.won }))}
          />
        ) : (
          <Muted>No data yet.</Muted>
        )}
      </Card>

      <SectionTitle>Lead pipeline</SectionTitle>
      <Card>
        {["NEW", "INTERESTED", "FOLLOW_UP", "WON", "LOST"].map((k) => {
          const map: Record<string, number> = { NEW: s?.newCount, INTERESTED: s?.interested, FOLLOW_UP: s?.followups, WON: s?.won, LOST: s?.lost };
          const max = Math.max(1, s?.total || 1);
          return (
            <View key={k} className="mb-2.5">
              <View className="mb-1 flex-row justify-between">
                <Text className="text-[13px] text-slate-700 dark:text-slate-300">{statusLabel(k)}</Text>
                <Text className="text-[13px] font-semibold text-slate-900 dark:text-white">{map[k] ?? 0}</Text>
              </View>
              <View className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                <View className="h-2 rounded-full bg-[#2a78d6]" style={{ width: `${Math.max(map[k] ? 3 : 0, ((map[k] || 0) / max) * 100)}%` }} />
              </View>
            </View>
          );
        })}
      </Card>

      <SectionTitle>Lead delivery</SectionTitle>
      <Card>
        <View className="flex-row items-center gap-3">
          <PauseCircle size={20} color={st?.isActive ? "#D97706" : c.faint} />
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-slate-900 dark:text-white">
              {st?.isActive ? "Holding leads now" : st?.schedule?.enabled ? "Hold window scheduled" : "Delivering instantly"}
            </Text>
            <Muted className="text-xs">
              {st?.schedule?.enabled ? `${formatDateTime(st.schedule.holdFrom)} → ${formatDateTime(st.schedule.holdUntil)}` : "New leads are assigned as they arrive."}
            </Muted>
          </View>
        </View>
        <View className="mt-3 flex-row gap-2">
          <Button title="Edit hold window" variant="secondary" size="sm" className="flex-1" onPress={openHold} />
          <Button title="Release held now" size="sm" className="flex-1" onPress={releaseNow} />
        </View>
      </Card>

      <SectionTitle>Today's capacity</SectionTitle>
      <Card>
        {(capacity.data?.capacity || []).slice(0, 12).map((p, i, arr) => (
          <View key={p.userId} className={cx("flex-row items-center justify-between py-2.5", i < arr.length - 1 && "border-b border-slate-100 dark:border-slate-800")}>
            <Text className="text-[14px] text-slate-800 dark:text-slate-200">{p.name}</Text>
            <Text className="text-[14px] font-semibold text-slate-900 dark:text-white">{p.assignedToday}</Text>
          </View>
        ))}
        {capacity.data && !capacity.data.capacity.length ? <Muted>No active salespeople.</Muted> : null}
        <Button title="Manage team & limits" variant="ghost" size="sm" className="mt-2 self-start" onPress={() => router.push("/team")} />
      </Card>

      <SelectSheet
        visible={pick === "city"}
        onClose={() => setPick(null)}
        title="Show another city"
        options={[{ value: "", label: "None" }, ...otherCityOptions.map((x) => ({ value: x, label: x }))]}
        value={otherCity}
        onSelect={setOtherCity}
      />
      <SelectSheet
        visible={pick === "business"}
        onClose={() => setPick(null)}
        title="Business"
        options={[{ value: "", label: "All businesses" }, ...businessList.map((b) => ({ value: b._id as string, label: b.name as string }))]}
        value={perfBusiness}
        onSelect={(v) => { setPerfBusiness(v); setPerfProject(""); }}
      />
      <SelectSheet
        visible={pick === "project"}
        onClose={() => setPick(null)}
        title="Project"
        options={[{ value: "", label: "All projects" }, ...projectList.map((p) => ({ value: p._id as string, label: p.name as string }))]}
        value={perfProject}
        onSelect={setPerfProject}
      />

      <Sheet
        visible={holdOpen}
        onClose={() => setHoldOpen(false)}
        title="Hold window"
        subtitle="Leads arriving in this window are stored and delivered when it ends."
        footer={<Button title="Save" full loading={busy} onPress={saveHold} />}
      >
        <View className="mb-4 flex-row items-center gap-3">
          <Text className="flex-1 text-[15px] text-slate-800 dark:text-slate-200">Enable hold window</Text>
          <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: c.brand, false: c.border }} />
        </View>
        {enabled ? (
          <>
            {(["from", "until"] as const).map((which) => {
              const d = which === "from" ? from : until;
              return (
                <View key={which} className="mb-3">
                  <Text className="mb-1.5 text-[13px] font-semibold text-slate-700 dark:text-slate-300">{which === "from" ? "Hold from" : "Release at"}</Text>
                  <View className="flex-row gap-2">
                    <Button title={d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} variant="secondary" className="flex-1" onPress={() => setPicker({ which, mode: "date" })} />
                    <Button title={d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} variant="secondary" className="flex-1" onPress={() => setPicker({ which, mode: "time" })} />
                  </View>
                </View>
              );
            })}
          </>
        ) : null}
        {picker ? (
          <DateTimePicker
            value={picker.which === "from" ? from : until}
            mode={picker.mode}
            minuteInterval={15}
            onValueChange={(_, d) => {
              const p = picker;
              setPicker(null);
              if (d) (p.which === "from" ? setFrom : setUntil)(d);
            }}
            onDismiss={() => setPicker(null)}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}
