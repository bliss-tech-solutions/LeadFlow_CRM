import { useMemo, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { IndianRupee, PhoneCall, Timer, Trophy, Users } from "lucide-react-native";
import { get } from "../../api/client";
import { useRole } from "../../auth/permissions";
import { Avatar, Card, ErrorState, Loading, Muted, Screen, SectionTitle, Segmented, Stat } from "../../ui";
import { useTheme } from "../../ui/theme";
import { LEAD_STATUSES, inr, statusLabel } from "../../lib/leadMeta";

// Validated categorical slots (light / dark): 1 = blue, 3 = aqua.
const SERIES = { light: { leads: "#2a78d6", won: "#1baf7a" }, dark: { leads: "#3987e5", won: "#199e70" } };

function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n + 1);
  return d.toISOString().slice(0, 10);
}

/** Two-series line chart with tap-to-inspect (single y-axis). */
export function TrendChart({ data, width }: { data: { label: string; leads: number; won: number }[]; width: number }) {
  const { isDark, c } = useTheme();
  const colors = isDark ? SERIES.dark : SERIES.light;
  const [active, setActive] = useState<number | null>(null);
  const H = 180;
  const P = { l: 8, r: 8, t: 12, b: 20 };
  const max = Math.max(1, ...data.map((d) => d.leads));
  const x = (i: number) => P.l + (i * (width - P.l - P.r)) / Math.max(1, data.length - 1);
  const y = (v: number) => P.t + (H - P.t - P.b) * (1 - v / max);
  const path = (k: "leads" | "won") => data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d[k])}`).join(" ");
  const sel = active !== null ? data[active] : null;

  return (
    <View>
      <View className="mb-2 flex-row items-center gap-4">
        <View className="flex-row items-center gap-1.5">
          <View className="h-0.5 w-4" style={{ backgroundColor: colors.leads }} />
          <Text className="text-xs text-slate-600 dark:text-slate-300">Leads</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-0.5 w-4" style={{ backgroundColor: colors.won }} />
          <Text className="text-xs text-slate-600 dark:text-slate-300">Won</Text>
        </View>
        <Text className="ml-auto text-xs text-slate-500">{sel ? `${sel.label}: ${sel.leads} leads · ${sel.won} won` : "Tap the chart"}</Text>
      </View>
      <View>
        <Svg width={width} height={H}>
          {[0.25, 0.5, 0.75].map((f) => (
            <Line key={f} x1={P.l} x2={width - P.r} y1={P.t + (H - P.t - P.b) * f} y2={P.t + (H - P.t - P.b) * f} stroke={c.border} strokeWidth={1} />
          ))}
          <Line x1={P.l} x2={width - P.r} y1={H - P.b} y2={H - P.b} stroke={c.border} strokeWidth={1} />
          {active !== null ? <Line x1={x(active)} x2={x(active)} y1={P.t} y2={H - P.b} stroke={c.faint} strokeDasharray="3 3" /> : null}
          <Path d={path("leads")} stroke={colors.leads} strokeWidth={2} fill="none" strokeLinejoin="round" />
          <Path d={path("won")} stroke={colors.won} strokeWidth={2} fill="none" strokeLinejoin="round" />
          {active !== null ? (
            <>
              <Circle cx={x(active)} cy={y(data[active].leads)} r={5} fill={colors.leads} stroke={c.card} strokeWidth={2} />
              <Circle cx={x(active)} cy={y(data[active].won)} r={5} fill={colors.won} stroke={c.card} strokeWidth={2} />
            </>
          ) : null}
        </Svg>
        <View className="absolute inset-0 flex-row">
          {data.map((d, i) => (
            <Pressable key={d.label} className="flex-1" onPressIn={() => setActive(i)} accessibilityLabel={`${d.label}: ${d.leads} leads, ${d.won} won`} />
          ))}
        </View>
      </View>
      <View className="flex-row justify-between">
        <Text className="text-[10px] text-slate-400">{data[0]?.label}</Text>
        <Text className="text-[10px] text-slate-400">{data[data.length - 1]?.label}</Text>
      </View>
    </View>
  );
}

function Bars({ rows, color }: { rows: { label: string; value: number; sub?: string }[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View className="gap-3">
      {rows.map((r) => (
        <View key={r.label} accessibilityLabel={`${r.label}: ${r.value}`}>
          <View className="mb-1 flex-row justify-between">
            <Text className="flex-1 text-[13px] text-slate-700 dark:text-slate-300" numberOfLines={1}>{r.label}</Text>
            <Text className="text-[13px] font-semibold text-slate-900 dark:text-white">{r.value}{r.sub ? <Text className="font-normal text-slate-400"> {r.sub}</Text> : null}</Text>
          </View>
          <View className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
            <View className="h-2 rounded-full" style={{ width: `${Math.max(r.value ? 3 : 0, (r.value / max) * 100)}%`, backgroundColor: color }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function AnalyticsScreen() {
  const role = useRole();
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  const colors = isDark ? SERIES.dark : SERIES.light;
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const from = daysAgoISO(Number(range));
  const to = new Date().toISOString().slice(0, 10);

  const ov = useQuery({ queryKey: ["analytics", "overview", range], queryFn: () => get<any>("/analytics/overview", { from, to }) });
  const team = useQuery({ queryKey: ["analytics", "team", range], queryFn: () => get<any>("/analytics/team", { from, to }) });

  const trend = useMemo(
    () => (ov.data?.trend || []).map((d: any) => ({ ...d, label: new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) })),
    [ov.data],
  );
  const t = ov.data?.totals;
  const isSales = role === "SALES";

  return (
    <Screen title={isSales ? "My performance" : "Analytics"} back refreshing={ov.isRefetching} onRefresh={() => { ov.refetch(); team.refetch(); }}>
      <Segmented value={range} onChange={setRange} options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} />
      {ov.isLoading ? <Loading /> : null}
      {ov.error ? <ErrorState error={ov.error} onRetry={() => ov.refetch()} /> : null}
      {t ? (
        <>
          <View className="mt-4 flex-row gap-2.5">
            <Stat label="Leads" value={t.leads} icon={<Users size={16} color="#4F46E5" />} />
            <Stat label={`Conversion · ${t.won} won`} value={`${t.conversionRate}%`} icon={<Trophy size={16} color="#16A34A" />} tone="#16A34A" />
          </View>
          <View className="mt-2.5 flex-row gap-2.5">
            <Stat label="Avg. first response" value={t.avgFirstResponseMinutes != null ? `${t.avgFirstResponseMinutes}m` : "–"} icon={<Timer size={16} color="#D97706" />} tone="#D97706" />
            <Stat label="Contact rate" value={`${t.contactRate}%`} icon={<PhoneCall size={16} color="#0EA5E9" />} tone="#0EA5E9" />
            <Stat label="Revenue won" value={inr(t.dealValue)} icon={<IndianRupee size={16} color="#8B5CF6" />} tone="#8B5CF6" />
          </View>

          <SectionTitle>Leads and wins per day</SectionTitle>
          <Card>{trend.length ? <TrendChart data={trend} width={width - 64} /> : <Muted>No leads in this period.</Muted>}</Card>

          <SectionTitle>Pipeline stages</SectionTitle>
          <Card>
            <Bars
              color={colors.leads}
              rows={LEAD_STATUSES.map((s) => ({ label: statusLabel(s), value: ov.data.byStatus?.[s] || 0 }))}
            />
          </Card>

          {!isSales ? (
            <>
              <SectionTitle>Sources</SectionTitle>
              <Card>
                <Bars color={colors.leads} rows={(ov.data.bySource || []).map((s: any) => ({ label: String(s.source).replace(/_/g, " "), value: s.count, sub: s.won ? `· ${s.won} won` : undefined }))} />
              </Card>
              <SectionTitle>Top campaigns</SectionTitle>
              <Card>
                {(ov.data.byCampaign || []).length ? (
                  <Bars color={colors.leads} rows={ov.data.byCampaign.map((c: any) => ({ label: c.campaign, value: c.count, sub: `· ${c.count ? Math.round((c.won / c.count) * 100) : 0}%` }))} />
                ) : (
                  <Muted>No campaign data.</Muted>
                )}
              </Card>
            </>
          ) : null}

          <SectionTitle>Why leads are lost</SectionTitle>
          <Card>
            {(ov.data.lostReasons || []).length ? (
              <Bars color={colors.leads} rows={ov.data.lostReasons.map((r: any) => ({ label: r.reason, value: r.count }))} />
            ) : (
              <Muted>No lost reasons recorded yet.</Muted>
            )}
          </Card>
        </>
      ) : null}

      {team.data?.team?.length ? (
        <>
          <SectionTitle>{isSales ? "My numbers" : "Team leaderboard"}</SectionTitle>
          {team.data.team.map((m: any, i: number) => (
            <Card key={m.userId} className="mb-2">
              <View className="flex-row items-center gap-3">
                <Text className="w-5 text-center text-[13px] font-bold text-slate-400">{i + 1}</Text>
                <Avatar name={m.name} uri={m.profilePhotoUrl} size={38} />
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold text-slate-900 dark:text-white">{m.name}</Text>
                  <Muted className="text-xs">{m.assigned} assigned · {m.contactRate}% contacted</Muted>
                </View>
                <View className="items-end">
                  <Text className="text-[16px] font-bold text-emerald-700 dark:text-emerald-400">{m.won} won</Text>
                  <Muted className="text-xs">{m.conversionRate}%</Muted>
                </View>
              </View>
              <View className="mt-3 flex-row justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                <Muted className="text-xs">⏱ {m.avgResponseMinutes != null ? `${m.avgResponseMinutes}m` : "—"}</Muted>
                <Muted className="text-xs">📞 {m.calls} ({m.connectedCalls})</Muted>
                <Muted className="text-xs">✅ {m.followupsDone} / ⚠ {m.followupsMissed}</Muted>
                <Muted className="text-xs">{inr(m.dealValue)}</Muted>
              </View>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
