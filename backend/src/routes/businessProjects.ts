import { Router } from "express";
import crypto from "crypto";
import { BusinessProject } from "../models/BusinessProject";
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
  return req.user?.role === "ADMIN";
}

async function canViewProject(req: any, projectId: string) {
  if (isAdmin(req)) return true;

  return Boolean(
    await Lead.exists({
      businessProject: projectId,
      assignedTo: req.user!.id,
      deliveryStatus: "RELEASED",
    }),
  );
}

function getObjectUrl(key: string) {
  return `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/**
 * GET /api/business-projects
 * Admin sees every project; other authenticated users see only projects linked to their assigned leads.
 */
r.get("/", auth, async (req, res) => {
  const filter: Record<string, unknown> = { isActive: true };

  if (!isAdmin(req)) {
    const projectIds = await Lead.distinct("businessProject", {
      assignedTo: req.user!.id,
      deliveryStatus: "RELEASED",
      businessProject: { $exists: true },
    });

    filter._id = { $in: projectIds };
  }

  const { search = "", page = "1", limit = "10" } =
    req.query as Record<string, string>;

  const normalizedSearch = String(search).trim();
  if (normalizedSearch) {
    filter.$or = [
      { name: { $regex: normalizedSearch, $options: "i" } },
      { developerGroup: { $regex: normalizedSearch, $options: "i" } },
      { reraNumber: { $regex: normalizedSearch, $options: "i" } },
      { stage: { $regex: normalizedSearch, $options: "i" } },
    ];
  }

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(50, Math.max(1, Number(limit) || 10));

  const [projects, total] = await Promise.all([
    BusinessProject.find(filter)
      .populate("createdBy", "name")
      .sort({ updatedAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    BusinessProject.countDocuments(filter),
  ]);

  res.json({ projects, total, page: p, pages: Math.ceil(total / l) });
});

/**
 * GET /api/business-projects/:id
 * Return a project only when the user is an admin or has an assigned lead for that project.
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
 * Admin creates a real-estate project using the setup wizard.
 */
r.post("/", auth, roles("ADMIN"), async (req, res) => {
  const body = req.body ?? {};

  if (!body.name?.trim()) {
    return res.status(400).json({ message: "Business name is required" });
  }

  if (!body.stage) {
    return res.status(400).json({ message: "Project stage is required" });
  }

  if (!Array.isArray(body.products) || !body.products.length) {
    return res
      .status(400)
      .json({ message: "At least one product type is required" });
  }

  if (!body.metaSetupSkipped) {
    const invalidSource = (body.metaSources ?? []).some(
      (source: any) => !source.pageId && !source.adId && !source.formId,
    );

    if (invalidSource) {
      return res.status(400).json({
        message: "Each Meta source needs at least a Page ID, Ad ID or Form ID",
      });
    }
  }

  const documents = (body.documents ?? []).map((document: any) => ({
    ...document,
    uploadedBy: req.user!.id,
    isDemo: Boolean(document.isDemo),
  }));

  const project = await BusinessProject.create({
    name: body.name.trim(),
    stage: body.stage,
    developerGroup: body.developerGroup,
    reraNumber: body.reraNumber,
    penthouse: Boolean(body.penthouse),
    products: body.products,
    ongoing: body.ongoing,
    upcoming: body.upcoming,
    completed: body.completed,
    metaSources: body.metaSources ?? [],
    documents,
    metaSetupSkipped: Boolean(body.metaSetupSkipped),
    documentsSetupSkipped: Boolean(body.documentsSetupSkipped),
    createdBy: req.user!.id,
    updatedBy: req.user!.id,
  });

  await logAudit({
    actor: req.user!.id,
    action: "BUSINESS_PROJECT_CREATED",
    entity: "BusinessProject",
    entityId: project.id,
    after: { name: project.name, stage: project.stage },
    ip: req.ip,
  });

  res.status(201).json({ project });
});

/**
 * PATCH /api/business-projects/:id
 * Admin updates project details, Meta mappings and project settings.
 */
r.patch("/:id", auth, roles("ADMIN"), async (req, res) => {
  const project = await BusinessProject.findById(req.params.id);

  if (!project) {
    return res.status(404).json({ message: "Business project not found" });
  }

  const allowed = [
    "name",
    "stage",
    "developerGroup",
    "reraNumber",
    "penthouse",
    "products",
    "ongoing",
    "upcoming",
    "completed",
    "metaSources",
    "metaSetupSkipped",
    "documentsSetupSkipped",
    "isActive",
  ];

  for (const key of allowed) {
    if (key in (req.body ?? {})) {
      (project as any)[key] = req.body[key];
    }
  }

  project.updatedBy = req.user!.id as any;
  await project.save();

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
 * Save metadata after the browser successfully uploads the selected file to S3.
 */
r.post("/:id/documents", auth, roles("ADMIN"), async (req, res) => {
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
 */
r.post("/:id/documents/presign", auth, roles("ADMIN"), async (req, res) => {
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
 * Admin deletes the document from S3 and removes its project metadata.
 */
r.delete(
  "/:id/documents/:documentId",
  auth,
  roles("ADMIN"),
  async (req, res) => {
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
