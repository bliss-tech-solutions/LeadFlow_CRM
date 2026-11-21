import { useAuth, type Role } from "./store";

/**
 * Client-side capability map. It only shapes the UI (hide what you can't use);
 * the backend enforces every rule again, so a tampered app gains nothing.
 */
const CAN = {
  "leads.assign": ["ADMIN", "MANAGER", "BUSINESS"],
  "leads.import": ["ADMIN", "MANAGER", "BUSINESS"],
  "leads.filterBySales": ["ADMIN", "MANAGER", "BUSINESS"],
  "leads.remap": ["ADMIN", "MANAGER"],
  "whatsapp.send": ["BUSINESS", "SALES"],
  "whatsapp.manage": ["BUSINESS"],
  "team.manage": ["ADMIN", "MANAGER", "BUSINESS"],
  "projects.documents": ["ADMIN", "MANAGER", "BUSINESS"],
  "projects.edit": ["ADMIN", "MANAGER"],
  "business.settings": ["ADMIN", "MANAGER", "BUSINESS"],
  "platform.view": ["ADMIN", "MANAGER"],
  "webhooks.replay": ["ADMIN"],
  "delivery.schedule": ["ADMIN", "MANAGER"],
  "businesses.manage": ["ADMIN", "MANAGER"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof CAN;

export function can(role: Role | undefined, permission: Permission) {
  return Boolean(role && (CAN[permission] as readonly Role[]).includes(role));
}

export function useCan(permission: Permission) {
  const role = useAuth((s) => s.user?.role);
  return can(role, permission);
}

export function useRole() {
  return useAuth((s) => s.user?.role);
}
