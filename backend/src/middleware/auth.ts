import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { getLiveUser } from "../utils/userCache";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "SALES" | "BUSINESS";
  business?: string;
  assignedProjects?: string[];
  businessProject?: string;
  /** Set when the request comes from a mobile app. */
  app?: "admin-app" | "partner-app";
  /** Mobile device session id (app tokens only). */
  sessionId?: string;
};

/** Which roles may use each mobile app. Enforced at login, refresh and on every request. */
export const APP_ROLES: Record<"admin-app" | "partner-app", AuthUser["role"][]> = {
  "admin-app": ["ADMIN", "MANAGER"],
  "partner-app": ["BUSINESS", "SALES"],
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

type TokenPayload = Partial<AuthUser> & { id?: string; tv?: number; sid?: string };

export function signUserToken(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  business?: unknown;
  assignedProjects?: unknown[];
  businessProject?: unknown;
  tokenVersion?: number;
}, opts: { app?: "admin-app" | "partner-app"; sessionId?: string; expiresIn?: string } = {}) {
  return jwt.sign(
    {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      business: u.business ? String(u.business) : undefined,
      assignedProjects: Array.isArray(u.assignedProjects) ? u.assignedProjects.map(String) : [],
      businessProject: u.businessProject ? String(u.businessProject) : undefined,
      tv: Number(u.tokenVersion || 0),
      ...(opts.app ? { app: opts.app, sid: opts.sessionId } : {}),
    },
    env.JWT_SECRET,
    { expiresIn: (opts.expiresIn || env.JWT_EXPIRES_IN) as any },
  );
}

/**
 * Verify a JWT and resolve it against the live user record.
 * Returns null when the token is invalid, the user no longer exists, was
 * blocked, or the token was revoked (tokenVersion bumped by "log out everywhere").
 */
export async function resolveToken(token: string): Promise<AuthUser | null> {
  let decoded: TokenPayload;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
  if (!decoded.id) return null;

  const live = await getLiveUser(String(decoded.id));
  if (!live || !live.isActive) return null;
  if (Number(decoded.tv || 0) !== live.tokenVersion) return null;
  // App tokens only work for the roles that app is built for (e.g. a Partner-app
  // token can never act as ADMIN even if the account's role changes later).
  const app = decoded.app === "admin-app" || decoded.app === "partner-app" ? decoded.app : undefined;
  if (app && !APP_ROLES[app].includes(live.role)) return null;

  // Authorization data always comes from the database, never from stale token claims.
  return {
    id: live.id,
    name: live.name,
    email: live.email,
    role: live.role,
    business: live.business,
    assignedProjects: live.assignedProjects,
    businessProject: live.businessProject,
    app,
    sessionId: app && decoded.sid ? String(decoded.sid) : undefined,
  };
}

export async function auth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer "))
    return res.status(401).json({ message: "Authentication required" });

  const user = await resolveToken(h.slice(7));
  if (!user) {
    return res.status(401).json({ message: "Session expired or account disabled. Please sign in again." });
  }
  req.user = user;
  next();
}

export function roles(...allowed: AuthUser["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowed.includes(req.user.role))
      return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

export function isAdminRole(role?: string) {
  return role === "ADMIN" || role === "MANAGER";
}
