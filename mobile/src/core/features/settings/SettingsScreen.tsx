import { useEffect, useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as LocalAuthentication from "expo-local-authentication";
import { Camera, LogOut, Moon, Smartphone, Sun, Monitor, Trash2 } from "lucide-react-native";
import { api, del, get, patch, post, tokenStore } from "../../api/client";
import { useAuth } from "../../auth/store";
import { Avatar, Button, Card, Field, Muted, Row, Screen, SectionTitle, Segmented, Sheet } from "../../ui";
import { useTheme } from "../../ui/theme";
import { toast } from "../../ui/toast";
import { getStoredPushToken, registerForPush } from "../../push/push";
import { saveThemePreference } from "../../AppRoot";
import { APP_NAME, APP_VERSION } from "../../config";
import { timeAgo } from "../../lib/leadMeta";
import { queryClient } from "../../query";

const PREFS: { key: string; label: string; hint: string }[] = [
  { key: "newLead", label: "New leads", hint: "A lead is assigned or released to you" },
  { key: "assignment", label: "Assignments", hint: "Leads moved to you by a manager" },
  { key: "followup", label: "Follow-up reminders", hint: "24 hours and 15 minutes before" },
  { key: "sla", label: "SLA alerts", hint: "Leads waiting too long for first contact" },
  { key: "mention", label: "Mentions", hint: "Someone @mentions you in a note" },
  { key: "whatsapp", label: "WhatsApp", hint: "Failed sends and connection changes" },
  { key: "activity", label: "Team activity", hint: "Every call your team logs (busy!)" },
  { key: "system", label: "Account & system", hint: "Limits, security and other updates" },
];

export default function SettingsScreen() {
  const { c, colorScheme, setColorScheme } = useTheme();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const setUser = useAuth((s) => s.setUser);
  const biometricEnabled = useAuth((s) => s.biometricEnabled);
  const setBiometric = useAuth((s) => s.setBiometric);

  const [name, setName] = useState(user?.name || "");
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [sheet, setSheet] = useState<null | "password" | "devices">(null);
  const [busy, setBusy] = useState("");
  const [themeMode, setThemeMode] = useState<"system" | "light" | "dark">("system");

  const prefs = useQuery({ queryKey: ["notif-prefs"], queryFn: () => get<{ preferences: Record<string, boolean> }>("/notifications/preferences") });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => get<{ sessions: any[]; currentSessionId: string }>("/auth/sessions"), enabled: sheet === "devices" });

  useEffect(() => {
    setThemeMode(colorScheme === "dark" || colorScheme === "light" ? (colorScheme as any) : "system");
  }, []);

  async function saveName() {
    if (!name.trim() || name.trim() === user?.name) return;
    setBusy("name");
    try {
      await patch("/users/me", { name: name.trim() });
      setUser({ name: name.trim() });
      toast.success("Profile updated");
    } catch (e: any) {
      toast.error("Couldn't save", e?.message);
    } finally {
      setBusy("");
    }
  }

  async function changePhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const type = asset.mimeType === "image/png" ? "image/png" : "image/jpeg";
    setBusy("photo");
    try {
      const blob = await (await fetch(asset.uri)).blob();
      if (blob.size > 5 * 1024 * 1024) throw new Error("Photo must be smaller than 5 MB");
      const presign = await post<{ uploadUrl: string; key: string }>("/users/me/profile-photo/upload-url", { contentType: type, size: blob.size });
      const up = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": type }, body: blob });
      if (!up.ok) throw new Error("Upload failed");
      const saved = await patch<{ user: { profilePhotoUrl: string } }>("/users/me/profile-photo", { key: presign.key });
      setUser({ profilePhotoUrl: saved.user.profilePhotoUrl });
      toast.success("Photo updated");
    } catch (e: any) {
      toast.error("Couldn't update photo", e?.message);
    } finally {
      setBusy("");
    }
  }

  async function changePassword() {
    if (pw.next !== pw.confirm) return toast.warn("New passwords don't match");
    if (pw.next.length < 8) return toast.warn("Use at least 8 characters");
    setBusy("pw");
    try {
      const r = await post<{ token?: string; refreshToken?: string; message: string }>("/auth/change-password", { currentPassword: pw.current, newPassword: pw.next });
      if (r.token && r.refreshToken) await tokenStore.setTokens({ token: r.token, refreshToken: r.refreshToken });
      toast.success("Password updated", "Other devices were signed out.");
      setPw({ current: "", next: "", confirm: "" });
      setSheet(null);
    } catch (e: any) {
      toast.error("Couldn't change password", e?.message);
    } finally {
      setBusy("");
    }
  }

  async function togglePref(key: string, value: boolean) {
    qc.setQueryData(["notif-prefs"], (old: any) => ({ preferences: { ...(old?.preferences || {}), [key]: value } }));
    try {
      await patch("/notifications/preferences", { [key]: value });
    } catch (e: any) {
      toast.error("Couldn't save", e?.message);
      prefs.refetch();
    }
  }

  async function toggleBiometric(on: boolean) {
    if (on) {
      const [hw, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
      if (!hw || !enrolled) return toast.warn("Biometrics unavailable", "Set up Face ID or fingerprint in your phone settings first.");
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Confirm to enable app lock" });
      if (!r.success) return;
    }
    await setBiometric(on);
    toast.success(on ? "App lock on" : "App lock off");
  }

  async function signOut() {
    Alert.alert("Sign out?", `You'll stop receiving notifications on this device.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          const pushToken = await getStoredPushToken();
          await logout({ pushToken });
          queryClient.clear();
        },
      },
    ]);
  }

  async function signOutEverywhere() {
    Alert.alert("Sign out of all devices?", "Every phone and browser signed in to your account will be signed out.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out all",
        style: "destructive",
        onPress: async () => {
          await post("/auth/logout-all").catch(() => undefined);
          await logout({ remote: false });
          queryClient.clear();
        },
      },
    ]);
  }

  return (
    <Screen title="Settings" back>
      <Card className="mt-2 items-center">
        <Pressable onPress={changePhoto} accessibilityRole="button" accessibilityLabel="Change profile photo" disabled={busy === "photo"}>
          <Avatar name={user?.name} uri={user?.profilePhotoUrl} size={84} />
          <View className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-brand-600 dark:border-slate-900">
            <Camera size={15} color="#fff" />
          </View>
        </Pressable>
        <Text className="mt-3 text-lg font-bold text-slate-900 dark:text-white">{user?.name}</Text>
        <Muted>{user?.email}</Muted>
        <View className="mt-1 rounded-full bg-slate-100 px-2.5 py-0.5 dark:bg-slate-800">
          <Text className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            {user?.role === "BUSINESS"
              ? "Business Partner"
              : user?.role === "SALES"
                ? "Sales Representative"
                : user?.role === "ADMIN"
                  ? "Platform Administrator"
                  : user?.role === "MANAGER"
                    ? "Operations Manager"
                    : "User"}
          </Text>
        </View>
      </Card>

      <SectionTitle>Profile</SectionTitle>
      <Field label="Display name" value={name} onChangeText={setName} onBlur={saveName} returnKeyType="done" onSubmitEditing={saveName} />

      <SectionTitle>Appearance</SectionTitle>
      <Segmented
        value={themeMode}
        onChange={(m) => {
          setThemeMode(m);
          setColorScheme(m);
          void saveThemePreference(m);
        }}
        options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />

      <SectionTitle>Notifications</SectionTitle>
      <Card>
        {PREFS.map((p) => (
          <View key={p.key} className="min-h-[56px] flex-row items-center gap-3 border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
            <View className="flex-1">
              <Text className="text-[15px] text-slate-800 dark:text-slate-200">{p.label}</Text>
              <Muted className="text-xs">{p.hint}</Muted>
            </View>
            <Switch
              value={Boolean(prefs.data?.preferences?.[p.key])}
              onValueChange={(v) => togglePref(p.key, v)}
              trackColor={{ true: c.brand, false: c.border }}
              accessibilityLabel={p.label}
            />
          </View>
        ))}
        <Button
          title="Send test notification"
          variant="ghost"
          size="sm"
          className="mt-2 self-start"
          onPress={async () => {
            const st = await registerForPush().catch(() => "unavailable" as const);
            if (st === "denied") return toast.warn("Notifications are off", "Enable them for LeadFlow in your phone settings.");
            if (st === "unavailable") return toast.warn("Push not available here", "Remote push needs a development or store build — it does not work in Expo Go.");
            await post("/notifications/test-push").catch(() => undefined);
            toast.info("Test sent", "It should arrive in a few seconds.");
          }}
        />
      </Card>

      <SectionTitle>Security</SectionTitle>
      <Card>
        <View className="min-h-[52px] flex-row items-center gap-3">
          <Text className="flex-1 text-[15px] text-slate-800 dark:text-slate-200">App lock (Face ID / fingerprint)</Text>
          <Switch value={biometricEnabled} onValueChange={toggleBiometric} trackColor={{ true: c.brand, false: c.border }} accessibilityLabel="App lock" />
        </View>
        <Row label="Change password" onPress={() => setSheet("password")} />
        <Row label="Signed-in devices" onPress={() => setSheet("devices")} />
        <Row label="Sign out of all devices" danger onPress={signOutEverywhere} />
      </Card>

      <Button title="Sign out" variant="secondary" className="mt-6" icon={<LogOut size={18} color={c.danger} />} onPress={signOut} full />
      <Text className="mt-4 text-center text-xs text-slate-400">{APP_NAME} · v{APP_VERSION}</Text>

      <Sheet visible={sheet === "password"} onClose={() => setSheet(null)} title="Change password" footer={<Button title="Update password" full loading={busy === "pw"} onPress={changePassword} disabled={!pw.current || !pw.next} />}>
        <Field label="Current password" secureTextEntry value={pw.current} onChangeText={(v) => setPw((p) => ({ ...p, current: v }))} autoComplete="current-password" />
        <Field label="New password" secureTextEntry value={pw.next} onChangeText={(v) => setPw((p) => ({ ...p, next: v }))} autoComplete="new-password" hint="At least 8 characters" />
        <Field label="Confirm new password" secureTextEntry value={pw.confirm} onChangeText={(v) => setPw((p) => ({ ...p, confirm: v }))} autoComplete="new-password" />
      </Sheet>

      <Sheet visible={sheet === "devices"} onClose={() => setSheet(null)} title="Signed-in devices" subtitle="Remove any device you don't recognise.">
        {(sessions.data?.sessions || []).map((s) => (
          <View key={s._id} className="min-h-[60px] flex-row items-center gap-3 border-b border-slate-100 py-2 dark:border-slate-800">
            <Smartphone size={20} color={c.muted} />
            <View className="flex-1">
              <Text className="text-[15px] text-slate-800 dark:text-slate-200">
                {s.deviceName || (s.platform === "ios" ? "iPhone" : "Android phone")}
                {s._id === sessions.data?.currentSessionId ? "  · This device" : ""}
              </Text>
              <Muted className="text-xs">{s.app === "admin-app" ? "Admin app" : "Partner app"} · v{s.appVersion || "?"} · active {timeAgo(s.lastUsedAt)}</Muted>
            </View>
            {s._id !== sessions.data?.currentSessionId ? (
              <Pressable
                onPress={async () => {
                  await del(`/auth/sessions/${s._id}`).catch(() => undefined);
                  sessions.refetch();
                  toast.success("Device signed out");
                }}
                accessibilityLabel="Sign out this device"
                hitSlop={8}
              >
                <Trash2 size={18} color={c.danger} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {sessions.data && !sessions.data.sessions.length ? <Muted>No other devices.</Muted> : null}
      </Sheet>
    </Screen>
  );
}
