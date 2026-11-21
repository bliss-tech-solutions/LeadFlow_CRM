import { Types } from "mongoose";
import { Router } from "express";
import crypto from "crypto";
import { BusinessProject } from "../models/BusinessProject";
import { Business } from "../models/Business";
import { Lead } from "../models/Lead";
import { User } from "../models/User";
import { auth, roles } from "../middleware/auth";
import { logActivity } from "../utils/activity";
import {
  createDocumentDownloadUrl,
  createDocumentUploadUrl,
  deleteDocumentObject,
} from "../services/s3.service";
import { env } from "../config/env";
import { Notification } from "../models/Notification";
import { remapUnmappedLeads } from "../services/leadRemap.service";
import { containsRegex, exactRegex } from "../utils/regex";
import { salesBelongsToProject, stripQuota } from "../utils/tenant";
import { invalidateUser } from "../utils/userCache";

const r = Router();

const DOCUMENT_CATEGORIES = [
  "BROCHURE",
  "PRICE_SHEET",
  "FLOOR_PLAN",
  "PAYMENT_PLAN",
  "AMENITIES",
  "OTHER",
];

/** Upload limits: documents up to 20 MB, images up to 1 MB (apps compress photos before upload). */
const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024;
const MAX_IMAGE_SIZE = 1 * 1024 * 1024;
const ALLOWED_DOC_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Validate an upload request; returns an error message or null. */
function checkUpload(contentType: string, size: number): string | null {
  const type = String(contentType || "").toLowerCase();
  if (ALLOWED_IMAGE_TYPES.has(type)) {
    if (!size || size <= 0 || size > MAX_IMAGE_SIZE) return "Images must be 1 MB or smaller";
    return null;
  }
  if (ALLOWED_DOC_TYPES.has(type)) {
    if (!size || size <= 0 || size > MAX_DOCUMENT_SIZE) return "Documents must be 20 MB or smaller";
    return null;
  }
  return "Only PDF, Word, Excel, PowerPoint, JPG, PNG or WEBP files are allowed";
}

function isAdmin(req: any) {
  return req.user?.role === "ADMIN" || req.user?.role === "MANAGER";
}

async function canViewProject(req: any, projectId: string) {
  if (isAdmin(req)) return true;

  const project = await BusinessProject.findById(projectId).select("business").lean();
  if (!project) return false;

  if (req.user?.role === "BUSINESS") {
    if (req.user.business && String(project.business) === String(req.user.business)) return true;
    if (String(req.user.businessProject) === String(projectId)) return true;
    if (Array.isArray(req.user.assignedProjects) && req.user.assignedProjects.some((p: any) => String(p) === String(projectId))) return true;
    return false;
  }

  if (req.user?.role === "SALES") {
    if (Array.isArray(req.user.assignedProjects) && req.user.assignedProjects.some((p: any) => String(p) === String(projectId))) return true;
    return Boolean(
      await Lead.exists({
        businessProject: projectId,
        assignedTo: req.user!.id,
        deliveryStatus: "RELEASED",
      }),
    );
  }

  return false;
}

async function canManageProjectDocuments(req: any, projectId: string) {
  const project = await BusinessProject.findById(projectId).select("business stage").lean();
  if (!project) return false;

  // UPCOMING projects cannot have documents uploaded
  if (project.stage === "UPCOMING") return false;

  // Project content (details & documents) is maintained by the LeadFlow admin team only.
  return isAdmin(req);
}

