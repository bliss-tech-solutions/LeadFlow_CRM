import "../../global.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, Linking, LogBox, Platform, Text, View } from "react-native";
import { Image } from "expo-image";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Fingerprint, Download, Wrench } from "lucide-react-native";
import { queryClient, persister, useOutbox } from "./query";
import { useAuth } from "./auth/store";
import { setSessionExpiredHandler, api } from "./api/client";
import { useRealtime } from "./realtime/socket";
import { usePushNotifications } from "./push/push";
import { Toaster, toast } from "./ui/toast";
import { useTheme } from "./ui/theme";
import { Button } from "./ui";
import { APP_NAME, APP_VARIANT, APP_VERSION } from "./config";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Known third-party notices that are not actionable in this app.
LogBox.ignoreLogs(["ImageBackground is deprecated", "expo-notifications", "`expo-notifications` functionality"]);

const THEME_KEY = "leadflow.theme";

function Effects() {
  useRealtime();
  usePushNotifications();
  return null;
}

/** Biometric lock shown on cold start and after the app was in the background > 60s. */
function LockScreen() {
  const unlock = useAuth((s) => s.unlock);
  const logout = useAuth((s) => s.logout);
  const user = useAuth((s) => s.user);
  const { c } = useTheme();

  const prompt = async () => {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: `Unlock ${APP_NAME}`, cancelLabel: "Cancel" });
    if (res.success) unlock();
  };
  useEffect(() => {
    void prompt();
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-slate-50 px-8 dark:bg-[#0B1120]">
      <View className="mb-6 h-20 w-20 items-center justify-center rounded-3xl bg-brand-600">
        <Fingerprint size={40} color="#fff" />
      </View>
      <Text className="text-xl font-bold text-slate-900 dark:text-white">Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</Text>
      <Text className="mt-2 text-center text-sm text-slate-500">Unlock to continue to {APP_NAME}.</Text>
      <Button title="Unlock" onPress={prompt} className="mt-8 w-full" size="lg" icon={<Fingerprint size={18} color="#fff" />} />
      <Button title="Sign out" variant="ghost" onPress={() => logout()} className="mt-2" />
      <Text className="absolute bottom-10 text-xs" style={{ color: c.faint }}>
        v{APP_VERSION}
      </Text>
    </View>
  );
}

type AppConfig = { updateRequired: boolean; maintenance: boolean; maintenanceMessage?: string; storeUrls?: { android?: string; ios?: string } };

function Blocker({ cfg }: { cfg: AppConfig }) {
  const url = Platform.OS === "ios" ? cfg.storeUrls?.ios : cfg.storeUrls?.android;
  return (
    <View className="flex-1 items-center justify-center bg-white px-8 dark:bg-[#0B1120]">
      <View className="mb-6 h-20 w-20 items-center justify-center rounded-3xl bg-brand-50 dark:bg-brand-900">
        {cfg.maintenance ? <Wrench size={36} color="#4F46E5" /> : <Download size={36} color="#4F46E5" />}
      </View>
      <Text className="text-center text-xl font-bold text-slate-900 dark:text-white">{cfg.maintenance ? "We'll be right back" : "Update required"}</Text>
      <Text className="mt-2 text-center text-sm leading-5 text-slate-500">
        {cfg.maintenance ? cfg.maintenanceMessage : `A newer version of ${APP_NAME} is required to keep your data safe and in sync.`}
      </Text>
      {!cfg.maintenance && url ? <Button title="Update now" size="lg" className="mt-8 w-full" onPress={() => Linking.openURL(url)} /> : null}
    </View>
  );
}

function AppSplashScreen() {
  const isAdmin = APP_VARIANT === "admin";
  return (
    <View className="flex-1 items-center justify-between bg-white px-6 py-12 dark:bg-[#0B1120]">
      <View />
      <View className="items-center">
        <View className={`h-24 w-24 items-center justify-center rounded-3xl shadow-xl ${isAdmin ? "bg-slate-900 shadow-slate-900/30 dark:bg-brand-600" : "bg-brand-600 shadow-brand-500/30"}`}>
          <Image
            source={require("../../assets/icon.png")}
            style={{ width: 68, height: 68, borderRadius: 16 }}
            contentFit="cover"
          />
        </View>
        <Text className="mt-6 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{APP_NAME}</Text>
        <Text className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">Intelligent Real Estate CRM</Text>
        <ActivityIndicator className="mt-8" color={isAdmin ? "#0F172A" : "#4F46E5"} />
      </View>
      <View className="items-center pb-4">
        <Text className="mb-2 text-[10px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase">Developed by</Text>
        <Image
          source={require("../../assets/tbs-dark.jpg")}
          style={{ width: 120, height: 40 }}
          contentFit="contain"
          accessibilityLabel="Developed by TBS"
        />
      </View>
    </View>
  );
}

/**
 * Shared root for both apps: providers, session bootstrap, app lock,
 * forced-update gate, realtime, push and offline sync.
 */
export function AppRoot({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status);
  const bootstrap = useAuth((s) => s.bootstrap);
  const lock = useAuth((s) => s.lock);
  const { isDark, setColorScheme } = useTheme();
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (useAuth.getState().status !== "signedOut") {
        toast.warn("Signed out", "Your session ended. Please sign in again.");
        void useAuth.getState().logout({ remote: false });
      }
    });
    AsyncStorage.getItem(THEME_KEY)
      .then((t) => t === "light" || t === "dark" ? setColorScheme(t) : setColorScheme("system"))
      .catch(() => undefined);
    void useOutbox.getState().load();
    void bootstrap();
    api<AppConfig>("/app/config", { auth: false, query: { app: APP_VARIANT, version: APP_VERSION }, timeoutMs: 8000 })
      .then(setCfg)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (status !== "booting") SplashScreen.hideAsync().catch(() => undefined);
  }, [status]);

  // Re-lock with biometrics after > 60s in the background.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background") backgroundAt.current = Date.now();
      if (s === "active" && backgroundAt.current && Date.now() - backgroundAt.current > 60_000) lock();
      if (s === "active") void useOutbox.getState().flush();
    });
    return () => sub.remove();
  }, [lock]);

  const blocked = cfg && (cfg.updateRequired || cfg.maintenance);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000, buster: `${APP_VARIANT}-${APP_VERSION}` }}
        >
          <StatusBar style={isDark ? "light" : "dark"} />
          {blocked ? <Blocker cfg={cfg!} /> : status === "booting" ? <AppSplashScreen /> : status === "locked" ? <LockScreen /> : children}
          {status === "signedIn" && <Effects />}
          <Toaster />
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export async function saveThemePreference(mode: "light" | "dark" | "system") {
  await AsyncStorage.setItem(THEME_KEY, mode);
}
