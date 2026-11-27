import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import * as Device from "expo-device";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { api } from "../api/client";
import { EAS_PROJECT_ID } from "../config";
import { useAuth } from "../auth/store";
import { queryClient } from "../query";
import { toast } from "../ui/toast";

type NotificationsModule = typeof import("expo-notifications");

const PUSH_TOKEN_KEY = "leadflow.pushToken";

/**
 * Expo Go (Android) removed remote push in SDK 53 and logs errors when
 * expo-notifications is even imported. So in Expo Go the module is never loaded:
 * the app still works fully, live updates arrive over the socket and show as toasts.
 * Push needs a development build or a store build.
 */
export const IS_EXPO_GO = isRunningInExpoGo();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const N: NotificationsModule | null = IS_EXPO_GO ? null : (require("expo-notifications") as NotificationsModule);

/** While the app is open, show the server push as an in-app toast instead of a system banner. */
N?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

/** Android channels must exist before requesting a token (Android 13+). */
async function ensureChannels() {
  if (!N || Platform.OS !== "android") return;
  await N.setNotificationChannelAsync("leads", {
    name: "New leads & assignments",
    importance: N.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: "#4F46E5",
    sound: "default",
  });
  await N.setNotificationChannelAsync("reminders", {
    name: "Follow-up reminders & SLA",
    importance: N.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
    sound: "default",
  });
  await N.setNotificationChannelAsync("system", {
    name: "Account & WhatsApp updates",
    importance: N.AndroidImportance.DEFAULT,
  });
}

export async function getStoredPushToken() {
  return SecureStore.getItemAsync(PUSH_TOKEN_KEY);
}

/**
 * Ask permission (once), get the Expo push token and register it for the signed-in
 * user. The server decides which app the token belongs to from the session.
 */
export async function registerForPush(): Promise<"granted" | "denied" | "unavailable"> {
  if (!N || !Device.isDevice) return "unavailable";
  await ensureChannels();
  const existing = await N.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const req = await N.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
    status = req.status;
  }
  if (status !== "granted") return "denied";
  if (!EAS_PROJECT_ID) return "unavailable";

  const { data: token } = await N.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
  await api("/notifications/push-token", {
    method: "POST",
    body: { token, platform: Platform.OS === "ios" ? "ios" : "android", deviceName: Device.deviceName || Device.modelName || undefined },
  });
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
  pushRegistered = true;
  return "granted";
}

/** True once this device has a working push token; the socket then stays quiet to avoid double toasts. */
let pushRegistered = false;
export const isPushRegistered = () => pushRegistered;

/** In-app destination for a notification (shared by push taps and realtime toasts). */
export function pathForNotification(n: { entityType?: string; entityId?: string; type?: string }) {
  if (n.entityType === "Lead" && n.entityId && /^[a-f0-9]{24}$/.test(n.entityId)) return `/leads/${n.entityId}`;
  if (n.type?.startsWith("FOLLOWUP")) return "/followups";
  return "/notifications";
}

export function openFromNotification(data: any) {
  const path = typeof data?.path === "string" && data.path.startsWith("/") ? data.path : "/notifications";
  // Only allow in-app paths we expect (no arbitrary deep links from payloads).
  if (!/^\/(leads(\/[a-f0-9]{24})?|notifications|whatsapp|followups|platform)$/.test(path)) {
    router.push("/notifications");
    return;
  }
  router.push(path as any);
}

/**
 * Registers the device after sign-in and routes taps on notifications.
 * Mounted once in each app's root layout. A no-op in Expo Go.
 */
export function usePushNotifications() {
  const status = useAuth((s) => s.status);
  const handledInitial = useRef(false);
  // IS_EXPO_GO is constant for the lifetime of the app, so hook order never changes.
  const lastResponse = N ? N.useLastNotificationResponse() : null;

  useEffect(() => {
    if (!N || status !== "signedIn") return;
    registerForPush().catch(() => undefined);
  }, [status]);

  // Cold start from a notification tap.
  useEffect(() => {
    if (status !== "signedIn" || handledInitial.current || !lastResponse) return;
    handledInitial.current = true;
    openFromNotification(lastResponse.notification.request.content.data);
  }, [status, lastResponse]);

  useEffect(() => {
    if (!N) return;
    const received = N.addNotificationReceivedListener((n) => {
      const c = n.request.content;
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.info(c.title || "LeadFlow", c.body || "", () => openFromNotification(c.data));
    });
    const tapped = N.addNotificationResponseReceivedListener((r) => {
      if (useAuth.getState().status === "signedIn") openFromNotification(r.notification.request.content.data);
    });
    return () => {
      received.remove();
      tapped.remove();
    };
  }, []);
}
