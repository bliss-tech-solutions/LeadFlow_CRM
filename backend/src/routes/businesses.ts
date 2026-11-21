import { Router } from "express";
import { Business } from "../models/Business";
import { BusinessProject } from "../models/BusinessProject";
import { Lead } from "../models/Lead";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { auth, roles } from "../middleware/auth";
import { containsRegex, exactRegex } from "../utils/regex";
import { getUserBusinessIds } from "../utils/tenant";
import { validateBody, z } from "../middleware/validate";
import {
  holdBusinessLeads,
  releaseBusinessHeldLeads,
} from "../services/leadDelivery.service";

const r = Router();

function isAdmin(req: any) {
  return req.user?.role === "ADMIN" || req.user?.role === "MANAGER";
}

/**
 * GET /api/businesses
 * List businesses with project counts and lead counts.
 */
r.get("/", auth, async (req, res) => {
  const filter: Record<string, unknown> = {};

  const { search = "", status = "ALL", page = "1", limit = "20", state, city, area } = req.query as Record<string, string>;

  if (state) filter.state = state;
  if (city) filter.city = city;
  if (area) filter.area = area;

  if (req.user?.role === "BUSINESS") {
    filter.isActive = true;
    if (req.user.business) {
      filter._id = req.user.business;
    } else if (req.user.businessProject) {
      // Fallback for legacy business user linked by project
      const proj = await BusinessProject.findById(req.user.businessProject).select("business").lean();
      if (proj?.business) {
        filter._id = proj.business;
      }
    }
    if (!filter._id) filter._id = { $in: [] };
  } else if (!isAdmin(req)) {
    // SALES: only the business(es) they work for.
    filter.isActive = true;
    filter._id = { $in: await getUserBusinessIds(req.user!) };
  } else {
    // Admin / Manager status filtering
    if (status === "ACTIVE") {
      filter.isActive = true;
    } else if (status === "INACTIVE") {
      filter.isActive = false;
    }
    // "ALL" leaves filter.isActive undefined so both active and inactive are included
  }

  const querySearch = String(search).trim();
  if (querySearch) {
    filter.$or = [
      { name: containsRegex(querySearch) },
      { detail: containsRegex(querySearch) },
      { contactNo: containsRegex(querySearch) },
      { city: containsRegex(querySearch) },
      { area: containsRegex(querySearch) },
      { pincode: containsRegex(querySearch) },
    ];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(limit) || 20));
  const skip = (pageNum - 1) * pageSize;

  const [businesses, total] = await Promise.all([
    Business.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    Business.countDocuments(filter),
  ]);

  // Aggregate project and lead counts for each business
  const businessIds = businesses.map((b) => b._id);
  const [projectCounts, projects, adminUsers] = await Promise.all([
    BusinessProject.aggregate([
      { $match: { business: { $in: businessIds }, isActive: true } },
      { $group: { _id: "$business", count: { $sum: 1 } } },
    ]),
    BusinessProject.find({ business: { $in: businessIds }, isActive: true })
      .select("_id business stage")
      .lean(),
    User.find({ business: { $in: businessIds }, role: "BUSINESS" })
      .select("_id name email isActive business")
      .lean(),
  ]);

  const adminUserMap = new Map(adminUsers.map((u: any) => [String(u.business), u]));

  const projectCountMap = new Map(
    projectCounts.map((p) => [String(p._id), Number(p.count || 0)]),
  );

  // Group projects by business to count stages
  const stageCountMap = new Map<string, { ongoing: number; upcoming: number; completed: number }>();
  for (const proj of projects) {
    const bId = String(proj.business);
    if (!stageCountMap.has(bId)) {
      stageCountMap.set(bId, { ongoing: 0, upcoming: 0, completed: 0 });
    }
    const counts = stageCountMap.get(bId)!;
    if (proj.stage === "ONGOING") counts.ongoing++;
    else if (proj.stage === "UPCOMING") counts.upcoming++;
    else if (proj.stage === "COMPLETED") counts.completed++;
  }

  const isUserAdmin = isAdmin(req);
  const enriched = businesses.map((b) => {
    const item: any = {
      ...b,
      projectCount: projectCountMap.get(String(b._id)) || 0,
      stages: stageCountMap.get(String(b._id)) || { ongoing: 0, upcoming: 0, completed: 0 },
      businessAdmin: adminUserMap.get(String(b._id)) || null,
    };
    if (req.user?.role === "SALES" && item.businessAdmin) {
      item.businessAdmin = { _id: item.businessAdmin._id, name: item.businessAdmin.name };
    }
    if (!isUserAdmin) {
      delete item.leadLimit;
      delete item.leadLimitType;
    }
    return item;
  });

  res.json({
    businesses: enriched,
    total,
    page: pageNum,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

/**
 * POST /api/businesses
 * Create a new business group.
 */
r.post("/", auth, roles("ADMIN", "MANAGER"), async (req, res) => {
  const { name, detail, state = "Gujarat", city, area, pincode, contactNo, leadLimit, leadLimitType, adminEmail, adminPassword, adminName } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: "Business name is required." });
  }

  const existing = await Business.findOne({
    name: exactRegex(String(name).trim()),
    isActive: true,
  });

  if (existing) {
    return res.status(400).json({ message: "A business with this name already exists." });
  }

  const business = await Business.create({
    name: String(name).trim(),
    detail: detail ? String(detail).trim() : "",
    state: state ? String(state).trim() : "Gujarat",
    city: city ? String(city).trim() : undefined,
    area: area ? String(area).trim() : "",
    pincode: pincode ? String(pincode).trim() : "",
    contactNo: contactNo ? String(contactNo).trim() : "",
    leadLimit: Math.max(0, Number(leadLimit) || 0),
    leadLimitType: ["DAILY", "MONTHLY", "NONE"].includes(leadLimitType)
      ? leadLimitType
      : "NONE",
    createdBy: req.user!.id,
  });


  let createdAdminUser: any = null;
  if (adminEmail && String(adminEmail).trim() && adminPassword) {
    const normalizedAdminEmail = String(adminEmail).trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedAdminEmail });
    if (!existingUser) {
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      createdAdminUser = await User.create({
        name: adminName ? String(adminName).trim() : `${business.name} Admin`,
        email: normalizedAdminEmail,
        passwordHash,
        role: "BUSINESS",
        business: business._id,
        isActive: true,
        dailyLeadLimit: 0,
      });
    }
  }

  res.status(201).json({
    business: {
      ...business.toObject(),
      businessAdmin: createdAdminUser
        ? {
            _id: createdAdminUser._id,
            name: createdAdminUser.name,
            email: createdAdminUser.email,
            isActive: createdAdminUser.isActive,
          }
        : null,
    },
  });
});

