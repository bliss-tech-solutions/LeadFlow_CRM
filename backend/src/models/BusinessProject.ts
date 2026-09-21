import { Schema, model, Document, Types } from "mongoose";

export type ProjectStage = "ONGOING" | "UPCOMING" | "COMPLETED";

export type ProductType =
  | "COMMERCIAL_SHOP"
  | "SHOWROOM"
  | "PLOT"
  | "OFFICE"
  | "STUDIO"
  | "1BHK"
  | "2BHK"
  | "3BHK"
  | "4BHK"
  | "OTHER";

export interface IProjectProduct {
  type: ProductType;
  customType?: string;
  details: Record<string, unknown>;
}

export interface IProjectMetaSource {
  label?: string;
  businessId?: string;
  pageId?: string;
  adAccountId?: string;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  formId?: string;
}

export interface IProjectDocument {
  name: string;
  url: string;
  category: string;
  mimeType?: string;
  size?: number;
  description?: string;
  createdAt: Date;
  uploadedBy: Types.ObjectId;
  storageKey?: string;
  isDemo?: boolean;
}

export interface IBusinessProject extends Document {
  name: string;
  stage: ProjectStage;
  developerGroup?: string;
  reraNumber?: string;
  penthouse: boolean;
  products: IProjectProduct[];
  upcoming?: {
    productRepeat?: boolean;
    reraTenureYears?: number;
    location?: string;
    details?: Record<string, unknown>;
  };
  completed?: {
    businessType?: string;
    completionYear?: number;
    area?: string;
    location?: string;
    details?: Record<string, unknown>;
  };
  ongoing?: {
    details?: Record<string, unknown>;
  };
  metaSources: IProjectMetaSource[];
  documents: IProjectDocument[];
  metaSetupSkipped: boolean;
  documentsSetupSkipped: boolean;
  isActive: boolean;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<IProjectDocument>(
  {
    name: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      default: "BROCHURE",
    },
    mimeType: String,
    size: Number,
    description: String,
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    storageKey: String,
    isDemo: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const schema = new Schema<IBusinessProject>(
  {
    name: { type: String, required: true, trim: true, index: true },
    stage: {
      type: String,
      enum: ["ONGOING", "UPCOMING", "COMPLETED"],
      required: true,
      index: true,
    },
    developerGroup: String,
    reraNumber: String,
    penthouse: { type: Boolean, default: false },
    products: [
      {
        type: {
          type: String,
          enum: [
            "COMMERCIAL_SHOP",
            "SHOWROOM",
            "PLOT",
            "OFFICE",
            "STUDIO",
            "1BHK",
            "2BHK",
            "3BHK",
            "4BHK",
            "OTHER",
          ],
          required: true,
        },
        customType: String,
        details: { type: Schema.Types.Mixed, default: {} },
      },
    ],
    upcoming: {
      productRepeat: Boolean,
      reraTenureYears: Number,
      location: String,
      details: { type: Schema.Types.Mixed, default: {} },
    },
    completed: {
      businessType: String,
      completionYear: Number,
      area: String,
      location: String,
      details: { type: Schema.Types.Mixed, default: {} },
    },
    ongoing: {
      details: { type: Schema.Types.Mixed, default: {} },
    },
    metaSources: {
      type: [
        {
          label: String,
          businessId: String,
          pageId: String,
          adAccountId: String,
          campaignId: String,
          adSetId: String,
          adId: String,
          formId: String,
        },
      ],
      default: [],
    },
    documents: { type: [documentSchema], default: [] },
    metaSetupSkipped: { type: Boolean, default: false },
    documentsSetupSkipped: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

schema.index({ "metaSources.pageId": 1 });
schema.index({ "metaSources.adId": 1 });
schema.index({ "metaSources.formId": 1 });

export const BusinessProject = model<IBusinessProject>(
  "BusinessProject",
  schema,
);
