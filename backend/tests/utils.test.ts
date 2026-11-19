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
    expect(out).toContain("₹85L - 95L");
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
