import { describe, expect, it } from "vitest";
import { demoRowsFromCsv, sheetCsvUrl } from "../src/services/demoScrape.service";

describe("demo scrape sheet", () => {
  it("builds the CSV export URL from a sheet link", () => {
    expect(sheetCsvUrl("https://docs.google.com/spreadsheets/d/abc_DEF-123/edit?gid=42#gid=42")).toBe(
      "https://docs.google.com/spreadsheets/d/abc_DEF-123/export?format=csv&gid=42"
    );
    expect(sheetCsvUrl("not a sheet")).toBeNull();
  });

  it("reads only name + a valid phone, preferring phone_number then phone", () => {
    const csv = [
      'id,full_name,phone,city,phone_number',
      'l:1,"Asha Patel",,Pune,p:+919876543210',
      'l:2,Ravi,+91 98765 11111,"Ahmedabad, GJ",',
      'l:3,No Phone,,Surat,',
      'l:4,Bad,123,Surat,abc',
    ].join("\r\n");
    expect(demoRowsFromCsv(csv)).toEqual([
      { name: "Asha Patel", phone: "919876543210" },
      { name: "Ravi", phone: "919876511111" },
    ]);
  });
});
