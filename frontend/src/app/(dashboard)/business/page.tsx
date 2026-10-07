"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Topbar from "../../../components/Topbar";
import Pagination from "../../../components/Pagination";
import { api } from "../../../lib/api";
import { isAuthError } from "../../../lib/auth";
import { getUser } from "../../../lib/auth";
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Plus,
  Trash2,
  Upload,
  Search,
  X,
} from "lucide-react";

const stages = [
  {
    id: "ONGOING",
    title: "Ongoing",
    text: "Projects currently being developed, marketed or sold.",
  },
  {
    id: "UPCOMING",
    title: "Upcoming",
    text: "Future launches, planned inventory and pre-launch projects.",
  },
  {
    id: "COMPLETED",
    title: "Completed",
    text: "Delivered projects and historical real-estate inventory.",
  },
];

const productTypes = [
  ["COMMERCIAL_SHOP", "Commercial shop"],
  ["SHOWROOM", "Showroom"],
  ["PLOT", "Plot"],
  ["OFFICE", "Office"],
  ["STUDIO", "Studio"],
  ["1BHK", "1 BHK"],
  ["2BHK", "2 BHK"],
  ["3BHK", "3 BHK"],
  ["4BHK", "4 BHK"],
  ["OTHER", "Other"],
] as const;

const documentCategories = [
  ["BROCHURE", "Brochure"],
  ["PRICE_SHEET", "Price sheet"],
  ["FLOOR_PLAN", "Floor plan"],
  ["PAYMENT_PLAN", "Payment plan"],
  ["AMENITIES", "Amenities"],
  ["OTHER", "Other"],
] as const;

const emptyForm = {
  name: "",
  developerGroup: "",
  reraNumber: "",
  penthouse: false,
  productRepeat: false,
  reraTenureYears: "",
  location: "",
  businessType: "Residential",
  completionYear: "",
  area: "",
  launchDate: "",
  possessionDate: "",
  landArea: "",
  projectStatus: "Under Construction",
  expectedLaunchDate: "",
  expectedPossessionDate: "",
};

function createProduct(type = "3BHK") {
  return {
    type,
    customType: "",
    details: {},
  };
}

