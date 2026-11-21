import * as SecureStore from "expo-secure-store";
import { API_URL, APP_VERSION } from "../config";

const REFRESH_KEY = "leadflow.refreshToken";
const TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
  get isNetwork() {
    return this.status === 0;
  }
}

type Tokens = { token: string; refreshToken: string };

/** Access token lives only in memory; the refresh token in the Keychain / Keystore. */
let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;

export const tokenStore = {
  get access() {
    return accessToken;
  },
  async setTokens(t: Tokens) {
    accessToken = t.token;
    await SecureStore.setItemAsync(REFRESH_KEY, t.refreshToken, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
  },
  async getRefresh() {
    return SecureStore.getItemAsync(REFRESH_KEY);
  },
  async clear() {
    accessToken = null;
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
  setAccess(token: string | null) {
    accessToken = token;
  },
};

export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

async function rawFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? TIMEOUT_MS);
  try {
    return await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal });
  } catch (e: any) {
    throw new ApiError(e?.name === "AbortError" ? "The server took too long to respond." : "No internet connection. Check your network and try again.", 0, "NETWORK");
  } finally {
    clearTimeout(timer);
  }
}

/** Exchange the stored refresh token for a new pair. Single-flight across concurrent requests. */
export function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = await tokenStore.getRefresh();
    if (!refreshToken) return false;
    try {
      const res = await rawFetch("/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App-Version": APP_VERSION },
        body: JSON.stringify({ refreshToken, appVersion: APP_VERSION }),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) await tokenStore.clear();
        return false;
      }
      const data = await res.json();
      await tokenStore.setTokens({ token: data.token, refreshToken: data.refreshToken });
      return true;
    } catch (e) {
      // Network error: keep the refresh token so we can retry when back online.
      if (e instanceof ApiError && e.isNetwork) throw e;
      return false;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

type Options = { method?: string; body?: unknown; query?: Record<string, string | number | boolean | undefined | null>; auth?: boolean; timeoutMs?: number };

/**
 * JSON API call with bearer auth, transparent token refresh (retry once on 401),
 * timeouts and readable errors.
 */
export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const qs = opts.query
    ? "?" +
      Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  const url = `${path}${qs === "?" ? "" : qs}`;

  const doRequest = () =>
    rawFetch(url, {
      method: opts.method || (opts.body ? "POST" : "GET"),
      timeoutMs: opts.timeoutMs,
      headers: {
        Accept: "application/json",
        "X-App-Version": APP_VERSION,
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.auth !== false && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

  let res = await doRequest();
  if (res.status === 401 && opts.auth !== false) {
    const ok = await refreshSession();
    if (ok) res = await doRequest();
    if (!ok || res.status === 401) {
      onSessionExpired?.();
      throw new ApiError("Your session has ended. Please sign in again.", 401, "SESSION_EXPIRED");
    }
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const fallback =
      res.status === 403
        ? "You don't have access to this."
        : res.status === 404
          ? "Not found."
          : res.status === 429
            ? "Too many requests. Please wait a moment."
            : res.status >= 500
              ? "Something went wrong on our side. Please try again."
              : `Request failed (${res.status})`;
    throw new ApiError(data?.message || fallback, res.status, data?.code);
  }
  return data as T;
}

export const get = <T = any>(path: string, query?: Options["query"]) => api<T>(path, { query });
export const post = <T = any>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body ?? {} });
export const patch = <T = any>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body: body ?? {} });
export const put = <T = any>(path: string, body?: unknown) => api<T>(path, { method: "PUT", body: body ?? {} });
export const del = <T = any>(path: string, body?: unknown) => api<T>(path, { method: "DELETE", body });
