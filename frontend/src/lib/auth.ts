export type User = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "SALES";
  profilePhotoUrl?: string;
};
export function saveSession(token: string, user: User) {
  localStorage.setItem("leadflow_token", token);
  localStorage.setItem("leadflow_user", JSON.stringify(user));
}
export function getUser(): User | null {
  try {
    const v = localStorage.getItem("leadflow_user");
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
export function logout() {
  if (typeof window === "undefined") return;

  localStorage.removeItem("leadflow_token");
  localStorage.removeItem("leadflow_user");

  // Let realtime clients close their socket before navigation.
  window.dispatchEvent(new Event("leadflow:logout"));

  if (window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

export function isAuthError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "AUTH_EXPIRED",
  );
}
