import { Schema, model, Document, Types } from "mongoose";
import type { City } from "../config/cities";

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
  | "PENTHOUSE"
  | "OTHER";

export interface IProjectProduct {
  type: ProductType;
  customType?: string;
  priceRange?: string;
  areaSqFt?: string;
  units?: number;
  isPenthouse?: boolean;
  details: Record<string, unknown>;
}

export interface IProjectMetaSource {
  pageName?: string;
  pageId?: string;
  formName?: string;
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
  business?: Types.ObjectId;
  name: string;
  state?: string;
  city?: City;
  area?: string;
  pincode?: string;
  stage: ProjectStage;
  location?: string;
  developerGroup?: string;
  hasRera?: boolean;
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
  leadLimit: number;
  leadLimitType: "DAILY" | "MONTHLY" | "NONE";
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
    business: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      index: true,
    },
    name: { type: String, required: true, trim: true, index: true },
    state: { type: String, default: "Gujarat", index: true },
    city: { type: String, index: true },
    area: { type: String, default: "", index: true },
    pincode: { type: String, default: "" },
    stage: {
      type: String,
      enum: ["ONGOING", "UPCOMING", "COMPLETED"],
      required: true,
      index: true,
    },
    location: String,
    developerGroup: String,
    hasRera: { type: Boolean, default: false },
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
            "PENTHOUSE",
            "OTHER",
          ],
          required: true,
        },
        customType: String,
        priceRange: String,
        areaSqFt: String,
        units: Number,
        isPenthouse: { type: Boolean, default: false },
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
          pageName: { type: String, trim: true },
          pageId: { type: String, trim: true },
          formName: { type: String, trim: true },
          formId: { type: String, trim: true },
        },
      ],
      default: [],
    },
    documents: { type: [documentSchema], default: [] },
    metaSetupSkipped: { type: Boolean, default: false },
    documentsSetupSkipped: { type: Boolean, default: false },
    leadLimit: { type: Number, default: 0, min: 0 },
    leadLimitType: {
      type: String,
      enum: ["DAILY", "MONTHLY", "NONE"],
      default: "NONE",
    },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

schema.index({ "metaSources.pageId": 1 });
schema.index({ "metaSources.formId": 1 });
schema.index({ "metaSources.formName": 1 });
schema.index({ "metaSources.pageName": 1 });

export const BusinessProject = model<IBusinessProject>(
  "BusinessProject",
  schema,
);
