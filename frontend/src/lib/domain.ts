/**
 * Website-domain validation for the Data scraping search.
 *
 * Accepts a domain with or without http:// / https:// (e.g. "yourbusiness.com",
 * "https://abc.co.in", "http://www.shop.example.in/"). The protocol, a leading "www."
 * and a trailing "/" are removed. Paths, query strings, ports, spaces and endings that
 * are not real domain extensions are rejected. google.com and youtube.com are only
 * examples and are rejected.
 */

// Domain extensions accepted at the end of the name. Multi-part ones (co.in, com.np …)
// are matched first. Add more here if needed.
const MULTI_PART = [
  "co.in", "net.in", "org.in", "firm.in", "gen.in", "ind.in", "gov.in", "nic.in", "ac.in", "edu.in", "res.in",
  "com.np", "org.np", "net.np", "edu.np", "gov.np",
  "co.uk", "org.uk", "ac.uk", "gov.uk",
  "com.au", "net.au", "org.au", "co.nz", "com.sg", "com.my", "co.za", "com.br", "co.jp", "com.bd", "com.pk", "com.lk",
  "co.ae", "com.sa",
];

const SINGLE = [
  // generic
  "com", "in", "org", "net", "co", "io", "ai", "app", "dev", "info", "biz", "me", "tech", "store", "online", "site",
  "shop", "xyz", "live", "cloud", "digital", "agency", "solutions", "services", "company", "business", "media",
  "news", "blog", "world", "today", "group", "global", "network", "systems", "software", "academy", "education",
  "health", "care", "clinic", "finance", "money", "capital", "realty", "properties", "homes", "estate", "travel",
  "tours", "studio", "design", "art", "fashion", "boutique", "restaurant", "cafe", "food", "events", "club", "tv",
  "fm", "gg", "pro", "name", "mobi", "asia", "edu", "gov", "mil", "int",
  // country
  "uk", "us", "ca", "au", "nz", "ae", "sa", "qa", "om", "kw", "bh", "sg", "my", "id", "th", "vn", "ph", "jp", "kr",
  "cn", "hk", "tw", "np", "bd", "pk", "lk", "bt", "mv", "de", "fr", "it", "es", "nl", "be", "ch", "at", "se", "no",
  "dk", "fi", "ie", "pl", "pt", "gr", "ru", "ua", "tr", "za", "ng", "ke", "eg", "br", "mx", "ar", "cl",
];

const MULTI_SET = new Set(MULTI_PART);
const SINGLE_SET = new Set(SINGLE);

// One part of a domain: letters, digits and hyphens, 1–63 chars, no hyphen at either end.
// Shown only as examples; scraping them is not allowed.
const EXAMPLE_ONLY = ["google.com", "youtube.com"];

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type DomainCheck = { ok: true; domain: string } | { ok: false; error: string };

export function validateDomain(input: string): DomainCheck {
  let raw = String(input || "").trim();
  if (!raw) return { ok: false, error: "Enter a website domain, e.g. yourbusiness.com" };

  // http:// or https:// is optional: strip it (and one trailing "/") and check the domain.
  raw = raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (!raw) return { ok: false, error: "Enter a website domain, e.g. yourbusiness.com" };
  if (raw.includes("://") || /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    return { ok: false, error: "Only http:// or https:// websites can be scraped (e.g. https://yourbusiness.com)." };
  }
  if (/[\s/\\?#@:,;]/.test(raw)) {
    return { ok: false, error: "Enter only the domain name: no spaces, /, ?, #, @ or port (e.g. yourbusiness.com)." };
  }

  let domain = raw.toLowerCase();
  if (domain.startsWith("www.")) domain = domain.slice(4);

  if (domain.endsWith(".") || domain.startsWith(".") || domain.includes("..")) {
    return { ok: false, error: "The domain has a misplaced dot. Use a name like yourbusiness.com." };
  }
  if (domain.length > 253) return { ok: false, error: "That domain is too long." };

  const parts = domain.split(".");
  if (parts.length < 2) {
    return { ok: false, error: "Add the domain extension at the end, e.g. yourbusiness.com or yourbusiness.in." };
  }
  if (parts.every((p) => /^\d+$/.test(p))) return { ok: false, error: "Enter a domain name, not an IP address." };
  if (!parts.every((p) => LABEL.test(p))) {
    return { ok: false, error: "Use only letters, numbers and hyphens in the domain (no hyphen at the start or end of a part)." };
  }

  // Extension must be a real one, at the very end. Prefer two-part extensions like co.in.
  const last2 = parts.slice(-2).join(".");
  const tld = parts[parts.length - 1];
  const known = parts.length >= 3 && MULTI_SET.has(last2);
  if (MULTI_SET.has(last2) && parts.length === 2) {
    return { ok: false, error: `Add the name before .${last2}, e.g. example.${last2}.` };
  }
  if (!known && !SINGLE_SET.has(tld)) {
    return { ok: false, error: `".${tld}" is not a valid domain extension. Use one like .com, .in, .co.in, .org or .net.` };
  }
  const example = EXAMPLE_ONLY.find((d) => domain === d || domain.endsWith(`.${d}`));
  if (example) {
    return { ok: false, error: `Invalid domain: ${example} is only an example. Enter the website you want to scrape, e.g. yourbusiness.com.` };
  }
  return { ok: true, domain };
}
