import { Lead } from "../models/Lead";
import { BusinessProject } from "../models/BusinessProject";
import { logger } from "../config/logger";
import { chooseRandomSalesperson } from "./leadDelivery.service";

function clean(str?: any): string {
  if (!str) return "";
  return String(str).trim().toLowerCase();
}

/**
 * Automatically discovers unmapped leads and links them to the correct
 * BusinessProject based on:
 * 1. meta.formId matching project metaSources.formId
 * 2. meta.pageId matching project metaSources.pageId
 * 3. formName or meta.formName matching project metaSources.formName
 * 4. meta.pageName matching project metaSources.pageName
 * 5. project name or business name contained within campaign / formName
 * 6. Historical cohort mapping: if other leads from the exact same campaign / form were mapped
 */
export async function remapUnmappedLeads(): Promise<{ remappedCount: number; scannedCount: number }> {
  try {
    const unmappedLeads = await Lead.find({
      $or: [{ businessProject: { $exists: false } }, { businessProject: null }],
    });

    if (!unmappedLeads.length) {
      return { remappedCount: 0, scannedCount: 0 };
    }

    const projects = await BusinessProject.find({ isActive: true })
      .select("_id name business metaSources")
      .populate("business", "name status")
      .lean();

    if (!projects.length) {
      return { remappedCount: 0, scannedCount: unmappedLeads.length };
    }

    // Historical cohort lookup from already mapped leads
    const mappedLeads = await Lead.find({
      businessProject: { $ne: null },
    })
      .select("campaign formName meta.formName meta.formId meta.pageId businessProject")
      .lean();

    const campaignToProject = new Map<string, any>();
    const formNameToProject = new Map<string, any>();
    const formIdToProject = new Map<string, any>();
    const pageIdToProject = new Map<string, any>();

    for (const ml of mappedLeads) {
      if (ml.businessProject) {
        if (ml.campaign && !campaignToProject.has(clean(ml.campaign))) {
          campaignToProject.set(clean(ml.campaign), ml.businessProject);
        }
        if (ml.formName && !formNameToProject.has(clean(ml.formName))) {
          formNameToProject.set(clean(ml.formName), ml.businessProject);
        }
        if (ml.meta?.formName && !formNameToProject.has(clean(ml.meta.formName))) {
          formNameToProject.set(clean(ml.meta.formName), ml.businessProject);
        }
        if (ml.meta?.formId && !formIdToProject.has(clean(ml.meta.formId))) {
          formIdToProject.set(clean(ml.meta.formId), ml.businessProject);
        }
        if (ml.meta?.pageId && !pageIdToProject.has(clean(ml.meta.pageId))) {
          pageIdToProject.set(clean(ml.meta.pageId), ml.businessProject);
        }
      }
    }

    let remappedCount = 0;

    for (const lead of unmappedLeads) {
      let matchedProjectId: any = null;

      const leadFormId = clean(lead.meta?.formId);
      const leadPageId = clean(lead.meta?.pageId);
      const leadFormName = clean(lead.formName || lead.meta?.formName);
      const leadPageName = clean(lead.meta?.pageName);
      const leadCampaign = clean(lead.campaign);
      const rawBizId = clean(lead.meta?.businessId);

      // 1. Direct match against active projects and their metaSources
      for (const p of projects) {
        const pIdStr = String(p._id);
        const pName = clean(p.name);
        const bizName = clean((p.business as any)?.name);

        if (rawBizId && (rawBizId === pIdStr || rawBizId === clean(p.name))) {
          matchedProjectId = p._id;
          break;
        }

        const sources = Array.isArray(p.metaSources) ? p.metaSources : [];
        for (const s of sources) {
          const sFormId = clean(s.formId);
          const sPageId = clean(s.pageId);
          const sFormName = clean(s.formName);
          const sPageName = clean(s.pageName);

          if (leadFormId && sFormId && leadFormId === sFormId) {
            matchedProjectId = p._id;
            break;
          }
          if (leadPageId && sPageId && leadPageId === sPageId) {
            matchedProjectId = p._id;
            break;
          }
          if (leadFormName && sFormName && (leadFormName === sFormName || leadFormName.includes(sFormName) || sFormName.includes(leadFormName))) {
            matchedProjectId = p._id;
            break;
          }
          if (leadPageName && sPageName && (leadPageName === sPageName || leadPageName.includes(sPageName) || sPageName.includes(leadPageName))) {
            matchedProjectId = p._id;
            break;
          }
        }
        if (matchedProjectId) break;

        // Project name or Business name match in campaign or form name
        if (pName && pName.length >= 3) {
          if (leadCampaign && (leadCampaign.includes(pName) || pName.includes(leadCampaign))) {
            matchedProjectId = p._id;
            break;
          }
          if (leadFormName && (leadFormName.includes(pName) || pName.includes(leadFormName))) {
            matchedProjectId = p._id;
            break;
          }
        }
        if (bizName && bizName.length >= 3) {
          if (leadCampaign && (leadCampaign.includes(bizName) || bizName.includes(leadCampaign))) {
            matchedProjectId = p._id;
            break;
          }
          if (leadFormName && (leadFormName.includes(bizName) || bizName.includes(leadFormName))) {
            matchedProjectId = p._id;
            break;
          }
        }
      }

      // 2. Cohort match from already mapped leads
      if (!matchedProjectId) {
        if (leadFormId && formIdToProject.has(leadFormId)) {
          matchedProjectId = formIdToProject.get(leadFormId);
        } else if (leadFormName && formNameToProject.has(leadFormName)) {
          matchedProjectId = formNameToProject.get(leadFormName);
        } else if (leadCampaign && campaignToProject.has(leadCampaign)) {
          matchedProjectId = campaignToProject.get(leadCampaign);
        } else if (leadPageId && pageIdToProject.has(leadPageId)) {
          matchedProjectId = pageIdToProject.get(leadPageId);
        }
      }

      if (matchedProjectId) {
        lead.businessProject = matchedProjectId;
        if (!lead.meta) lead.meta = {};
        lead.meta.businessId = String(matchedProjectId);

        // If lead was unassigned and released, assign it to an eligible salesperson under that project
        if (!lead.assignedTo && lead.deliveryStatus === "RELEASED") {
          try {
            const assignee = await chooseRandomSalesperson(matchedProjectId);
            if (assignee) {
              lead.assignedTo = assignee._id;
              lead.assignedAt = new Date();
              lead.assignmentSource = "AUTO";
            }
          } catch {
            // Ignore assignment errors during remapping
          }
        }

        await lead.save();
        remappedCount++;
      }
    }

    if (remappedCount > 0) {
      logger.info(`[leadRemap] Successfully remapped ${remappedCount} leads to their business projects.`);
    }

    return { remappedCount, scannedCount: unmappedLeads.length };
  } catch (error) {
    logger.error("[leadRemap] Error during lead remapping", { error });
    return { remappedCount: 0, scannedCount: 0 };
  }
}

