import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { BusinessProject } from "../models/BusinessProject";
import { Business } from "../models/Business";
import { auth, roles, signUserToken, isAdminRole } from "../middleware/auth";
import { containsRegex } from "../utils/regex";
import { invalidateUser } from "../utils/userCache";
import { disconnectUserSockets } from "../sockets";
import { revokeUserSessions } from "../models/Session";
import { PushToken } from "../models/PushToken";
import { Notification } from "../models/Notification";
import { Lead } from "../models/Lead";
import crypto from "crypto";
import { createDocumentUploadUrl, createPublicObjectUrl, deleteDocumentObject } from "../services/s3.service";

const r = Router();

function getDateKey(timezone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

/**
 * GET /api/users
 * List users with search, role filter, active/blocked status, and pagination.
 */
r.get("/", auth, roles("ADMIN", "MANAGER", "BUSINESS"), async (req, res) => {
  const filter: Record<string, unknown> = {};

  // Business partner scoping
  if (req.user?.role === "BUSINESS") {
    let businessId = req.user.business;
    if (!businessId) {
      const me = await User.findById(req.user.id).select("business businessProject").lean();
      businessId = me?.business ? String(me.business) : undefined;
    }

    const projectConditions: any[] = [];
    if (businessId) {
      const bizProjects = await BusinessProject.find({ business: businessId }).select("_id").lean();
      const projIds = bizProjects.map((p: any) => p._id);
      projectConditions.push({ business: businessId });
      if (projIds.length) {
        projectConditions.push({ assignedProjects: { $in: projIds } });
        projectConditions.push({ businessProject: { $in: projIds } });
      }
    }
    if (req.user.businessProject) {
      projectConditions.push({ businessProject: req.user.businessProject });
      projectConditions.push({ assignedProjects: req.user.businessProject });
    }

    if (projectConditions.length) {
      filter.$or = projectConditions;
    } else {
      filter._id = req.user.id;
    }
  }

  if (req.query.status === "ACTIVE" || req.query.isActive === "true") {
    filter.isActive = true;
  } else if (
    req.query.status === "BLOCKED" ||
    req.query.status === "INACTIVE" ||
    req.query.isActive === "false"
  ) {
    filter.isActive = false;
  } else if (
    req.query.status === "ALL" ||
    req.query.includeInactive === "true"
  ) {
    // include both active and blocked
  } else if (!req.query.role || req.query.role !== "SALES") {
    filter.isActive = true;
  }

  if (
    req.query.role &&
    ["ADMIN", "MANAGER", "SALES", "BUSINESS"].includes(String(req.query.role))
  ) {
    filter.role = req.query.role;
  }

  if (req.query.search) {
    const searchStr = String(req.query.search).trim();
    if (searchStr) {
      const searchOr = [{ name: containsRegex(searchStr) }, { email: containsRegex(searchStr) }];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
        delete filter.$or;
      } else {
        filter.$or = searchOr;
      }
    }
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const isPaginated =
    req.query.page !== undefined ||
    req.query.limit !== undefined ||
    req.query.search !== undefined;
  const limit =
    req.query.limit !== undefined
      ? Math.max(1, Math.min(100, Number(req.query.limit) || 10))
      : isPaginated
        ? 10
        : 100;
  const skip = (page - 1) * limit;

  const total = await User.countDocuments(filter);
  const users = await User.find(filter)
    .select("-passwordHash -tokenVersion")
    .populate("business", isAdminRole(req.user?.role) ? "name contactNo leadLimit leadLimitType" : "name contactNo")
    .populate("businessProject", "name stage reraNumber developerGroup")
    .populate("assignedProjects", "name stage location reraNumber")
    .sort({ createdAt: -1, name: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const userIds = users.map((u) => u._id);

  const [counts, projectCounts] = await Promise.all([
    Lead.aggregate([
      {
        $match: {
          deliveryStatus: "RELEASED",
          assignedTo: { $in: userIds },
        },
      },
      { $group: { _id: "$assignedTo", count: { $sum: 1 } } },
    ]),
    Lead.aggregate([
      {
        $match: {
          deliveryStatus: "RELEASED",
          businessProject: { $exists: true },
        },
      },
      { $group: { _id: "$businessProject", count: { $sum: 1 } } },
    ]),
  ]);

  const countMap = new Map(
    counts.map((item: any) => [String(item._id), Number(item.count || 0)]),
  );
  const projectCountMap = new Map(
    projectCounts.map((item: any) => [
      String(item._id),
      Number(item.count || 0),
    ]),
  );

  const dateKey = getDateKey();
  const todayCounts = await Lead.aggregate([
    {
      $match: {
        assignedTo: { $in: userIds },
        assignmentSource: "AUTO",
        deliveryStatus: "RELEASED",
        assignedAt: { $exists: true },
      },
    },
    {
      $group: {
        _id: {
          userId: "$assignedTo",
          day: {
            $dateToString: {
              date: "$assignedAt",
              format: "%Y-%m-%d",
              timezone: "Asia/Kolkata",
            },
          },
        },
        count: { $sum: 1 },
      },
    },
    {
      $match: {
        "_id.day": dateKey,
      },
    },
  ]);

  const todayCountMap = new Map(
    todayCounts.map((item: any) => [
      String(item._id.userId),
      Number(item.count || 0),
    ]),
  );

  res.json({
    users: users.map((user: any) => {
      const bizProjId = user.businessProject?._id || user.businessProject;
      const assignedToday =
        todayCountMap.get(String(user._id)) ??
        (user.autoLeadCountDate === dateKey
          ? Number(user.autoLeadCount || 0)
          : 0);
      const limitVal = Math.max(0, Number(user.dailyLeadLimit ?? 5));
      const remaining = Math.max(0, limitVal - assignedToday);
      const atCapacity = assignedToday >= limitVal;

      return {
        ...user,
        dailyLeadLimit: limitVal,
        assignedToday,
        remaining,
        atCapacity,
        assignedLeadCount:
          user.role === "BUSINESS" && bizProjId
            ? projectCountMap.get(String(bizProjId)) || 0
            : countMap.get(String(user._id)) || 0,
      };
    }),
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    limit,
  });
});

r.post("/", auth, roles("ADMIN", "BUSINESS"), async (req, res) => {
  const {
    name,
    email,
    password,
    role = "SALES",
    business,
    businessProject,
    assignedProjects = [],
    dailyLeadLimit,
  } = req.body ?? {};

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({
      message: "Name, email and password are required",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      message: "Password must be at least 8 characters",
    });
  }

  let finalRole: "SALES" | "BUSINESS" = "SALES";
  let finalBusinessId: string | undefined = undefined;
  let finalAssignedProjects: string[] = [];
  let validatedProject: any = null;

  if (req.user?.role === "BUSINESS") {
    finalRole = "SALES";
    let myBusinessId = req.user.business;
    if (!myBusinessId) {
      const me = await User.findById(req.user.id).select("business").lean();
      myBusinessId = me?.business ? String(me.business) : undefined;
    }
    if (!myBusinessId) {
      return res.status(400).json({ message: "No business profile associated with your account" });
    }
    finalBusinessId = myBusinessId;

    const projectIds = Array.isArray(assignedProjects) ? assignedProjects.map(String) : [];
    if (projectIds.length > 0) {
      const count = await BusinessProject.countDocuments({
        _id: { $in: projectIds },
        business: myBusinessId,
      });
      if (count !== projectIds.length) {
        return res.status(400).json({
          message: "All assigned projects must belong to your business",
        });
      }
      finalAssignedProjects = projectIds;
    }
  } else {
    finalRole = role === "BUSINESS" ? "BUSINESS" : "SALES";

    if (finalRole === "BUSINESS") {
      if (business) {
        const biz = await Business.findById(business);
        if (!biz) return res.status(400).json({ message: "Invalid business selected" });
        finalBusinessId = String(biz._id);
      } else if (businessProject) {
        validatedProject = await BusinessProject.findById(businessProject);
        if (!validatedProject || !validatedProject.isActive) {
          return res.status(400).json({
            message: "The selected business project is invalid or not active",
          });
        }
        finalBusinessId = validatedProject.business ? String(validatedProject.business) : undefined;
      } else {
        return res.status(400).json({
          message: "A business must be selected for this business account",
        });
      }
    } else {
      if (business) {
        const biz = await Business.findById(business).select("_id").lean();
        if (!biz) return res.status(400).json({ message: "Invalid business selected" });
        finalBusinessId = String(biz._id);
      }
      if (Array.isArray(assignedProjects) && assignedProjects.length > 0) {
        const projects = await BusinessProject.find({ _id: { $in: assignedProjects.map(String) } }).select("business").lean();
        if (projects.length !== assignedProjects.length) {
          return res.status(400).json({ message: "One or more assigned projects do not exist" });
        }
        const projectBusinesses = new Set(projects.map((pr) => String(pr.business)));
        if (projectBusinesses.size > 1 || (finalBusinessId && !projectBusinesses.has(finalBusinessId))) {
          return res.status(400).json({ message: "All assigned projects must belong to the salesperson's business" });
        }
        finalAssignedProjects = assignedProjects.map(String);
        // Automatically sync business from the assigned project if not explicitly set
        if (!finalBusinessId) {
          const firstProj = await BusinessProject.findById(finalAssignedProjects[0]).select("business").lean();
          if (firstProj?.business) {
            finalBusinessId = String(firstProj.business);
          }
        }
      }
    }
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });

  if (existing) {
    return res.status(409).json({ message: "Email is already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: finalRole,
    business: finalBusinessId,
    businessProject: validatedProject ? validatedProject._id : (finalAssignedProjects[0] || undefined),
    assignedProjects: finalAssignedProjects,
    isActive: true,
    dailyLeadLimit: finalRole === "BUSINESS" ? 0 : (Number(dailyLeadLimit) || 5),
  });

  const populatedUser = await User.findById(user._id)
    .select("-passwordHash -tokenVersion")
    .populate("business", isAdminRole(req.user?.role) ? "name contactNo leadLimit leadLimitType" : "name contactNo")
    .populate("businessProject", "name stage reraNumber developerGroup")
    .populate("assignedProjects", "name stage location reraNumber")
    .lean();

  res.status(201).json({
    user: populatedUser,
  });
});

r.patch("/:id/capacity", auth, roles("ADMIN", "MANAGER"), async (req, res) => {
  const limit = Number(req.body?.dailyLeadLimit);

  if (!Number.isFinite(limit) || limit < 0 || limit > 1000) {
    return res
      .status(400)
      .json({ message: "Daily lead limit must be between 0 and 1000" });
  }

  const user = await User.findOneAndUpdate(
    { _id: req.params.id, role: "SALES" },
    { $set: { dailyLeadLimit: Math.floor(limit) } },
    { new: true },
  ).select("-passwordHash");

  if (!user) return res.status(404).json({ message: "Salesperson not found" });

  await Notification.create({
    user: user._id,
    type: "DAILY_LEAD_LIMIT_CHANGED",
    title: "Daily lead limit updated",
    message: `Your daily automatic lead limit is now ${user.dailyLeadLimit} leads.`,
    entityType: "User",
    entityId: user.id,
  });


  const io = req.app.get("io");
  if (io) {
    io.to(`user:${user.id}`).emit("capacity_updated", {
      userId: user.id,
      dailyLeadLimit: user.dailyLeadLimit,
    });
    io.to("role:ADMIN").emit("capacity_updated", {
      userId: user.id,
      dailyLeadLimit: user.dailyLeadLimit,
    });
  }

  res.json({ user });
});

/**
 * PATCH /api/users/:id/status
 * Admin blocks or unblocks a user account (restricts receiving leads & login).
 */
r.patch("/:id/status", auth, roles("ADMIN", "MANAGER", "BUSINESS"), async (req, res) => {
  const { isActive } = req.body ?? {};

  if (typeof isActive !== "boolean") {
    return res.status(400).json({ message: "isActive boolean is required" });
  }

  // Prevent admin from blocking themselves
  if (req.user!.id === req.params.id && !isActive) {
    return res.status(400).json({ message: "You cannot block your own account" });
  }

  const before = await User.findById(req.params.id).select("name email isActive role business");
  if (!before) return res.status(404).json({ message: "User not found" });

  if (req.user?.role === "BUSINESS") {
    if (before.role !== "SALES" || !req.user.business || String(before.business) !== String(req.user.business)) {
      return res.status(403).json({ message: "You can only block or unblock your own sales staff" });
    }
  }
  if (req.user?.role === "MANAGER" && before.role === "ADMIN") {
    return res.status(403).json({ message: "Managers cannot block administrators" });
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { $set: { isActive }, ...(isActive ? {} : { $inc: { tokenVersion: 1 } }) },
    { new: true },
  ).select("-passwordHash -tokenVersion");

  invalidateUser(String(req.params.id));
  if (!isActive) {
    await revokeUserSessions(String(req.params.id), "blocked");
    await PushToken.updateMany({ user: req.params.id }, { $set: { isActive: false } });
  }


  const io = req.app.get("io");
  if (io) {
    io.to("role:ADMIN").emit("user_status_changed", {
      userId: user!.id,
      isActive: user!.isActive,
    });
    io.to(`user:${user!.id}`).emit("user_status_changed", {
      userId: user!.id,
      isActive: user!.isActive,
    });
    if (!isActive) disconnectUserSockets(io, user!.id);
  }

  res.json({
    user,
    message: isActive ? "User unblocked successfully" : "User blocked successfully",
  });
});

/**
 * GET /api/users/me
 * Return the current user's editable profile.
 */
r.get("/me", auth, async (req, res) => {
  const user = await User.findById(req.user!.id)
    .select("name email role isActive dailyLeadLimit profilePhotoUrl businessProject")
    .populate("businessProject", "name stage developerGroup reraNumber");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user });
});

