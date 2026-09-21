import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "SALES";
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
    req.user = jwt.verify(h.slice(7), env.JWT_SECRET) as AuthUser;
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
