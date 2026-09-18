"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Topbar from "../../../../components/Topbar";
import { api } from "../../../../lib/api";
import { getUser } from "../../../../lib/auth";
import {
  Building2,
  ExternalLink,
  FileText,
  MapPin,
  Trash2,
  Upload,
} from "lucide-react";

const demoDocuments = [
  { name: "Project Brochure (Demo)", category: "BROCHURE", isDemo: true },
  { name: "Price Sheet (Demo)", category: "PRICE_SHEET", isDemo: true },
  { name: "Floor Plan (Demo)", category: "FLOOR_PLAN", isDemo: true },
];

const documentCategories = [
  ["BROCHURE", "Brochure"],
  ["PRICE_SHEET", "Price sheet"],
  ["FLOOR_PLAN", "Floor plan"],
  ["PAYMENT_PLAN", "Payment plan"],
  ["AMENITIES", "Amenities"],
  ["OTHER", "Other"],
] as const;

export default function BusinessProjectDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const user = getUser();
  const isAdmin = user?.role === "ADMIN";

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState("BROCHURE");
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      const data = await api(`/business-projects/${id}`);
      setProject(data.project);
      setError("");
    } catch (requestError: any) {
      setError(requestError?.message || "Unable to load project");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) void load();
  }, [id]);

  async function uploadDocument(file: File) {
    if (!isAdmin) return;

    try {
      setUploading(true);
      setError("");

      const presign = await api(`/business-projects/${id}/documents/presign`, {
        method: "POST",
        body: JSON.stringify({
          name: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
        }),
      });

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

      await api(`/business-projects/${id}/documents`, {
        method: "POST",
        body: JSON.stringify({
          name: file.name,
          url: presign.objectUrl,
          storageKey: presign.key,
          category,
          mimeType: file.type,
          size: file.size,
          isDemo: false,
        }),
      });

      await load();
    } catch (requestError: any) {
      setError(requestError?.message || "Unable to upload document");
    } finally {
      setUploading(false);
    }
  }

  async function openDocument(document: any) {
    try {
      const data = await api(`/business-projects/${id}/documents/${document._id}/url`);
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (requestError: any) {
      setError(requestError?.message || "Unable to open document");
    }
  }

  async function deleteDocument(document: any) {
    if (!isAdmin || document.isDemo) return;

    if (!window.confirm(`Delete ${document.name}? This removes the file from AWS S3.`)) {
      return;
    }

    try {
      await api(`/business-projects/${id}/documents/${document._id}`, {
        method: "DELETE",
      });
      await load();
    } catch (requestError: any) {
      setError(requestError?.message || "Unable to delete document");
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Loading project...</div>;
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <Topbar title="Business project" />
        <div className="rounded-2xl border border-rose-200 bg-white p-8 text-sm text-rose-600">
          {error || "Project not found"}
        </div>
      </div>
    );
  }

  const docs = project.documents || [];
  const location =
    project.ongoing?.details?.location ||
    project.upcoming?.location ||
    project.completed?.location ||
    project.completed?.area;

  return (
    <div className="space-y-5">
      <Topbar
        title={project.name}
        subtitle={
          isAdmin
            ? "Project profile, Meta mappings, inventory and AWS S3 documents."
            : "Project information and client-shareable documents for your assigned lead."
        }
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/business"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
        >
          ← Projects
        </Link>
        <span className="rounded-full bg-indigo-50 px-3 py-2 text-[10px] font-bold uppercase text-indigo-700">
          {project.stage}
        </span>
        {project.penthouse && (
          <span className="rounded-full bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-700">
            Penthouse
          </span>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(330px,.75fr)]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                <Building2 size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-slate-900">{project.name}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {project.developerGroup || "Developer group not added"}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["RERA", project.reraNumber || "—"],
                ["Location", location || "—"],
                ["Products", project.products?.length || 0],
                ["Meta mappings", project.metaSources?.length || 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400">{label}</span>
                  <b className="mt-1 block break-words text-xs text-slate-900">{value}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="font-semibold text-slate-900">Products</h2>
              <p className="text-xs text-slate-500">Product-specific inventory and commercial details.</p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(project.products || []).map((product: any, index: number) => (
                <div key={index} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <b className="text-sm text-slate-900">{product.customType || product.type}</b>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {Object.entries(product.details || {}).map(([key, value]) => (
                      <div key={key}>
                        <span className="text-[10px] font-semibold uppercase text-slate-400">{key}</span>
                        <p className="break-words text-xs text-slate-700">{String(value) || "—"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Project documents</h2>
                <p className="text-xs text-slate-500">Client-shareable files stored in AWS S3.</p>
              </div>

              {isAdmin && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700"
                  >
                    {documentCategories.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>

                  <label className="inline-flex min-h-[42px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700">
                    <Upload size={14} />
                    {uploading ? "Uploading..." : "Select document"}
                    <input
                      type="file"
                      className="hidden"
                      disabled={uploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadDocument(file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {docs.length ? (
                docs.map((document: any) => (
                  <div key={document._id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                    <FileText size={17} className="shrink-0 text-indigo-600" />
                    <button onClick={() => openDocument(document)} className="min-w-0 flex-1 text-left hover:opacity-80">
                      <b className="block truncate text-xs text-slate-900">{document.name}</b>
                      <small className="text-[10px] text-slate-500">
                        {documentCategories.find(([value]) => value === document.category)?.[1] || document.category}
                        {document.isDemo ? " · Demo" : " · AWS S3"}
                      </small>
                    </button>
                    <ExternalLink size={13} className="shrink-0 text-slate-400" />
                    {isAdmin && !document.isDemo && (
                      <button onClick={() => void deleteDocument(document)} title="Delete document" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-rose-500 hover:bg-rose-50">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                demoDocuments.map((document) => (
                  <div key={document.name} className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
                    <FileText size={17} className="text-slate-400" />
                    <span className="flex-1">
                      <b className="block text-xs text-slate-700">{document.name}</b>
                      <small className="text-[10px] text-slate-400">Demo document · upload a real file from Admin</small>
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Meta lead mapping</h2>
            <p className="mt-1 text-xs text-slate-500">IDs used to connect incoming Meta leads to this project.</p>
            <div className="mt-4 space-y-2">
              {(project.metaSources || []).length ? project.metaSources.map((source: any, index: number) => (
                <div key={index} className="rounded-xl bg-slate-50 p-3">
                  <b className="text-xs text-slate-900">{source.label || `Meta source ${index + 1}`}</b>
                  {[
                    ["Page ID", source.pageId],
                    ["Ad account", source.adAccountId],
                    ["Campaign", source.campaignId],
                    ["Ad set", source.adSetId],
                    ["Ad ID", source.adId],
                    ["Form ID", source.formId],
                  ].map(([label, value]) => (
                    <div key={label} className="mt-2 flex justify-between gap-3 border-b border-slate-200/70 pb-2 last:border-0 last:pb-0">
                      <span className="text-[10px] text-slate-400">{label}</span>
                      <strong className="max-w-[180px] break-all text-right text-[10px] text-slate-700">{value || "—"}</strong>
                    </div>
                  ))}
                </div>
              )) : (
                <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">Meta setup was skipped for this project.</div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-indigo-600" />
              <h2 className="font-semibold text-slate-900">Stage details</h2>
            </div>
            <div className="mt-4 space-y-3 text-xs text-slate-600">
              {project.stage === "UPCOMING" && (
                <>
                  <p><b>Product repeat:</b> {project.upcoming?.productRepeat ? "Yes" : "No"}</p>
                  <p><b>RERA tenure:</b> {project.upcoming?.reraTenureYears || "—"} years</p>
                  <p><b>Location:</b> {project.upcoming?.location || "—"}</p>
                  <p><b>Expected launch:</b> {project.upcoming?.details?.expectedLaunchDate || "—"}</p>
                </>
              )}
              {project.stage === "COMPLETED" && (
                <>
                  <p><b>Business type:</b> {project.completed?.businessType || "—"}</p>
                  <p><b>Completion year:</b> {project.completed?.completionYear || "—"}</p>
                  <p><b>Area:</b> {project.completed?.area || "—"}</p>
                  <p><b>Location:</b> {project.completed?.location || "—"}</p>
                </>
              )}
              {project.stage === "ONGOING" && (
                <>
                  <p><b>Status:</b> {project.ongoing?.details?.projectStatus || "—"}</p>
                  <p><b>Location:</b> {project.ongoing?.details?.location || "—"}</p>
                  <p><b>Launch date:</b> {project.ongoing?.details?.launchDate || "—"}</p>
                  <p><b>Possession date:</b> {project.ongoing?.details?.possessionDate || "—"}</p>
                  <p><b>Land area:</b> {project.ongoing?.details?.landArea || "—"}</p>
                </>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