/**
 * PATCH /api/users/:id/assigned-projects
 * Admin or Business partner updates project assignments for a salesperson.
 */
r.patch("/:id/assigned-projects", auth, roles("ADMIN", "BUSINESS"), async (req, res) => {
  const { assignedProjects = [] } = req.body ?? {};
  if (!Array.isArray(assignedProjects)) {
    return res.status(400).json({ message: "assignedProjects must be an array of project IDs" });
  }

  const targetUser = await User.findById(req.params.id);
  if (!targetUser || targetUser.role !== "SALES") {
    return res.status(404).json({ message: "Salesperson not found" });
  }

  if (req.user?.role === "BUSINESS") {
    let myBusinessId = req.user.business;
    if (!myBusinessId) {
      const me = await User.findById(req.user.id).select("business").lean();
      myBusinessId = me?.business ? String(me.business) : undefined;
    }
    if (String(targetUser.business) !== String(myBusinessId)) {
      return res.status(403).json({ message: "Cannot modify salesperson outside your business" });
    }
    if (assignedProjects.length > 0) {
      const count = await BusinessProject.countDocuments({
        _id: { $in: assignedProjects },
        business: myBusinessId,
      });
      if (count !== assignedProjects.length) {
        return res.status(400).json({ message: "All projects must belong to your business" });
      }
    }
  }

  targetUser.assignedProjects = assignedProjects as any;
  if (assignedProjects.length > 0) {
    if (!targetUser.businessProject) {
      targetUser.businessProject = assignedProjects[0] as any;
    }
    // Automatically associate business if not already set
    if (!targetUser.business) {
      const firstProj = await BusinessProject.findById(assignedProjects[0]).select("business").lean();
      if (firstProj?.business) {
        targetUser.business = firstProj.business as any;
      }
    }
  }
  await targetUser.save();
  invalidateUser(targetUser.id);

  const populated = await User.findById(targetUser._id)
    .select("-passwordHash -tokenVersion")
    .populate("business", isAdminRole(req.user?.role) ? "name contactNo leadLimit leadLimitType" : "name contactNo")
    .populate("businessProject", "name stage reraNumber developerGroup")
    .populate("assignedProjects", "name stage location reraNumber")
    .lean();

  res.json({ user: populated });
});

