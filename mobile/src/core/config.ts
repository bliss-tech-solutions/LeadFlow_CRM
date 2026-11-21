import Constants from "expo-constants";

export type AppVariant = "admin" | "partner";

const extra = (Constants.expoConfig?.extra || {}) as { variant?: AppVariant; apiUrl?: string };

export const APP_VARIANT: AppVariant = extra.variant === "admin" ? "admin" : "partner";
export const CLIENT_APP = APP_VARIANT === "admin" ? "admin-app" : "partner-app";
export const API_URL = String(process.env.EXPO_PUBLIC_API_URL || extra.apiUrl || "http://10.0.2.2:4000/api").replace(/\/+$/, "");
export const SOCKET_URL = API_URL.replace(/\/api$/, "");
export const APP_VERSION = Constants.expoConfig?.version || "1.0.0";
export const EAS_PROJECT_ID: string | undefined =
  (Constants.expoConfig?.extra as any)?.eas?.projectId || (Constants as any).easConfig?.projectId;
export const APP_NAME = APP_VARIANT === "admin" ? "LeadFlow Admin" : "LeadFlow Partner";
