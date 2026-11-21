import { Router } from "express";
import { Types } from "mongoose";
import { auth, roles } from "../middleware/auth";
import { AdSpend } from "../models/AdSpend";
import { Lead } from "../models/Lead";
import { Business } from "../models/Business";
import { BusinessProject } from "../models/BusinessProject";

const r = Router();
const adminOnly = [auth, roles("ADMIN", "MANAGER")] as const;

function parseDate(s: string | undefined, fallback: Date) {
  if (!s || Number.isNaN(Date.parse(s))) return fallback;
  return new Date(s);
}

/** Build the lead $match scope for a spend record. */
function spendLeadScope(spend: { business: any; project?: any; campaignId?: string; adId?: string; periodFrom: Date; periodTo: Date }) {
  const m: Record<string, any> = {
    business: spend.business,
    createdAt: { $gte: spend.periodFrom, $lte: spend.periodTo },
  };
  if (spend.project) m.businessProject = spend.project;
  if (spend.campaignId) m["meta.campaignId"] = spend.campaignId;
  if (spend.adId) m["meta.adId"] = spend.adId;
  return m;
}

/**
 * GET /api/spend
 * List spend records (filtered by business/project/range).
 */
r.get("/", ...adminOnly, async (req, res) => {
  const q = req.query as Record<string, string>;
  const filter: Record<string, any> = {};
  if (q.business && Types.ObjectId.isValid(q.business)) filter.business = new Types.ObjectId(q.business);
  if (q.project && Types.ObjectId.isValid(q.project)) filter.project = new Types.ObjectId(q.project);
  if (q.level) filter.level = q.level;

  const records = await AdSpend.find(filter)
    .sort({ periodFrom: -1 })
    .limit(200)
    .populate("business", "name")
    .populate("project", "name")
    .populate("createdBy", "name email")
    .lean();

  res.json({ records });
});

/**
 * POST /api/spend
 * Create a spend entry.
 */
r.post("/", ...adminOnly, async (req, res) => {
  const { business, project, level, campaignId, campaignName, adId, adName, amount, periodFrom, periodTo, date, entryDate, note } = req.body;
  if (!business || !Types.ObjectId.isValid(business)) return res.status(400).json({ message: "business is required" });

  const finalLevel = level || (project && Types.ObjectId.isValid(project) ? "PROJECT" : "BUSINESS");
  if (!["BUSINESS", "PROJECT", "CAMPAIGN", "AD"].includes(finalLevel)) return res.status(400).json({ message: "Invalid level" });
  if (amount === undefined || typeof amount !== "number" || amount < 0) return res.status(400).json({ message: "amount must be a non-negative number" });

  let pFrom = periodFrom ? new Date(periodFrom) : undefined;
  let pTo = periodTo ? new Date(periodTo) : undefined;
  const rawDate = entryDate || date;
  if (!pFrom && rawDate) {
    const d = new Date(rawDate);
    if (!Number.isNaN(d.getTime())) {
      pFrom = new Date(d);
      pFrom.setHours(0, 0, 0, 0);
      pTo = new Date(d);
      pTo.setHours(23, 59, 59, 999);
    }
  }

  if (!pFrom || !pTo) return res.status(400).json({ message: "entryDate or period is required" });

  const spend = await AdSpend.create({
    business: new Types.ObjectId(business),
    project: project && Types.ObjectId.isValid(project) ? new Types.ObjectId(project) : undefined,
    level: finalLevel,
    campaignId,
    campaignName,
    adId,
    adName,
    amount,
    periodFrom: pFrom,
    periodTo: pTo,
    note,
    createdBy: req.user!.id,
  });

  res.status(201).json({ spend });
});

/**
 * PATCH /api/spend/:id
 * Update a spend entry.
 */
r.patch("/:id", ...adminOnly, async (req, res) => {
  const spend = await AdSpend.findById(req.params.id);
  if (!spend) return res.status(404).json({ message: "Not found" });

  const { amount, note, periodFrom, periodTo, campaignId, campaignName, adId, adName } = req.body;
  if (amount !== undefined) {
    if (typeof amount !== "number" || amount < 0) return res.status(400).json({ message: "Invalid amount" });
    spend.amount = amount;
  }
  if (note !== undefined) spend.note = note;
  if (periodFrom) spend.periodFrom = new Date(periodFrom);
  if (periodTo) spend.periodTo = new Date(periodTo);
  if (campaignId !== undefined) spend.campaignId = campaignId;
  if (campaignName !== undefined) spend.campaignName = campaignName;
  if (adId !== undefined) spend.adId = adId;
  if (adName !== undefined) spend.adName = adName;

  await spend.save();
  res.json({ spend });
});

/**
 * DELETE /api/spend/:id
 */
