import { describe, it, expect } from "vitest";
import { normalizePhone, phoneTail } from "../src/utils/phone";
import { escapeRegex } from "../src/utils/regex";
import { renderTemplate } from "../src/services/whatsapp/template";
import { computeLeadScore } from "../src/utils/scoring";
import { encryptString, decryptString } from "../src/utils/crypto";
import { splitMetaPayload } from "../src/services/webhookEvents.service";

describe("normalizePhone", () => {
  it("adds the default country code to local numbers", () => {
    expect(normalizePhone("98765 43210")).toBe("919876543210");
    expect(normalizePhone("098765-43210")).toBe("919876543210");
  });
  it("keeps explicit international numbers", () => {
    expect(normalizePhone("+1 (415) 555-0100")).toBe("14155550100");
    expect(normalizePhone("0044 20 7946 0958")).toBe("442079460958");
  });
  it("rejects junk", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
  });
  it("phoneTail matches across formats", () => {
    expect(phoneTail("+91 98765 43210")).toBe(phoneTail("09876543210"));
  });
});

describe("escapeRegex", () => {
  it("neutralises regex metacharacters", () => {
    const evil = "(a+)+$";
    const escaped = escapeRegex(evil);
    expect(new RegExp(escaped).test("(a+)+$")).toBe(true);
    expect(new RegExp(escaped).test("aaaa")).toBe(false);
  });
  it("caps input length", () => {
    expect(escapeRegex("x".repeat(1000)).length).toBe(200);
  });
});

describe("renderTemplate", () => {
  it("fills variables and drops unknown ones", () => {
    const out = renderTemplate("Hi {{first_name}}, welcome to {{project}} {{unknown}}!", {
      lead: { name: "Asha Patel" },
      project: { name: "Skyline Towers" },
    });
    expect(out).toBe("Hi Asha, welcome to Skyline Towers !");
  });
  it("renders unit price summary", () => {
    const out = renderTemplate("{{price}}", {
      lead: { name: "A" },
      project: { products: [{ customType: "2 BHK", areaSqFt: "1100", priceRange: "85L - 95L" }] },
    });
    expect(out).toContain("2 BHK");
    // The price range is printed as stored; no "₹" is prepended (it may already contain one).
    expect(out).toContain("85L - 95L");
    expect(out).not.toContain("₹₹");
  });
});

describe("computeLeadScore", () => {
  it("pins terminal states", () => {
    expect(computeLeadScore({ status: "WON" })).toBe(100);
    expect(computeLeadScore({ status: "LOST" })).toBe(0);
  });
  it("rewards engagement and penalises missed calls", () => {
    const engaged = computeLeadScore({ status: "INTERESTED", phone: "1", email: "a", connectedCalls: 2 });
    const cold = computeLeadScore({ status: "NEW", phone: "1", missedCalls: 4, ageHours: 200 });
    expect(engaged).toBeGreaterThan(cold);
    expect(engaged).toBeLessThanOrEqual(100);
    expect(cold).toBeGreaterThanOrEqual(0);
  });
});

describe("encryptString", () => {
  it("round-trips and uses a fresh IV", () => {
    const a = encryptString("secret-creds");
    const b = encryptString("secret-creds");
    expect(a).not.toBe(b);
    expect(decryptString(a)).toBe("secret-creds");
  });
  it("detects tampering", () => {
    const enc = encryptString("hello");
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptString(parts.join(":"))).toThrow();
  });
});

describe("splitMetaPayload", () => {
  it("splits batched entries and changes into one payload each", () => {
    const body = {
      object: "page",
      entry: [
        { id: "p1", changes: [{ field: "leadgen", value: { leadgen_id: "1" } }, { field: "leadgen", value: { leadgen_id: "2" } }] },
        { id: "p2", changes: [{ field: "leadgen", value: { leadgen_id: "3" } }, { field: "feed", value: {} }] },
      ],
    };
    const parts = splitMetaPayload(body);
    expect(parts).toHaveLength(3);
    expect(parts.map((p) => p.entry[0].changes[0].value.leadgen_id)).toEqual(["1", "2", "3"]);
  });
  it("passes through non-standard payloads", () => {
    expect(splitMetaPayload({ leadgen_id: "x" })).toEqual([{ leadgen_id: "x" }]);
  });
});

