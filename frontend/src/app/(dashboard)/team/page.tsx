"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Topbar from "../../../components/Topbar";
import Pagination from "../../../components/Pagination";
import { api } from "../../../lib/api";
import { getUser } from "../../../lib/auth";
import {
  Plus,
  X,
  Search,
  Lock,
  Unlock,
  Ban,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FolderGit2,
} from "lucide-react";

export default function Team() {
  const current = getUser();
  const isAdmin = current?.role === "ADMIN" || current?.role === "MANAGER";
  const canManage = isAdmin || current?.role === "BUSINESS";

  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);

  // Add salesperson modal
  const [openCreate, setOpenCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    assignedProjects: [] as string[],
  });
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit assigned projects modal
  const [projectModalUser, setProjectModalUser] = useState<any | null>(null);
  const [modalAssignedProjects, setModalAssignedProjects] = useState<string[]>([]);
  const [savingProjects, setSavingProjects] = useState(false);
  const [projectModalError, setProjectModalError] = useState("");

  // Block/unblock state
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    api("/business-projects?limit=100")
      .then((d) => setProjects(d.projects || []))
      .catch(() => {});
  }, []);

  async function load(currentPage = page, search = q, status = statusFilter) {
    setLoading(true);
    setActionError("");
    try {
      const params = new URLSearchParams({
        role: "SALES",
        page: String(currentPage),
        limit: "10",
      });
      if (search.trim()) params.set("search", search.trim());
      if (status !== "ALL") params.set("status", status);
      else params.set("status", "ALL");

      const d = await api(`/users?${params.toString()}`);
      setUsers(d.users || []);
      setMeta({ total: d.total || 0, pages: d.pages || 1 });
    } catch (err: any) {
      console.error("[team] load failed", err);
      setActionError(err?.message || "Failed to load salespeople");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [q, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load(page, q, statusFilter);
    }, 350);
    return () => clearTimeout(timer);
  }, [page, q, statusFilter]);

  async function toggleBlock(user: any) {
    if (user._id === current?.id && user.isActive) {
      alert("You cannot block your own account.");
      return;
    }

    const actionName = user.isActive ? "block" : "unblock";
    const confirmMsg = user.isActive
      ? `Are you sure you want to block ${user.name}? When blocked, this salesperson cannot log in or receive any leads.`
      : `Unblock ${user.name}? They will be able to log in and receive leads for their assigned projects.`;

    if (!window.confirm(confirmMsg)) return;

    setStatusUpdatingId(user._id);
    setActionError("");
    try {
      await api(`/users/${user._id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      void load(page, q, statusFilter);
    } catch (err: any) {
      setActionError(err?.message || `Failed to ${actionName} user.`);
    } finally {
      setStatusUpdatingId(null);
    }
  }

  function openProjectModal(user: any) {
    setProjectModalUser(user);
    const existing = Array.isArray(user.assignedProjects)
      ? user.assignedProjects.map((p: any) => p._id || String(p))
      : user.businessProject?._id
      ? [String(user.businessProject._id)]
      : [];
    setModalAssignedProjects(existing);
    setProjectModalError("");
  }

  async function saveAssignedProjects() {
    if (!projectModalUser) return;
    setSavingProjects(true);
    setProjectModalError("");
    try {
      await api(`/users/${projectModalUser._id}/assigned-projects`, {
        method: "PATCH",
        body: JSON.stringify({ assignedProjects: modalAssignedProjects }),
      });
      setProjectModalUser(null);
      void load(page, q, statusFilter);
    } catch (err: any) {
      setProjectModalError(err?.message || "Failed to update project assignments.");
    } finally {
      setSavingProjects(false);
    }
  }

  async function createSalesperson() {
    setCreateError("");
    if (!createForm.name.trim() || !createForm.email.trim() || !createForm.password) {
      setCreateError("Name, email and temporary password are required.");
      return;
    }
    if (createForm.password.length < 8) {
      setCreateError("Password must be at least 8 characters.");
      return;
    }

    setCreating(true);
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({
          name: createForm.name.trim(),
          email: createForm.email.trim().toLowerCase(),
          password: createForm.password,
          role: "SALES",
          assignedProjects: createForm.assignedProjects,
        }),
      });
      setCreateForm({ name: "", email: "", password: "", assignedProjects: [] });
      setOpenCreate(false);
      void load(1, q, statusFilter);
    } catch (e: any) {
      setCreateError(e?.message || "Unable to create salesperson.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <Topbar
        title="Sales Team"
        subtitle="Manage sales team members, restrict or block accounts, and assign business projects."
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Search & Filter Bar */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 border-b border-slate-100 p-3 sm:p-4">
          <div className="relative flex-1 min-w-[200px] w-full sm:w-auto">
            <Search size={14} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search salesperson by name or email (top 10 results)..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 text-xs outline-none focus:border-indigo-500 focus:bg-white transition"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none"
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active only</option>
            <option value="BLOCKED">Blocked only</option>
          </select>

          {q && (
            <button
              onClick={() => setQ("")}
              className="inline-flex h-10 w-full sm:w-auto items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition"
            >
              <X size={13} /> Clear
            </button>
          )}

          {canManage && (
            <button
              onClick={() => setOpenCreate(true)}
              className="w-full sm:w-auto sm:ml-auto inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
            >
              <Plus size={15} /> Add Salesperson
            </button>
          )}
        </div>

        {actionError && (
          <div className="flex items-center justify-between border-b border-rose-100 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
            <span>{actionError}</span>
            <button onClick={() => setActionError("")} className="text-rose-500 hover:text-rose-700">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Mobile & Tablet Card View (< lg: stacked cards, no horizontal scroll) */}
        <div className="block lg:hidden divide-y divide-slate-100">
          {users.map((u) => {
            const isBlocked = !u.isActive;
            const isUpdating = statusUpdatingId === u._id;

            return (
              <div key={u._id} className="p-4 space-y-3 bg-white hover:bg-slate-50/60 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {u.profilePhotoUrl ? (
                      <Image
                        src={u.profilePhotoUrl}
                        alt={u.name}
                        height={40}
                        width={40}
                        className="h-10 w-10 shrink-0 rounded-full border border-indigo-200 object-cover"
                      />
                    ) : (
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-50 font-bold text-xs text-indigo-700">
                        {u.name?.[0]?.toUpperCase() || "S"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <b className="block text-sm text-slate-900 truncate">{u.name}</b>
                      <span className="block text-xs text-slate-400 truncate mt-0.5">{u.email}</span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isBlocked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200">
                        <Ban size={11} /> Blocked / Restricted
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                        <CheckCircle2 size={11} /> Active
                      </span>
                    )}
                  </div>
                </div>

                {/* Assigned Projects Badges */}
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Assigned Projects
                  </span>
                  {u.assignedProjects?.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {u.assignedProjects.map((p: any) => (
                        <span
                          key={p._id || p}
                          className="rounded-md bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 truncate max-w-[150px]"
                        >
                          {p.name || p}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400 text-xs italic">All Projects</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-slate-50 p-2.5 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Today Assigned</span>
                    <b className="mt-1 block text-sm text-slate-900">{u.assignedToday ?? 0} leads</b>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Lifetime Leads</span>
                    <b className="mt-1 block text-sm text-slate-900">{u.assignedLeadCount || 0} leads</b>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openProjectModal(u)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
                      >
                        <FolderGit2 size={12} /> Assign Projects
                      </button>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => toggleBlock(u)}
                          disabled={isUpdating || u._id === current?.id}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 shadow-xs ${
                            isBlocked
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                              : "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          }`}
                        >
                          {isUpdating ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : isBlocked ? (
                            <Unlock size={12} />
                          ) : (
                            <Lock size={12} />
                          )}
                          {isBlocked ? "Unblock Staff" : "Block / Restrict"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table View (>= lg) */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="min-w-[960px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {["Salesperson", "Assigned Projects", "Today Assigned", "Total Leads", "Status", "Actions"].map(
                  (label) => (
                    <th key={label} className="px-5 py-3.5 font-semibold">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isBlocked = !u.isActive;
                const isUpdating = statusUpdatingId === u._id;

                return (
                  <tr key={u._id} className="border-t border-slate-100 hover:bg-slate-50/70 transition">
                    {/* Salesperson */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {u.profilePhotoUrl ? (
                          <Image
                            src={u.profilePhotoUrl}
                            alt={u.name}
                            height={36}
                            width={36}
                            className="h-9 w-9 shrink-0 rounded-full border border-indigo-200 object-cover"
                          />
                        ) : (
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-50 font-bold text-xs text-indigo-700">
                            {u.name?.[0]?.toUpperCase() || "S"}
                          </div>
                        )}
                        <div className="min-w-0">
                          <b className="block truncate text-slate-900">{u.name}</b>
                          <span className="block truncate text-[11px] text-slate-400">{u.email}</span>
                        </div>
                      </div>
                    </td>

                    {/* Assigned Projects */}
                    <td className="px-5 py-3.5 max-w-[260px]">
                      {u.assignedProjects?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {u.assignedProjects.map((p: any) => (
                            <span
                              key={p._id || p}
                              className="rounded-md bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 truncate max-w-[140px]"
                            >
                              {p.name || p}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs italic">All Projects</span>
                      )}
                    </td>

                    {/* Today Assigned */}
                    <td className="px-5 py-3.5 font-semibold text-slate-800">
                      {u.assignedToday ?? 0} leads
                    </td>

                    {/* Total Leads */}
                    <td className="px-5 py-3.5 font-semibold text-slate-700">
                      {u.assignedLeadCount || 0} leads
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5">
                      {isBlocked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
                          <Ban size={12} /> Blocked / Restricted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                          <CheckCircle2 size={12} /> Active
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => openProjectModal(u)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 shadow-xs transition"
                            title="Assign or change business projects"
                          >
                            <FolderGit2 size={12} /> Assign Projects
                          </button>
                        )}

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => toggleBlock(u)}
                            disabled={isUpdating || u._id === current?.id}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40 shadow-xs ${
                              isBlocked
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                : "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                            }`}
                            title={isBlocked ? "Unblock this salesperson" : "Block salesperson from receiving leads"}
                          >
                            {isUpdating ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : isBlocked ? (
                              <Unlock size={12} />
                            ) : (
                              <Lock size={12} />
                            )}
                            {isBlocked ? "Unblock" : "Block"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {users.length === 0 && !loading && (
          <div className="p-8 text-center text-xs text-slate-400">
            No salespeople found.
          </div>
        )}

        {meta.pages > 1 && (
          <div className="border-t border-slate-100 p-4">
            <Pagination
              page={page}
              pages={meta.pages}
              total={meta.total}
              onChange={(p) => setPage(p)}
            />
          </div>
        )}
      </section>

      {/* ASSIGN PROJECTS MODAL */}
      {projectModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <FolderGit2 size={18} className="text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Assign Projects: {projectModalUser.name}
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Staff will strictly receive and access leads for selected projects only.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProjectModalUser(null)}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {projectModalError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {projectModalError}
                </div>
              )}

              <p className="text-xs text-slate-600">
                Select which projects this sales rep can receive leads for:
              </p>

              <div className="space-y-2">
                {projects.map((proj) => {
                  const isChecked = modalAssignedProjects.includes(proj._id);
                  return (
                    <label
                      key={proj._id}
                      className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${
                        isChecked
                          ? "border-indigo-400 bg-indigo-50/40 text-slate-900"
                          : "border-slate-200 hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setModalAssignedProjects((prev) => [...prev, proj._id]);
                          } else {
                            setModalAssignedProjects((prev) =>
                              prev.filter((id) => id !== proj._id),
                            );
                          }
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold">{proj.name}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 uppercase">
                            {proj.stage}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          {proj.location || proj.developerGroup || "No location added"}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>

              {projects.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400">
                  No projects available to assign.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setProjectModalUser(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingProjects}
                onClick={saveAssignedProjects}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingProjects ? "Saving..." : "Save Project Assignments"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE SALESPERSON MODAL */}
      {openCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Plus size={18} className="text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Add New Salesperson</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpenCreate(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              {createError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3.5 text-xs outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  placeholder="e.g. rahul@example.com"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3.5 text-xs outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Temporary Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  placeholder="Minimum 8 characters"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3.5 text-xs outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Assigned Business Projects
                </label>
                <p className="text-[11px] text-slate-400 mb-2">
                  Select which projects this salesperson can receive leads for:
                </p>

                <div className="max-h-40 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2.5">
                  {projects.map((proj) => {
                    const isChecked = createForm.assignedProjects.includes(proj._id);
                    return (
                      <label
                        key={proj._id}
                        className={`flex items-center gap-2.5 rounded-lg p-2 text-xs cursor-pointer ${
                          isChecked ? "bg-indigo-50 font-bold text-indigo-700" : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCreateForm((prev) => ({
                                ...prev,
                                assignedProjects: [...prev.assignedProjects, proj._id],
                              }));
                            } else {
                              setCreateForm((prev) => ({
                                ...prev,
                                assignedProjects: prev.assignedProjects.filter((id) => id !== proj._id),
                              }));
                            }
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{proj.name}</span>
                        <span className="text-[10px] text-slate-400 uppercase">({proj.stage})</span>
                      </label>
                    );
                  })}
                  {projects.length === 0 && (
                    <span className="text-xs text-slate-400">No projects available</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setOpenCreate(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={createSalesperson}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Salesperson"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