function getObjectUrl(key: string) {
  return `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/**
 * GET /api/business-projects
 * Admin sees every project; business partner sees their assigned project;
 * sales users see projects linked to their assigned leads.
 */
r.get("/", auth, async (req, res) => {
  const filter: Record<string, unknown> = { isActive: true };

  const { business, stage, search = "", page = "1", limit = "10", state, city, area } =
    req.query as Record<string, string>;

  if (state) filter.state = state;
  if (city) filter.city = city;
  if (area) filter.area = area;

  if (business && isAdmin(req)) {
    filter.business = business;
  }

  if (stage && ["ONGOING", "UPCOMING", "COMPLETED"].includes(stage)) {
    filter.stage = stage;
  }

  if (req.user?.role === "BUSINESS") {
    if (req.user.business) {
      filter.business = req.user.business;
    } else if (req.user.businessProject) {
      filter._id = req.user.businessProject;
    } else {
      filter._id = { $in: [] };
    }
  } else if (!isAdmin(req)) {
    const assignedIds = req.user && Array.isArray(req.user.assignedProjects) ? req.user.assignedProjects : [];
    const leadProjectIds = await Lead.distinct("businessProject", {
      assignedTo: req.user!.id,
      deliveryStatus: "RELEASED",
      businessProject: { $exists: true },
    });
    const combined = Array.from(new Set([...assignedIds.map(String), ...leadProjectIds.map(String)]));
    filter._id = { $in: combined };
  }

  const normalizedSearch = String(search).trim();
  if (normalizedSearch) {
    filter.$or = [
      { name: containsRegex(normalizedSearch) },
      { developerGroup: containsRegex(normalizedSearch) },
      { location: containsRegex(normalizedSearch) },
      { city: containsRegex(normalizedSearch) },
      { area: containsRegex(normalizedSearch) },
      { pincode: containsRegex(normalizedSearch) },
      { reraNumber: containsRegex(normalizedSearch) },
      { stage: containsRegex(normalizedSearch) },
    ];
  }

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 10));

  const [projects, total] = await Promise.all([
    BusinessProject.find(filter)
      .populate("business", "name detail contactNo leadLimit leadLimitType")
      .populate("createdBy", "name")
      .sort({ updatedAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    BusinessProject.countDocuments(filter),
  ]);

  if (!isAdmin(req)) projects.forEach((proj: any) => stripQuota(proj));

  res.json({ projects, total, page: p, pages: Math.ceil(total / l) || 1 });
});

/**
 * GET /api/business-projects/:id
 * Return a project only when authorized.
 */
r.get("/:id", auth, async (req, res) => {
  if (!(await canViewProject(req, String(req.params.id)))) {
    return res
      .status(403)
      .json({ message: "You do not have access to this project" });
  }

  const project = await BusinessProject.findById(req.params.id)
    .populate("business", "name contactNo")
    .populate("createdBy", "name")
    .populate("updatedBy", "name")
    .populate("documents.uploadedBy", "name")
    .lean();

  if (!project) {
    return res.status(404).json({ message: "Business project not found" });
  }

  if (!isAdmin(req)) stripQuota(project as any);

  // Sales staff working on this project (owners & admins only).
  let team: any[] = [];
  const projectBusinessId = (project.business as any)?._id ?? project.business;
  if (req.user?.role !== "SALES" && projectBusinessId) {
    team = await User.find({ role: "SALES", business: projectBusinessId })
      .select("name email isActive profilePhotoUrl assignedProjects")
      .sort({ name: 1 })
      .lean();
    team = team.map((u: any) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      isActive: u.isActive,
      profilePhotoUrl: u.profilePhotoUrl,
      // No project restriction = works on every project of the business.
      onProject: !u.assignedProjects?.length || u.assignedProjects.some((pid: any) => String(pid) === String(project._id)),
      allProjects: !u.assignedProjects?.length,
    }));
  }
  res.json({ project, team });
});

/**
 * GET /api/business-projects/:id/stats?range=day|week|month
 * Lead volume and outcomes for one project, scoped to what the caller may see.
 *   day   → last 14 days, week → last 12 weeks, month → last 12 months.
 */
r.get("/:id/stats", auth, async (req, res) => {
  const projectId = String(req.params.id);
  if (!Types.ObjectId.isValid(projectId) || !(await canViewProject(req, projectId))) {
    return res.status(403).json({ message: "You do not have access to this project" });
  }
  const range = req.query.range === "week" ? "week" : req.query.range === "month" ? "month" : "day";
  const now = new Date();
  const since = new Date(now);
  if (range === "day") since.setDate(since.getDate() - 13);
  else if (range === "week") since.setDate(since.getDate() - 7 * 11 - ((since.getDay() + 6) % 7));
  else since.setMonth(since.getMonth() - 11, 1);
  since.setHours(0, 0, 0, 0);

  const match: Record<string, unknown> = { businessProject: new Types.ObjectId(projectId), deliveryStatus: "RELEASED" };
  if (req.user?.role === "SALES") match.assignedTo = new Types.ObjectId(req.user.id);

  const format = range === "month" ? "%Y-%m" : range === "week" ? "%G-W%V" : "%Y-%m-%d";
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const todayStart = startOf(now);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [series, byStatus, totals, team] = await Promise.all([
    Lead.aggregate([
      { $match: { ...match, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { date: "$createdAt", format, timezone: "Asia/Kolkata" } },
          leads: { $sum: 1 },
          won: { $sum: { $cond: [{ $eq: ["$status", "WON"] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Lead.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Lead.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          today: { $sum: { $cond: [{ $gte: ["$createdAt", todayStart] }, 1, 0] } },
          thisWeek: { $sum: { $cond: [{ $gte: ["$createdAt", weekStart] }, 1, 0] } },
          thisMonth: { $sum: { $cond: [{ $gte: ["$createdAt", monthStart] }, 1, 0] } },
          won: { $sum: { $cond: [{ $eq: ["$status", "WON"] }, 1, 0] } },
          uncontacted: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "NEW"] }, { $not: [{ $ifNull: ["$lastContactAt", false] }] }] }, 1, 0] } },
          unassigned: { $sum: { $cond: [{ $ifNull: ["$assignedTo", false] }, 0, 1] } },
        },
      },
    ]),
    req.user?.role === "SALES"
      ? Promise.resolve([])
      : Lead.aggregate([
          { $match: { ...match, assignedTo: { $ne: null } } },
          { $group: { _id: "$assignedTo", leads: { $sum: 1 }, won: { $sum: { $cond: [{ $eq: ["$status", "WON"] }, 1, 0] } } } },
          { $sort: { leads: -1 } },
          { $limit: 20 },
          { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u" } },
          { $project: { leads: 1, won: 1, name: { $ifNull: [{ $arrayElemAt: ["$u.name", 0] }, "—"] } } },
        ]),
  ]);

  const t = totals[0] || { total: 0, today: 0, thisWeek: 0, thisMonth: 0, won: 0, uncontacted: 0, unassigned: 0 };
  res.json({
    range,
    totals: { ...t, _id: undefined, conversionRate: t.total ? Math.round((t.won / t.total) * 1000) / 10 : 0 },
    series: series.map((x) => ({ period: x._id, leads: x.leads, won: x.won })),
    byStatus: Object.fromEntries(byStatus.map((x: any) => [x._id, x.count])),
    team,
  });
});

/**
 * PUT /api/business-projects/:id/team  { userIds: [] }
 * Business owners (and admins) choose which of their salespeople work on a project.
 * Only salespeople of the project's own business can be added.
 */
r.put("/:id/team", auth, roles("ADMIN", "MANAGER", "BUSINESS"), async (req, res) => {
  const project = await BusinessProject.findById(req.params.id).select("_id name business");
  if (!project) return res.status(404).json({ message: "Project not found" });
  if (req.user?.role === "BUSINESS" && String(project.business) !== String(req.user.business)) {
    return res.status(403).json({ message: "Access denied to this project." });
  }
  const userIds: string[] = Array.isArray(req.body?.userIds) ? req.body.userIds.map(String).filter((id: string) => Types.ObjectId.isValid(id)) : [];
  if (userIds.length > 200) return res.status(400).json({ message: "Too many salespeople" });

  const staff = await User.find({ role: "SALES", business: project.business }).select("_id name assignedProjects");
  const allowed = new Set(staff.map((u) => u.id));
  const invalid = userIds.filter((id) => !allowed.has(id));
  if (invalid.length) return res.status(400).json({ message: "Some salespeople are not part of this business" });

  const pid = String(project._id);
  const businessProjectIds = (await BusinessProject.find({ business: project.business }).select("_id").lean()).map((p) => String(p._id));
  let changed = 0;
  const blocked: string[] = [];
  for (const u of staff) {
    const current = (u.assignedProjects || []).map(String);
    const wants = userIds.includes(u.id);
    // An empty list means "all projects"; materialise it before removing one.
    const effective = current.length ? current : businessProjectIds;
    const has = effective.includes(pid);
    if (wants === has && current.length) continue;
    if (wants && !current.length) continue; // already on every project
    const next = wants ? Array.from(new Set([...current, pid])) : effective.filter((x) => x !== pid);
    if (!next.length) {
      // An empty list would mean "all projects" — never widen access by removing one.
      blocked.push(u.name);
      continue;
    }
    u.assignedProjects = next as any;
    await u.save();
    invalidateUser(u.id);
    changed++;
  }

  if (blocked.length) {
    return res.status(400).json({
      message: `${blocked.join(", ")} only work${blocked.length === 1 ? "s" : ""} on this project. Assign another project first, or block them from Sales staff.`,
      changed,
    });
  }
  res.json({ success: true, changed });
});

/**
 * POST /api/business-projects
 * Admin creates a real-estate project under a business.
 */
r.post("/", auth, roles("ADMIN", "MANAGER"), async (req, res) => {
  const body = req.body ?? {};

  if (!body.name?.trim()) {
    return res.status(400).json({ message: "Project name is required" });
  }

  if (!body.stage || !["ONGOING", "UPCOMING", "COMPLETED"].includes(body.stage)) {
    return res.status(400).json({ message: "Valid project stage (ONGOING, UPCOMING, COMPLETED) is required" });
  }

  // Determine business
  let businessId = body.business;
  if (req.user?.role === "BUSINESS") {
    businessId = req.user.business;
  }

  if (!businessId) {
    // If no business selected by admin, find or create default business
    const defaultName = body.developerGroup?.trim() || "General Business Group";
    let defaultBiz = await Business.findOne({ name: exactRegex(defaultName) });
    if (!defaultBiz) {
      defaultBiz = await Business.create({
        name: defaultName,
        detail: "Auto-created business group",
        contactNo: "",
        createdBy: req.user!.id,
      });
    }
    businessId = defaultBiz._id;
  }

  // Stage-specific rules
  const stage = body.stage;
  const state = body.state?.trim() || "Gujarat";
  const city = body.city?.trim();
  const area = body.area?.trim() || "";
  const pincode = body.pincode?.trim() || "";
  const location = body.location?.trim() || body.upcoming?.location?.trim() || body.completed?.location?.trim() || [area, city, state, pincode].filter(Boolean).join(", ");
  
  // COMPLETED always has RERA. ONGOING uses body.hasRera. UPCOMING has no RERA.
  const hasRera = stage === "COMPLETED" ? true : (stage === "ONGOING" ? Boolean(body.hasRera) : false);
  const reraNumber = hasRera ? (body.reraNumber?.trim() || "") : "";

  // Products: Upcoming has NO products. Ongoing has products only if hasRera is true. Completed has products.
  let products = Array.isArray(body.products) ? body.products : [];
  if (stage === "UPCOMING" || (stage === "ONGOING" && !hasRera)) {
    products = [];
  } else {
    products = products.map((p: any) => ({
      type: p.type,
      customType: p.customType || (p.type === "OTHER" ? "Custom Unit" : String(p.type).replace(/_/g, " ")),
      priceRange: p.priceRange ? String(p.priceRange).trim() : "",
      areaSqFt: p.areaSqFt ? String(p.areaSqFt).trim() : "",
      units: Number(p.units) > 0 ? Number(p.units) : undefined,
      isPenthouse: Boolean(p.isPenthouse),
      details: p.details || {},
    }));
  }

  // Documents: Upcoming CANNOT upload documents
  let documents = Array.isArray(body.documents) ? body.documents : [];
  if (stage === "UPCOMING") {
    documents = [];
  } else {
    documents = documents
      .filter((doc: any) => !doc.storageKey || String(doc.storageKey).startsWith("leadflow/projects/pending/"))
      .map((doc: any) => ({
      name: doc.name,
      url: doc.url,
      category: doc.category || "BROCHURE",
      mimeType: doc.mimeType,
      size: doc.size,
      description: doc.description,
      uploadedBy: req.user!.id,
      storageKey: doc.storageKey,
      isDemo: Boolean(doc.isDemo),
      createdAt: new Date(),
    }));
  }

  const project = await BusinessProject.create({
    business: businessId,
    name: body.name.trim(),
    state,
    city,
    area,
    pincode,
    stage,
    location,
    developerGroup: body.developerGroup?.trim(),
    hasRera,
    reraNumber,
    penthouse: Boolean(body.penthouse),
    products,
    upcoming: { location },
    completed: { location },
    ongoing: { details: {} },
    metaSources: (Array.isArray(body.metaSources) ? body.metaSources : [])
      .map((m: any) => ({
        pageName: m.pageName ? String(m.pageName).trim() : "",
        pageId: m.pageId ? String(m.pageId).trim() : "",
        formName: m.formName ? String(m.formName).trim() : "",
        formId: m.formId ? String(m.formId).trim() : "",
      }))
      .filter((m: any) => m.pageName || m.pageId || m.formName || m.formId),
    documents,
    metaSetupSkipped: Boolean(body.metaSetupSkipped),
    documentsSetupSkipped: Boolean(body.documentsSetupSkipped),
    leadLimit: Math.max(0, Number(body.leadLimit) || 0),
    leadLimitType: ["DAILY", "MONTHLY", "NONE"].includes(body.leadLimitType) ? body.leadLimitType : "NONE",
    createdBy: req.user!.id,
    updatedBy: req.user!.id,
  });


  const populated = await BusinessProject.findById(project._id)
    .populate("business", "name detail contactNo leadLimit leadLimitType")
    .lean();

  void remapUnmappedLeads();
  res.status(201).json({ project: populated });
});

/**
 * PATCH /api/business-projects/:id/stage
 * Promote or transition project stage (e.g. UPCOMING -> ONGOING or COMPLETED)
 */
r.patch("/:id/stage", auth, roles("ADMIN", "MANAGER"), async (req, res) => {
  const project = await BusinessProject.findById(req.params.id);
  if (!project) return res.status(404).json({ message: "Project not found" });

  if (req.user?.role === "BUSINESS" && String(project.business) !== String(req.user.business)) {
    return res.status(403).json({ message: "Access denied to this project." });
  }

  const { stage, hasRera, reraNumber, products, location, state, city, area, pincode } = req.body;
  if (!["ONGOING", "UPCOMING", "COMPLETED"].includes(stage)) {
    return res.status(400).json({ message: "Valid stage is required (ONGOING, UPCOMING, COMPLETED)." });
  }

  project.stage = stage;
  if (hasRera !== undefined) project.hasRera = Boolean(hasRera);
  if (reraNumber !== undefined) project.reraNumber = String(reraNumber).trim();
  if (state !== undefined) project.state = String(state).trim();
  if (city !== undefined) project.city = String(city).trim() as any;
  if (area !== undefined) project.area = String(area).trim();
  if (pincode !== undefined) project.pincode = String(pincode).trim();
  if (location !== undefined) project.location = String(location).trim();
  else if (area !== undefined || city !== undefined) {
    project.location = [project.area, project.city, project.state, project.pincode].filter(Boolean).join(", ");
  }
  if (Array.isArray(products)) project.products = products;

  project.updatedBy = req.user!.id as any;
  await project.save();
  void remapUnmappedLeads();


  const populated = await BusinessProject.findById(project._id)
    .populate("business", "name detail contactNo")
    .lean();

  res.json({ project: populated });
});

/**
 * PATCH /api/business-projects/:id
 * Admin updates the project configuration.
 */
r.patch("/:id", auth, roles("ADMIN", "MANAGER"), async (req, res) => {
  const project = await BusinessProject.findById(req.params.id);

  if (!project) {
    return res.status(404).json({ message: "Business project not found" });
  }

  if (req.user?.role === "BUSINESS" && String(project.business) !== String(req.user.business)) {
    return res.status(403).json({ message: "Access denied." });
  }

  const allowed = [
    "name",
    "business",
    "stage",
    "state",
    "city",
    "area",
    "pincode",
    "location",
    "developerGroup",
    "hasRera",
    "reraNumber",
    "penthouse",
    "products",
    "ongoing",
    "upcoming",
    "completed",
    "metaSources",
    "leadLimit",
    "leadLimitType",
    "metaSetupSkipped",
    "documentsSetupSkipped",
    "isActive",
  ];

  for (const key of allowed) {
    if (key === "metaSources" && "metaSources" in (req.body ?? {})) {
      project.metaSources = (Array.isArray(req.body.metaSources) ? req.body.metaSources : [])
        .map((m: any) => ({
          pageName: m.pageName ? String(m.pageName).trim() : "",
          pageId: m.pageId ? String(m.pageId).trim() : "",
          formName: m.formName ? String(m.formName).trim() : "",
          formId: m.formId ? String(m.formId).trim() : "",
        }))
        .filter((m: any) => m.pageName || m.pageId || m.formName || m.formId);
    } else if (key === "products" && "products" in (req.body ?? {})) {
      const nextStage = req.body.stage !== undefined ? req.body.stage : project.stage;
      const nextHasRera =
        nextStage === "COMPLETED"
          ? true
          : nextStage === "ONGOING"
            ? Boolean(req.body.hasRera !== undefined ? req.body.hasRera : project.hasRera)
            : false;

      if (nextStage === "UPCOMING" || (nextStage === "ONGOING" && !nextHasRera)) {
        project.products = [] as any;
      } else if (Array.isArray(req.body.products)) {
        project.products = req.body.products.map((p: any) => ({
          type: p.type,
          customType:
            p.customType ||
            (p.type === "OTHER" ? "Custom Unit" : String(p.type).replace(/_/g, " ")),
          priceRange: p.priceRange ? String(p.priceRange).trim() : "",
          areaSqFt: p.areaSqFt ? String(p.areaSqFt).trim() : "",
          units: Number(p.units) > 0 ? Number(p.units) : undefined,
          isPenthouse: Boolean(p.isPenthouse),
          details: p.details || {},
        })) as any;
      }
    } else if (key in (req.body ?? {})) {
      (project as any)[key] = req.body[key];
    }
  }

  // Ensure stage consistency on patch
  if (project.stage === "COMPLETED") {
    project.hasRera = true;
  } else if (project.stage === "UPCOMING") {
    project.hasRera = false;
    project.reraNumber = "";
    project.products = [] as any;
  } else if (project.stage === "ONGOING" && !project.hasRera) {
    project.reraNumber = "";
    project.products = [] as any;
  }

  project.updatedBy = req.user!.id as any;
  await project.save();
  void remapUnmappedLeads();

  res.json({ project });
});

/**
 * POST /api/business-projects/uploads/presign
 * Admin requests a short-lived S3 upload URL before a project exists.
 */
r.post("/uploads/presign", auth, roles("ADMIN"), async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const contentType = String(
    req.body?.contentType ?? "application/octet-stream",
  );
  const size = Number(req.body?.size ?? 0);

  if (!name) {
    return res.status(400).json({ message: "Document file name is required" });
  }

  const uploadError = checkUpload(contentType, size);
  if (uploadError) return res.status(400).json({ message: uploadError });

  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const key = `leadflow/projects/pending/${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${safeName}`;
  const uploadUrl = await createDocumentUploadUrl(key, contentType);

  res.json({
    uploadUrl,
    key,
    objectUrl: getObjectUrl(key),
  });
});

/**
 * POST /api/business-projects/:id/documents
 * Save metadata after uploading a document to S3.
 * Authorized for Admin, Manager, and the Business Partner assigned to this project.
 */
r.post("/:id/documents", auth, async (req, res) => {
  if (!(await canManageProjectDocuments(req, String(req.params.id)))) {
    return res
      .status(403)
      .json({ message: "You do not have permission to manage documents for this project" });
  }

  const project = await BusinessProject.findById(req.params.id);

  if (!project) {
    return res.status(404).json({ message: "Business project not found" });
  }

  const name = String(req.body?.name ?? "").trim().slice(0, 200);
  const storageKey = String(req.body?.storageKey ?? "").trim();
  const category = String(req.body?.category ?? "OTHER");

  if (!name || !storageKey) {
    return res.status(400).json({
      message: "Uploaded document metadata is incomplete",
    });
  }

  // The key must have been issued by our presign endpoint for THIS project
  // (or the admin-only pending prefix). Prevents registering another tenant's object.
  const ownPrefix = `leadflow/projects/${project.id}/`;
  const pendingAllowed = isAdmin(req) && storageKey.startsWith("leadflow/projects/pending/");
  if ((!storageKey.startsWith(ownPrefix) && !pendingAllowed) || storageKey.includes("..")) {
    return res.status(400).json({ message: "Invalid document storage key for this project" });
  }
  if (project.documents.some((d: any) => d.storageKey === storageKey)) {
    return res.status(409).json({ message: "This document is already attached" });
  }
  const url = getObjectUrl(storageKey);

  if (!DOCUMENT_CATEGORIES.includes(category)) {
    return res.status(400).json({ message: "Invalid document category" });
  }
  const metaError = checkUpload(String(req.body?.mimeType || ""), Number(req.body?.size || 0));
  if (metaError) return res.status(400).json({ message: metaError });

  project.documents.push({
    name,
    url,
    category,
    mimeType: req.body.mimeType,
    size: Number(req.body.size || 0),
    description: req.body.description,
    uploadedBy: req.user!.id as any,
    storageKey,
    isDemo: false,
    createdAt: new Date(),
  });

  project.documentsSetupSkipped = false;
  project.updatedBy = req.user!.id as any;
  await project.save();
  void remapUnmappedLeads();


  res.status(201).json({ project: isAdmin(req) ? project : stripQuota(project.toObject()) });
});

/**
 * POST /api/business-projects/:id/documents/presign
 * Create a short-lived S3 upload URL for an existing project document.
 * Authorized for Admin, Manager, and the Business Partner assigned to this project.
 */
r.post("/:id/documents/presign", auth, async (req, res) => {
  if (!(await canManageProjectDocuments(req, String(req.params.id)))) {
    return res
      .status(403)
      .json({ message: "You do not have permission to upload documents for this project" });
  }

  const project = await BusinessProject.findById(req.params.id).select("_id");

  if (!project) {
    return res.status(404).json({ message: "Business project not found" });
  }

  const name = String(req.body?.name ?? "").trim();
  const contentType = String(
    req.body?.contentType ?? "application/octet-stream",
  );
  const size = Number(req.body?.size ?? 0);

  if (!name) {
    return res.status(400).json({ message: "Document file name is required" });
  }

  const uploadError = checkUpload(contentType, size);
  if (uploadError) return res.status(400).json({ message: uploadError });

  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const key = `leadflow/projects/${project.id}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${safeName}`;
  const uploadUrl = await createDocumentUploadUrl(key, contentType);

  res.json({
    uploadUrl,
    key,
    objectUrl: getObjectUrl(key),
  });
});

/**
 * GET /api/business-projects/:id/documents/:documentId/url
 * Return a short-lived S3 download URL for an authorized project document.
 */
r.get("/:id/documents/:documentId/url", auth, async (req, res) => {
  if (!(await canViewProject(req, String(req.params.id)))) {
    return res
      .status(403)
      .json({ message: "You do not have access to this project document" });
  }

  const project = await BusinessProject.findById(req.params.id).select(
    "documents",
  );

  if (!project) {
    return res.status(404).json({ message: "Business project not found" });
  }

  const document: any = project.documents.find(
    (item: any) => String(item._id) === req.params.documentId,
  );

  if (!document) {
    return res.status(404).json({ message: "Document not found" });
  }

  if (!document.storageKey) {
    return res.json({ url: document.url });
  }

  const url = await createDocumentDownloadUrl(document.storageKey);
  res.json({ url });
});

/**
 * DELETE /api/business-projects/:id/documents/:documentId
 * Admin, Manager, or assigned Business Partner deletes the document from S3 and removes its metadata.
 */
r.delete(
  "/:id/documents/:documentId",
  auth,
  async (req, res) => {
    if (!(await canManageProjectDocuments(req, String(req.params.id)))) {
      return res
        .status(403)
        .json({ message: "You do not have permission to delete documents for this project" });
    }

    const project = await BusinessProject.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Business project not found" });
    }

    const document: any = project.documents.find(
      (item: any) => String(item._id) === req.params.documentId,
    );

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    if (document.storageKey && !document.isDemo) {
      await deleteDocumentObject(document.storageKey);
    }

    project.documents = project.documents.filter(
      (item: any) => String(item._id) !== req.params.documentId,
    ) as any;
    project.updatedBy = req.user!.id as any;
    await project.save();
  void remapUnmappedLeads();


    res.json({ success: true, project: isAdmin(req) ? project : stripQuota(project.toObject()) });
  },
);

/**
 * PATCH /api/business-projects/:id/assign
 * Admin assigns all currently released leads for a project to one salesperson.
 */
r.patch("/:id/assign", auth, roles("ADMIN"), async (req, res) => {
  const project = await BusinessProject.findById(req.params.id).select(
    "_id name business",
  );
  const user = await User.findOne({
    _id: req.body?.userId,
    role: "SALES",
    isActive: true,
  });

  if (!project || !user) {
    return res
      .status(404)
      .json({ message: "Project or active salesperson not found" });
  }

  if (!(await salesBelongsToProject(user.id, project._id))) {
    return res.status(400).json({
      message: "This salesperson does not belong to the project's business. Assign the project to them first.",
    });
  }

  const leads = await Lead.find({
    businessProject: project._id,
    deliveryStatus: "RELEASED",
  }).select("_id assignedTo");

  await Lead.updateMany(
    {
      businessProject: project._id,
      deliveryStatus: "RELEASED",
    },
    {
      $set: {
        assignedTo: user._id,
        assignedAt: new Date(),
        assignmentSource: "MANUAL",
      },
    },
  );

  for (const lead of leads) {
    await logActivity({
      lead: lead.id,
      actor: req.user!.id,
      type: "LEAD_REASSIGNED",
      title: "Business lead reassigned",
      description: `Project ${project.name} lead assigned to ${user.name}.`,
    });
  }

  if (leads.length) {
    const io = req.app.get("io");
    if (io) {
      io.to(`business:${(project as any).business}`).emit("leads_assigned", {
        projectId: project.id,
        count: leads.length,
      });
      io.to("role:ADMIN").emit("leads_assigned", {
        projectId: project.id,
        count: leads.length,
      });
      io.to(`user:${user.id}`).emit("leads_assigned", {
        projectId: project.id,
        count: leads.length,
      });
    }
  }


  res.json({ success: true, assignedCount: leads.length, user });
});

export default r;
