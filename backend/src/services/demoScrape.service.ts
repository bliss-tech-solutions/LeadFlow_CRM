import { DemoContact } from "../models/Outreach";
import { addContacts } from "./contacts.service";
import { firstValidPhone } from "../utils/phone";
import { env } from "../config/env";
import { logger } from "../config/logger";

/**
 * Data scraping demo. The "demodata" collection is filled from a Google Sheet;
 * every scrape tick moves a few random unused rows into Contact Data.
 */

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

/** Turn a Google Sheets link (or bare ID) into its CSV export URL. */
export function sheetCsvUrl(source: string): string | null {
  const s = source.trim();
  if (!s) return null;
  const id = s.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] ?? (/^[\w-]{20,}$/.test(s) ? s : null);
  if (!id) return null;
  const gid = s.match(/[#&?]gid=(\d+)/)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[\s.\-]+/g, "_");
function column(headers: string[], keys: string[]) {
  const n = headers.map(norm);
  for (const k of keys) {
    const i = n.indexOf(k);
    if (i >= 0) return i;
  }
  return -1;
}

/** Name + valid mobile from each sheet row. Other columns are ignored. */
export function demoRowsFromCsv(text: string): { name: string; phone: string }[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) return [];
  const [headers, ...data] = rows;
  const iName = column(headers, ["full_name", "name"]);
  const phoneCols = ["phone_number", "phone", "mobile", "mobile_number"].map((k) => column(headers, [k])).filter((i) => i >= 0);
  const out: { name: string; phone: string }[] = [];
  for (const r of data) {
    let phone: string | null = null;
    for (const i of phoneCols) {
      phone = firstValidPhone(String(r[i] ?? "").replace(/^p:/i, ""), env.WA_DEFAULT_COUNTRY_CODE);
      if (phone) break;
    }
    if (!phone) continue;
    const name = (iName >= 0 ? String(r[iName] ?? "").trim() : "").slice(0, 120) || phone;
    out.push({ name, phone });
  }
  return out;
}

let lastSync = 0;
let syncing: Promise<number> | null = null;
const RESYNC_MS = 10 * 60_000;

/** Pull the sheet into "demodata" (new numbers only). Returns how many were added. */
export async function syncDemoData(): Promise<number> {
  const url = sheetCsvUrl(env.SCRAPE_SHEET_URL || "");
  if (!url) return 0;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "follow" });
  if (!res.ok) throw new Error(`Sheet download failed (${res.status})`);
  const rows = demoRowsFromCsv(await res.text());
  if (!rows.length) return 0;
  const out = await DemoContact.bulkWrite(
    rows.map((r) => ({
      updateOne: { filter: { phone: r.phone }, update: { $setOnInsert: { name: r.name, phone: r.phone, usedAt: null } }, upsert: true },
    })),
    { ordered: false },
  );
  lastSync = Date.now();
  logger.info("[demo-scrape] synced demo data", { rows: rows.length, added: out.upsertedCount });
  return out.upsertedCount || 0;
}

/** Sync when the pool has nothing left (at most every 10 minutes). Never throws. */
export async function ensurePool(): Promise<void> {
  if (await DemoContact.exists({ usedAt: null })) return;
  if (Date.now() - lastSync < RESYNC_MS) return;
  try {
    syncing ??= syncDemoData().finally(() => (syncing = null));
    await syncing;
  } catch (e: any) {
    lastSync = Date.now();
    logger.warn("[demo-scrape] could not sync demo data", { error: e?.message });
  }
}

const BATCH_SIZES = [1, 2, 3, 3, 4, 4, 5, 6, 8, 12];

/** One scrape tick: move a random handful of unused demo rows into Contact Data. */
export async function scrapeNext(userId?: string): Promise<{ found: number; added: number; exhausted: boolean }> {
  await ensurePool();
  const size = BATCH_SIZES[Math.floor(Math.random() * BATCH_SIZES.length)];
  const picks: { _id: unknown; name: string; phone: string }[] = await DemoContact.aggregate([
    { $match: { usedAt: null } },
    { $sample: { size } },
    { $project: { name: 1, phone: 1 } },
  ]);
  if (!picks.length) return { found: 0, added: 0, exhausted: true };
  await DemoContact.updateMany({ _id: { $in: picks.map((p) => p._id) } }, { $set: { usedAt: new Date() } });
  const added = await addContacts(
    picks.map((p) => ({ name: p.name, phone: p.phone })),
    "SCRAPE",
    userId,
  );
  return { found: picks.length, added, exhausted: false };
}
