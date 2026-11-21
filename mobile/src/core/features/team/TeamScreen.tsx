import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FolderGit2, Lock, Plus, Unlock, UserRound } from "lucide-react-native";
import { get, patch, post } from "../../api/client";
import { useRole } from "../../auth/permissions";
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Field, ListSkeleton, Muted, Screen, Sheet, cx } from "../../ui";
import { useTheme } from "../../ui/theme";
import { toast } from "../../ui/toast";

/** Sales staff: add, block/unblock, assign projects (and daily caps for admins). */
export default function TeamScreen() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const role = useRole();
  const isAdmin = role === "ADMIN" || role === "MANAGER";
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [projectsFor, setProjectsFor] = useState<any | null>(null);
  const [selProjects, setSelProjects] = useState<string[]>([]);
  const [capFor, setCapFor] = useState<any | null>(null);
  const [cap, setCap] = useState("");
  const [busy, setBusy] = useState(false);

  const team = useQuery({ queryKey: ["team"], queryFn: () => get<{ users: any[] }>("/users", { role: "SALES", status: "ALL", limit: 100 }) });
  const projects = useQuery({ queryKey: ["projects-lite"], queryFn: () => get<{ projects: any[] }>("/business-projects", { limit: 100 }) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["team"] });
    qc.invalidateQueries({ queryKey: ["sales-users"] });
  };

  async function create() {
    if (!form.name.trim() || !/\S+@\S+\.\S+/.test(form.email) || form.password.length < 8) return toast.warn("Check the details", "Name, valid email and an 8+ character password are required.");
    setBusy(true);
    try {
      await post("/users", { ...form, email: form.email.trim().toLowerCase(), role: "SALES", assignedProjects: selProjects });
      toast.success("Salesperson added", "Share the email and password with them securely.");
      setAdding(false);
      setForm({ name: "", email: "", password: "" });
      setSelProjects([]);
      refresh();
    } catch (e: any) {
      toast.error("Couldn't add", e?.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleBlock(u: any) {
    Alert.alert(u.isActive ? `Block ${u.name}?` : `Unblock ${u.name}?`, u.isActive ? "They'll be signed out everywhere and stop receiving leads." : "They'll be able to sign in and receive leads again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: u.isActive ? "Block" : "Unblock",
        style: u.isActive ? "destructive" : "default",
        onPress: async () => {
          try {
            await patch(`/users/${u._id}/status`, { isActive: !u.isActive });
            refresh();
          } catch (e: any) {
            toast.error("Couldn't update", e?.message);
          }
        },
      },
    ]);
  }

  async function saveProjects() {
    setBusy(true);
    try {
      await patch(`/users/${projectsFor._id}/assigned-projects`, { assignedProjects: selProjects });
      toast.success("Projects updated");
      setProjectsFor(null);
      refresh();
    } catch (e: any) {
      toast.error("Couldn't save", e?.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveCap() {
    const n = Number(cap);
    if (!Number.isFinite(n) || n < 0 || n > 1000) return toast.warn("Enter 0–1000 (0 = unlimited)");
    try {
      await patch(`/users/${capFor._id}/capacity`, { dailyLeadLimit: Math.floor(n) });
      toast.success("Daily limit updated");
      setCapFor(null);
      refresh();
    } catch (e: any) {
      toast.error("Couldn't save", e?.message);
    }
  }

  const ProjectPicker = () => (
    <View>
      {(projects.data?.projects || []).map((p) => {
        const on = selProjects.includes(p._id);
        return (
          <Pressable key={p._id} onPress={() => setSelProjects((s) => (on ? s.filter((x) => x !== p._id) : [...s, p._id]))} accessibilityRole="checkbox" accessibilityState={{ checked: on }} className="min-h-[50px] flex-row items-center gap-3 border-b border-slate-100 dark:border-slate-800">
            <View className={cx("h-5 w-5 items-center justify-center rounded-md border", on ? "border-brand-600 bg-brand-600" : "border-slate-300")}>{on ? <Check size={14} color="#fff" /> : null}</View>
            <Text className="flex-1 text-[15px] text-slate-800 dark:text-slate-200">{p.name}</Text>
            {p.business?.name && isAdmin ? <Muted className="text-xs">{p.business.name}</Muted> : null}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Screen title="Sales team" back refreshing={team.isRefetching} onRefresh={() => team.refetch()} right={<Button title="Add" size="sm" icon={<Plus size={14} color="#fff" />} onPress={() => { setSelProjects([]); setAdding(true); }} />}>
      {team.isLoading ? <ListSkeleton /> : null}
      {team.error ? <ErrorState error={team.error} onRetry={() => team.refetch()} /> : null}
      {team.data && !team.data.users.length ? <EmptyState title="No salespeople yet" message="Add your sales staff to start distributing leads automatically." icon={<UserRound size={28} color={c.faint} />} /> : null}
      {(team.data?.users || []).map((u) => (
        <Card key={u._id} className={cx("mb-2.5", !u.isActive && "opacity-70")}>
          <View className="flex-row items-center gap-3">
            <Avatar name={u.name} uri={u.profilePhotoUrl} size={44} />
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-[15px] font-semibold text-slate-900 dark:text-white">{u.name}</Text>
                {!u.isActive ? <Badge tone="rose">Blocked</Badge> : null}
              </View>
              <Muted className="text-xs">{u.email}</Muted>
            </View>
          </View>
          <View className="mt-3 flex-row gap-4">
            <Muted className="text-xs">Today: {u.assignedToday ?? 0}{u.dailyLeadLimit ? ` / ${u.dailyLeadLimit}` : ""}</Muted>
            <Muted className="text-xs">Total: {u.assignedLeadCount ?? 0}</Muted>
            <Muted className="flex-1 text-xs" >{(u.assignedProjects || []).map((p: any) => p.name).join(", ") || "All business projects"}</Muted>
          </View>
          <View className="mt-3 flex-row flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <Button title="Projects" size="sm" variant="secondary" icon={<FolderGit2 size={13} color={c.text} />} onPress={() => { setSelProjects((u.assignedProjects || []).map((p: any) => p._id || p)); setProjectsFor(u); }} />
            <Button title="Daily limit" size="sm" variant="secondary" onPress={() => { setCap(String(u.dailyLeadLimit ?? 5)); setCapFor(u); }} />
            <Button title={u.isActive ? "Block" : "Unblock"} size="sm" variant={u.isActive ? "ghost" : "secondary"} icon={u.isActive ? <Lock size={13} color={c.danger} /> : <Unlock size={13} color={c.text} />} onPress={() => toggleBlock(u)} />
          </View>
        </Card>
      ))}

      <Sheet visible={adding} onClose={() => setAdding(false)} full title="Add salesperson" footer={<Button title="Create account" full loading={busy} onPress={create} />}>
        <Field label="Full name" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} autoCapitalize="words" />
        <Field label="Email" value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Temporary password" value={form.password} onChangeText={(v) => setForm((f) => ({ ...f, password: v }))} secureTextEntry hint="At least 8 characters. They can change it in Settings." />
        <Text className="mb-1 mt-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">Projects</Text>
        <Muted className="mb-1 text-xs">Leave empty to work on all your business's projects.</Muted>
        <ProjectPicker />
      </Sheet>

      <Sheet visible={Boolean(projectsFor)} onClose={() => setProjectsFor(null)} full title={`Projects · ${projectsFor?.name || ""}`} subtitle="They only receive and see leads for these projects." footer={<Button title="Save" full loading={busy} onPress={saveProjects} />}>
        <ProjectPicker />
      </Sheet>

      <Sheet visible={Boolean(capFor)} onClose={() => setCapFor(null)} title={`Daily lead limit · ${capFor?.name || ""}`} footer={<Button title="Save" full onPress={saveCap} />}>
        <Field value={cap} onChangeText={(v) => setCap(v.replace(/\D/g, ""))} keyboardType="number-pad" hint="Automatic leads per day. 0 = unlimited." />
      </Sheet>
    </Screen>
  );
}