/**
 * GET /api/businesses/:id
 * Get single business with its projects.
 */
r.get("/:id", auth, async (req, res) => {
  const business = await Business.findById(req.params.id).lean();

  if (!business) {
    return res.status(404).json({ message: "Business not found." });
  }

  if (!business.isActive && !isAdmin(req)) {
    return res.status(404).json({ message: "Business not found." });
  }

  if (req.user?.role === "BUSINESS") {
    const isAssigned =
      String(req.user.business) === String(business._id) ||
      Boolean(await BusinessProject.exists({ business: business._id, _id: req.user.businessProject }));
    if (!isAssigned) {
      return res.status(403).json({ message: "Access denied to this business." });
    }
  }

  const projectFilter: Record<string, unknown> = { business: business._id, isActive: true };
  if (req.user?.role === "SALES") {
    const allowed = await getUserBusinessIds(req.user);
    if (!allowed.includes(String(business._id))) {
      return res.status(403).json({ message: "Access denied to this business." });
    }
    if (req.user.assignedProjects?.length) projectFilter._id = { $in: req.user.assignedProjects };
  }

  const [projects, businessAdmin] = await Promise.all([
    BusinessProject.find(projectFilter)
      .sort({ createdAt: -1 })
      .lean(),
    User.findOne({
      business: business._id,
      role: "BUSINESS",
    })
      .select("_id name email isActive")
      .lean(),
  ]);

  const businessData: any = { ...business };
  if (!isAdmin(req)) {
    delete businessData.leadLimit;
    delete businessData.leadLimitType;
    for (const p of projects as any[]) {
      delete p.leadLimit;
      delete p.leadLimitType;
    }
  }

  res.json({
    business: {
      ...businessData,
      businessAdmin:
        req.user?.role === "SALES" && businessAdmin
          ? { _id: businessAdmin._id, name: businessAdmin.name }
          : businessAdmin || null,
      projects,
    },
  });
});