r.patch("/me", auth, async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ message: "Name is required" });
  if (name.length > 100) return res.status(400).json({ message: "Name is too long" });

  const user = await User.findByIdAndUpdate(
    req.user!.id,
    { $set: { name } },
    { new: true },
  ).select("name email role isActive dailyLeadLimit profilePhotoUrl businessProject");

  if (!user) return res.status(404).json({ message: "User not found" });


  invalidateUser(user.id);
  const fresh = await User.findById(user.id).select("tokenVersion business assignedProjects businessProject").lean();
  const token = signUserToken({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    business: fresh?.business,
    assignedProjects: fresh?.assignedProjects,
    businessProject: fresh?.businessProject,
    tokenVersion: fresh?.tokenVersion,
  });

  res.json({ user, token });
});

/**
 * POST /api/users/me/profile-photo/upload-url
 * Return a presigned S3 PUT URL for the current user's profile photo.
 */
r.post("/me/profile-photo/upload-url", auth, async (req, res) => {
  const contentType = String(req.body?.contentType || "").toLowerCase();
  const size = Number(req.body?.size || 0);
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);

  if (!allowed.has(contentType)) {
    return res.status(400).json({ message: "Profile photo must be JPG, PNG or WEBP." });
  }
  if (!Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024) {
    return res.status(400).json({ message: "Profile photo must be smaller than 5 MB." });
  }

  const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
  const key = `profiles/${req.user!.id}/${crypto.randomUUID()}.${extension}`;

  try {
    const uploadUrl = await createDocumentUploadUrl(key, contentType);
    res.json({ uploadUrl, key, url: createPublicObjectUrl(key) });
  } catch (error: any) {
    res.status(503).json({ message: error?.message || "S3 is not configured." });
  }
});

