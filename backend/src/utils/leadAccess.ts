import { Lead } from "../models/Lead";
import { User } from "../models/User";
import { BusinessProject } from "../models/BusinessProject";

/**
 * Build the lead visibility filter:
 * - ADMIN / MANAGER sees all released leads.
 * - BUSINESS sees all released leads for their assigned project.
 * - SALES sees only their assigned leads.
 */
export async function visibleLeadFilter(req: any) {
  const filter: Record<string, unknown> = {
    deliveryStatus: { $ne: "HELD" },
  };

  const { business, businessProject } = req.query as Record<string, string>;

  if (req.user?.role === "ADMIN" || req.user?.role === "MANAGER") {
    if (business) {
      const bizProjects = await BusinessProject.find({ business }).select("_id").lean();
      filter.businessProject = { $in: bizProjects.map((p: any) => p._id) };
    } else if (businessProject) {
      filter.businessProject = businessProject;
    }
    return filter;
  }

  if (req.user?.role === "BUSINESS") {
    let businessId = req.user.business;
    if (!businessId) {
      const me = await User.findById(req.user.id).select("business businessProject").lean();
      businessId = me?.business ? String(me.business) : undefined;
    }
    const projectIds: any[] = [];
    if (businessId) {
      const bizProjects = await BusinessProject.find({ business: businessId }).select("_id").lean();
      projectIds.push(...bizProjects.map((p: any) => p._id));
    }
    if (req.user.businessProject) {
      projectIds.push(req.user.businessProject);
    }
    if (!projectIds.length) {
      filter.businessProject = { $in: [] };
      return filter;
    }

    if (businessProject && projectIds.map(String).includes(String(businessProject))) {
      filter.businessProject = businessProject;
    } else {
      filter.businessProject = { $in: projectIds };
    }
    return filter;
  }

  // SALES role
  filter.assignedTo = req.user!.id;
  filter.deliveryStatus = "RELEASED";

  let assignedProjects = req.user.assignedProjects;
  if (!assignedProjects) {
    const me = await User.findById(req.user.id).select("assignedProjects").lean();
    assignedProjects = me?.assignedProjects?.map(String) || [];
  }

  if (assignedProjects && assignedProjects.length > 0) {
    if (businessProject && assignedProjects.map(String).includes(String(businessProject))) {
      filter.businessProject = businessProject;
    } else {
      filter.businessProject = { $in: assignedProjects };
    }
  } else if (businessProject) {
    filter.businessProject = businessProject;
  }

  return filter;
}


export async function leadScope(leadId: unknown) {
  const l: any = await Lead.findById(leadId).select("assignedTo business businessProject").lean();
  if (!l) return {};
  let business = l.business;
  if (!business && l.businessProject) {
    const p = await BusinessProject.findById(l.businessProject).select("business").lean();
    business = p?.business;
  }
  return { assignedTo: l.assignedTo, business };
}

export async function canAccessLead(req: any, leadId: string) {
  if (req.user?.role === "ADMIN" || req.user?.role === "MANAGER") return true;

  if (req.user?.role === "BUSINESS") {
    let businessId = req.user.business;
    if (!businessId) {
      const u = await User.findById(req.user.id).select("business businessProject").lean();
      businessId = u?.business ? String(u.business) : undefined;
    }
    const projectIds: any[] = [];
    if (businessId) {
      const bizProjects = await BusinessProject.find({ business: businessId }).select("_id").lean();
      projectIds.push(...bizProjects.map((p: any) => p._id));
    }
    if (req.user.businessProject) {
      projectIds.push(req.user.businessProject);
    }
    if (!projectIds.length) return false;
    return Boolean(
      await Lead.exists({
        _id: leadId,
        businessProject: { $in: projectIds },
        deliveryStatus: { $ne: "HELD" },
      }),
    );
  }

  const salesLead: any = await Lead.findOne({
    _id: leadId,
    assignedTo: req.user!.id,
    deliveryStatus: "RELEASED",
  }).select("businessProject").lean();

  if (!salesLead) return false;

  let assignedProjects = req.user.assignedProjects;
  if (!assignedProjects) {
    const me = await User.findById(req.user.id).select("assignedProjects").lean();
    assignedProjects = me?.assignedProjects?.map(String) || [];
  }

  if (assignedProjects && assignedProjects.length > 0 && salesLead.businessProject) {
    return assignedProjects.map(String).includes(String(salesLead.businessProject));
  }

  return true;
}

