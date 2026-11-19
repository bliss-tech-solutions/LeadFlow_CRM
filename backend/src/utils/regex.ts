/**
 * Escape user input before using it inside a MongoDB `$regex`.
 * Prevents regex injection and catastrophic-backtracking (ReDoS) patterns.
 */
export function escapeRegex(value: unknown): string {
  return String(value ?? "")
    .slice(0, 200)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive "contains" regex condition for a search term. */
export function containsRegex(value: unknown) {
  return { $regex: escapeRegex(value), $options: "i" };
}

/** Case-insensitive exact-match regex condition. */
export function exactRegex(value: unknown) {
  return { $regex: `^${escapeRegex(value)}$`, $options: "i" };
}
