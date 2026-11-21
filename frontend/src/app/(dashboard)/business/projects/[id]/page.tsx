"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Topbar from "../../../../../components/Topbar";
import { api } from "../../../../../lib/api";
import { getUser, isAuthError } from "../../../../../lib/auth";
import {
  Building2,
  MapPin,
  CheckCircle2,
  Layers,
  Database,
  FileText,
  Upload,
  ExternalLink,
  Trash2,
  Edit2,
  ArrowLeft,
  X,
  Plus,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import LocationPicker from "../../../../../components/LocationPicker";

// Realistic Price Range Presets (No manual price typing)
const PRODUCT_PRICE_RANGES: Record<string, string[]> = {
  "1BHK": [
    "₹15 Lakh – ₹25 Lakh",
    "₹25 Lakh – ₹35 Lakh",
    "₹35 Lakh – ₹45 Lakh",
    "₹45 Lakh – ₹60 Lakh",
  ],
  "2BHK": [
    "₹35 Lakh – ₹50 Lakh",
    "₹50 Lakh – ₹65 Lakh",
    "₹65 Lakh – ₹80 Lakh",
    "₹80 Lakh – ₹1 Crore",
    "₹1 Crore – ₹1.25 Crore",
  ],
  "3BHK": [
    "₹60 Lakh – ₹80 Lakh",
    "₹80 Lakh – ₹1 Crore",
    "₹1 Crore – ₹1.3 Crore",
    "₹1.3 Crore – ₹1.6 Crore",
    "₹1.6 Crore – ₹2 Crore",
  ],
  "4BHK": [
    "₹1.2 Crore – ₹1.7 Crore",
    "₹1.7 Crore – ₹2.5 Crore",
    "₹2.5 Crore – ₹3.5 Crore",
    "₹3.5 Crore – ₹5 Crore",
    "₹5 Crore+",
  ],
  STUDIO: [
    "₹15 Lakh – ₹25 Lakh",
    "₹25 Lakh – ₹40 Lakh",
    "₹40 Lakh – ₹60 Lakh",
  ],
  PENTHOUSE: [
    "₹1.5 Crore – ₹2.5 Crore",
    "₹2.5 Crore – ₹4 Crore",
    "₹4 Crore – ₹6 Crore",
    "₹6 Crore+",
  ],
  COMMERCIAL_SHOP: [
    "₹25 Lakh – ₹45 Lakh",
    "₹45 Lakh – ₹75 Lakh",
    "₹75 Lakh – ₹1.2 Crore",
    "₹1.2 Crore – ₹2 Crore",
    "₹2 Crore – ₹3.5 Crore",
    "₹3.5 Crore+",
  ],
  SHOWROOM: [
    "₹50 Lakh – ₹80 Lakh",
    "₹80 Lakh – ₹1.5 Crore",
    "₹1.5 Crore – ₹2.5 Crore",
    "₹2.5 Crore – ₹4 Crore",
    "₹4 Crore+",
  ],
  OFFICE: [
    "₹30 Lakh – ₹50 Lakh",
    "₹50 Lakh – ₹80 Lakh",
    "₹80 Lakh – ₹1.3 Crore",
    "₹1.3 Crore – ₹2 Crore",
    "₹2 Crore – ₹3.5 Crore",
    "₹3.5 Crore+",
  ],
  PLOT: [
    "₹15 Lakh – ₹30 Lakh",
    "₹30 Lakh – ₹60 Lakh",
    "₹60 Lakh – ₹1 Crore",
    "₹1 Crore – ₹2 Crore",
    "₹2 Crore+",
  ],
  WAREHOUSE: [
    "₹50 Lakh – ₹1 Crore",
    "₹1 Crore – ₹2.5 Crore",
    "₹2.5 Crore – ₹5 Crore",
    "₹5 Crore+",
  ],
  OTHER: [
    "Under ₹25 Lakh",
    "₹25 Lakh – ₹50 Lakh",
    "₹50 Lakh – ₹1 Crore",
    "₹1 Crore – ₹2 Crore",
    "₹2 Crore – ₹5 Crore",
    "₹5 Crore+",
  ],
};

const documentCategories = [
  ["BROCHURE", "Brochure"],
  ["PRICE_SHEET", "Price sheet"],
  ["FLOOR_PLAN", "Floor plan"],
  ["PAYMENT_PLAN", "Payment plan"],
  ["AMENITIES", "Amenities"],
  ["OTHER", "Other"],
] as const;

export default function BusinessProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;
  const currentUser = getUser();
  const isAdmin = currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER";

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Documents
  const [uploadCategory, setUploadCategory] = useState("BROCHURE");
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState("");

  // Admin Edit Modal
  const [openEditModal, setOpenEditModal] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [editForm, setEditForm] = useState({
    name: "",
    stage: "ONGOING" as "ONGOING" | "UPCOMING" | "COMPLETED",
    state: "Gujarat",
    city: "Vadodara",
    area: "",
    customArea: "",
    pincode: "",
    location: "",
    hasRera: false,
    reraNumber: "",
    penthouse: false,
    products: [] as Array<{
      type: string;
      customType: string;
      priceRange: string;
      areaSqFt: string;
      units: string | number;
      isPenthouse: boolean;
    }>,
    metaSources: [
      { pageName: "", pageId: "", formName: "", formId: "" },
    ],
  });

  async function load() {
    try {
      setLoading(true);
      setError("");
      const data = await api(`/business-projects/${projectId}`);
      setProject(data.project);
    } catch (err: any) {
      if (!isAuthError(err)) {
        setError(err?.message || "Failed to load project details.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (projectId) void load();
  }, [projectId]);

  function openEdit() {
    if (!project) return;
    const isComp = project.stage === "COMPLETED";
    const hasReraInit = isComp ? true : (project.hasRera ?? Boolean(project.reraNumber));
    setEditForm({
      name: project.name || "",
      stage: project.stage || "ONGOING",
      state: project.state || "Gujarat",
      city: project.city || "Vadodara",
      area: project.area || "",
      customArea: "",
      pincode: project.pincode || "",
      location: project.location || "",
      hasRera: hasReraInit,
      reraNumber: project.reraNumber || "",
      penthouse: project.penthouse || false,
      products: Array.isArray(project.products)
        ? project.products.map((p: any) => ({
            type: p.type || "OTHER",
            customType: p.customType || (p.type === "OTHER" ? "Custom Unit" : String(p.type).replace(/_/g, " ")),
            priceRange: p.priceRange || "",
            areaSqFt: p.areaSqFt || "",
            units: p.units !== undefined && p.units !== null ? p.units : "",
            isPenthouse: Boolean(p.isPenthouse),
          }))
        : [],
      metaSources:
        project.metaSources && project.metaSources.length > 0
          ? project.metaSources.map((m: any) => ({
              pageName: m.pageName || "",
              pageId: m.pageId || "",
              formName: m.formName || "",
              formId: m.formId || "",
            }))
          : [{ pageName: "", pageId: "", formName: "", formId: "" }],
    });
    setEditError("");
    setOpenEditModal(true);
  }

  function addProductToEdit(type: string) {
    const ranges = PRODUCT_PRICE_RANGES[type] || PRODUCT_PRICE_RANGES["OTHER"];
    setEditForm((prev) => ({
      ...prev,
      products: [
        ...prev.products,
        {
          type,
          customType: type === "OTHER" ? "Custom Unit" : type.replace(/_/g, " "),
          priceRange: ranges[0] || "",
          areaSqFt: "",
          units: "",
          isPenthouse: type === "PENTHOUSE",
        },
      ],
    }));
  }

  function removeProductFromEdit(index: number) {
    setEditForm((prev) => ({
      ...prev,
      products: prev.products.filter((_, i) => i !== index),
    }));
  }

  function addMetaSourceRow() {
    setEditForm((prev) => ({
      ...prev,
      metaSources: [
        ...prev.metaSources,
        { pageName: "", pageId: "", formName: "", formId: "" },
      ],
    }));
  }

  function removeMetaSourceRow(index: number) {
    setEditForm((prev) => ({
      ...prev,
      metaSources: prev.metaSources.filter((_, i) => i !== index),
    }));
  }

  function updateMetaSourceField(
    index: number,
    field: "pageName" | "pageId" | "formName" | "formId",
    value: string,
  ) {
    setEditForm((prev) => {
      const copy = [...prev.metaSources];
      copy[index] = { ...copy[index], [field]: value };
      return { ...prev, metaSources: copy };
    });
  }

  async function handleSaveEdit() {
    setEditError("");
    if (!editForm.name.trim()) {
      setEditError("Project name is required.");
      return;
    }

    const effectiveArea = editForm.area === "Other" ? editForm.customArea.trim() : editForm.area.trim();
    const calculatedLocation = editForm.location.trim() || [effectiveArea, editForm.city, editForm.state, editForm.pincode].filter(Boolean).join(", ");
    if (!calculatedLocation) {
      setEditError("Location or area is required.");
      return;
    }

    const isCompleted = editForm.stage === "COMPLETED";
    const isOngoing = editForm.stage === "ONGOING";
    const hasReraEffective = isCompleted ? true : (isOngoing ? Boolean(editForm.hasRera) : false);

    if (hasReraEffective && !editForm.reraNumber.trim()) {
      setEditError("Please enter the RERA Registration Number.");
      return;
    }

    const cleanMeta = editForm.metaSources
      .map((m) => ({
        pageName: m.pageName.trim(),
        pageId: m.pageId.trim(),
        formName: m.formName.trim(),
        formId: m.formId.trim(),
      }))
      .filter((m) => m.pageName || m.pageId || m.formName || m.formId);

    const productsToSubmit = (isCompleted || (isOngoing && hasReraEffective))
      ? editForm.products.map((p) => ({
          type: p.type,
          customType: p.customType || (p.type === "OTHER" ? "Custom Unit" : p.type.replace(/_/g, " ")),
          priceRange: p.priceRange || "",
          areaSqFt: p.areaSqFt ? p.areaSqFt.trim() : "",
          units: Number(p.units) > 0 ? Number(p.units) : undefined,
          isPenthouse: Boolean(p.isPenthouse),
        }))
      : [];

    try {
      setSavingEdit(true);
      await api(`/business-projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name.trim(),
          stage: editForm.stage,
          state: editForm.state || "Gujarat",
          city: editForm.city || undefined,
          area: effectiveArea,
          pincode: editForm.pincode.trim(),
          location: calculatedLocation,
          hasRera: hasReraEffective,
          reraNumber: hasReraEffective ? editForm.reraNumber.trim() : undefined,
          penthouse: editForm.penthouse || editForm.products.some((p) => p.isPenthouse),
          products: productsToSubmit,
          metaSources: cleanMeta,
        }),
      });

      setOpenEditModal(false);
      await load();
    } catch (err: any) {
      setEditError(err?.message || "Failed to update project.");
    } finally {
      setSavingEdit(false);
    }
  }

  // Upload S3 Document
  async function handleUploadDocument(file: File) {
    setDocError("");
    try {
      setUploadingDoc(true);
      const presign = await api(
        `/business-projects/${projectId}/documents/presign`,
        {
          method: "POST",
          body: JSON.stringify({
            name: file.name,
            contentType: file.type || "application/octet-stream",
            size: file.size,
          }),
        },
      );

      const uploadResponse = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("AWS S3 upload failed. Check the S3 bucket CORS configuration.");
      }

      await api(`/business-projects/${projectId}/documents`, {
        method: "POST",
        body: JSON.stringify({
          name: file.name,
          url: presign.objectUrl,
          storageKey: presign.key,
          category: uploadCategory,
          mimeType: file.type,
          size: file.size,
          isDemo: false,
        }),
      });

      await load();
    } catch (err: any) {
      setDocError(err?.message || "Unable to upload document.");
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleOpenDocument(doc: any) {
    try {
      const data = await api(
        `/business-projects/${projectId}/documents/${doc._id}/url`,
      );
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      setDocError(err?.message || "Unable to open document.");
    }
  }

  async function handleDeleteDocument(docId: string) {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    try {
      await api(`/business-projects/${projectId}/documents/${docId}`, {
        method: "DELETE",
      });
      await load();
    } catch (err: any) {
      setDocError(err?.message || "Failed to delete document.");
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs font-semibold text-slate-400">
        Loading project details...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <Topbar title="Project Not Found" subtitle="Project does not exist or access is restricted." />
        <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center text-sm font-semibold text-rose-600">
          {error || "Project profile not found."}
        </div>
      </div>
    );
  }

  const businessId = project.business?._id || project.business;
  const businessName = project.business?.name || project.developerGroup || "Business Group";

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Navigation */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <Link
            href={businessId ? `/business/${businessId}` : "/business"}
            className="inline-flex items-center gap-1.5 text-slate-600 hover:text-indigo-600 transition-colors"
          >
            <ArrowLeft size={13} />
            <span>{businessName}</span>
          </Link>
          <span>/</span>
          <span className="text-slate-900 font-bold">{project.name}</span>
        </div>

        <Topbar
          title={project.name}
          subtitle={`Full project specifications, unit inventory, Meta sync mappings, and document repository.`}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Main Project Overview Card */}
      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/50 via-white to-slate-50 p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white font-black text-sm shadow-sm">
              <Building2 size={22} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">{project.name}</h1>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                    project.stage === "ONGOING"
                      ? "bg-emerald-100 text-emerald-800"
                      : project.stage === "UPCOMING"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-purple-100 text-purple-800"
                  }`}
                >
                  {project.stage}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <MapPin size={13} className="text-slate-400" />
                <span>
                  {project.location ||
                    [project.area, project.city, project.state, project.pincode].filter(Boolean).join(", ") ||
                    "Location not specified"}
                </span>
                <span>·</span>
                <span>Part of {businessName}</span>
              </p>
            </div>
          </div>

          {/* ADMIN ONLY EDIT BUTTON */}
          {isAdmin && (
            <button
              onClick={openEdit}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all"
            >
              <Edit2 size={13} />
              <span>Edit Project Details</span>
            </button>
          )}
        </div>

        {/* Info Grid */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-white border border-slate-100 p-3 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              RERA Registration
            </span>
            <b className="mt-1 block text-xs font-bold text-slate-800 truncate">
              {project.stage === "UPCOMING"
                ? "N/A (Upcoming)"
                : project.reraNumber || "No RERA"}
            </b>
          </div>

          <div className="rounded-xl bg-white border border-slate-100 p-3 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Products Configured
            </span>
            <b className="mt-1 block text-xs font-bold text-indigo-700">
              {project.products?.length || 0} unit types
            </b>
          </div>

          <div className="rounded-xl bg-white border border-slate-100 p-3 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Meta Sync Mappings
            </span>
            <b className="mt-1 block text-xs font-bold text-slate-800">
              {project.metaSources?.length || 0} active sources
            </b>
          </div>

          <div className="rounded-xl bg-white border border-slate-100 p-3 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Documents Vault
            </span>
            <b className="mt-1 block text-xs font-bold text-slate-800">
              {project.documents?.length || 0} uploaded files
            </b>
          </div>
        </div>
      </section>

      {/* Product Configurations - Responsive Grid across screen sizes */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
              <Layers size={17} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Product Unit Inventory
                </h3>
                <span className="rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                  {project.products?.length || 0} configured
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Configured unit types, area specifications, and realistic price brackets.
              </p>
            </div>
          </div>
        </div>

        {project.stage === "UPCOMING" ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
            <Layers size={24} className="mx-auto text-slate-300 mb-2" />
            <p className="text-xs font-bold text-slate-700">Upcoming Project Stage</p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
              Product inventory is kept disabled for Upcoming projects and will unlock when moved to Ongoing or Completed stage.
            </p>
          </div>
        ) : project.products?.length > 0 ? (
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {project.products.map((prod: any, idx: number) => (
              <div
                key={idx}
                className="group relative flex flex-col justify-between rounded-xl border border-slate-200/80 bg-gradient-to-b from-slate-50/40 via-white to-white p-4 shadow-2xs hover:border-indigo-200 hover:shadow-xs transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="block text-xs font-bold text-slate-900 truncate">
                          {prod.customType || prod.type.replace(/_/g, " ")}
                        </span>
                        {prod.isPenthouse && (
                          <span className="rounded-full bg-purple-100 border border-purple-200 px-1.5 py-0.2 text-[9px] font-extrabold text-purple-700">
                            👑 Penthouse
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">
                        Unit Spec
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-indigo-50/70 border border-indigo-100/80 px-2.5 py-1.5">
                    <span className="block text-[10px] uppercase font-bold text-indigo-400">
                      Price Bracket
                    </span>
                    <span className="block text-xs font-bold text-indigo-700 truncate">
                      {prod.priceRange || "Price on request"}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-100 text-xs">
                  <div className="rounded-lg bg-slate-50/80 p-2 border border-slate-100">
                    <span className="block text-[9px] uppercase font-bold text-slate-400">Area</span>
                    <strong className="block text-slate-800 font-semibold truncate text-[11px]">
                      {prod.areaSqFt ? `${prod.areaSqFt} sq.ft` : "—"}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-slate-50/80 p-2 border border-slate-100">
                    <span className="block text-[9px] uppercase font-bold text-slate-400">Total Units</span>
                    <strong className="block text-slate-800 font-semibold truncate text-[11px]">
                      {prod.units ? `${prod.units} units` : "—"}
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
            <Layers size={22} className="mx-auto text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-500">No products configured yet.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Click "Edit Project Details" above to add product configurations.</p>
          </div>
        )}
      </section>

      {/* 2-Column Responsive Section: Left = Meta Sync Mappings, Right = Document Vault */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LEFT COLUMN: Meta Lead Sync Mappings */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                <Database size={17} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    Meta Lead Sync Mappings
                  </h3>
                  <span className="rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                    {project.metaSources?.length || 0}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Incoming webhook leads matching these Page and Form details are automatically mapped to this project.
                </p>
              </div>
            </div>
          </div>

          {project.metaSources?.length > 0 ? (
            <div className="space-y-3">
              {project.metaSources.map((ms: any, idx: number) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 space-y-2.5 shadow-2xs hover:border-indigo-200 transition-all"
                >
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Source #{idx + 1}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      <CheckCircle2 size={11} className="text-emerald-600" />
                      <span>Active Mapping</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="rounded-lg bg-white p-2.5 border border-slate-100 space-y-1">
                      <span className="block text-[10px] uppercase font-bold text-slate-400">
                        Page Name
                      </span>
                      <strong className="block truncate text-slate-900 font-semibold">
                        {ms.pageName || "—"}
                      </strong>
                      <div className="pt-1">
                        <span className="block text-[9px] uppercase font-bold text-slate-400">Page ID</span>
                        <span className="block truncate text-slate-600 font-mono text-[11px] bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                          {ms.pageId || "—"}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg bg-white p-2.5 border border-slate-100 space-y-1">
                      <span className="block text-[10px] uppercase font-bold text-slate-400">
                        Form Name
                      </span>
                      <strong className="block truncate text-slate-900 font-semibold">
                        {ms.formName || "—"}
                      </strong>
                      <div className="pt-1">
                        <span className="block text-[9px] uppercase font-bold text-slate-400">Form ID</span>
                        <span className="block truncate text-slate-600 font-mono text-[11px] bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                          {ms.formId || "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
              <Database size={22} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs font-semibold text-slate-500">No Meta mappings configured</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                Incoming webhook leads without mapped Page/Form IDs will default to the business general pool.
              </p>
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: Project Document Repository */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                <FileText size={17} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    Project Documents
                  </h3>
                  <span className="rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                    {project.documents?.length || 0}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Brochures, price sheets, floor plans, and amenities on AWS S3.
                </p>
              </div>
            </div>

            {isAdmin && project.stage !== "UPCOMING" && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-indigo-500 shadow-2xs"
                >
                  {documentCategories.map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>

                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-[0.98] transition-all">
                  <Upload size={13} />
                  <span>{uploadingDoc ? "Uploading..." : "Upload"}</span>
                  <input
                    type="file"
                    disabled={uploadingDoc}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUploadDocument(file);
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>

          {docError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
              {docError}
            </div>
          )}

          {project.stage === "UPCOMING" ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
              <FileText size={24} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs font-bold text-slate-700">Documents Disabled</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                Document repository is disabled for Upcoming projects until transitioned to Ongoing or Completed stage.
              </p>
            </div>
          ) : project.documents?.length > 0 ? (
            <div className="space-y-2.5">
              {project.documents.map((doc: any) => (
                <div
                  key={doc._id}
                  className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs hover:border-indigo-200 transition-all gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                      <FileText size={16} />
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate text-xs font-bold text-slate-900">
                        {doc.name}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <span className="font-semibold uppercase tracking-wider text-slate-500">
                          {doc.category?.replace(/_/g, " ")}
                        </span>
                        <span>·</span>
                        <span>{doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : "Uploaded"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleOpenDocument(doc)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                    >
                      <ExternalLink size={12} />
                      <span>Open</span>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteDocument(doc._id)}
                        title="Delete document"
                        className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
              <FileText size={22} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs font-semibold text-slate-500">No documents uploaded yet</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                Upload brochures, price sheets, or floor plans to share with your sales staff.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ADMIN EDIT PROJECT MODAL */}
      {openEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Edit2 size={16} className="text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Edit Project Details (Admin)
                </h3>
              </div>
              <button
                onClick={() => setOpenEditModal(false)}
                className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
              {editError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                  {editError}
                </div>
              )}

              {/* Stage Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Stage
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["UPCOMING", "ONGOING", "COMPLETED"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() =>
                        setEditForm((prev) => ({
                          ...prev,
                          stage: st,
                          hasRera: st === "COMPLETED" ? true : st === "UPCOMING" ? false : prev.hasRera,
                          reraNumber: st === "UPCOMING" ? "" : prev.reraNumber,
                          products: st === "UPCOMING" || (st === "ONGOING" && !prev.hasRera) ? [] : prev.products,
                        }))
                      }
                      className={`rounded-xl border p-2.5 text-center text-xs font-bold uppercase transition-all ${
                        editForm.stage === st
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/20"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Project Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-800 focus:border-indigo-500"
                />
              </div>

              {/* Location Picker (State, City, Predefined Area, Pincode) */}
              <LocationPicker
                state={editForm.state}
                city={editForm.city}
                area={editForm.area}
                customArea={editForm.customArea}
                pincode={editForm.pincode}
                onChange={(patch) =>
                  setEditForm((prev) => ({
                    ...prev,
                    ...patch,
                    location: [
                      patch.area !== undefined ? (patch.area === "Other" ? patch.customArea ?? prev.customArea : patch.area) : (prev.area === "Other" ? prev.customArea : prev.area),
                      patch.city ?? prev.city,
                      patch.state ?? prev.state,
                      patch.pincode ?? prev.pincode,
                    ]
                      .filter(Boolean)
                      .join(", "),
                  }))
                }
              />

              {/* Upcoming Notice */}
              {editForm.stage === "UPCOMING" && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <Sparkles size={14} className="text-blue-600" />
                    <span>Upcoming Project Phase</span>
                  </div>
                  <p className="text-[11px] text-blue-700">
                    RERA certification, product unit configurations, and documents are kept disabled for Upcoming projects.
                  </p>
                </div>
              )}

              {/* ONGOING: RERA Yes / No Option */}
              {editForm.stage === "ONGOING" && (
                <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/40">
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1.5">
                      RERA Approved? <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setEditForm((prev) => ({
                            ...prev,
                            hasRera: true,
                          }))
                        }
                        className={`flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-bold transition-all border ${
                          editForm.hasRera
                            ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <CheckCircle2
                          size={14}
                          className={editForm.hasRera ? "text-emerald-600" : "text-slate-400"}
                        />
                        <span>Yes (RERA Approved)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setEditForm((prev) => ({
                            ...prev,
                            hasRera: false,
                            reraNumber: "",
                            products: [],
                          }))
                        }
                        className={`flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-bold transition-all border ${
                          !editForm.hasRera
                            ? "border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <X
                          size={14}
                          className={!editForm.hasRera ? "text-amber-600" : "text-slate-400"}
                        />
                        <span>No (Non-RERA)</span>
                      </button>
                    </div>
                  </div>

                  {editForm.hasRera ? (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        RERA Registration Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={editForm.reraNumber}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            reraNumber: e.target.value,
                          }))
                        }
                        placeholder="e.g. PR/GJ/VADODARA/Others/RAA09876/010126"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800"
                      />
                    </div>
                  ) : (
                    null
                  )}
                </div>
              )}

              {/* COMPLETED: RERA Registration Details */}
              {editForm.stage === "COMPLETED" && (
                <div className="rounded-xl border border-purple-200 p-4 space-y-3 bg-purple-50/30">
                  <div className="flex items-center gap-2 text-xs font-bold text-purple-900">
                    <CheckCircle2 size={16} className="text-purple-600" />
                    <span>RERA Registration (Completed Project)</span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      RERA Registration Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editForm.reraNumber}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          reraNumber: e.target.value,
                        }))
                      }
                      placeholder="e.g. PR/GJ/VADODARA/Others/RAA09876/010126"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800"
                    />
                  </div>
                </div>
              )}

              {/* Products & Unit Configurations */}
              {(editForm.stage === "COMPLETED" || (editForm.stage === "ONGOING" && editForm.hasRera)) && (
                <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        Products & Unit Configurations ({editForm.products.length})
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Add unit types with price range brackets, area (sq.ft), units, and penthouse status.
                      </p>
                    </div>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          addProductToEdit(e.target.value);
                          e.target.value = "";
                        }
                      }}
                      defaultValue=""
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700"
                    >
                      <option value="" disabled>
                        + Add Product Type
                      </option>
                      {Object.keys(PRODUCT_PRICE_RANGES).map((k) => (
                        <option key={k} value={k}>
                          {k.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </div>

                  {editForm.products.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                        Add Product Type above to select units (1BHK, 2BHK, 3BHK, Showroom, Office, etc.).
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {editForm.products.map((prod, idx) => {
                        const availableRanges =
                          PRODUCT_PRICE_RANGES[prod.type] || PRODUCT_PRICE_RANGES["OTHER"];

                        return (
                          <div
                            key={idx}
                            className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-2.5"
                          >
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-900">
                                  {prod.customType || prod.type}
                                </span>
                                {prod.isPenthouse && (
                                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-extrabold text-purple-700">
                                    👑 Penthouse
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeProductFromEdit(idx)}
                                className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                title="Remove unit"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                              {/* 1. Price Range */}
                              <div>
                                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                                  Price Range
                                </label>
                                <select
                                  value={prod.priceRange}
                                  onChange={(e) => {
                                    const updated = [...editForm.products];
                                    updated[idx].priceRange = e.target.value;
                                    setEditForm((prev) => ({
                                      ...prev,
                                      products: updated,
                                    }));
                                  }}
                                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-800"
                                >
                                  {availableRanges.map((rangeStr) => (
                                    <option key={rangeStr} value={rangeStr}>
                                      {rangeStr}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* 2. Area / sq.ft */}
                              <div>
                                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                                  Area / sq.ft
                                </label>
                                <input
                                  type="text"
                                  value={prod.areaSqFt}
                                  onChange={(e) => {
                                    const updated = [...editForm.products];
                                    updated[idx].areaSqFt = e.target.value;
                                    setEditForm((prev) => ({
                                      ...prev,
                                      products: updated,
                                    }));
                                  }}
                                  placeholder="e.g. 650 or 850-1100"
                                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-500"
                                />
                              </div>

                              {/* 3. Units */}
                              <div>
                                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                                  Total Units
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={prod.units}
                                  onChange={(e) => {
                                    const updated = [...editForm.products];
                                    updated[idx].units = e.target.value;
                                    setEditForm((prev) => ({
                                      ...prev,
                                      products: updated,
                                    }));
                                  }}
                                  placeholder="e.g. 24"
                                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-500"
                                />
                              </div>

                              {/* 4. Penthouse (Yes / No) */}
                              <div>
                                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                                  Penthouse?
                                </label>
                                <div className="grid grid-cols-2 gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...editForm.products];
                                      updated[idx].isPenthouse = true;
                                      setEditForm((prev) => ({
                                        ...prev,
                                        products: updated,
                                      }));
                                    }}
                                    className={`rounded-lg py-1.5 text-center text-xs font-bold transition-all border ${
                                      prod.isPenthouse
                                        ? "border-purple-500 bg-purple-50 text-purple-700 ring-1 ring-purple-500/20"
                                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                                    }`}
                                  >
                                    Yes
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...editForm.products];
                                      updated[idx].isPenthouse = false;
                                      setEditForm((prev) => ({
                                        ...prev,
                                        products: updated,
                                      }));
                                    }}
                                    className={`rounded-lg py-1.5 text-center text-xs font-bold transition-all border ${
                                      !prod.isPenthouse
                                        ? "border-slate-400 bg-slate-100 text-slate-800 font-bold"
                                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                                    }`}
                                  >
                                    No
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Meta Mappings (Strictly Page Name, Page ID, Form Name, Form ID) */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/30">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Database size={14} className="text-indigo-600" />
                      <span>Meta Lead Sync Mappings</span>
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={addMetaSourceRow}
                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700"
                  >
                    <Plus size={12} /> Add Mapping
                  </button>
                </div>

                <div className="space-y-3">
                  {editForm.metaSources.map((ms, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 relative"
                    >
                      <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                        <span className="text-[10px] font-bold uppercase text-slate-400">
                          Mapping #{idx + 1}
                        </span>
                        {editForm.metaSources.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMetaSourceRow(idx)}
                            className="text-slate-400 hover:text-rose-600 text-xs"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            Page Name
                          </label>
                          <input
                            type="text"
                            value={ms.pageName}
                            onChange={(e) =>
                              updateMetaSourceField(idx, "pageName", e.target.value)
                            }
                            placeholder="Baroda Business Park"
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            Page ID
                          </label>
                          <input
                            type="text"
                            value={ms.pageId}
                            onChange={(e) =>
                              updateMetaSourceField(idx, "pageId", e.target.value)
                            }
                            placeholder="1206344412560695"
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            Form Name
                          </label>
                          <input
                            type="text"
                            value={ms.formName}
                            onChange={(e) =>
                              updateMetaSourceField(idx, "formName", e.target.value)
                            }
                            placeholder="BBP - 09-07-26-V2"
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            Form ID
                          </label>
                          <input
                            type="text"
                            value={ms.formId}
                            onChange={(e) =>
                              updateMetaSourceField(idx, "formId", e.target.value)
                            }
                            placeholder="1021954890458488"
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setOpenEditModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingEdit}
                onClick={handleSaveEdit}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingEdit ? "Saving..." : "Save Project Details"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

