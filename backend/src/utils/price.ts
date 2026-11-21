/**
 * Parse Indian real-estate price strings into a numeric upper bound (₹).
 * Handles:
 *   "85L – 95L"  → 9_500_000
 *   "1.2 Cr"     → 12_000_000
 *   "₹85,00,000" → 8_500_000
 *   "50L"        → 5_000_000
 */
export function parsePrice(raw?: string | null): number {
  if (!raw) return 0;

  // Strip currency symbols and normalise separators
  const clean = raw.replace(/[₹,]/g, "").trim();

  // If it looks like a range (–, -, to), take the upper bound
  const rangeParts = clean.split(/\s*(?:–|-|to)\s*/i);
  const upper = rangeParts[rangeParts.length - 1].trim();

  return parseSingle(upper) || parseSingle(rangeParts[0].trim());
}

function parseSingle(s: string): number {
  if (!s) return 0;
  const m = s.match(/^([\d.]+)\s*(L|Lac|Lakh|Cr|Crore)?$/i);
  if (!m) return 0;
  const num = parseFloat(m[1]);
  const unit = (m[2] || "").toLowerCase();
  if (unit.startsWith("cr")) return Math.round(num * 10_000_000);
  if (unit.startsWith("l")) return Math.round(num * 100_000);
  return Math.round(num);
}
