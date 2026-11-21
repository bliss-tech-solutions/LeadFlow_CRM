import { useEffect, useState } from "react";
import { Alert, Pressable, Switch, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronRight, KeyRound, MapPin, Plus, Search, Trash2 } from "lucide-react-native";
import { get, patch, post } from "../../api/client";
import { Badge, Button, Card, Chip, EmptyState, ErrorState, Field, ListSkeleton, Loading, Muted, Screen, SectionTitle, Segmented, SelectSheet, Sheet, cx } from "../../ui";
import { useTheme } from "../../ui/theme";
import { WhatsAppGlyph } from "../whatsapp/WhatsAppGlyph";
import { toast } from "../../ui/toast";
import { LocationSelector } from "../../ui/LocationSelector";
import { GUJARAT_CITIES } from "../../lib/locations";

const LIMIT_TYPES = [
  { value: "NONE", label: "No limit" },
  { value: "DAILY", label: "Per day" },
  { value: "MONTHLY", label: "Per month" },
];
const UNIT_TYPES = ["1BHK", "2BHK", "3BHK", "4BHK", "PENTHOUSE", "STUDIO", "PLOT", "OFFICE", "COMMERCIAL_SHOP", "SHOWROOM", "OTHER"];

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

export function BusinessesListScreen() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ACTIVE");
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    state: "Gujarat",
    city: "Vadodara",
    area: "",
    pincode: "",
    contactNo: "",
    detail: "",
    leadLimit: "0",
    leadLimitType: "NONE",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["businesses", status, search, selectedCity],
    queryFn: () =>
      get<{ businesses: any[]; total: number }>("/businesses", {
        status,
        search: search.trim() || undefined,
        city: selectedCity || undefined,
        limit: 100,
      }),
  });

  async function create() {
    if (!form.name.trim()) return toast.warn("Business name is required");
    if (form.adminEmail && form.adminPassword.length < 8) return toast.warn("Owner password must be at least 8 characters");
    setBusy(true);
    try {
      const r = await post<{ business: any }>("/businesses", { ...form, leadLimit: Number(form.leadLimit) || 0, adminEmail: form.adminEmail.trim().toLowerCase() || undefined });
      toast.success("Business created", r.business.name);
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["businesses"] });
      router.push(`/businesses/${r.business._id}`);
    } catch (e: any) {
      toast.error("Couldn't create", e?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Businesses" refreshing={q.isRefetching} onRefresh={() => q.refetch()} right={<Button title="New" size="sm" icon={<Plus size={14} color="#fff" />} onPress={() => setCreating(true)} />}>
      <View className="min-h-[44px] flex-row items-center gap-2 rounded-xl bg-slate-200/70 px-3 dark:bg-slate-800">
        <Search size={18} color={c.muted} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Search businesses" placeholderTextColor={c.faint} className="flex-1 text-[15px] text-slate-900 dark:text-white" />
      </View>
      <View className="mt-3 flex-row flex-wrap gap-1">
        {(["ACTIVE", "INACTIVE", "ALL"] as const).map((s) => (
          <Chip key={s} label={s === "ALL" ? "All Status" : s === "ACTIVE" ? "Active" : "Inactive"} active={status === s} onPress={() => setStatus(s)} />
        ))}
      </View>
      <View className="mt-2 flex-row flex-wrap gap-1">
        <Chip label="All Cities" active={!selectedCity} onPress={() => setSelectedCity("")} />
        {GUJARAT_CITIES.map((cityName) => (
          <Chip key={cityName} label={cityName} active={selectedCity === cityName} onPress={() => setSelectedCity(selectedCity === cityName ? "" : cityName)} />
        ))}
      </View>
      <View className="mt-3">
        {q.isLoading ? <ListSkeleton /> : null}
        {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
        {q.data && !q.data.businesses.length ? <EmptyState title="No businesses" icon={<Building2 size={28} color={c.faint} />} /> : null}
        {(q.data?.businesses || []).map((b) => (
          <Card key={b._id} className="mb-2.5" onPress={() => router.push(`/businesses/${b._id}`)}>
            <View className="flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-900">
                <Text className="text-base font-bold text-brand-700 dark:text-brand-200">{b.name?.[0]?.toUpperCase()}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-[16px] font-semibold text-slate-900 dark:text-white">{b.name}</Text>
                <Muted className="text-xs">{b.projectCount} projects · {b.businessAdmin?.email || "No owner login"}</Muted>
                {(b.area || b.city) ? (
                  <View className="mt-1 flex-row items-center gap-1">
                    <MapPin size={11} color={c.faint} />
                    <Muted className="text-[11px]">{[b.area, b.city, b.pincode].filter(Boolean).join(", ")}</Muted>
                  </View>
                ) : null}
              </View>
              {!b.isActive ? <Badge tone="rose">Inactive</Badge> : null}
              <ChevronRight size={18} color={c.faint} />
            </View>
            {b.leadLimitType && b.leadLimitType !== "NONE" ? <Muted className="mt-2 text-xs">Quota: {b.leadLimit} leads {b.leadLimitType === "DAILY" ? "per day" : "per month"}</Muted> : null}
          </Card>
        ))}
      </View>

      <Sheet visible={creating} onClose={() => setCreating(false)} full title="New business" footer={<Button title="Create business" full loading={busy} onPress={create} />}>
        <Field label="Business name" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
        <LocationSelector value={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
        <Field label="Contact number" value={form.contactNo} onChangeText={(v) => setForm((f) => ({ ...f, contactNo: v }))} keyboardType="phone-pad" />
        <Field label="Details" value={form.detail} onChangeText={(v) => setForm((f) => ({ ...f, detail: v }))} multiline />
        <Text className="mb-1.5 text-[13px] font-semibold text-slate-700 dark:text-slate-300">Lead quota (confidential)</Text>
        <Segmented value={form.leadLimitType} onChange={(v) => setForm((f) => ({ ...f, leadLimitType: v }))} options={LIMIT_TYPES} />
        <View className="mb-3.5 mt-3 flex-row gap-2">
          {form.leadLimitType !== "NONE" ? (
            <View className="flex-1">
              <Field value={form.leadLimit} onChangeText={(v) => setForm((f) => ({ ...f, leadLimit: v.replace(/\D/g, "") }))} keyboardType="number-pad" placeholder="Leads" />
            </View>
          ) : null}
        </View>
        <SectionTitle>Owner login (optional)</SectionTitle>
        <Field label="Owner name" value={form.adminName} onChangeText={(v) => setForm((f) => ({ ...f, adminName: v }))} />
        <Field label="Owner email" value={form.adminEmail} onChangeText={(v) => setForm((f) => ({ ...f, adminEmail: v }))} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Temporary password" value={form.adminPassword} onChangeText={(v) => setForm((f) => ({ ...f, adminPassword: v }))} secureTextEntry hint="At least 8 characters." />
      </Sheet>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

export function BusinessDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["business", id], queryFn: () => get<{ business: any }>(`/businesses/${id}`) });
  const [sheet, setSheet] = useState<null | "edit" | "login" | "project">(null);
  const [edit, setEdit] = useState<any>({});
  const [login, setLogin] = useState({ name: "", email: "", password: "" });
  const [project, setProject] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const b = q.data?.business;
  useEffect(() => {
    if (b) {
      setEdit({
        name: b.name,
        state: b.state || "Gujarat",
        city: b.city || "",
        area: b.area || "",
        pincode: b.pincode || "",
        contactNo: b.contactNo,
        detail: b.detail,
        leadLimit: String(b.leadLimit || 0),
        leadLimitType: b.leadLimitType || "NONE",
      });
      setLogin({ name: b.businessAdmin?.name || "", email: b.businessAdmin?.email || "", password: "" });
    }
  }, [b?._id]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["business", id] });
    qc.invalidateQueries({ queryKey: ["businesses"] });
  };

  async function saveEdit() {
    setBusy(true);
    try {
      await patch(`/businesses/${id}`, { ...edit, leadLimit: Number(edit.leadLimit) || 0 });
      toast.success("Business updated");
      setSheet(null);
      refresh();
    } catch (e: any) {
      toast.error("Couldn't save", e?.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleActive() {
    Alert.alert(b.isActive ? "Deactivate business?" : "Reactivate business?", b.isActive ? "New leads are held and current NEW leads are paused until it's active again." : "Held leads will be released and assigned.", [
      { text: "Cancel", style: "cancel" },
      {
        text: b.isActive ? "Deactivate" : "Activate",
        style: b.isActive ? "destructive" : "default",
        onPress: async () => {
          try {
            const r = await patch<any>(`/businesses/${id}`, { isActive: !b.isActive });
            toast.success(b.isActive ? `Deactivated · ${r.holdResult?.heldCount ?? 0} leads held` : `Activated · ${r.releaseResult?.released ?? 0} leads released`);
            refresh();
          } catch (e: any) {
            toast.error("Couldn't update", e?.message);
          }
        },
      },
    ]);
  }

  async function saveLogin() {
    if (!/\S+@\S+\.\S+/.test(login.email) || login.password.length < 8) return toast.warn("Valid email and an 8+ character password are required");
    setBusy(true);
    try {
      await post(`/businesses/${id}/admin-user`, { ...login, email: login.email.trim().toLowerCase() });
      toast.success("Owner login saved", "Share the password securely.");
      setSheet(null);
      refresh();
    } catch (e: any) {
      toast.error("Couldn't save", e?.message);
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) return <Screen back title="Business"><Loading /></Screen>;
  if (q.error || !b) return <Screen back title="Business"><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;

  return (
    <Screen back title={b.name} subtitle={b.contactNo || undefined} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <View className="flex-row gap-2">
        <Badge tone={b.isActive ? "emerald" : "rose"}>{b.isActive ? "Active" : "Inactive"}</Badge>
        {b.leadLimitType !== "NONE" ? <Badge>Quota {b.leadLimit}/{b.leadLimitType === "DAILY" ? "day" : "month"}</Badge> : null}
      </View>
      <View className="mt-3 flex-row gap-2">
        <Button title="Edit" variant="secondary" className="flex-1" onPress={() => setSheet("edit")} />
        <Button title={b.isActive ? "Deactivate" : "Activate"} variant={b.isActive ? "danger" : "primary"} className="flex-1" onPress={toggleActive} />
      </View>

      <SectionTitle>Location & Contact</SectionTitle>
      <Card>
        <View className="flex-row items-center justify-between py-1.5">
          <Muted>State</Muted>
          <Text className="text-[14px] font-medium text-slate-900 dark:text-white">{b.state || "Gujarat"}</Text>
        </View>
        <View className="flex-row items-center justify-between border-t border-slate-100 py-1.5 dark:border-slate-800">
          <Muted>City</Muted>
          <Text className="text-[14px] font-medium text-slate-900 dark:text-white">{b.city || "—"}</Text>
        </View>
        {b.area ? (
          <View className="flex-row items-center justify-between border-t border-slate-100 py-1.5 dark:border-slate-800">
            <Muted>Area</Muted>
            <Text className="text-[14px] font-medium text-slate-900 dark:text-white">{b.area}</Text>
          </View>
        ) : null}
        {b.pincode ? (
          <View className="flex-row items-center justify-between border-t border-slate-100 py-1.5 dark:border-slate-800">
            <Muted>Pincode</Muted>
            <Text className="text-[14px] font-medium text-slate-900 dark:text-white">{b.pincode}</Text>
          </View>
        ) : null}
      </Card>

      <SectionTitle>Owner login</SectionTitle>
      <Card className="flex-row items-center gap-3" onPress={() => setSheet("login")}>
        <KeyRound size={20} color={c.brand} />
        <View className="flex-1">
          <Text className="text-[15px] font-medium text-slate-900 dark:text-white">{b.businessAdmin?.name || "Not set up"}</Text>
          <Muted className="text-xs">{b.businessAdmin?.email || "Tap to create the business owner's login"}</Muted>
        </View>
        <ChevronRight size={18} color={c.faint} />
      </Card>

      <SectionTitle right={<Button title="Project" size="sm" icon={<Plus size={14} color="#fff" />} onPress={() => { setProject({ name: "", stage: "ONGOING", location: "", hasRera: true, reraNumber: "", products: [], metaSources: [{ pageName: "", pageId: "", formName: "", formId: "" }] }); setSheet("project"); }} />}>
        Projects ({b.projects?.length || 0})
      </SectionTitle>
      {(b.projects || []).map((p: any) => (
        <Card key={p._id} className="mb-2" onPress={() => router.push(`/projects/${p._id}`)}>
          <View className="flex-row items-center gap-3">
            <Building2 size={20} color={c.brand} />
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-slate-900 dark:text-white">{p.name}</Text>
              <Muted className="text-xs">{String(p.stage).toLowerCase()} · {p.metaSources?.length || 0} Meta forms · {p.documents?.length || 0} docs</Muted>
            </View>
            <Pressable onPress={() => { setProject({ ...p, metaSources: p.metaSources?.length ? p.metaSources : [{ pageName: "", pageId: "", formName: "", formId: "" }] }); setSheet("project"); }} hitSlop={8} accessibilityLabel={`Edit ${p.name}`}>
              <Text className="text-[13px] font-semibold text-brand-600">Edit</Text>
            </Pressable>
          </View>
        </Card>
      ))}

      <SectionTitle>WhatsApp</SectionTitle>
      <Card className="flex-row items-center gap-3" onPress={() => router.push(`/businesses/${id}/whatsapp`)}>
        <WhatsAppGlyph size={22} color="#059669" />
        <View className="flex-1">
          <Text className="text-[15px] font-medium text-slate-900 dark:text-white">Templates & team settings</Text>
          <Muted className="text-xs">Create the message templates this business's team can send</Muted>
        </View>
        <ChevronRight size={18} color={c.faint} />
      </Card>

      <Sheet visible={sheet === "edit"} onClose={() => setSheet(null)} full title="Edit business" footer={<Button title="Save" full loading={busy} onPress={saveEdit} />}>
        <Field label="Name" value={edit.name} onChangeText={(v) => setEdit((e: any) => ({ ...e, name: v }))} />
        <LocationSelector value={edit} onChange={(patch) => setEdit((e: any) => ({ ...e, ...patch }))} />
        <Field label="Contact number" value={edit.contactNo} onChangeText={(v) => setEdit((e: any) => ({ ...e, contactNo: v }))} keyboardType="phone-pad" />
        <Field label="Details" value={edit.detail} onChangeText={(v) => setEdit((e: any) => ({ ...e, detail: v }))} multiline />
        <Text className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">Lead quota</Text>
        <Segmented value={edit.leadLimitType || "NONE"} onChange={(v) => setEdit((e: any) => ({ ...e, leadLimitType: v }))} options={LIMIT_TYPES} />
        {edit.leadLimitType !== "NONE" ? <View className="mt-3"><Field label="Leads" value={edit.leadLimit} onChangeText={(v) => setEdit((e: any) => ({ ...e, leadLimit: v.replace(/\D/g, "") }))} keyboardType="number-pad" /></View> : null}
      </Sheet>

      <Sheet visible={sheet === "login"} onClose={() => setSheet(null)} title="Owner login" subtitle="Creates or resets the business owner's account." footer={<Button title="Save login" full loading={busy} onPress={saveLogin} />}>
        <Field label="Name" value={login.name} onChangeText={(v) => setLogin((l) => ({ ...l, name: v }))} />
        <Field label="Email" value={login.email} onChangeText={(v) => setLogin((l) => ({ ...l, email: v }))} keyboardType="email-address" autoCapitalize="none" />
        <Field label="New password" value={login.password} onChangeText={(v) => setLogin((l) => ({ ...l, password: v }))} secureTextEntry hint="At least 8 characters." />
      </Sheet>

      {project ? <ProjectFormSheet visible={sheet === "project"} businessId={String(id)} project={project} onClose={() => setSheet(null)} onSaved={refresh} /> : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Project create / edit                                               */
/* ------------------------------------------------------------------ */

function ProjectFormSheet({ visible, businessId, project, onClose, onSaved }: { visible: boolean; businessId: string; project: any; onClose: () => void; onSaved: () => void }) {
  const { c } = useTheme();
  const [p, setP] = useState<any>(project);
  const [busy, setBusy] = useState(false);
  useEffect(() => setP(project), [project]);

  const set = (k: string, v: unknown) => setP((x: any) => ({ ...x, [k]: v }));
  const upd = (arr: "products" | "metaSources", i: number, k: string, v: unknown) => setP((x: any) => ({ ...x, [arr]: x[arr].map((r: any, j: number) => (j === i ? { ...r, [k]: v } : r)) }));

  const showProducts = p.stage === "COMPLETED" || (p.stage === "ONGOING" && p.hasRera);

  async function save() {
    if (!p.name?.trim()) return toast.warn("Project name is required");
    setBusy(true);
    try {
      const calculatedLocation = p.location?.trim() || [p.area, p.city, p.state, p.pincode].filter(Boolean).join(", ");
      const payload = {
        name: p.name.trim(),
        stage: p.stage,
        state: p.state || "Gujarat",
        city: p.city || undefined,
        area: p.area || "",
        pincode: p.pincode || "",
        location: calculatedLocation,
        hasRera: p.stage === "COMPLETED" ? true : p.stage === "ONGOING" ? Boolean(p.hasRera) : false,
        reraNumber: p.reraNumber,
        products: showProducts
          ? (p.products || [])
              .filter((x: any) => x.type)
              .map((x: any) => ({
                type: x.type,
                customType: x.customType?.trim() || undefined,
                priceRange: x.priceRange?.trim() || undefined,
                areaSqFt: x.areaSqFt?.trim() || undefined,
                units: x.units !== undefined && x.units !== "" ? Number(x.units) || undefined : undefined,
                isPenthouse: Boolean(x.isPenthouse || x.type === "PENTHOUSE"),
              }))
          : [],
        metaSources: (p.metaSources || []).filter((m: any) => m.pageName || m.pageId || m.formName || m.formId),
        business: businessId,
      };
      if (p._id) await patch(`/business-projects/${p._id}`, payload);
      else await post("/business-projects", payload);
      toast.success(p._id ? "Project updated" : "Project created");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error("Couldn't save project", e?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} full title={p._id ? "Edit project" : "New project"} footer={<Button title="Save project" full loading={busy} onPress={save} />}>
      <Field label="Project name" value={p.name} onChangeText={(v) => set("name", v)} />
      <Text className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">Stage</Text>
      <Segmented value={p.stage} onChange={(v) => set("stage", v)} options={[{ value: "UPCOMING", label: "Upcoming" }, { value: "ONGOING", label: "Ongoing" }, { value: "COMPLETED", label: "Completed" }]} />
      <View className="mt-3.5">
        <LocationSelector
          value={p}
          onChange={(patch) =>
            setP((x: any) => ({
              ...x,
              ...patch,
              location: [patch.area ?? x.area, patch.city ?? x.city, patch.state ?? x.state, patch.pincode ?? x.pincode].filter(Boolean).join(", "),
            }))
          }
        />
      </View>
      {p.stage === "ONGOING" ? (
        <View className="mb-3 flex-row items-center gap-3">
          <Text className="flex-1 text-[15px] text-slate-800 dark:text-slate-200">RERA registered</Text>
          <Switch value={Boolean(p.hasRera)} onValueChange={(v) => set("hasRera", v)} trackColor={{ true: c.brand, false: c.border }} />
        </View>
      ) : null}
      {p.stage === "COMPLETED" || (p.stage === "ONGOING" && p.hasRera) ? <Field label="RERA number" value={p.reraNumber} onChangeText={(v) => set("reraNumber", v)} autoCapitalize="characters" /> : null}

      {showProducts ? (
        <>
          <SectionTitle
            right={
              <Button
                title="Product"
                size="sm"
                icon={<Plus size={14} color="#fff" />}
                onPress={() =>
                  set("products", [
                    ...(p.products || []),
                    { type: "2BHK", customType: "", priceRange: "", areaSqFt: "", units: "", isPenthouse: false },
                  ])
                }
              />
            }
          >
            Products & Unit Inventory
          </SectionTitle>
          <Muted className="mb-2 text-xs">Configure product unit types, inventory count, and pricing tiers.</Muted>
          {(p.products || []).map((u: any, i: number) => (
            <Card key={i} className="mb-2.5">
              <View className="mb-2 flex-row items-center justify-between gap-2">
                <Text className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Product #{i + 1}
                </Text>
                <View className="flex-row items-center gap-2">
                  <Pressable
                    onPress={() => upd("products", i, "isPenthouse", !u.isPenthouse)}
                    className={cx(
                      "flex-row items-center gap-1 rounded-full border px-2 py-0.5",
                      u.isPenthouse || u.type === "PENTHOUSE"
                        ? "border-amber-500 bg-amber-500/15"
                        : "border-slate-200 dark:border-slate-700"
                    )}
                    accessibilityLabel="Toggle Penthouse"
                  >
                    <Text
                      className={cx(
                        "text-[10px] font-semibold",
                        u.isPenthouse || u.type === "PENTHOUSE" ? "text-amber-500" : "text-slate-600 dark:text-slate-400"
                      )}
                    >
                      👑 Penthouse{u.isPenthouse || u.type === "PENTHOUSE" ? " ✓" : ""}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => set("products", p.products.filter((_: any, j: number) => j !== i))}
                    hitSlop={8}
                    accessibilityLabel="Remove product"
                  >
                    <Trash2 size={16} color={c.faint} />
                  </Pressable>
                </View>
              </View>

              <View className="mb-2 flex-row flex-wrap gap-1">
                {UNIT_TYPES.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => upd("products", i, "type", t)}
                    className={cx(
                      "rounded-full border px-2 py-1",
                      u.type === t ? "border-brand-600 bg-brand-600" : "border-slate-200 dark:border-slate-700"
                    )}
                  >
                    <Text className={cx("text-[10px]", u.type === t ? "font-semibold text-white" : "text-slate-600 dark:text-slate-300")}>
                      {t.replace(/_/g, " ")}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {u.type === "OTHER" ? (
                <View className="mb-2">
                  <Field
                    label="Custom type"
                    placeholder="e.g. Duplex, Row House, Studio Plus"
                    value={u.customType || ""}
                    onChangeText={(v) => upd("products", i, "customType", v)}
                  />
                </View>
              ) : null}

              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Field
                    label="Price Range"
                    placeholder="e.g. 85L - 95L"
                    value={u.priceRange || ""}
                    onChangeText={(v) => upd("products", i, "priceRange", v)}
                  />
                </View>
                <View className="flex-1">
                  <Field
                    label="Area (sq.ft)"
                    placeholder="e.g. 650 - 1200"
                    value={u.areaSqFt ? String(u.areaSqFt) : ""}
                    onChangeText={(v) => upd("products", i, "areaSqFt", v)}
                  />
                </View>
              </View>

              <View className="mt-1">
                <Field
                  label="Units count (Inventory)"
                  placeholder="e.g. 24"
                  value={u.units !== undefined && u.units !== null ? String(u.units) : ""}
                  onChangeText={(v) => upd("products", i, "units", v.replace(/\D/g, ""))}
                  keyboardType="number-pad"
                />
              </View>
            </Card>
          ))}
        </>
      ) : null}

      <SectionTitle right={<Button title="Form" size="sm" variant="secondary" onPress={() => set("metaSources", [...(p.metaSources || []), { pageName: "", pageId: "", formName: "", formId: "" }])} />}>Meta lead forms</SectionTitle>
      <Muted className="mb-2 text-xs">Leads from these pages/forms are routed to this project.</Muted>
      {(p.metaSources || []).map((m: any, i: number) => (
        <Card key={i} className={cx("mb-2")}>
          <View className="flex-row gap-2">
            <View className="flex-1"><Field placeholder="Page name" value={m.pageName} onChangeText={(v) => upd("metaSources", i, "pageName", v)} /></View>
            <View className="flex-1"><Field placeholder="Page ID" value={m.pageId} onChangeText={(v) => upd("metaSources", i, "pageId", v)} keyboardType="number-pad" /></View>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1"><Field placeholder="Form name" value={m.formName} onChangeText={(v) => upd("metaSources", i, "formName", v)} /></View>
            <View className="flex-1"><Field placeholder="Form ID" value={m.formId} onChangeText={(v) => upd("metaSources", i, "formId", v)} keyboardType="number-pad" /></View>
          </View>
          <Pressable onPress={() => set("metaSources", p.metaSources.filter((_: any, j: number) => j !== i))} className="self-end" accessibilityLabel="Remove form">
            <Text className="text-xs text-rose-600">Remove</Text>
          </Pressable>
        </Card>
      ))}
    </Sheet>
  );
}
