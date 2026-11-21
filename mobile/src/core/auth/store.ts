import { create } from "zustand";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { api, ApiError, refreshSession, tokenStore } from "../api/client";
import { APP_VERSION, CLIENT_APP } from "../config";

export type Role = "ADMIN" | "MANAGER" | "BUSINESS" | "SALES";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  business?: string;
  assignedProjects?: string[];
  businessProject?: string;
  profilePhotoUrl?: string | null;
};

type Status = "booting" | "signedOut" | "locked" | "signedIn";

type AuthState = {
  status: Status;
  user: User | null;
  biometricEnabled: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: (opts?: { remote?: boolean; pushToken?: string | null }) => Promise<void>;
  unlock: () => void;
  lock: () => void;
  setBiometric: (on: boolean) => Promise<void>;
  setUser: (u: Partial<User>) => void;
};

const USER_KEY = "leadflow.user";
const BIO_KEY = "leadflow.biometric";

async function saveUser(u: User) {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(u));
}

export const useAuth = create<AuthState>((set, get) => ({
  status: "booting",
  user: null,
  biometricEnabled: false,

  /** Restore the session from the Keychain on app start. Works offline with the cached profile. */
  bootstrap: async () => {
    const [storedUser, bio, refresh] = await Promise.all([
      SecureStore.getItemAsync(USER_KEY),
      SecureStore.getItemAsync(BIO_KEY),
      tokenStore.getRefresh(),
    ]);
    const biometricEnabled = bio === "1";
    if (!refresh || !storedUser) {
      set({ status: "signedOut", user: null, biometricEnabled });
      return;
    }
    let user: User = JSON.parse(storedUser);
    try {
      const ok = await refreshSession();
      if (!ok) {
        await SecureStore.deleteItemAsync(USER_KEY);
        set({ status: "signedOut", user: null, biometricEnabled });
        return;
      }
      const me = await api<{ user: any }>("/auth/me");
      user = {
        ...user,
        name: me.user.name,
        role: me.user.role,
        profilePhotoUrl: me.user.profilePhotoUrl,
        business: me.user.business?._id || me.user.business,
      };
      await saveUser(user);
    } catch (e) {
      // Offline: continue with cached profile; the API refreshes when back online.
      if (!(e instanceof ApiError && e.isNetwork)) {
        set({ status: "signedOut", user: null, biometricEnabled });
        return;
      }
    }
    set({ user, biometricEnabled, status: biometricEnabled ? "locked" : "signedIn" });
  },

  login: async (email, password) => {
    const data = await api<{ token: string; refreshToken: string; user: User }>("/auth/login", {
      method: "POST",
      auth: false,
      body: {
        email: email.trim().toLowerCase(),
        password,
        client: CLIENT_APP,
        device: {
          name: Device.deviceName || Device.modelName || undefined,
          platform: Platform.OS === "ios" ? "ios" : "android",
          appVersion: APP_VERSION,
        },
      },
    });
    await tokenStore.setTokens({ token: data.token, refreshToken: data.refreshToken });
    await saveUser(data.user);
    set({ user: data.user, status: "signedIn" });
  },

  logout: async (opts = {}) => {
    if (opts.remote !== false) {
      try {
        const refreshToken = await tokenStore.getRefresh();
        await api("/auth/logout", { method: "POST", body: { refreshToken, pushToken: opts.pushToken || undefined }, timeoutMs: 5000 });
      } catch {
        // signing out locally must never fail
      }
    }
    await tokenStore.clear();
    await SecureStore.deleteItemAsync(USER_KEY);
    set({ user: null, status: "signedOut" });
  },

  unlock: () => set({ status: "signedIn" }),
  lock: () => {
    if (get().biometricEnabled && get().status === "signedIn") set({ status: "locked" });
  },
  setBiometric: async (on) => {
    await SecureStore.setItemAsync(BIO_KEY, on ? "1" : "0");
    set({ biometricEnabled: on });
  },
  setUser: (u) => {
    const next = { ...(get().user as User), ...u };
    void saveUser(next);
    set({ user: next });
  },
}));
