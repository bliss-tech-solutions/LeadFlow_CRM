export type User = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "SALES";
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
  localStorage.removeItem("leadflow_token");
  localStorage.removeItem("leadflow_user");
  window.location.href = "/login";
}
