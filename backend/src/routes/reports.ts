import { Router } from "express";
import { Types } from "mongoose";
import PDFDocument from "pdfkit";
import { auth, roles } from "../middleware/auth";
import { Lead } from "../models/Lead";
import { parsePrice } from "../utils/price";

const r = Router();
const adminOnly = [auth, roles("ADMIN", "MANAGER")] as const;

function maskPhone(phone: string | undefined, role: string): string {
  if (!phone) return "";
  if (role === "ADMIN") return phone;
  return phone.slice(0, -4).replace(/\d/g, "*") + phone.slice(-4);
}

/**
 * GET /api/reports/leads.pdf
 * Download a PDF of the lead list with optional groupBy=product.
 * Limited to 5000 rows.
 */
r.get("/leads.pdf", ...adminOnly, async (req, res) => {
  const q = req.query as Record<string, string>;

  const filter: Record<string, any> = {};
  if (q.business && Types.ObjectId.isValid(q.business)) filter.business = new Types.ObjectId(q.business);
  const projectId = q.businessProject || q.project;
  if (projectId && Types.ObjectId.isValid(projectId)) filter.businessProject = new Types.ObjectId(projectId);
  if (q.status) filter.status = q.status;
  if (q.product) filter.interestedProduct = q.product;
  if (q.city) filter.city = q.city;
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = new Date(q.from);
    if (q.to) { const t = new Date(q.to); t.setHours(23, 59, 59, 999); filter.createdAt.$lte = t; }
  }

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    product: { interestedProduct: 1 },
    size_desc: { interestedProduct: 1 }, // best-effort; real size sort needs aggregation
    price_desc: { interestedProduct: 1 },
    newest: { createdAt: -1 },
  };
  const sort = sortMap[q.sort ?? "newest"] ?? { createdAt: -1 };

  const leads = await Lead.find(filter)
    .sort(sort)
    .limit(5000)
    .populate("businessProject", "name")
    .populate("assignedTo", "name")
    .lean();

  const role = req.user!.role;
  const now = new Date();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="leads-${now.toISOString().slice(0, 10)}.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
  doc.pipe(res);

  // Header
  doc.fontSize(16).text("LeadFlow — Lead Report", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#555")
    .text(`Generated: ${now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}  |  Rows: ${leads.length}`, { align: "center" });
  if (q.from || q.to) {
    doc.text(`Date range: ${q.from ?? "–"} to ${q.to ?? "–"}`, { align: "center" });
  }
  doc.fillColor("#000").moveDown(0.5);

  // Summary per product if groupBy=product
  if (q.groupBy === "product") {
    const byProduct = new Map<string, { leads: number; won: number; priceSum: number; priceCount: number }>();
    for (const l of leads) {
      const key = l.interestedProduct || "Unknown";
      const e = byProduct.get(key) ?? { leads: 0, won: 0, priceSum: 0, priceCount: 0 };
      e.leads++;
      if (l.status === "WON") e.won++;
      const proj: any = l.businessProject;
      byProduct.set(key, e);
    }

    doc.fontSize(11).text("Summary by Product");
    doc.moveDown(0.2);
    const cols = [120, 60, 50, 80];
    const headers = ["Product", "Leads", "Won", "Conversion"];
    drawRow(doc, headers, cols, true);
    for (const [product, s] of byProduct) {
      drawRow(doc, [
        product,
        String(s.leads),
        String(s.won),
        s.leads ? `${Math.round((s.won / s.leads) * 100)}%` : "0%",
      ], cols, false);
    }
    doc.moveDown(1);
  }

  // Lead table
  doc.fontSize(11).text("Lead Details");
  doc.moveDown(0.2);

  const cols2 = [140, 90, 100, 70, 80, 110, 70];
  drawRow(doc, ["Name", "Phone", "Project", "Product", "Status", "Assigned To", "Date"], cols2, true);

  for (const l of leads) {
    const proj: any = l.businessProject;
    const user: any = l.assignedTo;
    drawRow(doc, [
      l.name ?? "",
      maskPhone(l.phone, role),
      proj?.name ?? "",
      l.interestedProduct ?? "",
      l.status,
      user?.name ?? "",
      l.createdAt ? new Date(l.createdAt).toLocaleDateString("en-IN") : "",
    ], cols2, false);
  }

  // Page numbers
  const pages = (doc as any).bufferedPageRange?.() ?? { start: 0, count: 1 };
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor("#888")
      .text(`Page ${i + 1} of ${pages.count}`, 40, doc.page.height - 30, { align: "center" });
  }

  doc.end();
});

function drawRow(doc: PDFKit.PDFDocument, cells: string[], widths: number[], header: boolean) {
  const x0 = 40;
  let x = x0;
  if (header) {
    doc.fontSize(8).fillColor("#fff").rect(x0, doc.y - 2, widths.reduce((a, b) => a + b, 0), 14).fill("#374151");
    doc.fillColor("#fff");
  } else {
    doc.fontSize(7).fillColor("#111");
  }
  for (let i = 0; i < cells.length; i++) {
    doc.text(cells[i] ?? "", x + 2, header ? doc.y : doc.y, { width: widths[i] - 4, lineBreak: false });
    x += widths[i];
  }
  doc.moveDown(header ? 0.5 : 0.3);
  if (!header) doc.fillColor("#000");
}

export default r;