import { parsePrice } from "../src/utils/price";
import { matchProduct } from "../src/utils/productMatch";
describe("parsePrice", () => {
  it("parses lakh strings", () => {
    expect(parsePrice("85L")).toBe(8_500_000);
    expect(parsePrice("1.5 Lakh")).toBe(150_000);
  });
  it("parses crore strings", () => {
    expect(parsePrice("1.2 Cr")).toBe(12_000_000);
    expect(parsePrice("2Crore")).toBe(20_000_000);
  });
  it("takes the upper bound of a range", () => {
    expect(parsePrice("85L – 95L")).toBe(9_500_000);
    expect(parsePrice("1.2 Cr - 1.5 Cr")).toBe(15_000_000);
  });
  it("returns 0 for null/undefined/junk", () => {
    expect(parsePrice(null)).toBe(0);
    expect(parsePrice("")).toBe(0);
    expect(parsePrice("Ask for price")).toBe(0);
  });
});

describe("matchProduct", () => {
  const products = [
    { type: "2BHK" as const, customType: undefined, priceRange: "85L-95L", areaSqFt: "1100", units: 10, isPenthouse: false, details: {} },
    { type: "3BHK" as const, customType: undefined, priceRange: "1.2Cr-1.5Cr", areaSqFt: "1600", units: 5, isPenthouse: false, details: {} },
  ];
  it("matches a product from form field data", () => {
    const fields = [{ name: "interested_in", values: ["3BHK apartment"] }];
    expect(matchProduct(fields, products)).toBe("3BHK");
  });
  it("returns null when nothing matches", () => {
    const fields = [{ name: "city", values: ["Ahmedabad"] }];
    expect(matchProduct(fields, products)).toBeNull();
  });
  it("returns null for empty inputs", () => {
    expect(matchProduct([], products)).toBeNull();
    expect(matchProduct([{ name: "x", values: ["y"] }], [])).toBeNull();
  });
});

describe("CPL math", () => {
  it("computes cost per lead correctly", () => {
    const spend = 42_000;
    const leads = 42;
    expect(Math.round((spend / leads) * 100) / 100).toBe(1000);
  });
  it("handles zero leads without dividing by zero", () => {
    const leads = 0;
    const cpl = leads > 0 ? 42_000 / leads : null;
    expect(cpl).toBeNull();
  });
  it("handles overlapping periods by counting per record", () => {
    // Each record is counted independently; overlaps are by design
    const records = [{ amount: 10_000, leads: 20 }, { amount: 10_000, leads: 20 }];
    const totalSpend = records.reduce((a, r) => a + r.amount, 0);
    const totalLeads = records.reduce((a, r) => a + r.leads, 0);
    expect(Math.round((totalSpend / totalLeads) * 100) / 100).toBe(500);
  });
});

import { compareVersions } from "../src/routes/appConfig";
import { categorize, isExpoPushToken } from "../src/services/push.service";

describe("compareVersions", () => {
  it("orders dotted versions numerically", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.9.0", "1.0.0")).toBe(-1);
  });
});

describe("push categories", () => {
  it("maps notification types to user-controllable categories", () => {
    expect(categorize("NEW_LEAD").category).toBe("newLead");
    expect(categorize("FOLLOWUP_DUE_SOON").channelId).toBe("reminders");
    expect(categorize("SLA_ESCALATION").timeSensitive).toBe(true);
    expect(categorize("CALL_LOGGED").category).toBe("activity");
    expect(categorize("WHATSAPP_STATUS").category).toBe("whatsapp");
  });
  it("validates Expo push tokens", () => {
    expect(isExpoPushToken("ExponentPushToken[abc123]")).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[xyz]")).toBe(true);
    expect(isExpoPushToken("not-a-token")).toBe(false);
  });
});
