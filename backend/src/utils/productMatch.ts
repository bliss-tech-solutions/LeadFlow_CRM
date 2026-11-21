import type { IProjectProduct } from "../models/BusinessProject";

/**
 * Derive a product label from a lead's Meta form answers by scanning
 * the project's product list for matching keywords.
 * Returns the product's display label or null if nothing matches.
 */
export function matchProduct(
  fieldData: Array<{ name: string; values: string[] }>,
  products: IProjectProduct[],
): string | null {
  if (!fieldData?.length || !products?.length) return null;

  const haystack = fieldData
    .flatMap((f) => [f.name, ...f.values])
    .join(" ")
    .toLowerCase();

  for (const p of products) {
    const label = p.type === "OTHER" ? (p.customType ?? "OTHER") : p.type;
    const keywords = [label, p.type, p.customType].filter(Boolean).map((k) => k!.toLowerCase());
    if (keywords.some((k) => haystack.includes(k))) return label;
  }

  return null;
}

/** Human-friendly display label for a product type/customType pair. */
export function productLabel(type: string, customType?: string | null): string {
  return type === "OTHER" && customType ? customType : type;
}
