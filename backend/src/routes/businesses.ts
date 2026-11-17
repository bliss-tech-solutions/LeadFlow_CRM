import { Router } from "express";
import { Business } from "../models/Business";
import { BusinessProject } from "../models/BusinessProject";
import { Lead } from "../models/Lead";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { auth, roles } from "../middleware/auth";
import { logAudit } from "../utils/activity";
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

  const { search = "", status = "ALL", page = "1", limit = "20" } = req.query as Record<string, string>;

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
  } else if (!isAdmin(req)) {
    filter.isActive = true;
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
      { name: { $regex: querySearch, $options: "i" } },
      { detail: { $regex: querySearch, $options: "i" } },
      { contactNo: { $regex: querySearch, $options: "i" } },
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
  const { name, detail, contactNo, leadLimit, leadLimitType, adminEmail, adminPassword, adminName } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: "Business name is required." });
  }

  const existing = await Business.findOne({
    name: { $regex: `^${String(name).trim()}$`, $options: "i" },
    isActive: true,
  });

  if (existing) {
    return res.status(400).json({ message: "A business with this name already exists." });
  }

  const business = await Business.create({
    name: String(name).trim(),
    detail: detail ? String(detail).trim() : "",
    contactNo: contactNo ? String(contactNo).trim() : "",
    leadLimit: Math.max(0, Number(leadLimit) || 0),
    leadLimitType: ["DAILY", "MONTHLY", "NONE"].includes(leadLimitType)
      ? leadLimitType
      : "NONE",
    createdBy: req.user!.id,
  });

  await logAudit({
    actor: req.user!.id,
    action: "BUSINESS_CREATED",
    entity: "Business",
    entityId: business.id,
    after: business.toObject(),
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

  const [projects, businessAdmin] = await Promise.all([
    BusinessProject.find({
      business: business._id,
      isActive: true,
    })
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
  }

  res.json({
    business: {
      ...businessData,
      businessAdmin: businessAdmin || null,
      projects,
    },
  });
});

/**
 * PATCH /api/businesses/:id
 * Update business details or limits.
 * Toggling active/inactive holds or releases leads for this business.
 */
r.patch("/:id", auth, roles("ADMIN", "MANAGER", "BUSINESS"), async (req, res) => {
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

  const before = business.toObject();
  const { name, detail, contactNo, leadLimit, leadLimitType, isActive } = req.body;

  if (name !== undefined) {
    if (!String(name).trim()) {
      return res.status(400).json({ message: "Business name cannot be empty." });
    }
    business.name = String(name).trim();
  }

  if (detail !== undefined) business.detail = String(detail).trim();
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

  await logAudit({
    actor: req.user!.id,
    action: "BUSINESS_UPDATED",
    entity: "Business",
    entityId: business.id,
    before,
    after: business.toObject(),
  });

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

  await logAudit({
    actor: req.user!.id,
    action: "BUSINESS_DEACTIVATED",
    entity: "Business",
    entityId: business.id,
    before: { isActive: true },
    after: { isActive: false },
  });

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

  await logAudit({
    actor: req.user!.id,
    action: "BUSINESS_ADMIN_CONFIGURED",
    entity: "Business",
    entityId: business.id,
    after: { userId: adminUser.id, email: adminUser.email },
  });

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

  await logAudit({
    actor: req.user!.id,
    action: "BUSINESS_ADMIN_PASSWORD_CHANGED",
    entity: "User",
    entityId: adminUser.id,
  });

  res.json({ message: "Business admin password updated successfully." });
});

export default r;
