import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View, RefreshControl } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Briefcase, Building2, CheckSquare, Copy, FileDown, Layers, MapPin, Phone, Search, SlidersHorizontal, Sparkles, Tag, UserRound, Users, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { get, post, tokenStore } from "../../api/client";
import { API_URL } from "../../config";
import { useCan } from "../../auth/permissions";
import { Avatar, Badge, Button, Chip, EmptyState, ErrorState, Field, IconButton, ListSkeleton, ScoreChip, SelectSheet, Sheet, StatusPill, cx } from "../../ui";
import { useTheme } from "../../ui/theme";
import { toast } from "../../ui/toast";
import { LEAD_STATUSES, statusLabel, timeAgo } from "../../lib/leadMeta";
import { startCall } from "../calls/callFlow";
import { openWhatsApp } from "../whatsapp/Composer";
import { AssignSheet, StatusSheet } from "./sheets";
import { WhatsAppGlyph } from "../whatsapp/WhatsAppGlyph";

type Quick = "" | "uncontacted" | "today" | "overdue" | "hot" | "unassigned";
type Filters = { search: string; status: string; businessProject: string; assignedTo: string; quick: Quick; sort: string; business: string; product: string; city: string };
const EMPTY: Filters = { search: "", status: "", businessProject: "", assignedTo: "", quick: "", sort: "newest", business: "", product: "", city: "" };

const PRODUCT_TYPES = ["1BHK", "2BHK", "3BHK", "4BHK", "STUDIO", "PENTHOUSE", "COMMERCIAL_SHOP", "SHOWROOM", "OFFICE", "PLOT", "OTHER"];

function toQuery(f: Filters) {
  return {
    search: f.search.trim() || undefined,
    status: f.status || undefined,
    businessProject: f.businessProject || undefined,
    business: f.business || undefined,
    assignedTo: f.assignedTo || undefined,
    product: f.product || undefined,
    city: f.city || undefined,
    sort: f.sort !== "newest" ? f.sort : undefined,
    uncontacted: f.quick === "uncontacted" ? "true" : undefined,
    followup: f.quick === "today" ? "today" : f.quick === "overdue" ? "overdue" : undefined,
    scoreMin: f.quick === "hot" ? 70 : undefined,
    unassigned: f.quick === "unassigned" ? "true" : undefined,
  };
}

