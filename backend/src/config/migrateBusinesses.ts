import { Business } from "../models/Business";
import { BusinessProject } from "../models/BusinessProject";
import { User } from "../models/User";
import { Lead } from "../models/Lead";
import { logger } from "./logger";
import { exactRegex } from "../utils/regex";
import { remapUnmappedLeads } from "../services/leadRemap.service";

export async function migrateBusinesses() {
  try {
    // 1. Find projects without a business reference
    const unlinkedProjects = await BusinessProject.find({
      $or: [{ business: { $exists: false } }, { business: null }],
    });

    if (unlinkedProjects.length > 0) {
      logger.info(`[migration] Found ${unlinkedProjects.length} projects without a business. Migrating...`);

      for (const project of unlinkedProjects) {
        const businessName = (project.developerGroup || project.name || "Default Business Group").trim();

        let business = await Business.findOne({
          name: exactRegex(businessName),
        });

        if (!business) {
          business = await Business.create({
            name: businessName,
            detail: `Business group for ${project.name}`,
            contactNo: "+91 98765 00000",
            createdBy: project.createdBy,
          });
          logger.info(`[migration] Created new Business "${business.name}"`);
        }

        project.business = business._id as any;
        if (project.stage === "ONGOING" && project.reraNumber) {
          project.hasRera = true;
        }
        await project.save();
      }
    }

    // 2. Link any BUSINESS users to their business
    const businessUsers = await User.find({
      role: "BUSINESS",
      $or: [{ business: { $exists: false } }, { business: null }],
    });

    for (const u of businessUsers) {
      if (u.businessProject) {
        const proj = await BusinessProject.findById(u.businessProject).select("business").lean();
        if (proj?.business) {
          u.business = proj.business as any;
          await u.save();
        }
      }
    }

    // 3. For any SALES users, initialize assignedProjects from businessProject if empty
    const salesUsers = await User.find({
      role: "SALES",
      $or: [{ assignedProjects: { $exists: false } }, { assignedProjects: { $size: 0 } }],
      businessProject: { $exists: true, $ne: null },
    });

    for (const s of salesUsers) {
      if (s.businessProject) {
        s.assignedProjects = [s.businessProject];
        await s.save();
      }
    }

    // 4. Backfill Lead.business from the lead's project (tenant field used for fast scoping).
    const projectsWithBusiness = await BusinessProject.find({ business: { $ne: null } }).select("_id business").lean();
    let backfilled = 0;
    for (const proj of projectsWithBusiness) {
      const result = await Lead.updateMany(
        { businessProject: proj._id, $or: [{ business: { $exists: false } }, { business: null }] },
        { $set: { business: proj.business } },
      );
      backfilled += result.modifiedCount;
    }
    if (backfilled) logger.info(`[migration] Backfilled business on ${backfilled} leads`);

    logger.info("[migration] Business hierarchy migration completed successfully.");

    // 4. Automatically remap any unmapped leads to matching business projects
    await remapUnmappedLeads();
  } catch (error) {
    logger.error("[migration] Error during business migration", { error });
  }
}
