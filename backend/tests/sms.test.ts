import { describe, it, expect } from "vitest";
import { parseDeliveryReports } from "../src/services/sms.service";

describe("parseDeliveryReports (MSG91)", () => {
  it("reads JSON reports with delivered and failed numbers", () => {
    const out = parseDeliveryReports({
      data: [
        {
          requestId: "abc123",
          report: [
            { number: "919876543210", status: "1", desc: "DELIVERED" },
            { number: "919800000000", status: "16", desc: "REJECTED" },
            { number: "919811111111", status: "8", desc: "SUBMITTED" },
          ],
        },
      ],
    });
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ requestId: "abc123", number: "919876543210", delivered: true, failed: false });
    expect(out[1]).toMatchObject({ delivered: false, failed: true });
    expect(out[2]).toMatchObject({ delivered: false, failed: false });
  });

  it("reads the form-encoded `data` string", () => {
    const data = JSON.stringify([{ requestId: "r1", report: [{ number: "+91 98765 43210", status: "2", desc: "FAILED" }] }]);
    expect(parseDeliveryReports({ data })).toEqual([{ requestId: "r1", number: "919876543210", delivered: false, failed: true, description: "FAILED" }]);
  });

  it("ignores junk", () => {
    expect(parseDeliveryReports({ data: "not json" })).toEqual([]);
    expect(parseDeliveryReports(null)).toEqual([]);
  });
});

import { firstValidPhone } from "../src/utils/phone";
import { looseText } from "../src/middleware/validate";

describe("spreadsheet upload cells", () => {
  it("picks the first valid number from a messy cell", () => {
    expect(firstValidPhone("98765 43210 / 91234 56789")).toBe("919876543210");
    expect(firstValidPhone("+91-98765-43210, 9123456789")).toBe("919876543210");
    expect(firstValidPhone("call after 6pm")).toBeNull();
    expect(firstValidPhone("123")).toBeNull();
    expect(firstValidPhone("")).toBeNull();
  });

  it("never rejects an oversized or odd cell", () => {
    const cell = looseText(30);
    expect(cell.parse("x".repeat(500))).toHaveLength(30);
    expect(cell.parse(9876543210)).toBe("9876543210");
    expect(cell.parse(undefined)).toBe("");
    expect(cell.parse(null)).toBe("");
  });
});