export default function LeadsScreen({ title = "Leads" }: { title?: string }) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const qc = useQueryClient();
  const canAssign = useCan("leads.assign");
  const canFilterSales = useCan("leads.filterBySales");
  const canWhatsApp = useCan("whatsapp.send");
  const isPlatform = useCan("platform.view");

  // Deep links from Home / Projects: /leads?project=<id>&status=WON&quick=uncontacted
  const params = useLocalSearchParams<{ project?: string; status?: string; quick?: string }>();
  const [f, setF] = useState<Filters>(EMPTY);
  useEffect(() => {
    if (params.project || params.status || params.quick) {
      setF({
        ...EMPTY,
        businessProject: params.project ? String(params.project) : "",
        status: params.status ? String(params.status) : "",
        quick: (["uncontacted", "today", "overdue", "hot", "unassigned"].includes(String(params.quick)) ? params.quick : "") as Quick,
      });
    }
  }, [params.project, params.status, params.quick]);
  const [searchText, setSearchText] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pick, setPick] = useState<null | "status" | "project" | "sales" | "sort" | "business" | "product" | "city">(null);
  const [sharingPdf, setSharingPdf] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<null | "status" | "assign" | "tag">(null);
  const [tag, setTag] = useState("");

  // Debounce search typing.
  const debounced = useMemo(() => {
    let t: any;
    return (v: string) => {
      clearTimeout(t);
      t = setTimeout(() => setF((p) => ({ ...p, search: v })), 350);
    };
  }, []);

  // Scoped to the chosen business so the project list can't miss entries past the 100 cap.
  const projects = useQuery({
    queryKey: ["projects-lite", f.business],
    queryFn: () => get<{ projects: any[] }>("/business-projects", { business: f.business || undefined, limit: 100 }),
    staleTime: 5 * 60_000,
  });
  const sales = useQuery({ queryKey: ["sales-users"], queryFn: () => get<{ users: any[] }>("/users", { role: "SALES", limit: 100 }), enabled: canFilterSales, staleTime: 5 * 60_000 });
  const businesses = useQuery({ queryKey: ["businesses-lite"], queryFn: () => get<{ businesses: any[] }>("/businesses", { limit: 100 }), enabled: isPlatform, staleTime: 5 * 60_000 });
  const productOpts = useQuery({ queryKey: ["product-options"], queryFn: () => get<{ products: string[] }>("/leads/product-options"), staleTime: 5 * 60_000 });
  const productList = (productOpts.data?.products?.length ? productOpts.data.products : PRODUCT_TYPES);
  const cities = useQuery({ queryKey: ["cities"], queryFn: () => get<{ cities: string[] }>("/meta-data/cities"), enabled: isPlatform, staleTime: 60 * 60_000 });
  const cityList = cities.data?.cities || [];

  /** Admin only: download the filtered PDF report and hand it to the share sheet. */
  async function sharePdf() {
    setSharingPdf(true);
    try {
      // Any authed call first, so an expired in-memory access token is refreshed
      // before the raw download (which bypasses the client's retry logic).
      await get("/leads/stats");
      const qs = Object.entries({ ...toQuery(f), groupBy: "product" })
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
      const target = new File(Paths.cache, `leads-${new Date().toISOString().slice(0, 10)}.pdf`);
      if (target.exists) target.delete();
      const file = await File.downloadFileAsync(`${API_URL}/reports/leads.pdf?${qs}`, target, {
        headers: { Authorization: `Bearer ${tokenStore.access}` },
      });
      await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: "Leads report", UTI: "com.adobe.pdf" });
    } catch (e: any) {
      toast.error("Couldn't create the PDF", e?.message);
    } finally {
      setSharingPdf(false);
    }
  }

  const q = useInfiniteQuery({
    queryKey: ["leads", f],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => get<{ leads: any[]; total: number; pages: number; page: number }>("/leads", { ...toQuery(f), page: pageParam, limit: 25 }),
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  });
  const leads = q.data?.pages.flatMap((p) => p.leads) || [];
  const total = q.data?.pages[0]?.total ?? 0;

  const activeFilterCount = [f.status, f.businessProject, f.assignedTo, f.business, f.product, f.city, f.sort !== "newest" ? "x" : ""].filter(Boolean).length;
  const selecting = selected.size > 0;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function runBulk(body: Record<string, unknown>) {
    const r = await post<{ updated: number; skipped: number }>("/leads/bulk", { ids: [...selected], ...body });
    toast.success(`Updated ${r.updated} lead${r.updated === 1 ? "" : "s"}`, r.skipped ? `${r.skipped} skipped (not eligible)` : undefined);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["board"] });
  }

  const quick: { key: Quick; label: string; show: boolean }[] = [
    { key: "uncontacted", label: "Not contacted", show: true },
    { key: "today", label: "Follow-up today", show: true },
    { key: "overdue", label: "Overdue", show: true },
    { key: "hot", label: "🔥 Hot", show: true },
    { key: "unassigned", label: "Unassigned", show: canAssign },
  ];

  const closePick = () => {
    setPick(null);
    setTimeout(() => setFiltersOpen(true), 350);
  };

  const projectOptions = [
    { value: "", label: "All projects" },
    ...(projects.data?.projects || [])
      .filter((p) => !f.business || String(p.business?._id || p.business) === f.business)
      .map((p) => ({ value: p._id as string, label: p.name as string })),
  ];
  const salesOptions = [{ value: "", label: "Everyone" }, ...(sales.data?.users || []).map((u) => ({ value: u._id as string, label: u.name as string }))];

  return (
    <View className="flex-1 bg-slate-50 dark:bg-[#0B1120]">
      {/* Header */}
      <View style={{ paddingTop: insets.top + 8 }} className="px-4 pb-2">
        {selecting ? (
          <View className="h-12 flex-row items-center gap-2">
            <IconButton icon={<X size={22} color={c.text} />} label="Clear selection" onPress={() => setSelected(new Set())} />
            <Text className="flex-1 text-lg font-bold text-slate-900 dark:text-white">{selected.size} selected</Text>
          </View>
        ) : (
          <View className="flex-row items-end justify-between">
            <View>
              <Text accessibilityRole="header" className="text-[28px] font-bold leading-9 text-slate-900 dark:text-white">{title}</Text>
              <Text className="text-[13px] text-slate-500">{q.isLoading ? "Loading…" : `${total} lead${total === 1 ? "" : "s"}`}</Text>
            </View>
            <View className="flex-row items-center gap-1">
              {isPlatform ? (
                <IconButton
                  icon={<FileDown size={22} color={sharingPdf ? c.faint : c.text} />}
                  label="Share PDF report"
                  onPress={() => { if (!sharingPdf) void sharePdf(); }}
                />
              ) : null}
              <IconButton
                icon={
                  <View>
                    <SlidersHorizontal size={22} color={c.text} />
                    {activeFilterCount ? (
                      <View className="absolute -right-1.5 -top-1.5 h-4 w-4 items-center justify-center rounded-full bg-brand-600">
                        <Text className="text-[9px] font-bold text-white">{activeFilterCount}</Text>
                      </View>
                    ) : null}
                  </View>
                }
                label="Filters"
                onPress={() => setFiltersOpen(true)}
              />
            </View>
          </View>
        )}
        <View className="mt-3 min-h-[44px] flex-row items-center gap-2 rounded-xl bg-slate-200/70 px-3 dark:bg-slate-800">
          <Search size={18} color={c.muted} />
          <TextInput
            value={searchText}
            onChangeText={(t) => {
              setSearchText(t);
              debounced(t);
            }}
            placeholder="Search name, phone, campaign, tag"
            placeholderTextColor={c.faint}
            className="flex-1 text-[15px] text-slate-900 dark:text-white"
            returnKeyType="search"
            accessibilityLabel="Search leads"
          />
          {searchText ? (
            <Pressable
              onPress={() => {
                setSearchText("");
                setF((p) => ({ ...p, search: "" }));
              }}
              hitSlop={10}
              accessibilityLabel="Clear search"
            >
              <X size={18} color={c.muted} />
            </Pressable>
          ) : null}
        </View>
        {/* Quick Filter Buttons: Business & Project */}
        <View className="mt-2.5 flex-row flex-wrap items-center gap-2">
          {isPlatform && (
            <Pressable
              onPress={() => setPick("business")}
              className={cx(
                "flex-row items-center gap-1.5 rounded-full border px-3 py-1.5",
                f.business
                  ? "border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950"
                  : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
              )}
            >
              <Briefcase size={14} color={f.business ? "#059669" : c.faint} />
              <Text
                className={cx(
                  "text-[12px] font-semibold",
                  f.business ? "text-emerald-700 dark:text-emerald-200" : "text-slate-700 dark:text-slate-300",
                )}
                numberOfLines={1}
              >
                {(businesses.data?.businesses || []).find((b: any) => b._id === f.business)?.name
                  ? `Biz: ${(businesses.data?.businesses || []).find((b: any) => b._id === f.business)?.name}`
                  : "All Businesses"}
              </Text>
              {f.business ? (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    setF((p) => ({ ...p, business: "", businessProject: "" }));
                  }}
                  hitSlop={8}
                >
                  <X size={12} color="#059669" />
                </Pressable>
              ) : (
                <Text className="text-[11px] text-slate-400">▾</Text>
              )}
            </Pressable>
          )}

          <Pressable
            onPress={() => setPick("project")}
            className={cx(
              "flex-row items-center gap-1.5 rounded-full border px-3 py-1.5",
              f.businessProject
                ? "border-brand-500 bg-brand-50 dark:border-brand-600 dark:bg-brand-950"
                : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
            )}
          >
            <Building2 size={14} color={f.businessProject ? "#4F46E5" : c.faint} />
            <Text
              className={cx(
                "text-[12px] font-semibold",
                f.businessProject ? "text-brand-700 dark:text-brand-200" : "text-slate-700 dark:text-slate-300",
              )}
              numberOfLines={1}
            >
              {projectOptions.find((o) => o.value === f.businessProject)?.label || "All Projects"}
            </Text>
            {f.businessProject ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  setF((p) => ({ ...p, businessProject: "" }));
                }}
                hitSlop={8}
              >
                <X size={12} color="#4F46E5" />
              </Pressable>
            ) : (
              <Text className="text-[11px] text-slate-400">▾</Text>
            )}
          </Pressable>
        </View>

        {f.status || f.product ? (
          <View className="mt-2.5 flex-row flex-wrap gap-2">
            {f.status ? <Chip label={`${statusLabel(f.status)}  ✕`} active onPress={() => setF((p) => ({ ...p, status: "" }))} /> : null}
            {f.product ? <Chip label={`${f.product}  ✕`} active onPress={() => setF((p) => ({ ...p, product: "" }))} /> : null}
          </View>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerStyle={{ paddingRight: 16 }}>
          {quick
            .filter((x) => x.show)
            .map((x) => (
              <Chip key={x.key} label={x.label} active={f.quick === x.key} onPress={() => setF((p) => ({ ...p, quick: p.quick === x.key ? "" : x.key }))} />
            ))}
        </ScrollView>
      </View>

      {q.isLoading ? (
        <View className="px-4">
          <ListSkeleton />
        </View>
      ) : q.error && !leads.length ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <FlashList
          data={leads}
          keyExtractor={(l) => l._id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 120 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} tintColor={c.brand} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          ListEmptyComponent={
            <EmptyState
              title={f.search || f.quick || activeFilterCount ? "No leads match" : "No leads yet"}
              message={f.search || f.quick || activeFilterCount ? "Try clearing some filters." : "New Meta and LeadSync leads appear here instantly."}
              action={f.search || f.quick || activeFilterCount ? <Button title="Clear filters" variant="secondary" onPress={() => { setF(EMPTY); setSearchText(""); }} /> : undefined}
            />
          }
          ListFooterComponent={q.isFetchingNextPage ? <Text className="py-4 text-center text-xs text-slate-400">Loading more…</Text> : null}
          renderItem={({ item: l }) => {
            const isSel = selected.has(l._id);
            return (
              <Pressable
                onPress={() => (selecting ? toggle(l._id) : router.push(`/leads/${l._id}`))}
                onLongPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
                  toggle(l._id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${l.name}, ${statusLabel(l.status)}`}
                className={cx("mb-2.5 rounded-2xl border bg-white p-3.5 active:opacity-80 dark:bg-slate-900", isSel ? "border-brand-500" : "border-slate-200 dark:border-slate-800")}
              >
                <View className="flex-row items-start gap-3">
                  {selecting ? (
                    <View className={cx("mt-1 h-6 w-6 items-center justify-center rounded-md border-2", isSel ? "border-brand-600 bg-brand-600" : "border-slate-300")}>
                      {isSel ? <CheckSquare size={14} color="#fff" /> : null}
                    </View>
                  ) : (
                    <Avatar name={l.name} size={42} />
                  )}
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="flex-1 text-[16px] font-semibold text-slate-900 dark:text-white" numberOfLines={1}>{l.name || "Unnamed lead"}</Text>
                      <Text className="text-[11px] text-slate-400">{timeAgo(l.createdAt)}</Text>
                    </View>
                    <Text className="mt-0.5 text-[13px] text-slate-500" numberOfLines={1}>
                      {l.businessProject?.name || "Unmapped"}
                      {l.assignedTo?.name ? ` · ${l.assignedTo.name}` : canAssign ? " · Unassigned" : ""}
                    </Text>
                    <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
                      <StatusPill status={l.status} />
                      <ScoreChip score={l.score} />
                      {l.isFake ? <Badge tone="rose">🚨 Fake</Badge> : null}
                      {l.duplicateOf ? (
                        <View className="flex-row items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 dark:bg-amber-950">
                          <Copy size={10} color="#B45309" />
                          <Text className="text-[11px] font-medium text-amber-700 dark:text-amber-300">Repeat</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
                {!selecting && l.phone ? (
                  <View className="mt-3 flex-row gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <Pressable onPress={() => startCall(l)} accessibilityLabel={`Call ${l.name}`} className="min-h-[40px] flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-brand-50 active:bg-brand-100 dark:bg-brand-900">
                      <Phone size={16} color="#4F46E5" />
                      <Text className="text-[13px] font-semibold text-brand-700 dark:text-brand-200">Call</Text>
                    </Pressable>
                    {canWhatsApp ? (
                      <Pressable onPress={() => openWhatsApp(l._id)} accessibilityLabel={`WhatsApp ${l.name}`} className="min-h-[40px] flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-wa-50 active:bg-wa-100 dark:bg-emerald-950">
                        <WhatsAppGlyph size={16} color="#059669" />
                        <Text className="text-[13px] font-semibold text-wa-700 dark:text-emerald-300">WhatsApp</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}

      {selecting ? (
        <View style={{ paddingBottom: insets.bottom + 8 }} className="absolute bottom-0 left-0 right-0 flex-row gap-2 border-t border-slate-200 bg-white px-4 pt-3 dark:border-slate-800 dark:bg-slate-900">
          <Button title="Status" variant="secondary" className="flex-1" onPress={() => setBulk("status")} />
          {canAssign ? <Button title="Assign" variant="secondary" className="flex-1" icon={<UserRound size={16} color={c.text} />} onPress={() => setBulk("assign")} /> : null}
          <Button title="Tag" variant="secondary" className="flex-1" icon={<Tag size={16} color={c.text} />} onPress={() => setBulk("tag")} />
        </View>
      ) : null}

      {/* Filters */}
      <Sheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        footer={
          <>
            <Button title="Reset" variant="secondary" className="flex-1" onPress={() => setF((p) => ({ ...EMPTY, search: p.search, quick: p.quick }))} />
            <Button title="Show results" className="flex-[2]" onPress={() => setFiltersOpen(false)} />
          </>
        }
      >
        {[
          ...(isPlatform ? [{ key: "business" as const, label: "Business", icon: <Briefcase size={17} color="#059669" />, value: (businesses.data?.businesses || []).find((b) => b._id === f.business)?.name || "All businesses" }] : []),
          ...(isPlatform ? [{ key: "city" as const, label: "City", icon: <MapPin size={17} color="#D97706" />, value: f.city || "All cities" }] : []),
          { key: "project" as const, label: "Project", icon: <Building2 size={17} color="#4F46E5" />, value: projectOptions.find((o) => o.value === f.businessProject)?.label || "All projects" },
          { key: "status" as const, label: "Status", icon: <SlidersHorizontal size={17} color={c.text} />, value: f.status ? statusLabel(f.status) : "All statuses" },
          { key: "product" as const, label: "Product", icon: <Sparkles size={17} color="#8B5CF6" />, value: f.product || "All products" },
          ...(canFilterSales ? [{ key: "sales" as const, label: "Salesperson", icon: <Users size={17} color="#0284C7" />, value: salesOptions.find((o) => o.value === f.assignedTo)?.label || "Everyone" }] : []),
          { key: "sort" as const, label: "Sort", icon: <Tag size={17} color={c.faint} />, value: { newest: "Newest first", oldest: "Oldest first", score: "Highest score", followup: "Next follow-up", product: "Product (A–Z)", price_desc: "Price (high–low)" }[f.sort] || "Newest first" },
        ].map((row) => (
          <Pressable
            key={row.key}
            onPress={() => {
              setFiltersOpen(false);
              setTimeout(() => setPick(row.key), 350);
            }} className="min-h-[56px] flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800">
            <View className="flex-row items-center gap-2.5">
              {row.icon}
              <Text className="text-[15px] font-medium text-slate-800 dark:text-slate-200">{row.label}</Text>
            </View>
            <Text className="max-w-[55%] text-[14px] font-medium text-brand-600 dark:text-brand-200" numberOfLines={1}>{row.value}</Text>
          </Pressable>
        ))}
      </Sheet>

      <SelectSheet visible={pick === "project"} onClose={closePick} title="Project" options={projectOptions} value={f.businessProject} onSelect={(v) => setF((p) => ({ ...p, businessProject: v }))} />
      <SelectSheet visible={pick === "status"} onClose={closePick} title="Status" options={[{ value: "", label: "All statuses" }, ...LEAD_STATUSES.map((s) => ({ value: s as string, label: statusLabel(s) }))]} value={f.status} onSelect={(v) => setF((p) => ({ ...p, status: v }))} />
      <SelectSheet visible={pick === "product"} onClose={closePick} title="Product" options={[{ value: "", label: "All products" }, ...productList.map((pr) => ({ value: pr, label: pr }))]} value={f.product} onSelect={(v) => setF((p) => ({ ...p, product: v }))} />
      <SelectSheet visible={pick === "city"} onClose={closePick} title="City" options={[{ value: "", label: "All cities" }, ...cityList.map((x) => ({ value: x, label: x }))]} value={f.city} onSelect={(v) => setF((p) => ({ ...p, city: v }))} />
      <SelectSheet visible={pick === "sales"} onClose={closePick} title="Salesperson" options={salesOptions} value={f.assignedTo} onSelect={(v) => setF((p) => ({ ...p, assignedTo: v }))} />
      <SelectSheet
        visible={pick === "business"}
        onClose={closePick}
        title="Business"
        options={[{ value: "", label: "All businesses" }, ...(businesses.data?.businesses || []).map((b) => ({ value: b._id as string, label: b.name as string }))]}
        value={f.business}
        onSelect={(v) => setF((p) => ({ ...p, business: v, businessProject: "" }))}
      />
      <SelectSheet
        visible={pick === "sort"}
        onClose={closePick}
        title="Sort by"
        options={[
          { value: "newest", label: "Newest first" },
          { value: "oldest", label: "Oldest first" },
          { value: "score", label: "Highest score" },
          { value: "followup", label: "Next follow-up" },
          { value: "product", label: "Product (A–Z)" },
          { value: "price_desc", label: "Price (high–low)" },
        ]}
        value={f.sort}
        onSelect={(v) => setF((p) => ({ ...p, sort: v }))}
      />

      {/* Bulk actions */}
      <StatusSheet visible={bulk === "status"} count={selected.size} onClose={() => setBulk(null)} onConfirm={({ status, lostReason }) => runBulk({ action: "status", status, lostReason })} />
      <AssignSheet visible={bulk === "assign"} onClose={() => setBulk(null)} onPick={(userId) => runBulk({ action: "assign", userId })} />
      <Sheet
        visible={bulk === "tag"}
        onClose={() => setBulk(null)}
        title="Tag leads"
        footer={
          <Button
            title="Add tag"
            full
            disabled={!tag.trim()}
            onPress={async () => {
              await runBulk({ action: "tag", tag: tag.trim().toLowerCase() });
              setTag("");
              setBulk(null);
            }}
          />
        }
      >
        <Field value={tag} onChangeText={setTag} placeholder="e.g. site-visit-done" maxLength={40} autoCapitalize="none" />
      </Sheet>
    </View>
  );
}
