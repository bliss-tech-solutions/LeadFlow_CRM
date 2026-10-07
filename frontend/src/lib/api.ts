import { logout } from "./auth";

export const API =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export async function api(path: string, options: RequestInit = {}) {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("leadflow_token")
      : null;

  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...options,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new Error("Unable to reach CRM API. Check the backend URL and network connection.");
  }

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json().catch(() => ({}))
    : {};

  if (res.status === 401) {
    const isLogin = path.startsWith("/auth/login");
    if (!isLogin && typeof window !== "undefined" && token) {
      logout();
      const error = new Error("Your session has expired. Please sign in again.") as Error & { code?: string };
      error.code = "AUTH_EXPIRED";
      throw error;
    }

    throw new Error(data.message || (isLogin ? "Invalid email or password" : "Your session has expired. Please sign in again."));
  }

  if (res.status === 403) {
    throw new Error(data.message || "You do not have permission to perform this action.");
  }

  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);

  return data;
}
