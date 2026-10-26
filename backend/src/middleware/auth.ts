import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "SALES" | "BUSINESS";
  business?: string;
  assignedProjects?: string[];
  businessProject?: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function auth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer "))
    return res.status(401).json({ message: "Authentication required" });
  try {
    const decoded = jwt.verify(h.slice(7), env.JWT_SECRET) as Partial<AuthUser> & { id?: string };
    if (!decoded.id || !decoded.email || !decoded.role || !decoded.name) {
      return res.status(401).json({ message: "Invalid authentication token" });
    }
    req.user = {
      id: String(decoded.id),
      name: String(decoded.name),
      email: String(decoded.email),
      role: decoded.role as AuthUser["role"],
      business: decoded.business ? String(decoded.business) : undefined,
      assignedProjects: Array.isArray(decoded.assignedProjects)
        ? decoded.assignedProjects.map(String)
        : undefined,
      businessProject: decoded.businessProject ? String(decoded.businessProject) : undefined,
    };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function roles(...allowed: AuthUser["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowed.includes(req.user.role))
      return res.status(403).json({ message: "Forbidden" });
    next();
  };
}