export default function BusinessProjects() {
  const user = getUser();
  const isAdmin = user?.role === "ADMIN";

  const [projects, setProjects] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState("ONGOING");
  const [metaSkipped, setMetaSkipped] = useState(false);
  const [docsSkipped, setDocsSkipped] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [metaSources, setMetaSources] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [documentCategory, setDocumentCategory] = useState("BROCHURE");
  const [salesUsers, setSalesUsers] = useState<any[]>([]);
  const [assignProject, setAssignProject] = useState<any>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);

  async function load(currentPage = page, currentSearch = search) {
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: "10" });
      if (currentSearch.trim()) params.set("search", currentSearch.trim());
      const data = await api(`/business-projects?${params.toString()}`);
      setProjects(data.projects || []);
      setMeta({ total: data.total || 0, pages: data.pages || 1 });

    } catch (requestError) {
      if (!isAuthError(requestError)) {
        console.error("[business] load failed", requestError);
      }
      setProjects([]);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(page, search);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [page, search]);

  useEffect(() => {
    if (!isAdmin) return;
    void api("/users")
      .then((users) => {
        setSalesUsers(
          (users.users || []).filter(
            (item: any) => item.role === "SALES" && item.isActive !== false,
          ),
        );
      })
      .catch((error) => {
        if (!isAuthError(error)) {
          console.error("[business] sales users load failed", error);
        }
      });
  }, [isAdmin]);

  function reset() {
    setStep(1);
    setStage("ONGOING");
    setMetaSkipped(false);
    setDocsSkipped(false);
    setProducts([]);
    setMetaSources([]);
    setDocuments([]);
    setDocumentCategory("BROCHURE");
    setUploadingDocument(false);
    setError("");
    setForm({ ...emptyForm });
  }

  function close() {
    setOpen(false);
    reset();
  }

  function addProduct(type = "3BHK") {
    setProducts((items) => [...items, createProduct(type)]);
  }

  function updateProduct(index: number, patch: any) {
    setProducts((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function updateProductDetail(index: number, key: string, value: string) {
    setProducts((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              details: { ...item.details, [key]: value },
            }
          : item,
      ),
    );
  }

  function addMetaSource() {
    setMetaSources((items) => [
      ...items,
      {
        label: "",
        pageId: "",
        adAccountId: "",
        campaignId: "",
        adSetId: "",
        adId: "",
        formId: "",
      },
    ]);
  }

  async function uploadWizardDocument(file: File) {
    try {
      setUploadingDocument(true);
      setError("");

      const presign = await api(
        "/business-projects/uploads/presign",
        {
          method: "POST",
          body: JSON.stringify({
            name: file.name,
            contentType: file.type || "application/octet-stream",
            size: file.size,
          }),
        },
      );

      const response = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error("AWS S3 upload failed");
      }

      setDocuments((items) => [
        ...items,
        {
          name: file.name,
          url: presign.objectUrl,
          storageKey: presign.key,
          category: documentCategory,
          mimeType: file.type,
          size: file.size,
          description: "",
          isDemo: false,
        },
      ]);
    } catch (requestError: any) {
      setError(requestError?.message || "Unable to upload document");
    } finally {
      setUploadingDocument(false);
    }
  }

  function validateStep() {
    setError("");

    if (step === 1 && !stage) {
      setError("Select a project stage.");
      return false;
    }

    if (step === 2) {
      if (!form.name.trim()) {
        setError("Business/project name is required.");
        return false;
      }

      if (!products.length) {
        setError("Add at least one product type.");
        return false;
      }

      for (const product of products) {
        if (product.type === "OTHER" && !product.customType.trim()) {
          setError("Enter the custom name for the Other product type.");
          return false;
        }
      }
    }

    if (step === 3 && !metaSkipped) {
      if (!metaSources.length) {
        setError("Add at least one Meta source or choose Skip Meta setup.");
        return false;
      }

      for (const source of metaSources) {
        if (!source.pageId && !source.adId && !source.formId) {
          setError("Each Meta source needs a Page ID, Ad ID or Form ID.");
          return false;
        }
      }
    }

    return true;
  }

  function next() {
    if (!validateStep()) return;
    setStep((value) => Math.min(4, value + 1));
  }

  async function assignProjectLeads() {
    if (!assignProject || !assignUserId) return;

    setAssigning(true);

    try {
      await api(`/business-projects/${assignProject._id}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ userId: assignUserId }),
      });

      setAssignProject(null);
      setAssignUserId("");
      await load();
    } catch (requestError: any) {
      setError(requestError?.message || "Unable to assign project leads");
    } finally {
      setAssigning(false);
    }
  }

  async function save() {
    if (!validateStep()) return;

    setSaving(true);
    setError("");

    try {
      await api("/business-projects", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          stage,
          developerGroup: form.developerGroup,
          reraNumber: form.reraNumber,
          penthouse: form.penthouse,
          products,
          ongoing: {
            details: {
              location: form.location,
              launchDate: form.launchDate,
              possessionDate: form.possessionDate,
              landArea: form.landArea,
              projectStatus: form.projectStatus,
            },
          },
          upcoming: {
            productRepeat: form.productRepeat,
            reraTenureYears: form.reraTenureYears
              ? Number(form.reraTenureYears)
              : undefined,
            location: form.location,
            details: {
              expectedLaunchDate: form.expectedLaunchDate,
              expectedPossessionDate: form.expectedPossessionDate,
            },
          },
          completed: {
            businessType: form.businessType,
            completionYear: form.completionYear
              ? Number(form.completionYear)
              : undefined,
            area: form.area,
            location: form.location,
          },
          metaSources: metaSkipped ? [] : metaSources,
          documents: docsSkipped ? [] : documents,
          metaSetupSkipped: metaSkipped,
          documentsSetupSkipped: docsSkipped,
        }),
      });

      close();
      await load();
    } catch (requestError: any) {
      setError(requestError?.message || "Unable to save project");
    } finally {
      setSaving(false);
    }
  }

  const steps = useMemo(
    () => ["Stage", "Project", "Meta", "Documents"],
    [],
  );

  return (
    <div className="space-y-6">
      <Topbar
        title="Business projects"
        subtitle={
          isAdmin
            ? "Configure real-estate projects, Meta source mapping and client documents."
            : "Projects connected to your assigned leads."
        }
      />

      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus size={16} /> Add business project
          </button>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex h-10 w-full max-w-md items-center gap-2 rounded-xl border border-slate-200 px-3 text-slate-400">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search business, developer, RERA, stage..."
              className="w-full text-sm outline-none"
            />
          </div>
          <span className="text-xs text-slate-400 sm:ml-auto">10 businesses per page · latest updated first</span>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <div
            key={project._id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Building2 size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-slate-900">
                    {project.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {project.developerGroup || "Developer group not added"}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600">
                {project.stage}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="text-slate-500">Products</span>
                <strong className="mt-1 block text-slate-900">
                  {project.products?.length || 0}
                </strong>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="text-slate-500">Meta mappings</span>
                <strong className="mt-1 block text-slate-900">
                  {project.metaSources?.length || 0}
                </strong>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <FileText size={14} /> {project.documents?.length || 0} documents
            </div>

            <div className="mt-4 grid gap-2">
              <Link
                href={`/business/${project._id}`}
                className="inline-flex items-center justify-center rounded-xl bg-indigo-50 px-3 py-2.5 text-xs font-semibold text-indigo-700"
              >
                View details & documents
              </Link>

              {isAdmin && (
                <button
                  onClick={() => {
                    setAssignProject(project);
                    setAssignUserId("");
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Assign released project leads
                </button>
              )}
            </div>
          </div>
        ))}

        {!projects.length && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 sm:col-span-2 xl:col-span-3">
            {isAdmin
              ? "No business projects configured yet."
              : "No projects are connected to your assigned leads."}
          </div>
        )}
      </div>

      <Pagination page={page} pages={meta.pages} total={meta.total} label="business projects" onChange={setPage} />

      {isAdmin && open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Add business project</h2>
                <p className="text-xs text-slate-500">
                  Configure the project first; Meta and document setup can be skipped.
                </p>
              </div>
              <button
                onClick={close}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="border-b border-slate-200 px-5 py-3 sm:px-6">
              <div className="grid grid-cols-4 gap-2">
                {steps.map((label, index) => {
                  const current = index + 1;
                  return (
                    <button
                      key={label}
                      onClick={() => current < step && setStep(current)}
                      className={`rounded-xl px-2 py-2 text-[11px] font-semibold ${
                        current === step
                          ? "bg-indigo-600 text-white"
                          : current < step
                            ? "bg-indigo-50 text-indigo-700"
                            : "bg-slate-50 text-slate-400"
                      }`}
                    >
                      <span className="mr-1">{current}.</span>{label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Select project stage</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Start with the stage so the next screen can capture the correct real-estate information.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    {stages.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setStage(item.id)}
                        className={`rounded-2xl border p-5 text-left transition ${
                          stage === item.id
                            ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100"
                            : "border-slate-200 hover:border-indigo-300"
                        }`}
                      >
                        <span className="flex items-center justify-between">
                          <Building2 size={20} className="text-indigo-600" />
                          {stage === item.id && <Check size={18} className="text-indigo-600" />}
                        </span>
                        <b className="mt-5 block text-base text-slate-900">{item.title}</b>
                        <span className="mt-2 block text-xs leading-5 text-slate-500">{item.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Project information</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Add project details and as many product types as this business offers.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="text-xs font-semibold text-slate-600 lg:col-span-2">
                      Business / project name
                      <input
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        placeholder="Zion Group Residences"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-600">
                      Developer group
                      <input
                        value={form.developerGroup}
                        onChange={(event) => setForm({ ...form, developerGroup: event.target.value })}
                        placeholder="Zion Group"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-600">
                      RERA number
                      <input
                        value={form.reraNumber}
                        onChange={(event) => setForm({ ...form, reraNumber: event.target.value })}
                        placeholder="PR/GJ/XXXX/0001"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                      />
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.penthouse}
                        onChange={(event) => setForm({ ...form, penthouse: event.target.checked })}
                        className="h-4 w-4 accent-indigo-600"
                      />
                      Penthouse available
                    </label>
                    <label className="text-xs font-semibold text-slate-600">
                      Primary location
                      <input
                        value={form.location}
                        onChange={(event) => setForm({ ...form, location: event.target.value })}
                        placeholder="SG Highway, Ahmedabad"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                      />
                    </label>
                  </div>

                  {stage === "ONGOING" && (
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
                      <h4 className="font-semibold text-slate-900">Ongoing project details</h4>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="text-xs font-semibold text-slate-600">
                          Project status
                          <select
                            value={form.projectStatus}
                            onChange={(event) => setForm({ ...form, projectStatus: event.target.value })}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                          >
                            <option>Under Construction</option>
                            <option>Ready for Possession</option>
                            <option>Launching</option>
                            <option>Phase 2</option>
                            <option>Other</option>
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Launch date
                          <input type="date" value={form.launchDate} onChange={(event) => setForm({ ...form, launchDate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Possession date
                          <input type="date" value={form.possessionDate} onChange={(event) => setForm({ ...form, possessionDate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Land area
                          <input value={form.landArea} onChange={(event) => setForm({ ...form, landArea: event.target.value })} placeholder="4.5 acres" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
                        </label>
                      </div>
                    </div>
                  )}

                  {stage === "UPCOMING" && (
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
                      <h4 className="font-semibold text-slate-900">Upcoming project details</h4>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-slate-700">
                          <input type="checkbox" checked={form.productRepeat} onChange={(event) => setForm({ ...form, productRepeat: event.target.checked })} className="h-4 w-4 accent-indigo-600" /> Product repeat
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Estimation RERA tenure
                          <input type="number" min="0" value={form.reraTenureYears} onChange={(event) => setForm({ ...form, reraTenureYears: event.target.value })} placeholder="5" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Expected launch
                          <input type="date" value={form.expectedLaunchDate} onChange={(event) => setForm({ ...form, expectedLaunchDate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Expected possession
                          <input type="date" value={form.expectedPossessionDate} onChange={(event) => setForm({ ...form, expectedPossessionDate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
                        </label>
                      </div>
                    </div>
                  )}

                  {stage === "COMPLETED" && (
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
                      <h4 className="font-semibold text-slate-900">Completed project details</h4>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="text-xs font-semibold text-slate-600">
                          Business type
                          <select value={form.businessType} onChange={(event) => setForm({ ...form, businessType: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                            <option>Residential</option>
                            <option>Commercial</option>
                            <option>Mixed use</option>
                            <option>Plots</option>
                            <option>Industrial</option>
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Completion year
                          <input type="number" value={form.completionYear} onChange={(event) => setForm({ ...form, completionYear: event.target.value })} placeholder="2025" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Area
                          <input value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} placeholder="250 acres / 12 lakh sq.ft" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Area / location
                          <input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Ahmedabad" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" />
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="font-semibold text-slate-900">Products / inventory types</h4>
                        <p className="text-xs text-slate-500">Add multiple types. Each selected type gets its own details form.</p>
                      </div>
                      <button onClick={() => addProduct()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-300 px-3 py-2 text-xs font-semibold text-indigo-700">
                        <Plus size={14} /> Add product
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {products.map((product, index) => (
                        <div key={`${product.type}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-start gap-3">
                            <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">
                              Product type
                              <select value={product.type} onChange={(event) => updateProduct(index, { type: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                                {productTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                              </select>
                            </label>
                            <button onClick={() => setProducts((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="mt-5 rounded-lg p-2 text-rose-500 hover:bg-rose-50">
                              <Trash2 size={16} />
                            </button>
                          </div>

                          {product.type === "OTHER" && (
                            <input value={product.customType} onChange={(event) => updateProduct(index, { customType: event.target.value })} placeholder="Custom product type" className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
                          )}

                          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <label className="text-xs font-semibold text-slate-600">Unit count<input value={product.details.unitCount || ""} onChange={(event) => updateProductDetail(index, "unitCount", event.target.value)} placeholder="80" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></label>
                            <label className="text-xs font-semibold text-slate-600">Area / sq.ft<input value={product.details.areaSqFt || ""} onChange={(event) => updateProductDetail(index, "areaSqFt", event.target.value)} placeholder="1850" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></label>
                            <label className="text-xs font-semibold text-slate-600">Price from<input value={product.details.priceFrom || ""} onChange={(event) => updateProductDetail(index, "priceFrom", event.target.value)} placeholder="8500000" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></label>
                            <label className="text-xs font-semibold text-slate-600">Price to<input value={product.details.priceTo || ""} onChange={(event) => updateProductDetail(index, "priceTo", event.target.value)} placeholder="11000000" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></label>
                          </div>

                          {[
                            "1BHK",
                            "2BHK",
                            "3BHK",
                            "4BHK",
                            "STUDIO",
                          ].includes(product.type) && (
                            <div className="mt-3 grid gap-3 sm:grid-cols-3">
                              <label className="text-xs font-semibold text-slate-600">Bedrooms<input value={product.type.replace("BHK", "")} readOnly className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5" /></label>
                              <label className="text-xs font-semibold text-slate-600">Bathrooms<input value={product.details.bathrooms || ""} onChange={(event) => updateProductDetail(index, "bathrooms", event.target.value)} placeholder="3" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></label>
                              <label className="text-xs font-semibold text-slate-600">Facing<input value={product.details.facing || ""} onChange={(event) => updateProductDetail(index, "facing", event.target.value)} placeholder="East" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></label>
                              <label className="text-xs font-semibold text-slate-600 sm:col-span-3">Floor range<input value={product.details.floorRange || ""} onChange={(event) => updateProductDetail(index, "floorRange", event.target.value)} placeholder="1-14" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></label>
                            </div>
                          )}

                          {[
                            "COMMERCIAL_SHOP",
                            "SHOWROOM",
                            "OFFICE",
                            "PLOT",
                          ].includes(product.type) && (
                            <div className="mt-3 grid gap-3 sm:grid-cols-3">
                              <label className="text-xs font-semibold text-slate-600">Frontage<input value={product.details.frontage || ""} onChange={(event) => updateProductDetail(index, "frontage", event.target.value)} placeholder="20 ft" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></label>
                              <label className="text-xs font-semibold text-slate-600">Floor / level<input value={product.details.floor || ""} onChange={(event) => updateProductDetail(index, "floor", event.target.value)} placeholder="Ground / 1st" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></label>
                              <label className="text-xs font-semibold text-slate-600">Usage<input value={product.details.usage || ""} onChange={(event) => updateProductDetail(index, "usage", event.target.value)} placeholder="Retail / Office" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></label>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {!products.length && (
                      <button onClick={() => addProduct()} className="mt-4 w-full rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/50 p-6 text-sm font-semibold text-indigo-700">
                        + Add the first product type
                      </button>
                    )}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Meta source mapping</h3>
                    <p className="mt-1 text-sm text-slate-500">Map the Page, ad, campaign and form identifiers used to connect incoming Meta leads with this project.</p>
                  </div>

                  <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
                    <input type="checkbox" checked={metaSkipped} onChange={(event) => setMetaSkipped(event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                    <span>
                      <strong className="block text-slate-900">Skip Meta setup for now</strong>
                      <span className="text-xs text-amber-800">You can add mappings later.</span>
                    </span>
                  </label>

                  {!metaSkipped && (
                    <div className="space-y-3">
                      {metaSources.map((source, index) => (
                        <div key={index} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex gap-3">
                            <input value={source.label} onChange={(event) => setMetaSources((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} placeholder="Source label" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                            <button onClick={() => setMetaSources((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Trash2 size={16} /></button>
                          </div>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {[
                              ["pageId", "Page ID"],
                              ["adAccountId", "Ad account ID"],
                              ["campaignId", "Campaign ID"],
                              ["adSetId", "Ad set ID"],
                              ["adId", "Ad ID"],
                              ["formId", "Form ID"],
                            ].map(([key, label]) => (
                              <label key={key} className="text-xs font-semibold text-slate-600">
                                {label}
                                <input value={source[key] || ""} onChange={(event) => setMetaSources((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: event.target.value } : item))} placeholder={label} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                      <button onClick={addMetaSource} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-indigo-300 px-4 py-2.5 text-sm font-semibold text-indigo-700">
                        <Plus size={15} /> Add Meta source
                      </button>
                    </div>
                  )}
                </div>
              )}

              {step === 4 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Project documents</h3>
                    <p className="mt-1 text-sm text-slate-500">Select files directly. Each file uploads to AWS S3 first, then its URL and storage key are saved with the project.</p>
                  </div>

                  <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                    <input type="checkbox" checked={docsSkipped} onChange={(event) => setDocsSkipped(event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                    <span>
                      <strong className="block text-slate-900">Skip documents for now</strong>
                      <span className="text-xs text-slate-500">Documents can be uploaded later from the project detail page.</span>
                    </span>
                  </label>

                  {!docsSkipped && (
                    <>
                      <div className="flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 sm:flex-row sm:items-end">
                        <label className="flex-1 text-xs font-semibold text-slate-700">
                          Document category
                          <select value={documentCategory} onChange={(event) => setDocumentCategory(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                            {documentCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </label>
                        <label className="inline-flex min-h-[43px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700">
                          <Upload size={15} />
                          {uploadingDocument ? "Uploading to S3..." : "Select document"}
                          <input
                            type="file"
                            className="hidden"
                            disabled={uploadingDocument}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void uploadWizardDocument(file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </div>

                      <div className="space-y-2">
                        {documents.map((document, index) => (
                          <div key={`${document.storageKey || document.name}-${index}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                            <FileText size={17} className="shrink-0 text-indigo-600" />
                            <div className="min-w-0 flex-1">
                              <b className="block truncate text-xs text-slate-900">{document.name}</b>
                              <span className="text-[10px] text-slate-500">{documentCategories.find(([value]) => value === document.category)?.[1] || document.category} · Uploaded to S3</span>
                            </div>
                            <button onClick={() => setDocuments((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Trash2 size={15} /></button>
                          </div>
                        ))}
                        {!documents.length && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">No documents selected.</div>}
                      </div>
                    </>
                  )}
                </div>
              )}

              {error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
              <button disabled={step === 1 || saving} onClick={() => { setError(""); setStep((value) => Math.max(1, value - 1)); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40">
                <ChevronLeft size={16} /> Back
              </button>

              {step < 4 ? (
                <button onClick={next} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
                  Next <ChevronRight size={16} />
                </button>
              ) : (
                <button disabled={saving || uploadingDocument} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {saving ? "Creating..." : "Create project"} <Check size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isAdmin && assignProject && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-slate-900">Assign project leads</h2>
                <p className="mt-1 text-xs text-slate-500">All currently released leads for {assignProject.name} will be manually assigned. This bypasses automatic daily capacity.</p>
              </div>
              <button onClick={() => setAssignProject(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>

            <label className="mt-5 block text-xs font-semibold text-slate-700">
              Salesperson
              <select value={assignUserId} onChange={(event) => setAssignUserId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                <option value="">Select salesperson</option>
                {salesUsers.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.email}</option>)}
              </select>
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setAssignProject(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button>
              <button disabled={!assignUserId || assigning} onClick={assignProjectLeads} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{assigning ? "Assigning..." : "Assign released leads"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
