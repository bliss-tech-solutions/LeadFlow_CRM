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

/**
 * First valid number in a messy spreadsheet cell, e.g. "98765 43210 / 91234 56789"
 * or "Mobile: +91-98765-43210". Returns null when no part is a usable number.
 */
export function firstValidPhone(raw: unknown, defaultCountryCode = "91"): string | null {
  const text = String(raw ?? "").slice(0, 200);
  if (!text.trim()) return null;
  const whole = normalizePhone(text, defaultCountryCode);
  if (whole) return whole;
  for (const part of text.split(/[,;/|\n]+|\s{2,}|\bor\b/i)) {
    const p = normalizePhone(part, defaultCountryCode);
    if (p) return p;
  }
  return null;
}

/**
 * Format a normalized phone number for display & export (e.g. "919876543210" -> "+91 9876543210").
 * Handles 10-digit local numbers (+91 default) and 11-15 digit international numbers.
 */
export function formatPhoneDisplay(raw: unknown, defaultCountryCode = "91"): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return s;

  if (digits.length === 10) return `+${defaultCountryCode} ${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+${defaultCountryCode} ${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+91 ${digits.slice(2)}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+1 ${digits.slice(1)}`;
  if (digits.length > 10) return `+${digits.slice(0, digits.length - 10)} ${digits.slice(-10)}`;
  return `+${digits}`;
}
