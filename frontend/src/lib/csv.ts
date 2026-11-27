/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). Delimiter is auto-detected. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
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
    else if (c === delimiter) {
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

/**
 * Read the first sheet of a .csv, .xlsx or .xls-saved-as-xlsx file as rows of strings.
 * Excel parsing is loaded on demand so it never weighs down the rest of the app.
 */
export async function readSpreadsheet(file: File): Promise<string[][]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx")) {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      const cells = values.map((v: any) => {
        if (v == null) return "";
        if (typeof v === "object") return String(v.text ?? v.result ?? v.hyperlink ?? (v.richText ? v.richText.map((t: any) => t.text).join("") : ""));
        return String(v);
      });
      if (cells.some((c) => c.trim())) rows.push(cells);
    });
    return rows;
  }
  return parseCsv(decodeText(await file.arrayBuffer()));
}

/** Comma, tab or semicolon: whichever appears most in the header line. */
export function detectDelimiter(text: string): string {
  const end = text.search(/\r?\n/);
  const header = text.slice(0, end > 0 ? end : 2000);
  const counts = [",", "\t", ";"].map((d) => [d, header.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/**
 * Decode a text file to a string. Facebook / Meta lead exports are often
 * UTF-16 (with a byte-order mark), which file.text() would turn into garbage.
 */
export function decodeText(buffer: ArrayBuffer): string {
  const b = new Uint8Array(buffer);
  let text: string;
  if (b[0] === 0xff && b[1] === 0xfe) text = new TextDecoder("utf-16le").decode(b.subarray(2));
  else if (b[0] === 0xfe && b[1] === 0xff) text = new TextDecoder("utf-16be").decode(b.subarray(2));
  else if (b.length > 3 && b[1] === 0 && b[3] === 0) text = new TextDecoder("utf-16le").decode(b);
  else text = new TextDecoder("utf-8").decode(b);
  return text.replace(/^\uFEFF/, "");
}