r.delete("/:id", ...adminOnly, async (req, res) => {
  const spend = await AdSpend.findByIdAndDelete(req.params.id);
  if (!spend) return res.status(404).json({ message: "Not found" });
  res.json({ ok: true });
});

/**
 * GET /api/spend/summary?business=&project=&from=&to=&level=
 * Returns a table like Meta Ads Manager: spend, leads, CPL, won, CPW, conversion%.
 * If business is provided, returns per-project details for that business.
 * If business is omitted, returns network totals and per-business totals (business direct + projects combined).
 */
r.get("/summary", ...adminOnly, async (req, res) => {
  const q = req.query as Record<string, string>;
  const from = parseDate(q.from, new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));
  const to = parseDate(q.to, new Date());
  to.setHours(23, 59, 59, 999);
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // 1. If a specific business is requested:
  if (q.business && Types.ObjectId.isValid(q.business)) {
    const businessId = new Types.ObjectId(q.business);
    const selectedProjectId = q.project && Types.ObjectId.isValid(q.project) ? new Types.ObjectId(q.project) : undefined;

    // Fetch ALL spends for this business to have accurate business-level & project-level totals
    const allBusinessSpends = await AdSpend.find({ business: businessId, periodFrom: { $lte: to }, periodTo: { $gte: from } }).lean();

    const totalBusinessSpend = allBusinessSpends.reduce((a, s) => a + s.amount, 0);
    const businessLevelSpend = allBusinessSpends.filter((s) => !s.project).reduce((a, s) => a + s.amount, 0);
    const projectLevelSpend = allBusinessSpends.filter((s) => !!s.project).reduce((a, s) => a + s.amount, 0);

    // Records matching the specific filter (if project filtered, only those records)
    const spendFilter: Record<string, any> = { business: businessId, periodFrom: { $lte: to }, periodTo: { $gte: from } };
    if (selectedProjectId) spendFilter.project = selectedProjectId;
    if (q.level) spendFilter.level = q.level;

    const filteredSpends = await AdSpend.find(spendFilter).lean();

    const rows = await Promise.all(
      filteredSpends.map(async (s) => {
        const scope = spendLeadScope(s);
        const [leads, won] = await Promise.all([
          Lead.countDocuments(scope),
          Lead.countDocuments({ ...scope, status: "WON" }),
        ]);
        const cpl = leads > 0 ? Math.round((s.amount / leads) * 100) / 100 : null;
        const cpw = won > 0 ? Math.round((s.amount / won) * 100) / 100 : null;
        return {
          id: String(s._id),
          projectId: s.project ? String(s.project) : null,
          level: s.level,
          campaignId: s.campaignId,
          campaignName: s.campaignName,
          adId: s.adId,
          adName: s.adName,
          amount: s.amount,
          periodFrom: s.periodFrom,
          periodTo: s.periodTo,
          note: s.note,
          leads,
          won,
          cpl,
          cpw,
          conversionRate: leads > 0 ? Math.round((won / leads) * 1000) / 10 : 0,
          createdAt: s.createdAt,
        };
      })
    );

    const businessLeadScope = { business: businessId, createdAt: { $gte: from, $lte: to } };
    const [businessLeads, businessWon] = await Promise.all([
      Lead.countDocuments(businessLeadScope),
      Lead.countDocuments({ ...businessLeadScope, status: "WON" }),
    ]);

    // Calculate per-project direct spend and leads
    const projects = await BusinessProject.find({ business: businessId }).select("_id name").lean();
    const byProject = await Promise.all(
      projects.map(async (p) => {
        const leadScope = { business: businessId, businessProject: p._id, createdAt: { $gte: from, $lte: to } };
        const [leads, won] = await Promise.all([
          Lead.countDocuments(leadScope),
          Lead.countDocuments({ ...leadScope, status: "WON" }),
        ]);
        const projectSpends = allBusinessSpends.filter((s) => s.project && String(s.project) === String(p._id));
        const directSpend = projectSpends.reduce((a, s) => a + s.amount, 0);
        const allocatedSpend = businessLeads > 0 ? round2((businessLevelSpend * leads) / businessLeads) : 0;
        const effectiveSpend = round2(directSpend + allocatedSpend);
        return {
          projectId: String(p._id),
          name: p.name,
          directSpend,
          allocatedSpend,
          amount: directSpend, // Actual direct project spend!
          effectiveSpend,
          leads,
          won,
          cpl: leads > 0 && directSpend > 0 ? round2(directSpend / leads) : null,
          cpw: won > 0 && directSpend > 0 ? round2(directSpend / won) : null,
          conversionRate: leads > 0 ? Math.round((won / leads) * 1000) / 10 : 0,
        };
      })
    );
    byProject.sort((a, b) => b.directSpend - a.directSpend || b.leads - a.leads);

    let activeAmount = totalBusinessSpend;
    let activeLeads = businessLeads;
    let activeWon = businessWon;

    if (selectedProjectId) {
      const projObj = byProject.find((p) => p.projectId === String(selectedProjectId));
      activeAmount = projObj ? projObj.directSpend : 0;
      activeLeads = projObj ? projObj.leads : 0;
      activeWon = projObj ? projObj.won : 0;
    }

    const activeCpl = activeLeads > 0 && activeAmount > 0 ? round2(activeAmount / activeLeads) : null;
    const activeCpw = activeWon > 0 && activeAmount > 0 ? round2(activeAmount / activeWon) : null;

    return res.json({
      rows,
      byProject,
      totals: {
        amount: activeAmount,
        totalBusinessSpend,
        businessLevelSpend,
        projectLevelSpend,
        leads: activeLeads,
        won: activeWon,
        cpl: activeCpl,
        cpw: activeCpw,
        conversionRate: activeLeads > 0 ? Math.round((activeWon / activeLeads) * 1000) / 10 : 0,
      },
    });
  }

  // 2. If no business specified: overall summary across all businesses
  const allSpends = await AdSpend.find({ periodFrom: { $lte: to }, periodTo: { $gte: from } }).lean();
  const totalSpend = allSpends.reduce((a, s) => a + s.amount, 0);
  const totalBusinessDirect = allSpends.filter((s) => !s.project).reduce((a, s) => a + s.amount, 0);
  const totalProjectDirect = allSpends.filter((s) => !!s.project).reduce((a, s) => a + s.amount, 0);

  const [totalLeads, totalWon, allBusinesses] = await Promise.all([
    Lead.countDocuments({ createdAt: { $gte: from, $lte: to } }),
    Lead.countDocuments({ createdAt: { $gte: from, $lte: to }, status: "WON" }),
    Business.find().select("_id name city state").lean(),
  ]);

  const byBusiness = await Promise.all(
    allBusinesses.map(async (b) => {
      const bSpends = allSpends.filter((s) => String(s.business) === String(b._id));
      const bDirect = bSpends.filter((s) => !s.project).reduce((a, s) => a + s.amount, 0);
      const bProjectSpend = bSpends.filter((s) => !!s.project).reduce((a, s) => a + s.amount, 0);
      const bTotal = bDirect + bProjectSpend;

      const [bLeads, bWon, pCount] = await Promise.all([
        Lead.countDocuments({ business: b._id, createdAt: { $gte: from, $lte: to } }),
        Lead.countDocuments({ business: b._id, createdAt: { $gte: from, $lte: to }, status: "WON" }),
        BusinessProject.countDocuments({ business: b._id }),
      ]);

      return {
        businessId: String(b._id),
        name: b.name,
        city: b.city,
        state: b.state,
        totalSpend: bTotal,
        businessSpend: bDirect,
        projectSpend: bProjectSpend,
        projectCount: pCount,
        leads: bLeads,
        won: bWon,
        cpl: bLeads > 0 && bTotal > 0 ? round2(bTotal / bLeads) : null,
        spendCount: bSpends.length,
      };
    })
  );

  byBusiness.sort((a, b) => b.totalSpend - a.totalSpend);

  return res.json({
    byBusiness,
    totals: {
      amount: totalSpend,
      businessLevelSpend: totalBusinessDirect,
      projectLevelSpend: totalProjectDirect,
      leads: totalLeads,
      won: totalWon,
      cpl: totalLeads > 0 && totalSpend > 0 ? round2(totalSpend / totalLeads) : null,
      cpw: totalWon > 0 && totalSpend > 0 ? round2(totalSpend / totalWon) : null,
    },
  });
});

/**
 * GET /api/spend/options?business=
 * Returns distinct campaign/ad ids seen on that business's leads.
 */
r.get("/options", ...adminOnly, async (req, res) => {
  const q = req.query as Record<string, string>;
  if (!q.business || !Types.ObjectId.isValid(q.business)) return res.status(400).json({ message: "business is required" });

  const businessId = new Types.ObjectId(q.business);

  const [campaigns, ads] = await Promise.all([
    Lead.aggregate([
      { $match: { business: businessId, "meta.campaignId": { $ne: null } } },
      { $group: { _id: "$meta.campaignId", name: { $first: "$campaign" } } },
      { $project: { id: "$_id", name: 1, _id: 0 } },
    ]),
    Lead.aggregate([
      { $match: { business: businessId, "meta.adId": { $ne: null } } },
      { $group: { _id: "$meta.adId", name: { $first: { $ifNull: ["$meta.adName", null] } } } },
      { $project: { id: "$_id", name: 1, _id: 0 } },
    ]),
  ]);

  res.json({ campaigns, ads });
});

export default r;
