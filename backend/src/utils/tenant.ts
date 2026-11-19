import { Types } from "mongoose";
import { BusinessProject } from "../models/BusinessProject";
import { User } from "../models/User";
import type { AuthUser } from "../middleware/auth";

export function isAdminUser(user?: AuthUser | null) {
  return user?.role === "ADMIN" || user?.role === "MANAGER";
}

/**
 * Business ids a non-admin user belongs to.
 * BUSINESS: their business. SALES: their business plus the businesses of assigned projects.
 */
export async function getUserBusinessIds(user: AuthUser): Promise<string[]> {
  const ids = new Set<string>();
  if (user.business) ids.add(String(user.business));
  const projectIds = [
    ...(user.assignedProjects || []),
    ...(user.businessProject ? [user.businessProject] : []),
  ].filter((id) => Types.ObjectId.isValid(String(id)));
  if (projectIds.length) {
    const projects = await BusinessProject.find({ _id: { $in: projectIds } }).select("business").lean();
    for (const p of projects) if (p.business) ids.add(String(p.business));
  }
  return [...ids];
}

/**
 * Project ids a BUSINESS user owns (every project of their business, plus the legacy single project).
 */
export async function getBusinessOwnerProjectIds(user: AuthUser): Promise<Types.ObjectId[]> {
  const ids: Types.ObjectId[] = [];
  if (user.business) {
    const projects = await BusinessProject.find({ business: user.business }).select("_id").lean();
    ids.push(...projects.map((p) => p._id as Types.ObjectId));
  }
  if (user.businessProject && Types.ObjectId.isValid(user.businessProject)) {
    ids.push(new Types.ObjectId(user.businessProject));
  }
  return ids;
}

/**
 * True when a salesperson may work leads of the given project:
 * directly assigned to it, or in the same business with no project restriction.
 */
export async function salesBelongsToProject(salesUserId: string, projectId?: unknown): Promise<boolean> {
  if (!projectId) return true; // unmapped leads can go to anyone the admin chooses
  const [user, project] = await Promise.all([
    User.findById(salesUserId).select("business assignedProjects businessProject role").lean(),
    BusinessProject.findById(projectId).select("business").lean(),
  ]);
  if (!user || user.role !== "SALES" || !project) return false;
  const assigned = (user.assignedProjects || []).map(String);
  if (assigned.includes(String(projectId)) || String(user.businessProject) === String(projectId)) return true;
  return Boolean(user.business && String(user.business) === String(project.business) && assigned.length === 0);
}

/** Remove admin-only quota fields from a business or project object (mutates and returns it). */
export function stripQuota<T extends Record<string, any> | null | undefined>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  delete (obj as any).leadLimit;
  delete (obj as any).leadLimitType;
  if ((obj as any).business && typeof (obj as any).business === "object") {
    delete (obj as any).business.leadLimit;
    delete (obj as any).business.leadLimitType;
  }
  return obj;
}
