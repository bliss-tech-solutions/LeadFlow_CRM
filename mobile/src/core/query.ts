import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { QueryClient, onlineManager, focusManager } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { AppState } from "react-native";
import { create } from "zustand";
import { api, ApiError } from "./api/client";

// React Query understands the device's connectivity and app foreground state.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((s) => setOnline(Boolean(s.isConnected && s.isInternetReachable !== false))),
);
AppState.addEventListener("change", (s) => focusManager.setFocused(s === "active"));

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (count, error) => {
        if (error instanceof ApiError && [400, 401, 403, 404].includes(error.status)) return false;
        return count < 2;
      },
      networkMode: "offlineFirst",
    },
    mutations: { networkMode: "online" },
  },
});

/**
 * Cached queries survive restarts so lists and recently opened leads are readable
 * offline. Only non-sensitive API data goes here — tokens stay in SecureStore.
 */
export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: "leadflow.cache.v1", throttleTime: 2000 });

/* ------------------------------------------------------------------ */
/* Offline outbox: field actions recorded while offline are replayed. */
/* ------------------------------------------------------------------ */

export type OutboxItem = {
  id: string;
  label: string;
  path: string;
  method: "POST" | "PATCH";
  body: unknown;
  createdAt: number;
  attempts: number;
};

type OutboxState = {
  items: OutboxItem[];
  load: () => Promise<void>;
  add: (item: Omit<OutboxItem, "id" | "createdAt" | "attempts">) => Promise<void>;
  flush: () => Promise<number>;
};

const OUTBOX_KEY = "leadflow.outbox.v1";

export const useOutbox = create<OutboxState>((set, get) => ({
  items: [],
  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(OUTBOX_KEY);
      set({ items: raw ? JSON.parse(raw) : [] });
    } catch {
      set({ items: [] });
    }
  },
  add: async (item) => {
    const items = [...get().items, { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: Date.now(), attempts: 0 }];
    set({ items });
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  },
  flush: async () => {
    let sent = 0;
    const remaining: OutboxItem[] = [];
    for (const item of get().items) {
      try {
        await api(item.path, { method: item.method, body: item.body });
        sent++;
      } catch (e) {
        // Keep network failures; drop items the server rejects permanently (e.g. lead no longer yours).
        if (e instanceof ApiError && !e.isNetwork && e.status >= 400 && e.status < 500) continue;
        if (item.attempts < 20) remaining.push({ ...item, attempts: item.attempts + 1 });
      }
    }
    set({ items: remaining });
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(remaining));
    if (sent) await queryClient.invalidateQueries();
    return sent;
  },
}));

/**
 * Run an action now, or queue it when offline. Returns "sent" | "queued".
 */
export async function sendOrQueue(label: string, path: string, method: "POST" | "PATCH", body: unknown) {
  const state = await NetInfo.fetch();
  if (state.isConnected === false) {
    await useOutbox.getState().add({ label, path, method, body });
    return "queued" as const;
  }
  try {
    await api(path, { method, body });
    return "sent" as const;
  } catch (e) {
    if (e instanceof ApiError && e.isNetwork) {
      await useOutbox.getState().add({ label, path, method, body });
      return "queued" as const;
    }
    throw e;
  }
}

NetInfo.addEventListener((s) => {
  if (s.isConnected && useOutbox.getState().items.length) void useOutbox.getState().flush();
});
