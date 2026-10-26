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

  if (res.status === 429) {
    throw new Error(data.message || "Too many requests. Please wait a moment and try again.");
  }

  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);

  return data;
}

export async function downloadFile(path: string, fallbackFilename: string) {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("leadflow_token")
      : null;

  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: "GET",
      headers,
      cache: "no-store",
    });
  } catch {
    throw new Error("Unable to reach CRM API. Check the backend URL and network connection.");
  }

  if (res.status === 401) {
    if (typeof window !== "undefined" && token) {
      logout();
    }
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (res.status === 403) {
    throw new Error("You do not have permission to download this file.");
  }

  if (!res.ok) {
    let errorMsg = `Download failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.message) errorMsg = data.message;
    } catch {}
    throw new Error(errorMsg);
  }

  const blob = await res.blob();
  let filename = fallbackFilename;
  const disposition = res.headers.get("content-disposition");
  if (disposition && disposition.includes("filename=")) {
    const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (match && match[1]) {
      filename = match[1].replace(/['"]/g, "").trim();
    }
  }

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