/**
 * PATCH /api/businesses/:id
 * Update business details or limits.
 * Toggling active/inactive holds or releases leads for this business.
 */
// Business details are maintained by the LeadFlow admin team; owners have read-only access.
r.patch("/:id", auth, roles("ADMIN", "MANAGER"), async (req, res) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    return res.status(404).json({ message: "Business not found." });
  }

  if (!business.isActive && !isAdmin(req)) {
    return res.status(404).json({ message: "Business not found." });
  }

  if (req.user?.role === "BUSINESS" && String(req.user.business) !== String(business._id)) {
    return res.status(403).json({ message: "Access denied." });
  }

  const { name, detail, state, city, area, pincode, contactNo, leadLimit, leadLimitType, isActive } = req.body;

  if (name !== undefined) {
    if (!String(name).trim()) {
      return res.status(400).json({ message: "Business name cannot be empty." });
    }
    business.name = String(name).trim();
  }

  if (detail !== undefined) business.detail = String(detail).trim();
  if (state !== undefined) business.state = String(state).trim();
  if (city !== undefined) business.city = city ? (String(city).trim() as any) : undefined;
  if (area !== undefined) business.area = String(area).trim();
  if (pincode !== undefined) business.pincode = String(pincode).trim();
  if (contactNo !== undefined) business.contactNo = String(contactNo).trim();

  // Only admin can change lead limits or active status
  let statusChangedTo: boolean | null = null;
  if (isAdmin(req)) {
    if (leadLimit !== undefined) {
      business.leadLimit = Math.max(0, Number(leadLimit) || 0);
    }
    if (leadLimitType !== undefined && ["DAILY", "MONTHLY", "NONE"].includes(leadLimitType)) {
      business.leadLimitType = leadLimitType;
    }
    if (isActive !== undefined && typeof isActive === "boolean") {
      const willBeActive = Boolean(isActive);
      if (business.isActive !== willBeActive) {
        business.isActive = willBeActive;
        statusChangedTo = willBeActive;
      }
    }
  }

  await business.save();


  // If status changed to inactive -> hold leads; if changed to active -> release held leads
  const io = req.app.get("io");
  let holdResult: any = null;
  let releaseResult: any = null;

  if (statusChangedTo === false) {
    holdResult = await holdBusinessLeads(business._id, io);
  } else if (statusChangedTo === true) {
    releaseResult = await releaseBusinessHeldLeads(business._id, io);
  }

  res.json({
    business,
    holdResult: holdResult || undefined,
    releaseResult: releaseResult || undefined,
  });
});

/**
 * DELETE /api/businesses/:id
 * Soft-delete business and hold all open leads.
 */
r.delete("/:id", auth, roles("ADMIN", "MANAGER"), async (req, res) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    return res.status(404).json({ message: "Business not found." });
  }

  business.isActive = false;
  await business.save();


  const io = req.app.get("io");
  const holdResult = await holdBusinessLeads(business._id, io);

  res.json({
    message: "Business deactivated successfully.",
    holdResult,
  });
});

/**
 * POST /api/businesses/:id/admin-user
 * Create or configure the Business Admin login account for this business.
 */
