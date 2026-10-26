"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Topbar from "../../../components/Topbar";
import { api } from "../../../lib/api";
import { getUser, isAuthError, type User } from "../../../lib/auth";
import { socket } from "../../../lib/socket";
import {
  Building2,
  Users,
  CalendarDays,
  FileText,
  Upload,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Flame,
  PhoneCall,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Award,
  Layers,
  MapPin,
  Briefcase,
  Plus,
  ShieldCheck,
  AlertCircle,
  UserPlus,
  X,
} from "lucide-react";

export default function BusinessDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const currentUser = getUser();
    if (currentUser) setUser(currentUser);
  }, []);

  const isAdmin = user?.role === "ADMIN" || user?.role === "MANAGER";

  // Multi-project list & selector
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("ALL");
  const [businessInfo, setBusinessInfo] = useState<any>(null);

  // Stats & recent items
  const [stats, setStats] = useState<any>({});
  const [followupStats, setFollowupStats] = useState<any>({});
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [salesStaff, setSalesStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Quick document upload modal
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("BROCHURE");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // Create Staff Modal
  const [openCreateStaff, setOpenCreateStaff] = useState(false);
  const [staffForm, setStaffForm] = useState({
    name: "",
    email: "",
    password: "",
    assignedProjects: [] as string[],
  });
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [staffError, setStaffError] = useState("");

  // Selected single project object (when not "ALL")
  const currentProject = useMemo(() => {
    if (selectedProjectId === "ALL") return projects[0] || null;
    return projects.find((p) => p._id === selectedProjectId) || null;
  }, [projects, selectedProjectId]);

  async function loadData() {
    try {
      setLoading(true);

      const from = new Date();
      from.setDate(from.getDate() - 1);
      const to = new Date();
      to.setDate(to.getDate() + 14);

      // Query params for project scoping
      const projectParam = selectedProjectId !== "ALL" ? `&businessProject=${selectedProjectId}` : "";
      const projectQueryOnly = selectedProjectId !== "ALL" ? `?businessProject=${selectedProjectId}` : "";

      const [pRes, sRes, fRes, lRes, cRes, uRes, meRes] = await Promise.all([
        api("/business-projects"),
        api(`/leads/stats${projectQueryOnly}`),
        api(`/followups/stats${projectQueryOnly}`),
        api(`/leads?limit=6${projectParam}`),
        api(
          `/followups/calendar?start=${encodeURIComponent(
            from.toISOString(),
          )}&end=${encodeURIComponent(to.toISOString())}${projectParam}`,
        ),
        api("/users?role=SALES&limit=20"),
        api("/auth/me").catch(() => null),
      ]);

      const allProjects = pRes.projects || [];
      setProjects(allProjects);
      setStats(sRes || {});
      setFollowupStats(fRes || {});
      setRecentLeads(lRes.leads || []);
      setCalendarEvents(cRes.events || cRes.followups || []);
      setSalesStaff(uRes.users || []);

      if (meRes?.user?.business && typeof meRes.user.business === "object") {
        setBusinessInfo(meRes.user.business);
      } else if (allProjects[0]?.business) {
        setBusinessInfo(allProjects[0].business);
      }
    } catch (err) {
      if (!isAuthError(err)) {
        console.error("[business-dashboard] load failed", err);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [selectedProjectId]);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void loadData();
      }, 400);
    };

    socket.on("followup_updated", refresh);
    socket.on("new_lead", refresh);
    socket.on("lead_updated", refresh);
    socket.on("call_logged", refresh);

    return () => {
      if (timer) clearTimeout(timer);
      socket.off("followup_updated", refresh);
      socket.off("new_lead", refresh);
      socket.off("lead_updated", refresh);
      socket.off("call_logged", refresh);
    };
  }, [selectedProjectId]);

  async function handleQuickUpload(file: File) {
    if (!currentProject) return;
    if (currentProject.stage === "UPCOMING") {
      setUploadError("Document uploads are disabled for Upcoming projects.");
      return;
    }
    try {
      setUploading(true);
      setUploadError("");

      const presign = await api(`/business-projects/${currentProject._id}/documents/presign`, {
        method: "POST",
        body: JSON.stringify({
          name: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
        }),
      });

      const res = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!res.ok) throw new Error("File upload failed to AWS S3.");

      await api(`/business-projects/${currentProject._id}/documents`, {
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

      setUploadOpen(false);
      await loadData();
    } catch (e: any) {
      setUploadError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function openDoc(docId: string) {
    if (!currentProject) return;
    try {
      const res = await api(`/business-projects/${currentProject._id}/documents/${docId}/url`);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      alert(e?.message || "Failed to open document");
    }
  }

  // Handle staff creation
  async function handleCreateStaff() {
    if (!staffForm.name.trim() || !staffForm.email.trim() || !staffForm.password) {
      setStaffError("Name, email, and password are required");
      return;
    }
    if (staffForm.password.length < 8) {
      setStaffError("Password must be at least 8 characters");
      return;
    }
    setCreatingStaff(true);
    setStaffError("");
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({
          name: staffForm.name.trim(),
          email: staffForm.email.trim(),
          password: staffForm.password,
          role: "SALES",
          assignedProjects: staffForm.assignedProjects,
        }),
      });
      setOpenCreateStaff(false);
      setStaffForm({
        name: "",
        email: "",
        password: "",
        assignedProjects: [],
      });
      await loadData();
    } catch (err: any) {
      setStaffError(err?.message || "Failed to create sales staff");
    } finally {
      setCreatingStaff(false);
    }
  }

  const pipeline = [
    { label: "New Inbound", count: stats.newCount || 0, color: "bg-sky-500", text: "text-sky-700", bg: "bg-sky-50" },
    { label: "Interested", count: stats.interested || 0, color: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
    { label: "In Follow-up", count: stats.followups || 0, color: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50" },
    { label: "Won / Deals", count: stats.won || 0, color: "bg-indigo-600", text: "text-indigo-700", bg: "bg-indigo-50" },
  ];

  const totalLeads = stats.total || 0;
  const docs = currentProject?.documents || [];

  return (
    <div className="space-y-5 sm:space-y-6 pb-12">
      {/* TOPBAR (Page header + notification bell + sound toggle + mobile sidebar hamburger) */}
      <Topbar
        title="Partner Dashboard"
        subtitle="Real-time sales funnel, multi-project conversion, and sales staff monitoring."
      />

      {/* 1. HERO EXECUTIVE BUSINESS & PROJECT BANNER */}
      <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 sm:p-6 md:p-8 text-white shadow-xl">
        <div className="absolute right-0 top-0 -mt-10 -mr-10 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 -mb-10 h-48 w-48 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-5 sm:gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2 sm:space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-indigo-300 ring-1 ring-indigo-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                {businessInfo?.name || "Business Partner Portal"}
              </span>

              {/* Lead Quota Tracker Pill - Only visible to Admin */}
              {isAdmin &&
                (businessInfo?.leadLimitType && businessInfo.leadLimitType !== "NONE" ? (
                  <span className="rounded-full bg-amber-500/20 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-bold text-amber-300 ring-1 ring-amber-500/30">
                    Quota: {businessInfo.leadLimit} leads / {businessInfo.leadLimitType.toLowerCase()}
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-500/20 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-bold text-emerald-300 ring-1 ring-emerald-500/30">
                    Unlimited Lead Ingestion
                  </span>
                ))}
            </div>

            <h1 className="text-xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white flex items-center gap-2 break-words">
              {businessInfo?.name}
            </h1>

            <p className="max-w-2xl text-xs sm:text-sm text-slate-300 font-normal leading-relaxed">
              {businessInfo?.contactNo ? `Direct Contact: ${businessInfo.contactNo} · ` : ""}
              Real-time lead delivery, multi-project conversion pipeline, and assigned sales staff monitoring.
            </p>
          </div>

          {/* Action buttons & Project Selector Dropdown */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0 w-full sm:w-auto">
            {/* Filter by Project Dropdown */}
            <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 sm:px-3.5 sm:py-2.5 backdrop-blur-md border border-white/15 w-full sm:w-auto justify-between sm:justify-start">
              <span className="text-xs font-bold text-slate-300 shrink-0">Project:</span>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer max-w-[180px] sm:max-w-xs truncate"
              >
                <option value="ALL" className="bg-slate-900 text-white">
                  All Projects ({projects.length})
                </option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id} className="bg-slate-900 text-white">
                    {p.name} ({p.stage})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => {
                  setStaffError("");
                  setOpenCreateStaff(true);
                }}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-indigo-500"
              >
                <UserPlus size={15} />
                Add Sales Staff
              </button>

              <Link
                href="/business"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs font-bold text-white shadow-md backdrop-blur-sm transition hover:bg-white/20"
              >
                <Layers size={15} />
                Manage Projects
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 2. PROJECTS HORIZONTAL QUICK CARDS */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-indigo-600" />
            <h2 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              Projects Portfolio ({projects.length})
            </h2>
          </div>
          <Link href="/business" className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
            Portfolio view →
          </Link>
        </div>

        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {projects.map((p) => {
            const isSelected = selectedProjectId === p._id;
            return (
              <div
                key={p._id}
                onClick={() => setSelectedProjectId(isSelected ? "ALL" : p._id)}
                className={`cursor-pointer rounded-2xl border p-4 transition ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-200"
                    : "border-slate-200 bg-white hover:border-slate-300 shadow-xs"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <h3 className="font-bold text-slate-900 text-xs truncate">{p.name}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase shrink-0 ${
                      p.stage === "ONGOING"
                        ? "bg-indigo-50 text-indigo-700"
                        : p.stage === "UPCOMING"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {p.stage}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 truncate">
                  <MapPin size={11} className="shrink-0 text-slate-400" />
                  {p.location || "Location not added"}
                </div>
                <div className="mt-2.5 flex items-center justify-between text-[11px] pt-2 border-t border-slate-100">
                  <span className="text-slate-400">
                    {p.stage === "UPCOMING"
                      ? "Upcoming"
                      : p.reraNumber
                      ? `RERA: ${p.reraNumber.slice(0, 10)}...`
                      : "No RERA"}
                  </span>
                  <span className="font-bold text-indigo-600 text-[10px]">
                    {isSelected ? "Filter Active" : "Click to Filter"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. EXECUTIVE METRICS CARDS */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* Total Project Leads */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500 truncate">
              {selectedProjectId === "ALL" ? "Business Leads" : "Project Leads"}
            </span>
            <div className="grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
              <Users size={16} />
            </div>
          </div>
          <div className="mt-2.5 sm:mt-3 flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              {totalLeads}
            </span>
            <span className="text-[11px] sm:text-xs font-semibold text-emerald-600 flex items-center gap-0.5">
              <TrendingUp size={12} /> Active
            </span>
          </div>
          <span className="mt-1 block text-[10px] sm:text-[11px] text-slate-400 truncate">
            {selectedProjectId === "ALL" ? "Across all business projects" : currentProject?.name}
          </span>
        </div>

        {/* Interested Prospects */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500 truncate">Interested Buyers</span>
            <div className="grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <Flame size={16} />
            </div>
          </div>
          <div className="mt-2.5 sm:mt-3 flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              {stats.interested || 0}
            </span>
            <span className="text-[11px] sm:text-xs font-semibold text-slate-400">high intent</span>
          </div>
          <span className="mt-1 block text-[10px] sm:text-[11px] text-slate-400 truncate">
            Validated by sales team
          </span>
        </div>

        {/* Scheduled Follow-ups */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500 truncate">Scheduled Follow-ups</span>
            <div className="grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <Clock3 size={16} />
            </div>
          </div>
          <div className="mt-2.5 sm:mt-3 flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              {followupStats.pending || 0}
            </span>
            {followupStats.overdue > 0 && (
              <span className="text-[10px] sm:text-[11px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md truncate">
                {followupStats.overdue} overdue
              </span>
            )}
          </div>
          <span className="mt-1 block text-[10px] sm:text-[11px] text-slate-400 truncate">
            Upcoming commitments
          </span>
        </div>

        {/* Won  */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500 truncate">Won</span>
            <div className="grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
              <Award size={16} />
            </div>
          </div>
          <div className="mt-2.5 sm:mt-3 flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              {stats.won || 0}
            </span>
            <span className="text-[11px] sm:text-xs font-bold text-violet-600">Converted</span>
          </div>
          <span className="mt-1 block text-[10px] sm:text-[11px] text-slate-400 truncate">
            Successful deal closings
          </span>
        </div>
      </div>

      {/* 4. MAIN DASHBOARD SPLIT VIEW */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(350px,0.85fr)]">
        {/* LEFT COLUMN: Pipeline & Recent Leads */}
        <div className="space-y-6">
          {/* Conversion Pipeline */}
          <section className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">Conversion Pipeline</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Lead progression through sales stages{" "}
                  {selectedProjectId !== "ALL" && currentProject ? `for ${currentProject.name}` : ""}
                </p>
              </div>
              <Link
                href="/leads"
                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 shrink-0"
              >
                View all leads
                <ArrowUpRight size={13} />
              </Link>
            </div>

            <div className="mt-4 sm:mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              {pipeline.map((item) => (
                <div
                  key={item.label}
                  className={`rounded-2xl border border-slate-100 ${item.bg} p-3 sm:p-4 transition`}
                >
                  <span className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider ${item.text} block truncate`}>
                    {item.label}
                  </span>
                  <div className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-black text-slate-900">
                    {item.count}
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-white/70 overflow-hidden">
                    <div
                      className={`h-full ${item.color}`}
                      style={{
                        width: totalLeads
                          ? `${Math.min(100, Math.max(8, (item.count / totalLeads) * 100))}%`
                          : "0%",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Recent Inquiries List */}
          <section className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">Recent Leads & Inquiries</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Latest leads registered for {businessInfo?.name || "your business"}
                </p>
              </div>
              <Link
                href="/leads"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 shrink-0"
              >
                All Leads
                <ChevronRight size={14} />
              </Link>
            </div>

            {/* Mobile Cards */}
            <div className="block lg:hidden divide-y divide-slate-100">
              {recentLeads.map((lead) => (
                <div key={lead._id} className="p-3.5 sm:p-4 space-y-2.5 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/leads/${lead._id}`}
                        className="font-bold text-sm text-slate-900 hover:text-indigo-600 block truncate"
                      >
                        {lead.name}
                      </Link>
                      <span className="text-[11px] text-slate-400 block mt-0.5 truncate">
                        {lead.phone || lead.email || "No direct contact"}
                      </span>
                    </div>
                    <span className="inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 ring-1 ring-indigo-200 shrink-0">
                      {String(lead.status || "NEW").replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-50 p-2.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Project</span>
                      <span className="font-semibold text-slate-700 block mt-0.5 truncate">
                        {lead.businessProject?.name || "Unmapped"}
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Agent</span>
                      <span className="font-semibold text-slate-700 truncate block mt-0.5">
                        {lead.assignedTo?.name || "Unassigned"}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1 border-t border-slate-100/80">
                    <Link
                      href={`/leads/${lead._id}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
                    >
                      View lead details <ArrowUpRight size={13} />
                    </Link>
                  </div>
                </div>
              ))}
              {!recentLeads.length && (
                <div className="p-8 text-center text-sm text-slate-400">
                  No leads generated for this selection yet.
                </div>
              )}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-3.5">Client Details</th>
                    <th className="px-4 py-3.5">Project</th>
                    <th className="px-4 py-3.5">Assigned Agent</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentLeads.map((lead) => (
                    <tr key={lead._id} className="hover:bg-slate-50/60 transition">
                      <td className="px-6 py-3.5">
                        <b className="text-slate-900 block font-semibold">{lead.name}</b>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          {lead.phone || lead.email || "No direct contact"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-700">
                        {lead.businessProject?.name || "Unmapped"}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-700">
                        {lead.assignedTo?.name || "Unassigned"}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 ring-1 ring-indigo-200">
                          {String(lead.status || "NEW").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <Link
                          href={`/leads/${lead._id}`}
                          className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-800"
                        >
                          View
                          <ArrowUpRight size={13} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!recentLeads.length && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-sm text-slate-400">
                        No leads generated for this selection yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Sales Staff Overview Section */}
          <section className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Assigned Sales Team</h3>
                  <span className="text-[11px] text-slate-500">
                    Sales staff handling inquiries for {businessInfo?.name || "your projects"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setStaffError("");
                  setOpenCreateStaff(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition w-full sm:w-auto"
              >
                <Plus size={14} /> Add Sales Staff
              </button>
            </div>

            <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2">
              {salesStaff.map((s) => (
                <div
                  key={s._id}
                  className="rounded-2xl border border-slate-100 p-3.5 bg-slate-50/50 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-slate-900 truncate">{s.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{s.email}</div>
                    </div>
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 shrink-0">
                      Active
                    </span>
                  </div>

                  {s.assignedProjects?.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {s.assignedProjects.map((p: any) => (
                        <span
                          key={p._id || p}
                          className="rounded-md bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 truncate max-w-[140px]"
                        >
                          {p.name || p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {!salesStaff.length && (
                <div className="col-span-full p-6 text-center text-xs text-slate-400">
                  No sales staff assigned yet. Click &quot;Add Sales Staff&quot; above to add members.
                </div>
              )}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: Follow-ups & Documents */}
        <div className="space-y-6">
          {/* Scheduled Appointments */}
          <section className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 font-bold">
                  <CalendarDays size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Scheduled Appointments</h3>
                  <span className="text-[11px] text-slate-500">Upcoming follow-ups</span>
                </div>
              </div>
              <Link href="/followups" className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
                View all →
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {calendarEvents.slice(0, 5).map((ev: any) => {
                const scheduled = new Date(ev.scheduledAt);
                const isOverdue = scheduled.getTime() < Date.now() && ev.status === "PENDING";

                return (
                  <div
                    key={ev._id}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 p-3.5 hover:bg-slate-50/80 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {ev.lead?.name || "Client Follow-up"}
                        </span>
                        {isOverdue && (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-bold text-rose-700 shrink-0">
                            Overdue
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {ev.notes || "Scheduled discussion"} · Agent: {ev.user?.name || "Sales rep"}
                      </p>
                      <span className="text-[10px] font-semibold text-slate-400 mt-1 block">
                        📅 {scheduled.toLocaleDateString([], { month: "short", day: "numeric" })} at{" "}
                        {scheduled.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    {ev.lead?._id && (
                      <Link
                        href={`/leads/${ev.lead._id}`}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                      >
                        <ArrowUpRight size={14} />
                      </Link>
                    )}
                  </div>
                );
              })}

              {!calendarEvents.length && (
                <div className="p-6 text-center text-xs text-slate-400">
                  No upcoming appointments scheduled this week.
                </div>
              )}
            </div>
          </section>

          {/* Project Documents Vault */}
          <section className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Documents Vault</h3>
                  <span className="text-[11px] text-slate-500">
                    {currentProject?.stage === "UPCOMING"
                      ? "Disabled for Upcoming projects"
                      : `${docs.length} uploaded files`}
                  </span>
                </div>
              </div>

              {currentProject?.stage !== "UPCOMING" && (
                <button
                  onClick={() => setUploadOpen(true)}
                  className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition"
                >
                  <Upload size={13} />
                  Upload
                </button>
              )}
            </div>

            <div className="mt-4 space-y-2.5">
              {currentProject?.stage === "UPCOMING" ? (
                <div className="rounded-xl bg-amber-50 p-4 text-center text-xs text-amber-800">
                  Document uploads are disabled for Upcoming projects until promoted to Ongoing or Completed.
                </div>
              ) : (
                docs.slice(0, 5).map((doc: any) => (
                  <div
                    key={doc._id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 p-3 hover:bg-slate-50 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FileText size={16} className="text-indigo-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <b className="block text-xs font-semibold text-slate-900 truncate">
                          {doc.name}
                        </b>
                        <span className="text-[10px] text-slate-400 block">
                          {doc.category} {doc.size ? `· ${(doc.size / 1024 / 1024).toFixed(1)} MB` : ""}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => openDoc(doc._id)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-800"
                      title="View Document"
                    >
                      <ExternalLink size={14} />
                    </button>
                  </div>
                ))
              )}

              {currentProject?.stage !== "UPCOMING" && !docs.length && (
                <div className="p-6 text-center text-xs text-slate-400">
                  No documents uploaded yet for this project.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* MODAL: CREATE SALES STAFF */}
      {openCreateStaff && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus size={18} className="text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">Add Sales Staff Member</h3>
              </div>
              <button onClick={() => setOpenCreateStaff(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {staffError && (
              <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 flex items-center gap-2">
                <AlertCircle size={15} /> {staffError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 mb-1 block">Full Name *</label>
                <input
                  value={staffForm.name}
                  onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 mb-1 block">Email Address *</label>
                <input
                  type="email"
                  value={staffForm.email}
                  onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                  placeholder="e.g. rahul@example.com"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 mb-1 block">Login Password * (Min 8 chars)</label>
                <input
                  type="password"
                  value={staffForm.password}
                  onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-600"
                />
              </div>

              {/* Multi-project assignment */}
              <div>
                <label className="font-bold text-slate-700 mb-1 block">
                  Assign to Projects (Accessible Leads)
                </label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-2.5 bg-slate-50/50">
                  {projects.map((proj) => {
                    const checked = staffForm.assignedProjects.includes(proj._id);
                    return (
                      <label key={proj._id} className="flex items-center gap-2 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setStaffForm({
                                ...staffForm,
                                assignedProjects: [...staffForm.assignedProjects, proj._id],
                              });
                            } else {
                              setStaffForm({
                                ...staffForm,
                                assignedProjects: staffForm.assignedProjects.filter((id) => id !== proj._id),
                              });
                            }
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-medium text-slate-800">{proj.name}</span>
                        <span className="text-[10px] text-slate-400">({proj.stage})</span>
                      </label>
                    );
                  })}
                  {!projects.length && (
                    <span className="text-slate-400 text-xs">No projects available</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setOpenCreateStaff(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateStaff}
                disabled={creatingStaff}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {creatingStaff ? "Creating..." : "Create Staff Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK UPLOAD MODAL */}
      {uploadOpen && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-5">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white p-5 sm:p-6 shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Upload Project Document</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Store client-shareable files directly in AWS S3.
                </p>
              </div>
              <button
                onClick={() => setUploadOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <label className="mt-5 block text-xs font-semibold text-slate-700">
              Document Category
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
              >
                <option value="BROCHURE">Brochure</option>
                <option value="PRICE_SHEET">Price sheet</option>
                <option value="FLOOR_PLAN">Floor plan</option>
                <option value="PAYMENT_PLAN">Payment plan</option>
                <option value="AMENITIES">Amenities</option>
                <option value="OTHER">Other</option>
              </select>
            </label>

            <div className="mt-4">
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                Select File (PDF, DOCX, Images up to 25 MB)
              </span>
              <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50/30 transition">
                <Upload size={24} className="text-indigo-600 mb-2" />
                <span className="text-xs font-bold text-slate-800">
                  {uploading ? "Uploading to S3..." : "Click to select document"}
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5">
                  Supports brochure, floor plans & price sheets
                </span>
                <input
                  type="file"
                  disabled={uploading}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleQuickUpload(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>

            {uploadError && (
              <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
                {uploadError}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
