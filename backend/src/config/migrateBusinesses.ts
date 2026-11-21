import { Business } from "../models/Business";
import { BusinessProject } from "../models/BusinessProject";
import { User } from "../models/User";
import { Lead } from "../models/Lead";
import { logger } from "./logger";
import { exactRegex } from "../utils/regex";
import { remapUnmappedLeads } from "../services/leadRemap.service";
import { CITIES } from "./cities";
import { matchProduct, productLabel } from "../utils/productMatch";

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

    // 5. Backfill city on businesses (random for now), then cascade to projects and leads.
    const realCities = CITIES.filter((c) => c !== "Other");
    const businessesNoCity = await Business.find({ $or: [{ city: { $exists: false } }, { city: null }, { city: "" }] }).select("_id");
    for (const b of businessesNoCity) {
      const city = realCities[Math.floor(Math.random() * realCities.length)];
      await Business.updateOne({ _id: b._id }, { $set: { city } });
    }
    if (businessesNoCity.length) logger.info(`[migration] Assigned random city to ${businessesNoCity.length} businesses`);

    // Projects inherit their business's city when they have none.
    const businessCities = await Business.find({ city: { $nin: [null, ""] } }).select("_id city").lean();
    for (const b of businessCities) {
      await BusinessProject.updateMany(
        { business: b._id, $or: [{ city: { $exists: false } }, { city: null }, { city: "" }] },
        { $set: { city: b.city } },
      );
    }

    // Leads inherit their project's city (fallback to business city) when they have none.
    const projectCities = await BusinessProject.find({ city: { $nin: [null, ""] } }).select("_id city").lean();
    let cityLeads = 0;
    for (const proj of projectCities) {
      const result = await Lead.updateMany(
        { businessProject: proj._id, $or: [{ city: { $exists: false } }, { city: null }, { city: "" }] },
        { $set: { city: proj.city } },
      );
      cityLeads += result.modifiedCount;
    }
    for (const b of businessCities) {
      const result = await Lead.updateMany(
        { business: b._id, $or: [{ city: { $exists: false } }, { city: null }, { city: "" }] },
        { $set: { city: b.city } },
      );
      cityLeads += result.modifiedCount;
    }
    if (cityLeads) logger.info(`[migration] Backfilled city on ${cityLeads} leads`);

    // 6. Backfill interestedProduct on leads from their project's product list.
    const projectsWithProducts = await BusinessProject.find({ "products.0": { $exists: true } })
      .select("_id products")
      .lean();
    let productLeads = 0;
    for (const proj of projectsWithProducts) {
      const products = (proj.products || []) as any[];
      if (!products.length) continue;
      const fallback = productLabel(products[0].type, products[0].customType);
      const leadsToFix = await Lead.find({
        businessProject: proj._id,
        $or: [{ interestedProduct: { $exists: false } }, { interestedProduct: null }, { interestedProduct: "" }],
      }).select("_id meta.fieldData");
      for (const lead of leadsToFix) {
        const matched = matchProduct(lead.meta?.fieldData || [], products);
        await Lead.updateOne({ _id: lead._id }, { $set: { interestedProduct: matched || fallback } });
        productLeads++;
      }
    }
    if (productLeads) logger.info(`[migration] Backfilled interestedProduct on ${productLeads} leads`);

    logger.info("[migration] Business hierarchy migration completed successfully.");

    // 4. Automatically remap any unmapped leads to matching business projects
    await remapUnmappedLeads();
  } catch (error) {
    logger.error("[migration] Error during business migration", { error });
  }
}
