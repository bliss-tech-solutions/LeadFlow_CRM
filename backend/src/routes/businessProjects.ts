import { Router } from "express";
import crypto from "crypto";
import { BusinessProject } from "../models/BusinessProject";
import { Business } from "../models/Business";
import { Lead } from "../models/Lead";
import { User } from "../models/User";
import { auth, roles } from "../middleware/auth";
import { logActivity, logAudit } from "../utils/activity";
import {
  createDocumentDownloadUrl,
  createDocumentUploadUrl,
  deleteDocumentObject,
} from "../services/s3.service";
import { env } from "../config/env";
import { Notification } from "../models/Notification";
import { remapUnmappedLeads } from "../services/leadRemap.service";

const r = Router();

const DOCUMENT_CATEGORIES = [
  "BROCHURE",
  "PRICE_SHEET",
  "FLOOR_PLAN",
  "PAYMENT_PLAN",
  "AMENITIES",
  "OTHER",
];

const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024;

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

  if (isAdmin(req)) return true;

  if (req.user?.role === "BUSINESS") {
    if (req.user.business && String(project.business) === String(req.user.business)) return true;
    if (String(req.user.businessProject) === String(projectId)) return true;
    if (Array.isArray(req.user.assignedProjects) && req.user.assignedProjects.some((p: any) => String(p) === String(projectId))) return true;
  }

  return false;
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

  const { business, stage, search = "", page = "1", limit = "10" } =
    req.query as Record<string, string>;

  if (business) {
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
      { name: { $regex: normalizedSearch, $options: "i" } },
      { developerGroup: { $regex: normalizedSearch, $options: "i" } },
      { location: { $regex: normalizedSearch, $options: "i" } },
      { reraNumber: { $regex: normalizedSearch, $options: "i" } },
      { stage: { $regex: normalizedSearch, $options: "i" } },
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
    .populate("createdBy", "name")
    .populate("updatedBy", "name")
    .populate("documents.uploadedBy", "name")
    .lean();

  if (!project) {
    return res.status(404).json({ message: "Business project not found" });
  }

  res.json({ project });
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
    let defaultBiz = await Business.findOne({ name: { $regex: "^" + defaultName + "$", $options: "i" } });
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
  const location = body.location?.trim() || body.upcoming?.location?.trim() || body.completed?.location?.trim() || "";
  
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
    documents = documents.map((doc: any) => ({
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

  await logAudit({
    actor: req.user!.id,
    action: "BUSINESS_PROJECT_CREATED",
    entity: "BusinessProject",
    entityId: project.id,
    after: {
      name: project.name,
      stage: project.stage,
      business: businessId,
      productCount: project.products.length,
      documentCount: project.documents.length,
    },
    ip: req.ip,
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
r.patch("/:id/stage", auth, roles("ADMIN", "MANAGER", "BUSINESS"), async (req, res) => {
  const project = await BusinessProject.findById(req.params.id);
  if (!project) return res.status(404).json({ message: "Project not found" });

  if (req.user?.role === "BUSINESS" && String(project.business) !== String(req.user.business)) {
    return res.status(403).json({ message: "Access denied to this project." });
  }

  const { stage, hasRera, reraNumber, products, location } = req.body;
  if (!["ONGOING", "UPCOMING", "COMPLETED"].includes(stage)) {
    return res.status(400).json({ message: "Valid stage is required (ONGOING, UPCOMING, COMPLETED)." });
  }

  const beforeStage = project.stage;
  project.stage = stage;
  if (hasRera !== undefined) project.hasRera = Boolean(hasRera);
  if (reraNumber !== undefined) project.reraNumber = String(reraNumber).trim();
  if (location !== undefined) project.location = String(location).trim();
  if (Array.isArray(products)) project.products = products;

  project.updatedBy = req.user!.id as any;
  await project.save();
  void remapUnmappedLeads();

  await logAudit({
    actor: req.user!.id,
    action: "PROJECT_STAGE_CHANGED",
    entity: "BusinessProject",
    entityId: project.id,
    before: { stage: beforeStage },
    after: { stage: project.stage },
  });

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

  if (!size || size <= 0 || size > MAX_DOCUMENT_SIZE) {
    return res
      .status(400)
      .json({ message: "Document must be between 1 byte and 25 MB" });
  }

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

  const name = String(req.body?.name ?? "").trim();
  const url = String(req.body?.url ?? "").trim();
  const storageKey = String(req.body?.storageKey ?? "").trim();
  const category = String(req.body?.category ?? "OTHER");

  if (!name || !url || !storageKey) {
    return res.status(400).json({
      message: "Uploaded document metadata is incomplete",
    });
  }

  if (!DOCUMENT_CATEGORIES.includes(category)) {
    return res.status(400).json({ message: "Invalid document category" });
  }

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

  await logAudit({
    actor: req.user!.id,
    action: "PROJECT_DOCUMENT_UPLOADED",
    entity: "BusinessProject",
    entityId: project.id,
    after: { documentName: name, category },
    ip: req.ip,
  });

  res.status(201).json({ project });
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

  if (!size || size <= 0 || size > MAX_DOCUMENT_SIZE) {
    return res
      .status(400)
      .json({ message: "Document must be between 1 byte and 25 MB" });
  }

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

    await logAudit({
      actor: req.user!.id,
      action: "PROJECT_DOCUMENT_DELETED",
      entity: "BusinessProject",
      entityId: project.id,
      before: {
        documentId: req.params.documentId,
        documentName: document.name,
      },
      ip: req.ip,
    });

    res.json({ success: true, project });
  },
);

/**
 * PATCH /api/business-projects/:id/assign
 * Admin assigns all currently released leads for a project to one salesperson.
 */
r.patch("/:id/assign", auth, roles("ADMIN"), async (req, res) => {
  const project = await BusinessProject.findById(req.params.id).select(
    "_id name",
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

  await logAudit({
    actor: req.user!.id,
    action: "BUSINESS_LEADS_REASSIGNED",
    entity: "BusinessProject",
    entityId: project.id,
    before: { leadCount: leads.length },
    after: { assignedTo: user.id, leadCount: leads.length },
    ip: req.ip,
  });

  res.json({ success: true, assignedCount: leads.length, user });
});

export default r;
