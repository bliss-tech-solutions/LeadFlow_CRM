import { Types } from "mongoose";
import { Contact, OutreachSettings, type ContactSource } from "../models/Outreach";
import { Lead } from "../models/Lead";
import { normalizePhone } from "../utils/phone";
import { logger } from "../config/logger";
import { env } from "../config/env";

/**
 * Contact Data keeps only name + mobile, one row per number. Leads feed it
 * automatically; CSV uploads and manual adds go straight into it.
 */

type Input = { name?: unknown; phone?: unknown; lead?: unknown; createdAt?: Date };

function clean(input: Input) {
  const phone = normalizePhone(input.phone, env.WA_DEFAULT_COUNTRY_CODE);
  if (!phone) return null;
  const name = String(input.name ?? "").trim().slice(0, 120) || phone;
  return { name, phone };
}

/**
 * Insert contacts, skipping numbers that already exist (never overwrites).
 * Returns how many were new.
 */
export async function addContacts(rows: Input[], source: ContactSource, createdBy?: string): Promise<number> {
  const ops: any[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const c = clean(row);
    if (!c || seen.has(c.phone)) continue;
    seen.add(c.phone);
    const lead = row.lead && Types.ObjectId.isValid(String(row.lead)) ? new Types.ObjectId(String(row.lead)) : undefined;
    // Keep the lead's own date so the list stays in true arrival order.
    const at = row.createdAt instanceof Date ? row.createdAt : new Date();
    ops.push({
      updateOne: {
        filter: { phone: c.phone },
        update: {
          $setOnInsert: { name: c.name, phone: c.phone, source, createdAt: at, updatedAt: at, ...(lead ? { lead } : {}), ...(createdBy ? { createdBy } : {}) },
        },
        upsert: true,
        timestamps: false,
      },
    });
  }
  if (!ops.length) return 0;
  let added = 0;
  for (let i = 0; i < ops.length; i += 1000) {
    try {
      const res = await Contact.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
      added += res.upsertedCount || 0;
    } catch (e: any) {
      // Two writers inserting the same number at once: the duplicate is simply skipped.
      const errors: any[] = e?.writeErrors || [];
      if (!errors.length || errors.some((w) => (w.code ?? w.err?.code) !== 11000)) throw e;
      added += e?.result?.upsertedCount ?? e?.result?.nUpserted ?? 0;
    }
  }
  return added;
}

/** Called for every new lead (webhook, LeadSync, CSV import, manual). Never throws. */
export async function addContactFromLead(lead: { _id?: unknown; name?: unknown; phone?: unknown; createdAt?: Date }) {
  try {
    if (!lead?.phone) return;
    await addContacts([{ name: lead.name, phone: lead.phone, lead: lead._id, createdAt: lead.createdAt }], "LEAD");
  } catch (e: any) {
    logger.warn("[contacts] could not add contact from lead", { error: e?.message });
  }
}

/** One-time copy of leads that existed before Contact Data had its own collection. */
export async function backfillLeadContacts() {
  try {
    const done: any = await OutreachSettings.findOne({ key: "contacts" }).select("backfilledAt").lean();
    if (done?.backfilledAt) return;
    let added = 0;
    let batch: Input[] = [];
    const cursor = Lead.find({ phone: { $nin: [null, ""] } }).select("name phone createdAt").sort({ createdAt: 1 }).lean().cursor();
    for await (const l of cursor as any) {
      batch.push({ name: l.name, phone: l.phone, lead: l._id, createdAt: l.createdAt });
      if (batch.length >= 1000) {
        added += await addContacts(batch, "LEAD");
        batch = [];
      }
    }
    if (batch.length) added += await addContacts(batch, "LEAD");
    await OutreachSettings.updateOne({ key: "contacts" }, { $set: { backfilledAt: new Date() }, $setOnInsert: { key: "contacts" } }, { upsert: true });
    logger.info("[contacts] backfilled contacts from existing leads", { added });
  } catch (e: any) {
    logger.error("[contacts] backfill failed", { error: e?.message });
  }
}
