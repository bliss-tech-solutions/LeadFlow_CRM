import { Router } from "express";
import { LeadDocument } from "../models/Document";
import { Lead } from "../models/Lead";
import { auth, roles } from "../middleware/auth";
import { logActivity } from "../utils/activity";

const r = Router();


/**
 * Check whether a user can access documents attached to a lead.
 */
async function canAccessLeadDocuments(req: any, leadId: string) {
  if (req.user?.role === "ADMIN") return true;

  return Boolean(
    await Lead.exists({
      _id: leadId,
      assignedTo: req.user!.id,
      deliveryStatus: "RELEASED",
    }),
  );
}


/**
 * Check whether a user can access documents for a project.
 */
async function canAccessProjectDocuments(req: any, projectId: string) {
  if (req.user?.role === "ADMIN") return true;

  return Boolean(
    await Lead.exists({
      businessProject: projectId,
      assignedTo: req.user!.id,
      deliveryStatus: "RELEASED",
    }),
  );
}


/**
 * GET /api/documents/lead/:leadId
 * List legacy document metadata attached directly to an accessible lead.
 */
r.get("/lead/:leadId", auth, async (req, res) => {
  if (!(await canAccessLeadDocuments(req, req.params.leadId))) {
    return res.status(403).json({ message: "You do not have access to these documents" });
  }

  const documents = await LeadDocument.find({ lead: req.params.leadId })
    .populate("uploadedBy", "name")
    .sort({ createdAt: -1 });

  res.json({ documents });
});


/**
 * POST /api/documents/lead/:leadId
 * Store legacy lead-document metadata. Admin-only document management is preferred for project files.
 */
r.post("/lead/:leadId", auth, roles("ADMIN"), async (req, res) => {
  const document = await LeadDocument.create({
    lead: req.params.leadId,
    uploadedBy: req.user!.id,
    name: req.body.name,
    url: req.body.url,
    mimeType: req.body.mimeType,
    size: req.body.size,
  });

  await logActivity({
    lead: req.params.leadId,
    actor: req.user!.id,
    type: "DOCUMENT_UPLOADED",
    title: "Document uploaded",
    description: document.name,
  });

  res.status(201).json({ document });
});


/**
 * GET /api/documents/project/:projectId
 * List legacy project documents only when the project is related to the current user.
 */
r.get("/project/:projectId", auth, async (req, res) => {
  if (!(await canAccessProjectDocuments(req, req.params.projectId))) {
    return res.status(403).json({ message: "You do not have access to these documents" });
  }

  const documents = await LeadDocument.find({ businessProject: req.params.projectId })
    .populate("uploadedBy", "name")
    .sort({ createdAt: -1 });

  res.json({ documents });
});

export default r;
