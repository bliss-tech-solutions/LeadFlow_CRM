"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Topbar from "../../../components/Topbar";
import Pagination from "../../../components/Pagination";
import { api } from "../../../lib/api";
import { getUser, isAuthError } from "../../../lib/auth";
import {
  Building2,
  Plus,
  Search,
  X,
  Phone,
  ShieldCheck,
  Layers,
  ArrowRight,
  Key,
  Lock,
  UserPlus,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Users,
  Calendar,
  Sparkles,
} from "lucide-react";

interface BusinessItem {
  _id: string;
  name: string;
  detail?: string;
  contactNo?: string;
  leadLimit?: number;
  leadLimitType?: "DAILY" | "MONTHLY" | "NONE";
  isActive: boolean;
  projectCount: number;
  stages: {
    ongoing: number;
    upcoming: number;
    completed: number;
  };
  businessAdmin: {
    _id: string;
    name: string;
    email: string;
    isActive: boolean;
  } | null;
  createdAt: string;
}

export default function BusinessPage() {
  const router = useRouter();
  const currentUser = getUser();
  const isAdmin = currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER";

  // If a business admin logs in and navigates to /business, redirect directly to their business details
  useEffect(() => {
    if (currentUser?.role === "BUSINESS" && currentUser?.business) {
      router.replace(`/business/${currentUser.business}`);
    }
  }, [currentUser, router]);

  const [businesses, setBusinesses] = useState<BusinessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });

  // Modal: Add Business
  const [openAddModal, setOpenAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    detail: "",
    contactNo: "",
    leadLimit: "0",
    leadLimitType: "NONE" as "DAILY" | "MONTHLY" | "NONE",
    createAdmin: true,
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });
  const [addingBusiness, setAddingBusiness] = useState(false);
  const [addError, setAddError] = useState("");

  // Modal: Edit Business
  const [editingBusiness, setEditingBusiness] = useState<BusinessItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    detail: "",
    contactNo: "",
    leadLimit: "0",
    leadLimitType: "NONE" as "DAILY" | "MONTHLY" | "NONE",
    isActive: true,
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  // Modal: Configure Business Admin Login
  const [configLoginBusiness, setConfigLoginBusiness] = useState<BusinessItem | null>(null);
  const [configLoginForm, setConfigLoginForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [savingConfigLogin, setSavingConfigLogin] = useState(false);
  const [configLoginError, setConfigLoginError] = useState("");

  // Modal: Reset Password
  const [resetPasswordBusiness, setResetPasswordBusiness] = useState<BusinessItem | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  async function loadBusinesses(p = page, q = search, s = statusFilter) {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        page: String(p),
        limit: "15",
      });
      if (q.trim()) params.set("search", q.trim());
      if (s && s !== "ALL") params.set("status", s);
      else params.set("status", "ALL");

      const data = await api(`/businesses?${params.toString()}`);
      setBusinesses(data.businesses || []);
      setMeta({
        total: data.total || data.businesses?.length || 0,
        pages: data.pages || 1,
      });
    } catch (err: any) {
      if (!isAuthError(err)) {
        setError(err?.message || "Failed to load businesses.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadBusinesses(page, search, statusFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [page, search, statusFilter]);

  // Aggregate stats across loaded businesses
  const stats = useMemo(() => {
    let totalProjects = 0;
    let ongoing = 0;
    let upcoming = 0;
    let completed = 0;
    for (const b of businesses) {
      totalProjects += b.projectCount || 0;
      ongoing += b.stages?.ongoing || 0;
      upcoming += b.stages?.upcoming || 0;
      completed += b.stages?.completed || 0;
    }
    return {
      totalBusinesses: meta.total || businesses.length,
      totalProjects,
      ongoing,
      upcoming,
      completed,
    };
  }, [businesses, meta.total]);

  // Filtered list by status filter
  const filteredBusinesses = useMemo(() => {
    if (statusFilter === "ALL") return businesses;
    if (statusFilter === "ACTIVE") return businesses.filter((b) => b.isActive);
    return businesses.filter((b) => !b.isActive);
  }, [businesses, statusFilter]);

  // Handle Add Business
  async function handleAddBusiness() {
    setAddError("");
    if (!addForm.name.trim()) {
      setAddError("Business name is required (e.g. Zion Group).");
      return;
    }
    if (addForm.createAdmin) {
      if (!addForm.adminEmail.trim()) {
        setAddError("Admin email is required to create the business login.");
        return;
      }
      if (!addForm.adminPassword || addForm.adminPassword.length < 8) {
        setAddError("Admin password must be at least 8 characters.");
        return;
      }
    }

    try {
      setAddingBusiness(true);
      await api("/businesses", {
        method: "POST",
        body: JSON.stringify({
          name: addForm.name.trim(),
          detail: addForm.detail.trim(),
          contactNo: addForm.contactNo.trim(),
          leadLimit: Number(addForm.leadLimit) || 0,
          leadLimitType: addForm.leadLimitType,
          adminEmail: addForm.createAdmin ? addForm.adminEmail.trim().toLowerCase() : undefined,
          adminPassword: addForm.createAdmin ? addForm.adminPassword : undefined,
          adminName: addForm.createAdmin ? addForm.adminName.trim() || `${addForm.name.trim()} Admin` : undefined,
        }),
      });

      setOpenAddModal(false);
      setAddForm({
        name: "",
        detail: "",
        contactNo: "",
        leadLimit: "0",
        leadLimitType: "NONE",
        createAdmin: true,
        adminName: "",
        adminEmail: "",
        adminPassword: "",
      });
      await loadBusinesses(1, "");
    } catch (err: any) {
      setAddError(err?.message || "Failed to create business.");
    } finally {
      setAddingBusiness(false);
    }
  }

  // Handle Edit Business
  function openEdit(b: BusinessItem) {
    setEditingBusiness(b);
    setEditForm({
      name: b.name || "",
      detail: b.detail || "",
      contactNo: b.contactNo || "",
      leadLimit: String(b.leadLimit || 0),
      leadLimitType: b.leadLimitType || "NONE",
      isActive: b.isActive,
    });
    setEditError("");
  }

  async function handleSaveEdit() {
    if (!editingBusiness) return;
    setEditError("");
    if (!editForm.name.trim()) {
      setEditError("Business name cannot be empty.");
      return;
    }

    try {
      setSavingEdit(true);
      await api(`/businesses/${editingBusiness._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name.trim(),
          detail: editForm.detail.trim(),
          contactNo: editForm.contactNo.trim(),
          leadLimit: Number(editForm.leadLimit) || 0,
          leadLimitType: editForm.leadLimitType,
          isActive: editForm.isActive,
        }),
      });

      setEditingBusiness(null);
      await loadBusinesses(page, search, statusFilter);
    } catch (err: any) {
      setEditError(err?.message || "Failed to update business.");
    } finally {
      setSavingEdit(false);
    }
  }

  // Handle Configure Business Admin Login
  function openConfigLogin(b: BusinessItem) {
    setConfigLoginBusiness(b);
    setConfigLoginForm({
      name: `${b.name} Admin`,
      email: "",
      password: "",
    });
    setConfigLoginError("");
  }

  async function handleSaveConfigLogin() {
    if (!configLoginBusiness) return;
    setConfigLoginError("");
    if (!configLoginForm.email.trim()) {
      setConfigLoginError("Email is required.");
      return;
    }
    if (!configLoginForm.password || configLoginForm.password.length < 8) {
      setConfigLoginError("Password must be at least 8 characters.");
      return;
    }

    try {
      setSavingConfigLogin(true);
      await api(`/businesses/${configLoginBusiness._id}/admin-user`, {
        method: "POST",
        body: JSON.stringify({
          name: configLoginForm.name.trim() || `${configLoginBusiness.name} Admin`,
          email: configLoginForm.email.trim().toLowerCase(),
          password: configLoginForm.password,
        }),
      });

      setConfigLoginBusiness(null);
      await loadBusinesses(page, search, statusFilter);
    } catch (err: any) {
      setConfigLoginError(err?.message || "Failed to configure business login.");
    } finally {
      setSavingConfigLogin(false);
    }
  }

  // Handle Reset Password
  function openResetPassword(b: BusinessItem) {
    setResetPasswordBusiness(b);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setPasswordSuccess("");
  }

  async function handleResetPassword() {
    if (!resetPasswordBusiness) return;
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
      await api(`/businesses/${resetPasswordBusiness._id}/admin-password`, {
        method: "PATCH",
        body: JSON.stringify({ password: newPassword }),
      });

      setPasswordSuccess("Password successfully changed!");
      setTimeout(() => {
        setResetPasswordBusiness(null);
      }, 1200);
    } catch (err: any) {
      setPasswordError(err?.message || "Failed to update password.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-6">
      <Topbar
        title="Businesses"
        subtitle="Manage developer groups and business entities, their lead limits, and project portfolios."
      />

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Top Executive Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Total Businesses
            </span>
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
              <Briefcase size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{stats.totalBusinesses}</div>
          <p className="mt-1 text-[11px] text-slate-500">Developer & partner groups</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Total Projects
            </span>
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <Building2 size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{stats.totalProjects}</div>
          <p className="mt-1 text-[11px] text-slate-500">Across all businesses</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Ongoing Projects
            </span>
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <Sparkles size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-600">{stats.ongoing}</div>
          <p className="mt-1 text-[11px] text-slate-500">Active RERA & inventory</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Upcoming / Completed
            </span>
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <Layers size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-600">{stats.upcoming}</span>
            <span className="text-xs text-slate-400">upcoming /</span>
            <span className="text-2xl font-black text-slate-700">{stats.completed}</span>
            <span className="text-xs text-slate-400">done</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Pipeline portfolio</p>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search business, contact, detail..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-3.5 py-2 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Status Pills */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/70 p-1">
            {(["ALL", "ACTIVE", "INACTIVE"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-3 py-1 text-[11px] font-bold transition-all ${
                  statusFilter === s
                    ? "bg-white text-indigo-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {s === "ALL" ? "All" : s === "ACTIVE" ? "Active" : "Inactive"}
              </button>
            ))}
          </div>
        </div>

        {/* Primary Add Business Button */}
        {isAdmin && (
          <button
            onClick={() => {
              setAddError("");
              setOpenAddModal(true);
            }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 active:scale-[0.98] transition-all"
          >
            <Plus size={15} />
            <span>Add Business</span>
          </button>
        )}
      </div>

      {/* Businesses View */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs font-semibold text-slate-400">
          Loading businesses...
        </div>
      ) : filteredBusinesses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <Briefcase size={32} className="mx-auto text-slate-300" />
          <h3 className="mt-3 text-sm font-bold text-slate-800">No businesses found</h3>
          <p className="mt-1 text-xs text-slate-400">
            {search ? "No businesses match your search term." : "Get started by adding your first business group."}
          </p>
          {isAdmin && (
            <button
              onClick={() => setOpenAddModal(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
            >
              <Plus size={14} /> Add Business
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
                  <th className="py-3.5 px-5">Business</th>
                  <th className="py-3.5 px-4">Contact</th>
                  {isAdmin && <th className="py-3.5 px-4">Lead Quota</th>}
                  <th className="py-3.5 px-4">Projects</th>
                  <th className="py-3.5 px-4">Business Admin Login</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredBusinesses.map((b) => {
                  const quotaBadge =
                    b.leadLimitType === "DAILY"
                      ? `${b.leadLimit} / day`
                      : b.leadLimitType === "MONTHLY"
                        ? `${b.leadLimit} / month`
                        : "Unlimited";

                  return (
                    <tr key={b._id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Name & Detail */}
                      <td className="py-4 px-5">
                        <div className="flex items-start gap-3">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 font-black text-indigo-700 text-xs border border-indigo-100">
                            {b.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/business/${b._id}`}
                              className="font-bold text-slate-900 hover:text-indigo-600 hover:underline flex items-center gap-1.5"
                            >
                              <span>{b.name}</span>
                            </Link>
                            {b.detail && (
                              <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">
                                {b.detail}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-4 px-4 text-slate-700">
                        {b.contactNo ? (
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <Phone size={12} className="text-slate-400" />
                            {b.contactNo}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Lead Quota - Admin only */}
                      {isAdmin && (
                        <td className="py-4 px-4">
                          <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                            {quotaBadge}
                          </span>
                        </td>
                      )}

                      {/* Projects Breakdown */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">
                              {b.projectCount} {b.projectCount === 1 ? "Project" : "Projects"}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1 text-[10px]">
                            {b.stages?.ongoing > 0 && (
                              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
                                {b.stages.ongoing} Ongoing
                              </span>
                            )}
                            {b.stages?.upcoming > 0 && (
                              <span className="rounded-md bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">
                                {b.stages.upcoming} Upcoming
                              </span>
                            )}
                            {b.stages?.completed > 0 && (
                              <span className="rounded-md bg-purple-50 px-1.5 py-0.5 font-semibold text-purple-700">
                                {b.stages.completed} Done
                              </span>
                            )}
                            {b.projectCount === 0 && (
                              <span className="text-slate-400">None yet</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Business Admin Login */}
                      <td className="py-4 px-4">
                        {b.businessAdmin ? (
                          <div className="flex items-center gap-2">
                            <div className="min-w-0">
                              <span className="block truncate font-bold text-slate-800 text-[11px]">
                                {b.businessAdmin.email}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                                <CheckCircle2 size={10} /> Configured
                              </span>
                            </div>
                            {isAdmin && (
                              <button
                                onClick={() => openResetPassword(b)}
                                title="Reset / Change Business Admin Password"
                                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 transition-colors shadow-xs"
                              >
                                <Key size={13} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div>
                            {isAdmin ? (
                              <button
                                onClick={() => openConfigLogin(b)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/60 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 transition-colors"
                              >
                                <UserPlus size={12} />
                                <span>Create Login</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400">Not configured</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Active Status */}
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            b.isActive
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              b.isActive ? "bg-emerald-500" : "bg-slate-400"
                            }`}
                          />
                          {b.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5 text-right">
                        <div className="inline-flex items-center gap-2">
                          {isAdmin && (
                            <button
                              onClick={() => openEdit(b)}
                              title="Edit Business"
                              className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                              <Edit2 size={13} />
                            </button>
                          )}
                          <Link
                            href={`/business/${b._id}`}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 transition-all shadow-xs"
                          >
                            <span>Projects & Details</span>
                            <ArrowRight size={13} />
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
            {filteredBusinesses.map((b) => {
              const quotaBadge =
                b.leadLimitType === "DAILY"
                  ? `${b.leadLimit} / day`
                  : b.leadLimitType === "MONTHLY"
                    ? `${b.leadLimit} / month`
                    : "Unlimited";

              return (
                <div
                  key={b._id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
                >
                  <div>
                    {/* Top row: Name & Active badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 font-black text-indigo-700 text-xs border border-indigo-100">
                          {b.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/business/${b._id}`}
                            className="font-bold text-slate-900 text-sm hover:text-indigo-600 block truncate"
                          >
                            {b.name}
                          </Link>
                          {b.contactNo && (
                            <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                              <Phone size={11} className="text-slate-400" />
                              {b.contactNo}
                            </p>
                          )}
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          b.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {b.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>

                    {b.detail && (
                      <p className="mt-3 text-xs text-slate-600 line-clamp-2">{b.detail}</p>
                    )}

                    {/* Stats pill box */}
                    <div className={`mt-4 grid ${isAdmin ? "grid-cols-2" : "grid-cols-1"} gap-2 rounded-xl bg-slate-50 p-3`}>
                      {isAdmin && (
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Lead Quota
                          </span>
                          <strong className="mt-0.5 block text-xs font-bold text-slate-800">
                            {quotaBadge}
                          </strong>
                        </div>
                      )}
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Projects
                        </span>
                        <strong className="mt-0.5 block text-xs font-bold text-indigo-700">
                          {b.projectCount} {b.projectCount === 1 ? "Project" : "Projects"}
                        </strong>
                      </div>
                    </div>

                    {/* Project Stage Pills */}
                    <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px]">
                      {b.stages?.ongoing > 0 && (
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                          {b.stages.ongoing} Ongoing
                        </span>
                      )}
                      {b.stages?.upcoming > 0 && (
                        <span className="rounded-md bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
                          {b.stages.upcoming} Upcoming
                        </span>
                      )}
                      {b.stages?.completed > 0 && (
                        <span className="rounded-md bg-purple-50 px-2 py-0.5 font-semibold text-purple-700">
                          {b.stages.completed} Completed
                        </span>
                      )}
                    </div>

                    {/* Business Admin Login Box */}
                    <div className="mt-3.5 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="block text-[10px] font-bold uppercase text-slate-400">
                            Business Login
                          </span>
                          {b.businessAdmin ? (
                            <span className="block truncate text-xs font-bold text-slate-800">
                              {b.businessAdmin.email}
                            </span>
                          ) : (
                            <span className="block text-[11px] text-slate-400 font-medium">
                              Not configured
                            </span>
                          )}
                        </div>

                        {isAdmin && (
                          <div>
                            {b.businessAdmin ? (
                              <button
                                onClick={() => openResetPassword(b)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 shadow-xs"
                              >
                                <Key size={11} /> Reset
                              </button>
                            ) : (
                              <button
                                onClick={() => openConfigLogin(b)}
                                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-indigo-700"
                              >
                                <UserPlus size={11} /> Create
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action Button */}
                  <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    {isAdmin && (
                      <button
                        onClick={() => openEdit(b)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                    )}
                    <Link
                      href={`/business/${b._id}`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-all shadow-sm"
                    >
                      <span>View Projects & Details</span>
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {meta.pages > 1 && (
            <div className="mt-4">
              <Pagination
                page={page}
                pages={meta.pages}
                total={meta.total}
                onChange={(p: number) => setPage(p)}
              />
            </div>
          )}
        </>
      )}

      {/* MODAL: ADD BUSINESS */}
      {openAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-600 text-white shadow-xs">
                  <Building2 size={16} />
                </div>
                <h3 className="text-base font-bold text-slate-900">Add New Business</h3>
              </div>
              <button
                onClick={() => setOpenAddModal(false)}
                className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {addError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                  {addError}
                </div>
              )}

              {/* Business Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Business / Developer Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Zion Group, Baroda Business Park"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {/* Description / Detail */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Description / Detail
                </label>
                <textarea
                  rows={2}
                  value={addForm.detail}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, detail: e.target.value }))}
                  placeholder="Brief summary of developer group, primary operational regions..."
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {/* Contact Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Contact Number
                </label>
                <input
                  type="text"
                  value={addForm.contactNo}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, contactNo: e.target.value }))}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {/* Lead Quota Limit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Lead Limit Type
                  </label>
                  <select
                    value={addForm.leadLimitType}
                    onChange={(e) =>
                      setAddForm((prev) => ({
                        ...prev,
                        leadLimitType: e.target.value as any,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                  >
                    <option value="NONE">Unlimited (No Limit)</option>
                    <option value="DAILY">Daily Lead Quota</option>
                    <option value="MONTHLY">Monthly Lead Quota</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Quota Amount
                  </label>
                  <input
                    type="number"
                    min="0"
                    disabled={addForm.leadLimitType === "NONE"}
                    value={addForm.leadLimit}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, leadLimit: e.target.value }))}
                    placeholder="0 = unlimited"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
              </div>

              {/* Business Admin Login Section */}
              <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-indigo-600" />
                    <span className="text-xs font-bold text-slate-900">
                      Configure Business Admin Login
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={addForm.createAdmin}
                    onChange={(e) =>
                      setAddForm((prev) => ({ ...prev, createAdmin: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </div>

                {addForm.createAdmin && (
                  <div className="space-y-3 pt-2">
                    <p className="text-[11px] text-slate-500">
                      Creates the single Business Admin account for this partner. They can log in to manage projects, staff, and view scoped leads.
                    </p>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Admin Name
                      </label>
                      <input
                        type="text"
                        value={addForm.adminName}
                        onChange={(e) =>
                          setAddForm((prev) => ({ ...prev, adminName: e.target.value }))
                        }
                        placeholder={addForm.name ? `${addForm.name} Admin` : "e.g. Rahul Sharma"}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Admin Email <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={addForm.adminEmail}
                        onChange={(e) =>
                          setAddForm((prev) => ({ ...prev, adminEmail: e.target.value }))
                        }
                        placeholder="admin@developergroup.com"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Admin Password <span className="text-rose-500">*</span> (min 8 chars)
                      </label>
                      <input
                        type="password"
                        value={addForm.adminPassword}
                        onChange={(e) =>
                          setAddForm((prev) => ({ ...prev, adminPassword: e.target.value }))
                        }
                        placeholder="••••••••"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setOpenAddModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={addingBusiness}
                onClick={handleAddBusiness}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
              >
                {addingBusiness ? "Creating..." : "Create Business"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT BUSINESS */}
      {editingBusiness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <h3 className="text-base font-bold text-slate-900">
                Edit {editingBusiness.name}
              </h3>
              <button
                onClick={() => setEditingBusiness(null)}
                className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {editError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Business Name
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Description / Detail
                </label>
                <textarea
                  rows={2}
                  value={editForm.detail}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, detail: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Contact Number
                </label>
                <input
                  type="text"
                  value={editForm.contactNo}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, contactNo: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Lead Limit Type
                  </label>
                  <select
                    value={editForm.leadLimitType}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        leadLimitType: e.target.value as any,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                  >
                    <option value="NONE">Unlimited</option>
                    <option value="DAILY">Daily Lead Quota</option>
                    <option value="MONTHLY">Monthly Lead Quota</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Quota Amount
                  </label>
                  <input
                    type="number"
                    min="0"
                    disabled={editForm.leadLimitType === "NONE"}
                    value={editForm.leadLimit}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, leadLimit: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                <div>
                  <span className="block text-xs font-bold text-slate-800">Business Status</span>
                  <span className="text-[11px] text-slate-500">
                    Inactive businesses pause receiving new leads
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, isActive: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setEditingBusiness(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingEdit}
                onClick={handleSaveEdit}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIGURE BUSINESS ADMIN LOGIN */}
      {configLoginBusiness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <UserPlus size={16} className="text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Create Business Login
                </h3>
              </div>
              <button
                onClick={() => setConfigLoginBusiness(null)}
                className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500">
                Setup the Business Admin login for <b className="text-slate-800">{configLoginBusiness.name}</b>.
                This single login grants access to manage this business portfolio, projects, and sales staff.
              </p>

              {configLoginError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                  {configLoginError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={configLoginForm.name}
                  onChange={(e) =>
                    setConfigLoginForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Admin Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  value={configLoginForm.email}
                  onChange={(e) =>
                    setConfigLoginForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="admin@developer.com"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Password <span className="text-rose-500">*</span> (min 8 chars)
                </label>
                <input
                  type="password"
                  value={configLoginForm.password}
                  onChange={(e) =>
                    setConfigLoginForm((prev) => ({ ...prev, password: e.target.value }))
                  }
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setConfigLoginBusiness(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingConfigLogin}
                onClick={handleSaveConfigLogin}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingConfigLogin ? "Creating..." : "Create Login"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RESET PASSWORD */}
      {resetPasswordBusiness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Key size={16} className="text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Reset Business Admin Password
                </h3>
              </div>
              <button
                onClick={() => setResetPasswordBusiness(null)}
                className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="block text-[10px] font-bold uppercase text-slate-400">
                  Business Entity
                </span>
                <strong className="text-xs font-bold text-slate-800">
                  {resetPasswordBusiness.name}
                </strong>
                {resetPasswordBusiness.businessAdmin && (
                  <span className="block mt-1 text-[11px] text-slate-500 font-medium">
                    Admin login: {resetPasswordBusiness.businessAdmin.email}
                  </span>
                )}
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
                  New Password <span className="text-rose-500">*</span> (min 8 chars)
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
                  Confirm New Password <span className="text-rose-500">*</span>
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
                onClick={() => setResetPasswordBusiness(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingPassword}
                onClick={handleResetPassword}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingPassword ? "Updating..." : "Update Password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
