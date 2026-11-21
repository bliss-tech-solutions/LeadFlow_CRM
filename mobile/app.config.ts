import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * One codebase, two store apps.
 *   APP_VARIANT=partner  → "LeadFlow Partner" (Business owners & Sales staff)
 *   APP_VARIANT=admin    → "LeadFlow Admin"   (Admins & Managers)
 *
 * The expo-router `root` points at the variant's own route tree, so Metro only
 * bundles that app's screens — admin screens never ship inside the Partner app.
 */
type Variant = "admin" | "partner";
const VARIANT: Variant = process.env.APP_VARIANT === "admin" ? "admin" : "partner";

const VARIANTS: Record<Variant, { name: string; slug: string; scheme: string; bundleId: string; projectId?: string; color: string }> = {
  partner: {
    name: "LeadFlow Partner",
    slug: "leadflow-partner",
    scheme: "leadflow",
    bundleId: "com.leadflow.partner",
    projectId: process.env.EAS_PROJECT_ID_PARTNER,
    color: "#4F46E5",
  },
  admin: {
    name: "LeadFlow Admin",
    slug: "leadflow-admin",
    scheme: "leadflow-admin",
    bundleId: "com.leadflow.admin",
    projectId: process.env.EAS_PROJECT_ID_ADMIN,
    color: "#0F172A",
  },
};

const v = VARIANTS[VARIANT];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: v.name,
  slug: v.slug,
  owner: "harsh2414",
  scheme: v.scheme,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: v.bundleId,
    supportsTablet: true,
    infoPlist: {
      NSFaceIDUsageDescription: "Use Face ID to unlock LeadFlow quickly and securely.",
      NSPhotoLibraryUsageDescription: "Choose a profile photo or project documents to upload.",
      NSCameraUsageDescription: "Take a profile photo or photograph a document to upload.",
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: { "com.apple.developer.usernotifications.time-sensitive": true },
  },
  android: {
    package: v.bundleId,
    adaptiveIcon: {
      backgroundColor: "#EEF2FF",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    permissions: ["android.permission.USE_BIOMETRIC", "android.permission.POST_NOTIFICATIONS"],
    blockedPermissions: ["android.permission.RECORD_AUDIO"],
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: "resize",
  },
  web: { bundler: "metro", favicon: "./assets/favicon.png" },
  plugins: [
    ["expo-router", { root: `src/apps/${VARIANT}` }],
    "expo-secure-store",
    "expo-font",
    "expo-image",
    "expo-sharing",
    "expo-web-browser",
    "expo-status-bar",
    ["expo-local-authentication", { faceIDPermission: "Use Face ID to unlock LeadFlow quickly and securely." }],
    ["expo-notifications", { color: v.color, defaultChannel: "leads" }],
    ["expo-image-picker", { photosPermission: "Choose a profile photo or project documents to upload." }],
    [
      "expo-splash-screen",
      { image: "./assets/splash-icon.png", imageWidth: 180, resizeMode: "contain", backgroundColor: "#FFFFFF", dark: { backgroundColor: "#0B1120" } },
    ],
  ],
  // Typed routes are generated per variant; shared screens link to both apps, so keep them off.
  experiments: { typedRoutes: false },
  extra: {
    variant: VARIANT,
    apiUrl: process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:4000/api",
    eas: v.projectId ? { projectId: v.projectId } : undefined,
  },
  updates: v.projectId ? { url: `https://u.expo.dev/${v.projectId}` } : undefined,
  runtimeVersion: { policy: "appVersion" },
});
