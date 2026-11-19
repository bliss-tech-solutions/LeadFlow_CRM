import { User } from "../models/User";

export type CachedUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "SALES" | "BUSINESS";
  isActive: boolean;
  business?: string;
  assignedProjects: string[];
  businessProject?: string;
  tokenVersion: number;
};

const TTL_MS = 30_000;
const cache = new Map<string, { value: CachedUser | null; expires: number }>();

/**
 * Load the live user record used for authorization decisions.
 * Cached for a short TTL so every request does not hit MongoDB, while
 * blocks, role changes and project reassignments take effect within seconds
 * (immediately when `invalidateUser` is called).
 */
export async function getLiveUser(id: string): Promise<CachedUser | null> {
  const hit = cache.get(id);
  if (hit && hit.expires > Date.now()) return hit.value;

  let value: CachedUser | null = null;
  try {
    const u: any = await User.findById(id)
      .select("name email role isActive business assignedProjects businessProject tokenVersion")
      .lean();
    if (u) {
      value = {
        id: String(u._id),
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive !== false,
        business: u.business ? String(u.business) : undefined,
        assignedProjects: Array.isArray(u.assignedProjects) ? u.assignedProjects.map(String) : [],
        businessProject: u.businessProject ? String(u.businessProject) : undefined,
        tokenVersion: Number(u.tokenVersion || 0),
      };
    }
  } catch {
    value = null;
  }

  cache.set(id, { value, expires: Date.now() + TTL_MS });
  if (cache.size > 5000) {
    const now = Date.now();
    for (const [key, entry] of cache) if (entry.expires < now) cache.delete(key);
  }
  return value;
}

export function invalidateUser(id: string) {
  cache.delete(String(id));
}
