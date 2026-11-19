/**
 * Normalize a phone number to digits-only E.164 without the "+" (e.g. "919876543210").
 * - strips spaces, dashes, brackets and a leading "+"
 * - converts a leading "00" international prefix
 * - drops a single trunk "0" and prepends the default country code for local numbers
 * Returns null when the result cannot be a valid international number.
 */
export function normalizePhone(raw: unknown, defaultCountryCode = "91"): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;

  const hasPlus = s.startsWith("+");
  s = s.replace(/[^\d]/g, "");
  if (!s) return null;

  if (!hasPlus && s.startsWith("00")) s = s.slice(2);
  else if (!hasPlus) {
    if (s.length === 11 && s.startsWith("0")) s = s.slice(1);
    if (s.length <= 10) s = `${defaultCountryCode}${s}`;
  }

  if (s.length < 8 || s.length > 15) return null;
  return s;
}

/** Last 10 digits, used for loose duplicate matching across formats. */
export function phoneTail(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  return digits.length >= 8 ? digits.slice(-10) : null;
}
