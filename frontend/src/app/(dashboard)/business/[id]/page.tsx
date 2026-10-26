"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Topbar from "../../../../components/Topbar";
import { api } from "../../../../lib/api";
import { getUser, isAuthError } from "../../../../lib/auth";
import {
  Building2,
  Plus,
  Search,
  X,
  Phone,
  ShieldCheck,
  Key,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  MapPin,
  FileText,
  Upload,
  ExternalLink,
  Trash2,
  Database,
} from "lucide-react";

// Categorized Realistic Price Ranges (Preset brackets - No manual typing)
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
  STUDIO: ["₹15 Lakh – ₹25 Lakh", "₹25 Lakh – ₹40 Lakh", "₹40 Lakh – ₹60 Lakh"],
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

export default function BusinessDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const businessId = params.id;
  const currentUser = getUser();
  const isAdmin =
    currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER";
  const canManage = isAdmin || currentUser?.role === "BUSINESS";

  const [business, setBusiness] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [businessAdmin, setBusinessAdmin] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Projects filter and search
  const [stageFilter, setStageFilter] = useState<
    "ALL" | "ONGOING" | "UPCOMING" | "COMPLETED"
  >("ALL");
  const [projectSearch, setProjectSearch] = useState("");

  // Modal: Add Project
  const [openAddProject, setOpenAddProject] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const [addProjectError, setAddProjectError] = useState("");
  const [projectForm, setProjectForm] = useState({
    name: "",
    stage: "ONGOING" as "ONGOING" | "UPCOMING" | "COMPLETED",
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
    metaSources: [{ pageName: "", pageId: "", formName: "", formId: "" }],
  });

  // Modal: Change Stage
  const [stageModalProject, setStageModalProject] = useState<any | null>(null);
  const [newStage, setNewStage] = useState<
    "ONGOING" | "UPCOMING" | "COMPLETED"
  >("ONGOING");
  const [transitionRera, setTransitionRera] = useState("");
  const [transitionProducts, setTransitionProducts] = useState<any[]>([]);
  const [savingStage, setSavingStage] = useState(false);
  const [stageError, setStageError] = useState("");

  // Drawer / Modal: Project Details & Documents
  const [activeProject, setActiveProject] = useState<any | null>(null);
  const [uploadCategory, setUploadCategory] = useState("BROCHURE");
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState("");
  const [deleteDocTarget, setDeleteDocTarget] = useState<any | null>(null);

  // Modal: Delete Project
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<any | null>(
    null,
  );
  const [deletingProject, setDeletingProject] = useState(false);

  // Modal: Business Admin Password
  const [openPasswordModal, setOpenPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  // Modal: Create Business Admin Login
  const [openCreateAdminModal, setOpenCreateAdminModal] = useState(false);
  const [adminLoginForm, setAdminLoginForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [savingAdminLogin, setSavingAdminLogin] = useState(false);
  const [adminLoginError, setAdminLoginError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const data = await api(`/businesses/${businessId}`);
      setBusiness(data.business);
      setProjects(data.business?.projects || []);
      setBusinessAdmin(data.business?.businessAdmin || null);
    } catch (err: any) {
      if (!isAuthError(err)) {
        setError(err?.message || "Failed to load business details.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (businessId) void load();
  }, [businessId]);

  // Project Stage stats
  const projectStats = useMemo(() => {
    let ongoing = 0;
    let upcoming = 0;
    let completed = 0;
    for (const p of projects) {
      if (p.stage === "ONGOING") ongoing++;
      else if (p.stage === "UPCOMING") upcoming++;
      else if (p.stage === "COMPLETED") completed++;
    }
    return { total: projects.length, ongoing, upcoming, completed };
  }, [projects]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (stageFilter !== "ALL" && p.stage !== stageFilter) return false;
      if (projectSearch.trim()) {
        const q = projectSearch.toLowerCase();
        const matchName = p.name?.toLowerCase().includes(q);
        const matchLoc = p.location?.toLowerCase().includes(q);
        const matchRera = p.reraNumber?.toLowerCase().includes(q);
        return matchName || matchLoc || matchRera;
      }
      return true;
    });
  }, [projects, stageFilter, projectSearch]);

  // Open Add Project Modal
  function handleOpenAddProject() {
    setProjectForm({
      name: "",
      stage: "ONGOING",
      location: "",
      hasRera: false,
      reraNumber: "",
      penthouse: false,
      products: [],
      metaSources: [{ pageName: "", pageId: "", formName: "", formId: "" }],
    });
    setAddProjectError("");
    setOpenAddProject(true);
  }

  // Add Product to Form
  function addProductToForm(type: string) {
    const ranges = PRODUCT_PRICE_RANGES[type] || PRODUCT_PRICE_RANGES["OTHER"];
    setProjectForm((prev) => ({
      ...prev,
      products: [
        ...prev.products,
        {
          type,
          customType:
            type === "OTHER" ? "Custom Unit" : type.replace(/_/g, " "),
          priceRange: ranges[0] || "",
          areaSqFt: "",
          units: "",
          isPenthouse: type === "PENTHOUSE",
        },
      ],
    }));
  }

  function removeProductFromForm(index: number) {
    setProjectForm((prev) => ({
      ...prev,
      products: prev.products.filter((_, i) => i !== index),
    }));
  }

  // Meta Mapping helpers
  function addMetaSourceRow() {
    setProjectForm((prev) => ({
      ...prev,
      metaSources: [
        ...prev.metaSources,
        { pageName: "", pageId: "", formName: "", formId: "" },
      ],
    }));
  }

  function removeMetaSourceRow(index: number) {
    setProjectForm((prev) => ({
      ...prev,
      metaSources: prev.metaSources.filter((_, i) => i !== index),
    }));
  }

  function updateMetaSourceField(
    index: number,
    field: "pageName" | "pageId" | "formName" | "formId",
    value: string,
  ) {
    setProjectForm((prev) => {
      const copy = [...prev.metaSources];
      copy[index] = { ...copy[index], [field]: value };
      return { ...prev, metaSources: copy };
    });
  }

  // Handle Create Project
  async function handleCreateProject() {
    setAddProjectError("");
    if (!projectForm.name.trim()) {
      setAddProjectError("Project name is required.");
      return;
    }
    if (!projectForm.location.trim()) {
      setAddProjectError("Project location is required.");
      return;
    }

    const isCompleted = projectForm.stage === "COMPLETED";
    const isOngoing = projectForm.stage === "ONGOING";
    const hasReraEffective = isCompleted
      ? true
      : isOngoing
        ? Boolean(projectForm.hasRera)
        : false;

    if (hasReraEffective && !projectForm.reraNumber.trim()) {
      setAddProjectError("Please enter the RERA Registration Number.");
      return;
    }

    // Clean meta mappings: ONLY keep non-empty entries with pageName, pageId, formName, formId
    const cleanMetaSources = projectForm.metaSources
      .map((m) => ({
        pageName: m.pageName.trim(),
        pageId: m.pageId.trim(),
        formName: m.formName.trim(),
        formId: m.formId.trim(),
      }))
      .filter((m) => m.pageName || m.pageId || m.formName || m.formId);

    const productsToSubmit =
      isCompleted || (isOngoing && hasReraEffective)
        ? projectForm.products.map((p) => ({
            type: p.type,
            customType:
              p.customType ||
              (p.type === "OTHER" ? "Custom Unit" : p.type.replace(/_/g, " ")),
            priceRange: p.priceRange || "",
            areaSqFt: p.areaSqFt ? p.areaSqFt.trim() : "",
            units: Number(p.units) > 0 ? Number(p.units) : undefined,
            isPenthouse: Boolean(p.isPenthouse),
          }))
        : [];

    try {
      setAddingProject(true);
      await api("/business-projects", {
        method: "POST",
        body: JSON.stringify({
          business: businessId,
          name: projectForm.name.trim(),
          stage: projectForm.stage,
          location: projectForm.location.trim(),
          developerGroup: business?.name,
          hasRera: hasReraEffective,
          reraNumber: hasReraEffective
            ? projectForm.reraNumber.trim()
            : undefined,
          penthouse:
            projectForm.penthouse ||
            projectForm.products.some((p) => p.isPenthouse),
          products: productsToSubmit,
          metaSources: cleanMetaSources,
        }),
      });

      setOpenAddProject(false);
      await load();
    } catch (err: any) {
      setAddProjectError(err?.message || "Failed to create project.");
    } finally {
      setAddingProject(false);
    }
  }

  // Open Stage Modal
  function openChangeStage(p: any) {
    setStageModalProject(p);
    setNewStage(p.stage);
    setTransitionRera(p.reraNumber || "");
    setTransitionProducts(p.products || []);
    setStageError("");
  }

  async function handleSaveStage() {
    if (!stageModalProject) return;
    setStageError("");

    if (newStage !== "UPCOMING" && stageModalProject.stage === "UPCOMING") {
      if (transitionRera.trim() === "" && stageModalProject.hasRera) {
        setStageError(
          "RERA number is recommended when moving to Ongoing or Completed.",
        );
      }
    }

    try {
      setSavingStage(true);
      await api(`/business-projects/${stageModalProject._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          stage: newStage,
          reraNumber: transitionRera.trim() || undefined,
          hasRera: Boolean(transitionRera.trim()),
          products: transitionProducts,
        }),
      });

      setStageModalProject(null);
      await load();
    } catch (err: any) {
      setStageError(err?.message || "Failed to update project stage.");
    } finally {
      setSavingStage(false);
    }
  }

  // Upload S3 Document to activeProject
  async function handleUploadDocument(file: File) {
    if (!activeProject) return;
    setDocError("");

    try {
      setUploadingDoc(true);

      const presign = await api(
        `/business-projects/${activeProject._id}/documents/presign`,
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
        throw new Error(
          "AWS S3 upload failed. Check the S3 bucket CORS configuration.",
        );
      }

      const res = await api(
        `/business-projects/${activeProject._id}/documents`,
        {
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
        },
      );

      setActiveProject(res.project);
      await load();
    } catch (err: any) {
      setDocError(err?.message || "Unable to upload document.");
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleOpenDocument(doc: any) {
    if (!activeProject) return;
    try {
      const data = await api(
        `/business-projects/${activeProject._id}/documents/${doc._id}/url`,
      );
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      setDocError(err?.message || "Unable to open document.");
    }
  }

  async function handleDeleteDocument(doc: any) {
    if (!activeProject || !doc) return;
    try {
      await api(
        `/business-projects/${activeProject._id}/documents/${doc._id}`,
        { method: "DELETE" },
      );
      setDeleteDocTarget(null);
      const updated = await api(`/business-projects/${activeProject._id}`);
      setActiveProject(updated.project);
      await load();
    } catch (err: any) {
      setDocError(err?.message || "Failed to delete document.");
    }
  }

  // Delete Project
  async function handleConfirmDeleteProject() {
    if (!deleteProjectTarget) return;
    try {
      setDeletingProject(true);
      await api(`/business-projects/${deleteProjectTarget._id}`, {
        method: "DELETE",
      });
      setDeleteProjectTarget(null);
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to delete project.");
    } finally {
      setDeletingProject(false);
    }
  }

  // Business Admin Password Change
  async function handleSaveAdminPassword() {
    setPasswordError("");
    setPasswordSuccess("");

    if (!newPassword || newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    try {
      setSavingPassword(true);
      await api(`/businesses/${businessId}/admin-password`, {
        method: "PATCH",
        body: JSON.stringify({ password: newPassword }),
      });

      setPasswordSuccess("Password successfully updated!");
      setTimeout(() => {
        setOpenPasswordModal(false);
        setPasswordSuccess("");
      }, 1200);
    } catch (err: any) {
      setPasswordError(err?.message || "Failed to change password.");
    } finally {
      setSavingPassword(false);
    }
  }

  // Create Business Admin Login
  async function handleCreateAdminLogin() {
    setAdminLoginError("");
    if (!adminLoginForm.email.trim()) {
      setAdminLoginError("Email is required.");
      return;
    }
    if (!adminLoginForm.password || adminLoginForm.password.length < 8) {
      setAdminLoginError("Password must be at least 8 characters.");
      return;
    }

    try {
      setSavingAdminLogin(true);
      await api(`/businesses/${businessId}/admin-user`, {
        method: "POST",
        body: JSON.stringify({
          name: adminLoginForm.name.trim() || `${business?.name} Admin`,
          email: adminLoginForm.email.trim().toLowerCase(),
          password: adminLoginForm.password,
        }),
      });

      setOpenCreateAdminModal(false);
      await load();
    } catch (err: any) {
      setAdminLoginError(err?.message || "Failed to configure business login.");
    } finally {
      setSavingAdminLogin(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs font-semibold text-slate-400">
        Loading business details...
      </div>
    );
  }

  if (!business) {
    return (
      <div className="space-y-4">
        <Topbar
          title="Business Not Found"
          subtitle="Business could not be found or access is restricted."
        />
        <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center text-sm font-semibold text-rose-600">
          {error || "Business profile does not exist."}
        </div>
      </div>
    );
  }

  const quotaBadge =
    business.leadLimitType === "DAILY"
      ? `${business.leadLimit} / day`
      : business.leadLimitType === "MONTHLY"
        ? `${business.leadLimit} / month`
        : "Unlimited";

  return (
    <div className="space-y-6">
      {/* Topbar & Breadcrumb */}
      <div className="space-y-3">
       <Topbar
          title={business.name}
          subtitle={`Business portfolio overview, projects inventory, Meta mappings, and sales staff access.`}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Business Executive Overview Card */}
      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 via-white to-slate-50 p-5 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white font-black text-sm shadow-sm">
              {business.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">
                  {business.name}
                </h1>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    business.isActive
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {business.isActive ? "Active Developer" : "Inactive"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600 max-w-2xl">
                {business.detail || "No additional description provided."}
              </p>
              {business.contactNo && (
                <p className="mt-2 text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Phone size={13} className="text-indigo-600" />
                  <span>{business.contactNo}</span>
                </p>
              )}
            </div>
          </div>

          {/* Business Admin Account Info Card */}
          <div className="shrink-0 rounded-xl border border-indigo-100 bg-white p-3.5 shadow-xs min-w-[260px]">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Business Admin Login
              </span>
              <ShieldCheck size={14} className="text-indigo-600" />
            </div>

            {businessAdmin ? (
              <div className="space-y-1">
                <span className="block truncate font-bold text-slate-900 text-xs">
                  {businessAdmin.email}
                </span>
                <div className="flex items-center justify-between pt-1">
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                    <CheckCircle2 size={10} /> Active Partner Login
                  </span>
                  {canManage && (
                    <button
                      onClick={() => {
                        setNewPassword("");
                        setConfirmPassword("");
                        setPasswordError("");
                        setPasswordSuccess("");
                        setOpenPasswordModal(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                    >
                      <Key size={11} /> Change Password
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <span className="block text-xs text-slate-400">
                  Not configured yet
                </span>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setAdminLoginForm({
                        name: `${business.name} Admin`,
                        email: "",
                        password: "",
                      });
                      setAdminLoginError("");
                      setOpenCreateAdminModal(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-indigo-700 transition-colors"
                  >
                    <UserPlus size={12} /> Create Login
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Counter Pills */}
        <div
          className={`mt-5 grid grid-cols-2 gap-3 ${isAdmin ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}
        >
          <div className="rounded-xl bg-white border border-slate-100 p-3 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Total Projects
            </span>
            <b className="mt-1 block text-lg font-black text-slate-900">
              {projectStats.total}
            </b>
          </div>

          <div className="rounded-xl bg-white border border-slate-100 p-3 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
              Ongoing Projects
            </span>
            <b className="mt-1 block text-lg font-black text-emerald-600">
              {projectStats.ongoing}
            </b>
          </div>

          <div className="rounded-xl bg-white border border-slate-100 p-3 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
              Upcoming Projects
            </span>
            <b className="mt-1 block text-lg font-black text-blue-600">
              {projectStats.upcoming}
            </b>
          </div>

          {isAdmin && (
            <div className="rounded-xl bg-white border border-slate-100 p-3 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Lead Allocation
              </span>
              <b className="mt-1 block text-sm font-bold text-slate-800">
                {quotaBadge}
              </b>
            </div>
          )}
        </div>
      </section>

      {/* Projects Portfolio Section */}
      <section className="space-y-4">
        {/* Controls Bar */}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
              <Search
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Search project name, location, RERA..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-3.5 py-2 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              {projectSearch && (
                <button
                  onClick={() => setProjectSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Stage Filter Pills */}
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/70 p-1">
              {(["ALL", "ONGOING", "UPCOMING", "COMPLETED"] as const).map(
                (s) => (
                  <button
                    key={s}
                    onClick={() => setStageFilter(s)}
                    className={`rounded-lg px-3 py-1 text-[11px] font-bold transition-all ${
                      stageFilter === s
                        ? "bg-white text-indigo-700 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {s === "ALL"
                      ? "All"
                      : s.charAt(0) + s.slice(1).toLowerCase()}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Add Project Button (ADMIN ONLY) */}
          {isAdmin && (
            <button
              onClick={handleOpenAddProject}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all"
            >
              <Plus size={15} />
              <span>Add Project</span>
            </button>
          )}
        </div>

        {/* Projects Listing */}
        {filteredProjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <Building2 size={32} className="mx-auto text-slate-300" />
            <h3 className="mt-3 text-sm font-bold text-slate-800">
              No projects found
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              {projectSearch
                ? "No projects match your filter."
                : "No projects created under this business yet."}
            </p>
            {isAdmin && (
              <button
                onClick={handleOpenAddProject}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                <Plus size={14} /> Add First Project
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View (>= lg) */}
            <div className="hidden lg:block overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 px-5">Project & Location</th>
                    <th className="py-3.5 px-4">Stage</th>
                    <th className="py-3.5 px-4">RERA Status</th>
                    <th className="py-3.5 px-4">Products & Price Ranges</th>
                    <th className="py-3.5 px-4">Meta Mappings</th>
                    <th className="py-3.5 px-4">Docs</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredProjects.map((p) => {
                    const stageColor =
                      p.stage === "ONGOING"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : p.stage === "UPCOMING"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-purple-50 text-purple-700 border-purple-200";

                    return (
                      <tr
                        key={p._id}
                        className="hover:bg-slate-50/60 transition-colors"
                      >
                        {/* Name & Location */}
                        <td className="py-4 px-5">
                          <div className="flex items-start gap-3">
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
                              <Building2 size={16} />
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/business/projects/${p._id}`}
                                className="font-bold text-slate-900 hover:text-indigo-600 text-left block"
                              >
                                {p.name}
                              </Link>
                              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                                <MapPin size={11} className="text-slate-400" />
                                {p.location || "Location not specified"}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Stage */}
                        <td className="py-4 px-4">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${stageColor}`}
                          >
                            {p.stage}
                          </span>
                        </td>

                        {/* RERA */}
                        <td className="py-4 px-4">
                          {p.stage === "UPCOMING" ? (
                            <span className="text-[11px] text-slate-400 font-medium">
                              N/A (Upcoming)
                            </span>
                          ) : p.reraNumber ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-800">
                              <CheckCircle2
                                size={11}
                                className="text-emerald-600"
                              />
                              {p.reraNumber}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              No RERA
                            </span>
                          )}
                        </td>

                        {/* Products */}
                        <td className="py-4 px-4">
                          {p.stage === "UPCOMING" ? (
                            <span className="text-[11px] text-slate-400 font-medium">
                              Configured upon launch
                            </span>
                          ) : p.products?.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {p.products
                                .slice(0, 2)
                                .map((prod: any, idx: number) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center rounded-md bg-indigo-50/70 border border-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700"
                                  >
                                    {prod.customType || prod.type}:{" "}
                                    {prod.priceRange}
                                  </span>
                                ))}
                              {p.products.length > 2 && (
                                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                                  +{p.products.length - 2} more
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">
                              No products
                            </span>
                          )}
                        </td>

                        {/* Meta Mappings */}
                        <td className="py-4 px-4">
                          {p.metaSources?.length > 0 ? (
                            <div className="space-y-1">
                              {p.metaSources
                                .slice(0, 1)
                                .map((m: any, idx: number) => (
                                  <div
                                    key={idx}
                                    className="flex flex-col text-[11px]"
                                  >
                                    {m.pageName && (
                                      <span className="font-bold text-slate-800 truncate max-w-[150px]">
                                        {m.pageName}
                                      </span>
                                    )}
                                    {m.formName && (
                                      <span className="text-[10px] text-slate-500 truncate max-w-[150px]">
                                        Form: {m.formName}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              {p.metaSources.length > 1 && (
                                <span className="text-[10px] font-semibold text-indigo-600">
                                  +{p.metaSources.length - 1} more mappings
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">
                              None mapped
                            </span>
                          )}
                        </td>

                        {/* Documents */}
                        <td className="py-4 px-4">
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                            <FileText size={13} className="text-slate-400" />
                            {p.documents?.length || 0}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-5 text-right">
                          <div className="inline-flex items-center gap-2">
                            {isAdmin && (
                              <button
                                onClick={() => openChangeStage(p)}
                                className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
                              >
                                Change Stage
                              </button>
                            )}
                            <Link
                              href={`/business/projects/${p._id}`}
                              className="rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 shadow-xs"
                            >
                              View Details
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile / Tablet Cards View (< lg) */}
            <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
              {filteredProjects.map((p) => {
                const stageColor =
                  p.stage === "ONGOING"
                    ? "bg-emerald-50 text-emerald-700"
                    : p.stage === "UPCOMING"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-purple-50 text-purple-700";

                return (
                  <div
                    key={p._id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
                  >
                    <div>
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/business/projects/${p._id}`}
                            className="font-bold text-slate-900 text-sm hover:text-indigo-600 text-left block truncate"
                          >
                            {p.name}
                          </Link>
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                            <MapPin size={11} className="text-slate-400" />
                            {p.location || "Location not added"}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${stageColor}`}
                        >
                          {p.stage}
                        </span>
                      </div>

                      {/* Info grid */}
                      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-[11px]">
                        <div>
                          <span className="block text-[10px] font-bold uppercase text-slate-400">
                            RERA Status
                          </span>
                          <strong className="mt-0.5 block truncate font-bold text-slate-800">
                            {p.stage === "UPCOMING"
                              ? "N/A (Upcoming)"
                              : p.reraNumber || "No RERA"}
                          </strong>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold uppercase text-slate-400">
                            Documents
                          </span>
                          <strong className="mt-0.5 block font-bold text-slate-800">
                            {p.documents?.length || 0} files
                          </strong>
                        </div>
                      </div>

                      {/* Products preview */}
                      {p.products?.length > 0 && p.stage !== "UPCOMING" && (
                        <div className="mt-3">
                          <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Products
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {p.products
                              .slice(0, 3)
                              .map((prod: any, idx: number) => (
                                <span
                                  key={idx}
                                  className="rounded-md bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700"
                                >
                                  {prod.customType || prod.type}:{" "}
                                  {prod.priceRange}
                                </span>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Meta Mappings Preview */}
                      {p.metaSources?.length > 0 && (
                        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                          <span className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                            Meta Sync Mapping
                          </span>
                          <span className="block truncate text-xs font-bold text-slate-800">
                            {p.metaSources[0].pageName || "Mapped Page"}
                          </span>
                          {p.metaSources[0].formName && (
                            <span className="block truncate text-[10px] text-slate-500">
                              Form: {p.metaSources[0].formName}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      {isAdmin && (
                        <button
                          onClick={() => openChangeStage(p)}
                          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Change Stage
                        </button>
                      )}
                      <Link
                        href={`/business/projects/${p._id}`}
                        className="flex-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 text-center shadow-xs"
                      >
                        View Details
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* MODAL: ADD PROJECT */}
      {openAddProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Add Project to {business.name}
                </h3>
              </div>
              <button
                onClick={() => setOpenAddProject(false)}
                className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
              {addProjectError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                  {addProjectError}
                </div>
              )}

              {/* Stage Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Project Stage <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["UPCOMING", "ONGOING", "COMPLETED"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() =>
                        setProjectForm((prev) => ({
                          ...prev,
                          stage: st,
                          hasRera:
                            st === "COMPLETED"
                              ? true
                              : st === "UPCOMING"
                                ? false
                                : prev.hasRera,
                          reraNumber: st === "UPCOMING" ? "" : prev.reraNumber,
                          products:
                            st === "UPCOMING" ||
                            (st === "ONGOING" && !prev.hasRera)
                              ? []
                              : prev.products,
                        }))
                      }
                      className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                        projectForm.stage === st
                          ? "border-indigo-600 bg-indigo-50/50 text-indigo-700 ring-2 ring-indigo-500/20"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <span className="text-xs font-bold uppercase">{st}</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        {st === "UPCOMING"
                          ? "Planning phase"
                          : st === "ONGOING"
                            ? "Active sale"
                            : "Delivered & Verified"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Project Name & Location */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Project Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={projectForm.name}
                    onChange={(e) =>
                      setProjectForm((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    placeholder="e.g. Zion Heights, Baroda Business Park"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Location / Area <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={projectForm.location}
                    onChange={(e) =>
                      setProjectForm((prev) => ({
                        ...prev,
                        location: e.target.value,
                      }))
                    }
                    placeholder="e.g. Gorwa BIDC, Vadodara"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              {/* Dynamic Stage Rules Notice for Upcoming */}
              {projectForm.stage === "UPCOMING" && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <Sparkles size={14} className="text-blue-600" />
                    <span>Upcoming Project Rules</span>
                  </div>
                  <p className="text-[11px] text-blue-700">
                    Only Project Name and Location are required. RERA
                    certification, product unit inventories, and client
                    documents are kept disabled until you transition this
                    project to Ongoing or Completed.
                  </p>
                </div>
              )}

              {/* ONGOING: RERA Yes / No Option */}
              {projectForm.stage === "ONGOING" && (
                <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/40">
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1.5">
                      RERA Approved? <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setProjectForm((prev) => ({
                            ...prev,
                            hasRera: true,
                          }))
                        }
                        className={`flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-bold transition-all border ${
                          projectForm.hasRera
                            ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <CheckCircle2
                          size={14}
                          className={
                            projectForm.hasRera
                              ? "text-emerald-600"
                              : "text-slate-400"
                          }
                        />
                        <span>Yes (RERA Approved)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setProjectForm((prev) => ({
                            ...prev,
                            hasRera: false,
                            reraNumber: "",
                            products: [],
                          }))
                        }
                        className={`flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-bold transition-all border ${
                          !projectForm.hasRera
                            ? "border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <X
                          size={14}
                          className={
                            !projectForm.hasRera
                              ? "text-amber-600"
                              : "text-slate-400"
                          }
                        />
                        <span>No (Non-RERA)</span>
                      </button>
                    </div>
                  </div>

                  {projectForm.hasRera ? (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        RERA Registration Number{" "}
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={projectForm.reraNumber}
                        onChange={(e) =>
                          setProjectForm((prev) => ({
                            ...prev,
                            reraNumber: e.target.value,
                          }))
                        }
                        placeholder="e.g. PR/GJ/VADODARA/VADODARA/Others/RAA09876/010126"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800"
                      />
                    </div>
                  ) : null}
                </div>
              )}

              {/* COMPLETED: RERA Registration Details */}
              {projectForm.stage === "COMPLETED" && (
                <div className="rounded-xl border border-purple-200 p-4 space-y-3 bg-purple-50/30">
                  <div className="flex items-center gap-2 text-xs font-bold text-purple-900">
                    <CheckCircle2 size={16} className="text-purple-600" />
                    <span>RERA Registration (Completed Project)</span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      RERA Registration Number{" "}
                      <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={projectForm.reraNumber}
                      onChange={(e) =>
                        setProjectForm((prev) => ({
                          ...prev,
                          reraNumber: e.target.value,
                        }))
                      }
                      placeholder="e.g. PR/GJ/VADODARA/VADODARA/Others/RAA09876/010126"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800"
                    />
                  </div>
                </div>
              )}

              {/* Product Inventory with Price Range, Area sq.ft, Units, and Penthouse */}
              {(projectForm.stage === "COMPLETED" ||
                (projectForm.stage === "ONGOING" && projectForm.hasRera)) && (
                <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        Products & Unit Configurations (
                        {projectForm.products.length})
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Add unit types with price range brackets, area (sq.ft),
                        units, and penthouse status.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            addProductToForm(e.target.value);
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
                  </div>

                  {projectForm.products.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                      Add Product Type above to select units (1BHK, 2BHK, 3BHK,
                      Showroom, Office, etc.).
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {projectForm.products.map((prod, idx) => {
                        const availableRanges =
                          PRODUCT_PRICE_RANGES[prod.type] ||
                          PRODUCT_PRICE_RANGES["OTHER"];

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
                                onClick={() => removeProductFromForm(idx)}
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
                                    const updated = [...projectForm.products];
                                    updated[idx].priceRange = e.target.value;
                                    setProjectForm((prev) => ({
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
                                    const updated = [...projectForm.products];
                                    updated[idx].areaSqFt = e.target.value;
                                    setProjectForm((prev) => ({
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
                                    const updated = [...projectForm.products];
                                    updated[idx].units = e.target.value;
                                    setProjectForm((prev) => ({
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
                                      const updated = [...projectForm.products];
                                      updated[idx].isPenthouse = true;
                                      setProjectForm((prev) => ({
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
                                      const updated = [...projectForm.products];
                                      updated[idx].isPenthouse = false;
                                      setProjectForm((prev) => ({
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

              {/* Meta Mappings Section (ONLY MAINTAINS Page Name, Page ID, Form Name, Form ID) */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/30">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Database size={14} className="text-indigo-600" />
                      <span>Meta Lead Sync Mappings</span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Map Meta Webhook leads to this project using Page Name,
                      Page ID, Form Name, or Form ID.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addMetaSourceRow}
                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
                  >
                    <Plus size={12} /> Add Mapping
                  </button>
                </div>

                <div className="space-y-3">
                  {projectForm.metaSources.map((ms, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 relative"
                    >
                      <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                        <span className="text-[10px] font-bold uppercase text-slate-400">
                          Meta Mapping #{idx + 1}
                        </span>
                        {projectForm.metaSources.length > 1 && (
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
                              updateMetaSourceField(
                                idx,
                                "pageName",
                                e.target.value,
                              )
                            }
                            placeholder="e.g. Baroda Business Park"
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
                              updateMetaSourceField(
                                idx,
                                "pageId",
                                e.target.value,
                              )
                            }
                            placeholder="e.g. 1206344412560695"
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
                              updateMetaSourceField(
                                idx,
                                "formName",
                                e.target.value,
                              )
                            }
                            placeholder="e.g. BBP - 09-07-26-V2"
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
                              updateMetaSourceField(
                                idx,
                                "formId",
                                e.target.value,
                              )
                            }
                            placeholder="e.g. 1021954890458488"
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
                onClick={() => setOpenAddProject(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={addingProject}
                onClick={handleCreateProject}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
              >
                {addingProject ? "Creating..." : "Save Project"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CHANGE PROJECT STAGE */}
      {stageModalProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <h3 className="text-base font-bold text-slate-900">
                Change Stage: {stageModalProject.name}
              </h3>
              <button
                onClick={() => setStageModalProject(null)}
                className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {stageError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                  {stageError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Select New Stage
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["UPCOMING", "ONGOING", "COMPLETED"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setNewStage(st)}
                      className={`rounded-xl border p-2.5 text-center text-xs font-bold uppercase transition-all ${
                        newStage === st
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/20"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {newStage !== "UPCOMING" && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    RERA Registration Number
                  </label>
                  <input
                    type="text"
                    value={transitionRera}
                    onChange={(e) => setTransitionRera(e.target.value)}
                    placeholder="e.g. PR/GJ/VADODARA/..."
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Entering RERA enables product inventories and document
                    uploads.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setStageModalProject(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingStage}
                onClick={handleSaveStage}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingStage ? "Updating..." : "Update Stage"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER / MODAL: PROJECT SPECS & DOCUMENTS */}
      {activeProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-600 text-white shadow-xs">
                  <Building2 size={16} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {activeProject.name}
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    {business.name} ·{" "}
                    {activeProject.location || "Location not added"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setActiveProject(null)}
                className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {docError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                  {docError}
                </div>
              )}

              {/* Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Stage
                  </span>
                  <b className="mt-1 block text-xs font-bold text-slate-900 uppercase">
                    {activeProject.stage}
                  </b>
                </div>

                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    RERA Number
                  </span>
                  <b className="mt-1 block text-xs font-bold text-slate-900 truncate">
                    {activeProject.reraNumber || "None"}
                  </b>
                </div>

                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Location
                  </span>
                  <b className="mt-1 block text-xs font-bold text-slate-900 truncate">
                    {activeProject.location || "—"}
                  </b>
                </div>

                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    Lead Quota
                  </span>
                  <b className="mt-1 block text-xs font-bold text-slate-900">
                    {activeProject.leadLimit
                      ? `${activeProject.leadLimit}/day`
                      : "Inherited"}
                  </b>
                </div>
              </div>

              {/* Product Inventory */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 mb-2">
                  Product Inventory ({activeProject.products?.length || 0})
                </h4>
                {activeProject.products?.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {activeProject.products.map((prod: any, idx: number) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-200 p-3 bg-white shadow-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-800">
                              {prod.customType || prod.type}
                            </span>
                            {prod.isPenthouse && (
                              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[9px] font-extrabold text-purple-700">
                                👑 Penthouse
                              </span>
                            )}
                          </div>
                          <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                            {prod.priceRange || "Price on request"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1.5 border-t border-slate-100">
                          {prod.areaSqFt && (
                            <span>📏 {prod.areaSqFt} sq.ft</span>
                          )}
                          {prod.units && <span>🏢 {prod.units} units</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    No products configured.
                  </p>
                )}
              </div>

              {/* Meta Mappings */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                  <Database size={13} className="text-indigo-600" />
                  <span>
                    Meta Mappings ({activeProject.metaSources?.length || 0})
                  </span>
                </h4>
                {activeProject.metaSources?.length > 0 ? (
                  <div className="space-y-2">
                    {activeProject.metaSources.map((ms: any, idx: number) => (
                      <div
                        key={idx}
                        className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-[11px]"
                      >
                        <div>
                          <span className="block text-[10px] text-slate-400 font-bold uppercase">
                            Page Name
                          </span>
                          <strong className="text-slate-800 truncate block">
                            {ms.pageName || "—"}
                          </strong>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-400 font-bold uppercase">
                            Page ID
                          </span>
                          <span className="text-slate-700 font-mono text-[10px] truncate block">
                            {ms.pageId || "—"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-400 font-bold uppercase">
                            Form Name
                          </span>
                          <strong className="text-slate-800 truncate block">
                            {ms.formName || "—"}
                          </strong>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-400 font-bold uppercase">
                            Form ID
                          </span>
                          <span className="text-slate-700 font-mono text-[10px] truncate block">
                            {ms.formId || "—"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    No Meta mappings attached.
                  </p>
                )}
              </div>

              {/* Document Repository (AWS S3) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Project Documents ({activeProject.documents?.length || 0})
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Upload brochures, price sheets, floor plans to share with
                      leads.
                    </p>
                  </div>
                </div>

                {activeProject.stage === "UPCOMING" ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-400">
                    Documents are disabled for Upcoming projects. Transition
                    stage to Ongoing or Completed to enable uploads.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Upload Controls */}
                    {canManage && (
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                        <select
                          value={uploadCategory}
                          onChange={(e) => setUploadCategory(e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                        >
                          {documentCategories.map(([val, label]) => (
                            <option key={val} value={val}>
                              {label}
                            </option>
                          ))}
                        </select>

                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700">
                          <Upload size={13} />
                          <span>
                            {uploadingDoc ? "Uploading..." : "Upload Document"}
                          </span>
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

                    {/* Document List */}
                    {activeProject.documents?.length > 0 ? (
                      <div className="space-y-2">
                        {activeProject.documents.map((doc: any) => (
                          <div
                            key={doc._id}
                            className="flex items-center justify-between rounded-xl border border-slate-200 p-3 bg-white"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FileText
                                size={16}
                                className="text-indigo-600 shrink-0"
                              />
                              <div className="min-w-0">
                                <span className="block truncate text-xs font-bold text-slate-800">
                                  {doc.name}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {doc.category} ·{" "}
                                  {doc.size
                                    ? `${(doc.size / 1024).toFixed(1)} KB`
                                    : "Uploaded"}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleOpenDocument(doc)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                <ExternalLink size={11} /> Open
                              </button>
                              {canManage && (
                                <button
                                  onClick={() => handleDeleteDocument(doc)}
                                  className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        No documents uploaded yet.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setActiveProject(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CHANGE ADMIN PASSWORD */}
      {openPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Key size={16} className="text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Change Business Admin Password
                </h3>
              </div>
              <button
                onClick={() => setOpenPasswordModal(false)}
                className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="block text-[10px] font-bold uppercase text-slate-400">
                  Account
                </span>
                <strong className="text-xs font-bold text-slate-800">
                  {businessAdmin?.email}
                </strong>
              </div>

              {passwordError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
                  {passwordSuccess}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  New Password <span className="text-rose-500">*</span> (min 8
                  chars)
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Confirm Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setOpenPasswordModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingPassword}
                onClick={handleSaveAdminPassword}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingPassword ? "Updating..." : "Update Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE BUSINESS ADMIN LOGIN */}
      {openCreateAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <UserPlus size={16} className="text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Create Business Admin Login
                </h3>
              </div>
              <button
                onClick={() => setOpenCreateAdminModal(false)}
                className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500">
                Setup the single Business Partner account for{" "}
                <b className="text-slate-800">{business.name}</b>.
              </p>

              {adminLoginError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                  {adminLoginError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={adminLoginForm.name}
                  onChange={(e) =>
                    setAdminLoginForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  value={adminLoginForm.email}
                  onChange={(e) =>
                    setAdminLoginForm((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  placeholder="admin@developer.com"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Password <span className="text-rose-500">*</span> (min 8
                  chars)
                </label>
                <input
                  type="password"
                  value={adminLoginForm.password}
                  onChange={(e) =>
                    setAdminLoginForm((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setOpenCreateAdminModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingAdminLogin}
                onClick={handleCreateAdminLogin}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingAdminLogin ? "Creating..." : "Create Login"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