/**
 * PATCH /api/users/me/profile-photo
 * Save the uploaded S3 object and remove the previous object when replacing it.
 */
r.patch("/me/profile-photo", auth, async (req, res) => {
  const key = String(req.body?.key || "").trim();
  if (!key || !key.startsWith(`profiles/${req.user!.id}/`)) {
    return res.status(400).json({ message: "Invalid profile photo key." });
  }

  const current = await User.findById(req.user!.id).select("profilePhotoKey");
  if (!current) return res.status(404).json({ message: "User not found" });

  const oldKey = current.profilePhotoKey;
  const url = createPublicObjectUrl(key);
  current.profilePhotoKey = key;
  current.profilePhotoUrl = url;
  await current.save();

  if (oldKey && oldKey !== key) {
    try { await deleteDocumentObject(oldKey); } catch {}
  }

  res.json({ user: { id: current.id, profilePhotoUrl: url } });
});

/**
 * DELETE /api/users/me/profile-photo
 * Remove the current profile photo from S3 and MongoDB.
 */
r.delete("/me/profile-photo", auth, async (req, res) => {
  const current = await User.findById(req.user!.id).select("profilePhotoKey");
  if (!current) return res.status(404).json({ message: "User not found" });

  const oldKey = current.profilePhotoKey;
  current.profilePhotoKey = undefined;
  current.profilePhotoUrl = undefined;
  await current.save();

  if (oldKey) {
    try { await deleteDocumentObject(oldKey); } catch {}
  }

  res.json({ user: { id: current.id, profilePhotoUrl: null } });
});

export default r;
