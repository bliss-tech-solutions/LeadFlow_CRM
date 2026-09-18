import bcrypt from "bcryptjs";
import { connectDB } from "../src/config/db";
import { User } from "../src/models/User";
import { Lead } from "../src/models/Lead";
import { env } from "../src/config/env";
import { BusinessProject } from "../src/models/BusinessProject";
async function main() {
  await connectDB();
  await User.deleteMany({});
  await Lead.deleteMany({});
  await BusinessProject.deleteMany({});
  const password = await bcrypt.hash("Admin@123", 10);
  const [admin, manager, sales] = await User.create([
    {
      name: "Aarav Admin",
      email: "admin@leadflow.local",
      passwordHash: password,
      role: "ADMIN",
    },
    {
      name: "Maya Manager",
      email: "manager@leadflow.local",
      passwordHash: await bcrypt.hash("Manager@123", 10),
      role: "MANAGER",
    },
    {
      name: "Riya Sales",
      email: "sales@leadflow.local",
      passwordHash: await bcrypt.hash("Sales@123", 10),
      role: "SALES",
    },
  ]);
  const project = await BusinessProject.create({
    name: "Zion Group Demo Residences",
    stage: "ONGOING",
    developerGroup: "Zion Group",
    reraNumber: "PR/GJ/DEMO/0001",
    penthouse: true,
    products: [
      { type: "3BHK", details: { unitCount: "80", areaSqFt: "1850", priceFrom: "8500000", priceTo: "11000000", bathrooms: "3", facing: "East", floorRange: "1-14" } },
      { type: "4BHK", details: { unitCount: "24", areaSqFt: "2400", priceFrom: "12000000", priceTo: "15500000", bathrooms: "4", facing: "North", floorRange: "5-14" } },
    ],
    ongoing: { details: { location: "SG Highway, Ahmedabad", projectStatus: "Under Construction" } },
    metaSources: [{ label: "Demo Meta source", pageId: "TEST_PAGE", adId: "TEST_AD", formId: "TEST_FORM" }],
    documents: [
      {
        name: "Zion Project Brochure (Demo)",
        url: "https://example.com/leadflow-demo-brochure.pdf",
        category: "BROCHURE",
        mimeType: "application/pdf",
        size: 1024000,
        description: "Seeded demo brochure placeholder.",
        uploadedBy: admin._id,
        isDemo: true,
        createdAt: new Date(),
      },
      {
        name: "Zion Price Sheet (Demo)",
        url: "https://example.com/leadflow-demo-price-sheet.pdf",
        category: "PRICE_SHEET",
        mimeType: "application/pdf",
        size: 512000,
        description: "Seeded demo price sheet placeholder.",
        uploadedBy: admin._id,
        isDemo: true,
        createdAt: new Date(),
      },
      {
        name: "Zion 3 BHK Floor Plan (Demo)",
        url: "https://example.com/leadflow-demo-floor-plan.pdf",
        category: "FLOOR_PLAN",
        mimeType: "application/pdf",
        size: 768000,
        description: "Seeded demo floor plan placeholder.",
        uploadedBy: admin._id,
        isDemo: true,
        createdAt: new Date(),
      },
    ],
    metaSetupSkipped: false,
    documentsSetupSkipped: false,
    createdBy: admin._id,
  });

  await Lead.create([
    {
      name: "Rahul Mehta",
      email: "rahul@example.com",
      phone: "+91 98765 43210",
      source: "META",
      campaign: "Ahmedabad Residential",
      status: "NEW",
      assignedTo: sales._id,
      assignedAt: new Date(),
      assignmentSource: "AUTO",
      score: 82,
      businessProject: project._id,
      meta: { pageId: "TEST_PAGE", adId: "TEST_AD", formId: "TEST_FORM", businessId: project.id },
    },
    {
      name: "Neha Shah",
      email: "neha@example.com",
      phone: "+91 99887 66554",
      source: "META",
      campaign: "Premium Villas",
      status: "INTERESTED",
      assignedTo: sales._id,
      assignedAt: new Date(),
      assignmentSource: "AUTO",
      score: 91,
    },
    {
      name: "Vikram Patel",
      email: "vikram@example.com",
      phone: "+91 90909 12345",
      source: "WEBSITE",
      campaign: "Organic",
      status: "FOLLOW_UP",
      assignedTo: sales._id,
      assignedAt: new Date(),
      assignmentSource: "AUTO",
      score: 67,
    },
  ]);
  console.log("Seeded demo data.");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
