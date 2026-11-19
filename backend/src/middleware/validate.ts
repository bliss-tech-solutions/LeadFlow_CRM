import { Request, Response, NextFunction } from "express";
import { z, ZodType } from "zod";

/**
 * Validate and coerce `req.body` with a zod schema.
 * On failure responds 400 with the first readable issue; on success
 * replaces req.body with the parsed (whitelisted) value.
 */
export function validateBody<T extends ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path?.join(".");
      return res.status(400).json({
        message: path ? `${path}: ${issue.message}` : issue?.message || "Invalid request",
        issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    req.body = result.data;
    next();
  };
}

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

export { z };