r.post("/:id/admin-user", auth, roles("ADMIN", "MANAGER"), async (req, res) => {
  const { email, password, name } = req.body ?? {};

  if (!email?.trim() || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters." });
  }

  const business = await Business.findById(req.params.id);
  if (!business || !business.isActive) {
    return res.status(404).json({ message: "Business not found." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  let adminUser = await User.findOne({ business: business._id, role: "BUSINESS" });

  if (adminUser) {
    if (adminUser.email !== normalizedEmail) {
      const emailExists = await User.findOne({ email: normalizedEmail });
      if (emailExists) {
        return res.status(409).json({ message: "Email is already in use by another account." });
      }
      adminUser.email = normalizedEmail;
    }
    if (name?.trim()) adminUser.name = name.trim();
    adminUser.passwordHash = passwordHash;
    adminUser.isActive = true;
    await adminUser.save();
  } else {
    const emailExists = await User.findOne({ email: normalizedEmail });
    if (emailExists) {
      return res.status(409).json({ message: "Email is already in use by another account." });
    }
    adminUser = await User.create({
      name: name?.trim() || `${business.name} Admin`,
      email: normalizedEmail,
      passwordHash,
      role: "BUSINESS",
      business: business._id,
      isActive: true,
      dailyLeadLimit: 0,
    });
  }


  res.json({
    businessAdmin: {
      _id: adminUser._id,
      name: adminUser.name,
      email: adminUser.email,
      isActive: adminUser.isActive,
    },
    message: "Business login configured successfully.",
  });
});

/**
 * PATCH /api/businesses/:id/admin-password
 * Change password for the Business Admin login (allowed for Admin or this Business Admin).
 */
r.patch("/:id/admin-password", auth, roles("ADMIN", "MANAGER", "BUSINESS"), async (req, res) => {
  const { password } = req.body ?? {};

  if (!password || password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters." });
  }

  const business = await Business.findById(req.params.id);
  if (!business || !business.isActive) {
    return res.status(404).json({ message: "Business not found." });
  }

  if (req.user?.role === "BUSINESS" && String(req.user.business) !== String(business._id)) {
    return res.status(403).json({ message: "Access denied." });
  }

  const adminUser = await User.findOne({ business: business._id, role: "BUSINESS" });
  if (!adminUser) {
    return res.status(404).json({ message: "No business admin login configured for this business." });
  }

  adminUser.passwordHash = await bcrypt.hash(password, 12);
  await adminUser.save();


  res.json({ message: "Business admin password updated successfully." });
});

function canManageBusiness(req: any, businessId: string) {
  if (isAdmin(req)) return true;
  return req.user?.role === "BUSINESS" && String(req.user.business) === String(businessId);
}

/**
 * GET /api/businesses/:id/settings
 * Automation & team settings (SLA, auto-reassign, WhatsApp permissions, digest, assignment strategy).
 */
r.get("/:id/settings", auth, roles("ADMIN", "MANAGER", "BUSINESS"), async (req, res) => {
  if (!canManageBusiness(req, String(req.params.id))) {
    return res.status(403).json({ message: "Access denied." });
  }
  const business = await Business.findById(req.params.id).select("name settings").lean();
  if (!business) return res.status(404).json({ message: "Business not found." });
  res.json({ settings: business.settings || {} });
});

const settingsSchema = z.object({
  autoReassignHours: z.number().int().min(0).max(168).optional(),
  slaMinutes: z.number().int().min(1).max(1440).optional(),
  salesCanSendWhatsApp: z.boolean().optional(),
  dailyDigest: z.boolean().optional(),
  assignmentStrategy: z.enum(["LEAST_LOADED", "ROUND_ROBIN"]).optional(),
});

r.patch("/:id/settings", auth, roles("ADMIN", "MANAGER"), validateBody(settingsSchema), async (req, res) => {
  if (!canManageBusiness(req, String(req.params.id))) {
    return res.status(403).json({ message: "Access denied." });
  }
  const business = await Business.findById(req.params.id);
  if (!business) return res.status(404).json({ message: "Business not found." });

  const current = (business as any).settings || {};
  for (const [key, value] of Object.entries(req.body)) {
    if (value !== undefined) current[key] = value;
  }
  (business as any).settings = current;
  business.markModified("settings");
  await business.save();

  res.json({ settings: (business.toObject() as any).settings });
});

export default r;
