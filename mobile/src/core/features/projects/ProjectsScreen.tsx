import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  FolderOpen,
  ImageIcon,
  Loader2,
  MapPin,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react-native";
import { del, get, put } from "../../api/client";
import { useAuth } from "../../auth/store";
import { Avatar, Badge, Button, Card, Chip, EmptyState, ErrorState, IconButton, ListSkeleton, Loading, Muted, Screen, SectionTitle, Segmented, Sheet, Stat, cx } from "../../ui";
import { useTheme } from "../../ui/theme";
import { toast } from "../../ui/toast";
import { LEAD_STATUSES, STATUS_STYLE, statusLabel } from "../../lib/leadMeta";
import { DOC_TYPES, IMAGE_TYPES, formatBytes, uploadProjectFiles, useUploads } from "./uploader";
import { GUJARAT_CITIES } from "../../lib/locations";

const DOC_CATEGORIES = ["BROCHURE", "PRICE_SHEET", "FLOOR_PLAN", "PAYMENT_PLAN", "AMENITIES", "OTHER"];
const STAGE_TONE: Record<string, "emerald" | "amber" | "brand"> = { ONGOING: "brand", UPCOMING: "amber", COMPLETED: "emerald" };
const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (m) => m.toUpperCase());

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

export function ProjectsListScreen() {
  const { c } = useTheme();
  const role = useAuth((s) => s.user?.role);
  const [selectedCity, setSelectedCity] = useState("");
  const q = useQuery({
    queryKey: ["projects", selectedCity],
    queryFn: () => get<{ projects: any[] }>("/business-projects", { limit: 100, city: selectedCity || undefined }),
  });

  return (
    <Screen title="Projects" subtitle={role === "SALES" ? "Projects you work on" : "Your portfolio — details are maintained by LeadFlow admins"} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <View className="mb-3 flex-row flex-wrap gap-1">
        <Chip label="All Cities" active={!selectedCity} onPress={() => setSelectedCity("")} />
        {GUJARAT_CITIES.map((cityName) => (
          <Chip key={cityName} label={cityName} active={selectedCity === cityName} onPress={() => setSelectedCity(selectedCity === cityName ? "" : cityName)} />
        ))}
      </View>
      {q.isLoading ? <ListSkeleton rows={4} /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      {q.data && !q.data.projects.length ? <EmptyState title="No projects yet" message="Projects are created by your LeadFlow administrator." icon={<Building2 size={28} color={c.faint} />} /> : null}
      {(q.data?.projects || []).map((p) => (
        <Card key={p._id} className="mb-2.5" onPress={() => router.push(`/projects/${p._id}`)}>
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-900">
              <Building2 size={22} color={c.brand} />
            </View>
            <View className="flex-1">
              <Text className="text-[16px] font-semibold text-slate-900 dark:text-white">{p.name}</Text>
              <View className="mt-0.5 flex-row items-center gap-1">
                <MapPin size={12} color={c.faint} />
                <Muted className="text-xs">{p.location || [p.area, p.city, p.pincode].filter(Boolean).join(", ") || "Location not set"}</Muted>
              </View>
            </View>
            <ChevronRight size={18} color={c.faint} />
          </View>
          <View className="mt-3 flex-row flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <Badge tone={STAGE_TONE[p.stage] || "slate"}>{label(p.stage)}</Badge>
            {p.reraNumber ? <Badge icon={<ShieldCheck size={10} color="#475569" />}>RERA</Badge> : null}
            <Muted className="text-xs">{p.products?.length || 0} unit types · {p.documents?.length || 0} documents</Muted>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

function periodLabel(p: string, range: string) {
  if (range === "month") {
    const [y, m] = p.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" });
  }
  if (range === "week") return p.split("-W")[1] ? `W${p.split("-W")[1]}` : p;
  const d = new Date(`${p}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function ProjectStats({ projectId }: { projectId: string }) {
  const { isDark } = useTheme();
  const [range, setRange] = useState<"day" | "week" | "month">("day");
  const q = useQuery({ queryKey: ["project-stats", projectId, range], queryFn: () => get<any>(`/business-projects/${projectId}/stats`, { range }) });
  const [active, setActive] = useState<number | null>(null);
  const t = q.data?.totals;
  const series: any[] = q.data?.series || [];
  const max = Math.max(1, ...series.map((s) => s.leads));
  const blue = isDark ? "#3987e5" : "#2a78d6";
  const aqua = isDark ? "#199e70" : "#1baf7a";

  return (
    <>
      <SectionTitle>Lead statistics</SectionTitle>
      <View className="flex-row gap-2.5">
        <Stat label="Today" value={t?.today ?? "…"} />
        <Stat label="This week" value={t?.thisWeek ?? "…"} />
        <Stat label="This month" value={t?.thisMonth ?? "…"} />
      </View>
      <View className="mt-2.5 flex-row gap-2.5">
        <Stat label="All time" value={t?.total ?? "…"} />
        <Stat label={`Won · ${t?.conversionRate ?? 0}%`} value={t?.won ?? "…"} tone="#16A34A" />
        <Stat label="Not called yet" value={t?.uncontacted ?? "…"} tone="#E11D48" />
      </View>

      <Card className="mt-3">
        <Segmented value={range} onChange={(v) => { setRange(v); setActive(null); }} options={[{ value: "day", label: "Daily" }, { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }]} />
        <View className="mt-3 flex-row items-center gap-4">
          <View className="flex-row items-center gap-1.5"><View className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: blue }} /><Text className="text-xs text-slate-600 dark:text-slate-300">Leads</Text></View>
          <View className="flex-row items-center gap-1.5"><View className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: aqua }} /><Text className="text-xs text-slate-600 dark:text-slate-300">Won</Text></View>
          <Text className="ml-auto text-xs text-slate-500">
            {active !== null && series[active] ? `${periodLabel(series[active].period, range)}: ${series[active].leads} leads · ${series[active].won} won` : "Tap a bar"}
          </Text>
        </View>
        {q.isLoading ? <Loading /> : null}
        {!q.isLoading && !series.length ? <Muted className="py-8 text-center">No leads in this period.</Muted> : null}
        {series.length ? (
          <View className="mt-3 h-40 flex-row items-end gap-1">
            {series.map((s, i) => (
              <Pressable key={s.period} onPress={() => setActive(i)} className="h-full flex-1 justify-end" accessibilityLabel={`${periodLabel(s.period, range)}: ${s.leads} leads, ${s.won} won`}>
                <View style={{ height: `${Math.max(2, (s.leads / max) * 100)}%`, backgroundColor: blue, opacity: active === null || active === i ? 1 : 0.45 }} className="w-full rounded-t-[4px]">
                  {s.won ? <View style={{ height: `${(s.won / Math.max(1, s.leads)) * 100}%`, backgroundColor: aqua }} className="absolute bottom-0 w-full" /> : null}
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
        {series.length ? (
          <View className="mt-1 flex-row justify-between">
            <Text className="text-[10px] text-slate-400">{periodLabel(series[0].period, range)}</Text>
            <Text className="text-[10px] text-slate-400">{periodLabel(series[series.length - 1].period, range)}</Text>
          </View>
        ) : null}
      </Card>

      {q.data ? (
        <Card className="mt-3">
          <Text className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">By status</Text>
          {LEAD_STATUSES.map((s) => {
            const n = q.data.byStatus?.[s] || 0;
            const pct = t?.total ? (n / t.total) * 100 : 0;
            return (
              <Pressable key={s} onPress={() => router.push(`/leads?project=${projectId}&status=${s}`)} className="mb-2" accessibilityLabel={`${statusLabel(s)}: ${n}`}>
                <View className="mb-1 flex-row justify-between">
                  <Text className="text-[13px] text-slate-700 dark:text-slate-300">{statusLabel(s)}</Text>
                  <Text className="text-[13px] font-semibold text-slate-900 dark:text-white">{n}</Text>
                </View>
                <View className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                  <View className="h-2 rounded-full" style={{ width: `${Math.max(n ? 3 : 0, pct)}%`, backgroundColor: STATUS_STYLE[s].dot }} />
                </View>
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      {q.data?.team?.length ? (
        <Card className="mt-3">
          <Text className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">Leads by salesperson</Text>
          {q.data.team.map((m: any) => (
            <View key={m._id} className="flex-row items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800">
              <Text className="text-[14px] text-slate-800 dark:text-slate-200">{m.name}</Text>
              <Muted>{m.leads} leads · {m.won} won</Muted>
            </View>
          ))}
        </Card>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Team (owners & admins)                                              */
/* ------------------------------------------------------------------ */

function ProjectTeam({ projectId, team, onSaved }: { projectId: string; team: any[]; onSaved: () => void }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const members = team.filter((m) => m.onProject);

  useEffect(() => {
    if (open) setSel(team.filter((m) => m.onProject).map((m) => String(m._id)));
  }, [open, team]);

  async function save() {
    setBusy(true);
    try {
      await put(`/business-projects/${projectId}/team`, { userIds: sel });
      toast.success("Project team updated");
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast.error("Couldn't update team", e?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionTitle right={<Button title="Manage" size="sm" variant="secondary" icon={<Users size={14} color={c.text} />} onPress={() => setOpen(true)} />}>
        Sales team ({members.length})
      </SectionTitle>
      <Card>
        {!members.length ? <Muted>No salesperson works on this project yet. Leads here can't be auto-assigned.</Muted> : null}
        {members.map((m, i) => (
          <View key={m._id} className={cx("flex-row items-center gap-3 py-2", i < members.length - 1 && "border-b border-slate-100 dark:border-slate-800")}>
            <Avatar name={m.name} uri={m.profilePhotoUrl} size={34} />
            <View className="flex-1">
              <Text className="text-[14px] font-medium text-slate-900 dark:text-white">{m.name}</Text>
              <Muted className="text-xs">{m.allProjects ? "Works on all projects" : m.email}</Muted>
            </View>
            {!m.isActive ? <Badge tone="rose">Blocked</Badge> : null}
          </View>
        ))}
      </Card>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        full
        title="Who works on this project?"
        subtitle="Selected salespeople receive and see this project's leads."
        footer={
          <>
            <Button title="New salesperson" variant="secondary" className="flex-1" icon={<UserPlus size={15} color={c.text} />} onPress={() => { setOpen(false); router.push("/team"); }} />
            <Button title="Save" className="flex-1" loading={busy} onPress={save} />
          </>
        }
      >
        {!team.length ? <Muted>No sales staff yet. Add salespeople first.</Muted> : null}
        {team.map((m) => {
          const on = sel.includes(String(m._id));
          return (
            <Pressable
              key={m._id}
              onPress={() => setSel((s) => (on ? s.filter((x) => x !== String(m._id)) : [...s, String(m._id)]))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              className="min-h-[56px] flex-row items-center gap-3 border-b border-slate-100 dark:border-slate-800"
            >
              <View className={cx("h-6 w-6 items-center justify-center rounded-md border-2", on ? "border-brand-600 bg-brand-600" : "border-slate-300")}>{on ? <Check size={14} color="#fff" /> : null}</View>
              <Avatar name={m.name} uri={m.profilePhotoUrl} size={34} />
              <View className="flex-1">
                <Text className="text-[15px] text-slate-900 dark:text-white">{m.name}</Text>
                <Muted className="text-xs">{m.email}{!m.isActive ? " · blocked" : ""}</Muted>
              </View>
            </Pressable>
          );
        })}
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Documents (view for everyone; upload/delete for admins)             */
/* ------------------------------------------------------------------ */

function UploadProgressSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { items, running } = useUploads();
  const done = items.filter((i) => i.status === "done").length;
  const total = items.length;
  const overall = total ? Math.round(items.reduce((a, i) => a + (i.status === "error" ? 100 : i.progress), 0) / total) : 0;
  return (
    <Sheet visible={visible} onClose={running ? () => undefined : onClose} title={running ? `Uploading ${done + 1 > total ? total : done + 1} of ${total}` : `Uploaded ${done} of ${total}`} subtitle={`${overall}% complete`} footer={<Button title={running ? "Uploading…" : "Done"} full disabled={running} onPress={onClose} />}>
      <View className="mb-4 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800">
        <View className="h-2.5 rounded-full bg-brand-600" style={{ width: `${overall}%` }} />
      </View>
      {items.map((i) => (
        <View key={i.id} className="mb-3">
          <View className="flex-row items-center gap-2">
            {i.status === "done" ? <CheckCircle2 size={16} color="#16A34A" /> : i.status === "error" ? <AlertCircle size={16} color="#E11D48" /> : <Loader2 size={16} color="#4F46E5" />}
            <Text className="flex-1 text-[14px] text-slate-800 dark:text-slate-200" numberOfLines={1}>{i.name}</Text>
            <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">{i.status === "error" ? "Failed" : i.status === "done" ? "Done" : `${i.progress}%`}</Text>
          </View>
          <View className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
            <View className={cx("h-1.5 rounded-full", i.status === "error" ? "bg-rose-500" : i.status === "done" ? "bg-emerald-500" : "bg-brand-500")} style={{ width: `${i.status === "error" ? 100 : i.progress}%` }} />
          </View>
          <Text className={cx("mt-1 text-[11px]", i.status === "error" ? "text-rose-600" : "text-slate-400")}>
            {i.status === "error" ? i.error : `${i.size ? formatBytes(i.size) : ""}${i.compressed ? " · photo compressed to fit 1 MB" : ""}`}
          </Text>
        </View>
      ))}
    </Sheet>
  );
}

function ProjectDocuments({ project, canManage, onChanged }: { project: any; canManage: boolean; onChanged: () => void }) {
  const { c } = useTheme();
  const [category, setCategory] = useState("BROCHURE");
  const [progressOpen, setProgressOpen] = useState(false);
  const running = useUploads((s) => s.running);

  async function start(files: { uri: string; name: string; mimeType?: string | null; size?: number | null }[]) {
    if (!files.length) return;
    if (files.length > 10) return toast.warn("Up to 10 files at a time");
    setProgressOpen(true);
    const r = await uploadProjectFiles(project._id, files, category);
    onChanged();
    if (r.failed) toast.warn(`${r.ok} uploaded, ${r.failed} failed`, "See the list for details.");
    else toast.success(`${r.ok} file${r.ok === 1 ? "" : "s"} uploaded`);
  }

  async function pickFiles() {
    // Files from this device's storage (copied into the app before upload).
    const res = await DocumentPicker.getDocumentAsync({ type: DOC_TYPES, multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return;
    await start(res.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size })));
  }

  async function pickPhotos() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 10, quality: 1 });
    if (res.canceled) return;
    await start(
      res.assets.map((a, i) => ({
        uri: a.uri,
        name: a.fileName || `photo-${Date.now()}-${i}.jpg`,
        mimeType: a.mimeType && IMAGE_TYPES.includes(a.mimeType) ? a.mimeType : a.mimeType || "image/jpeg",
        size: a.fileSize,
      })),
    );
  }

  async function open(doc: any) {
    try {
      const r = await get<{ url: string }>(`/business-projects/${project._id}/documents/${doc._id}/url`);
      await WebBrowser.openBrowserAsync(r.url);
    } catch (e: any) {
      toast.error("Couldn't open", e?.message);
    }
  }

  function remove(doc: any) {
    Alert.alert("Delete document?", doc.name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await del(`/business-projects/${project._id}/documents/${doc._id}`);
            onChanged();
          } catch (e: any) {
            toast.error("Couldn't delete", e?.message);
          }
        },
      },
    ]);
  }

  return (
    <>
      <SectionTitle>Documents ({project.documents?.length || 0})</SectionTitle>
      {canManage && project.stage !== "UPCOMING" ? (
        <Card className="mb-3">
          <Text className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">Upload as</Text>
          <View className="mb-3 flex-row flex-wrap gap-1.5">
            {DOC_CATEGORIES.map((cat) => (
              <Pressable key={cat} onPress={() => setCategory(cat)} className={cx("rounded-full border px-3 py-1.5", category === cat ? "border-brand-600 bg-brand-600" : "border-slate-200 dark:border-slate-700")}>
                <Text className={cx("text-xs", category === cat ? "font-semibold text-white" : "text-slate-700 dark:text-slate-300")}>{label(cat)}</Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row gap-2">
            <Button title="Files" variant="secondary" className="flex-1" disabled={running} icon={<FolderOpen size={16} color={c.text} />} onPress={pickFiles} />
            <Button title="Photos" variant="secondary" className="flex-1" disabled={running} icon={<ImageIcon size={16} color={c.text} />} onPress={pickPhotos} />
          </View>
          <Muted className="mt-2 text-[11px]">Select several at once. PDF / Word / Excel / PowerPoint up to 20 MB; photos up to 1 MB (larger photos are compressed automatically).</Muted>
        </Card>
      ) : null}
      {!project.documents?.length ? <Muted>No documents yet.</Muted> : null}
      {(project.documents || []).map((d: any) => (
        <Card key={d._id} className="mb-2 flex-row items-center gap-3" onPress={() => open(d)}>
          {String(d.mimeType || "").startsWith("image/") ? <ImageIcon size={20} color={c.brand} /> : <FileText size={20} color={c.brand} />}
          <View className="flex-1">
            <Text className="text-[14px] font-medium text-slate-900 dark:text-white" numberOfLines={1}>{d.name}</Text>
            <Muted className="text-xs">{label(String(d.category || "OTHER"))}{d.size ? ` · ${formatBytes(d.size)}` : ""}</Muted>
          </View>
          {canManage ? <IconButton icon={<Trash2 size={18} color={c.faint} />} label={`Delete ${d.name}`} onPress={() => remove(d)} /> : <ChevronRight size={18} color={c.faint} />}
        </Card>
      ))}
      <UploadProgressSheet visible={progressOpen} onClose={() => setProgressOpen(false)} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

export function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const qc = useQueryClient();
  const role = useAuth((s) => s.user?.role);
  const isAdmin = role === "ADMIN" || role === "MANAGER";
  const canManageTeam = isAdmin || role === "BUSINESS";
  const q = useQuery({ queryKey: ["project", id], queryFn: () => get<{ project: any; team: any[] }>(`/business-projects/${id}`), enabled: Boolean(id) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["project", id] });
    qc.invalidateQueries({ queryKey: ["project-stats", id] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };

  const p = q.data?.project;
  const facts = useMemo(() => {
    if (!p) return [];
    const totalUnits = (p.products || []).reduce((acc: number, u: any) => acc + (Number(u.units) || 0), 0);
    return [
      ["Stage", label(p.stage)],
      ["City", p.city],
      ["Area", p.area],
      ["State", p.state],
      ["Pincode", p.pincode],
      ["Location", p.location || [p.area, p.city, p.state, p.pincode].filter(Boolean).join(", ") || p.upcoming?.location || p.completed?.location],
      ["Developer group", p.developerGroup],
      ["RERA status", p.hasRera || p.reraNumber ? p.reraNumber || "RERA Approved" : "Non-RERA"],
      ["Total inventory", totalUnits ? `${totalUnits} units` : undefined],
      ["Unit configurations", p.products?.length ? `${p.products.length} types` : undefined],
      ["Penthouse", p.penthouse ? "Available" : undefined],
      ["Completion year", p.completed?.completionYear],
      ["Total area", p.completed?.area],
      ["Business type", p.completed?.businessType],
      ["RERA tenure", p.upcoming?.reraTenureYears ? `${p.upcoming.reraTenureYears} years` : undefined],
      ["Documents in vault", p.documents?.length ? `${p.documents.length} files` : undefined],
      ["Amenities", p.ongoing?.amenities || p.completed?.amenities || undefined],
      ["Last updated", p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : undefined],
    ].filter(([, v]) => v !== undefined && v !== null && v !== "");
  }, [p]);

  if (q.isLoading) return <Screen back title="Project"><Loading /></Screen>;
  if (q.error || !p) return <Screen back title="Project"><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;

  const extraDetails = [p.ongoing?.details, p.upcoming?.details, p.completed?.details].filter((d) => d && typeof d === "object" && Object.keys(d).length);

  return (
    <Screen back title={p.name} subtitle={p.business?.name || undefined} refreshing={q.isRefetching} onRefresh={() => { q.refetch(); qc.invalidateQueries({ queryKey: ["project-stats", id] }); }}>
      <View className="flex-row flex-wrap gap-2">
        <Badge tone={STAGE_TONE[p.stage] || "slate"}>{label(p.stage)}</Badge>
        {p.reraNumber ? <Badge icon={<ShieldCheck size={10} color="#475569" />}>RERA {p.reraNumber}</Badge> : null}
      </View>
      <Button title="View this project's leads" className="mt-3" full icon={<Users size={16} color="#fff" />} onPress={() => router.push(`/leads?project=${p._id}`)} />

      <ProjectStats projectId={String(p._id)} />

      <SectionTitle>Project details</SectionTitle>
      <Card>
        {facts.map(([k, v], i) => (
          <View key={String(k)} className={cx("flex-row items-start justify-between gap-4 py-2.5", i < facts.length - 1 && "border-b border-slate-100 dark:border-slate-800")}>
            <Muted>{k}</Muted>
            <Text className="flex-1 text-right text-[14px] font-medium text-slate-900 dark:text-white">{String(v)}</Text>
          </View>
        ))}
        {extraDetails.map((d: any, i) =>
          Object.entries(d).map(([k, v]) => (
            <View key={`${i}-${k}`} className="flex-row items-start justify-between gap-4 border-t border-slate-100 py-2.5 dark:border-slate-800">
              <Muted>{label(k)}</Muted>
              <Text className="flex-1 text-right text-[14px] text-slate-900 dark:text-white">{typeof v === "object" ? JSON.stringify(v) : String(v)}</Text>
            </View>
          )),
        )}
      </Card>
      {!isAdmin ? <Muted className="mt-2 text-[11px]">Project details and documents are maintained by your LeadFlow admin team.</Muted> : null}

      {p.products?.length ? (
        <>
          <SectionTitle>Units & pricing</SectionTitle>
          <Card>
            {p.products.map((u: any, i: number) => (
              <View key={i} className={cx("py-3", i < p.products.length - 1 && "border-b border-slate-100 dark:border-slate-800")}>
                <View className="flex-row items-center justify-between">
                  <Text className="text-[15px] font-semibold text-slate-900 dark:text-white">{u.customType || label(String(u.type))}</Text>
                  <Text className="text-[15px] font-bold text-slate-900 dark:text-white">{u.priceRange ? `${u.priceRange}` : "—"}</Text>
                </View>
                <Muted className="mt-0.5 text-xs">
                  {[u.areaSqFt ? `${u.areaSqFt} sq.ft` : "", u.units ? `${u.units} units` : "", u.isPenthouse ? "Penthouse" : ""].filter(Boolean).join(" · ") || "No size details"}
                </Muted>
                {u.details && Object.keys(u.details).length ? (
                  <Muted className="mt-1 text-xs">{Object.entries(u.details).map(([k, v]) => `${label(k)}: ${v}`).join(" · ")}</Muted>
                ) : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {canManageTeam ? <ProjectTeam projectId={String(p._id)} team={q.data?.team || []} onSaved={refresh} /> : null}

      <ProjectDocuments project={p} canManage={isAdmin} onChanged={refresh} />
    </Screen>
  );
}
