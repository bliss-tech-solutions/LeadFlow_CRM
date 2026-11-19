"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import Modal, { btn, field } from "./Modal";
import { api } from "../lib/api";
import { getUser } from "../lib/auth";
import { MANUAL_SOURCES } from "../lib/leadMeta";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (lead: any) => void;
  projects: any[];
  salesUsers?: any[];
};

const empty = { name: "", phone: "", email: "", businessProject: "", source: "WALK_IN", campaign: "", notes: "", assignedTo: "" };

export default function NewLeadModal({ open, onClose, onCreated, projects, salesUsers = [] }: Props) {
  const user = getUser();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState<any>(null);

  useEffect(() => {
    if (open) {
      setForm({ ...empty, businessProject: projects.length === 1 ? projects[0]._id : "" });
      setError("");
      setDuplicate(null);
    }
  }, [open, projects]);

  // Live duplicate warning while typing phone / email.
  useEffect(() => {
    if (!open || (!form.phone.trim() && !form.email.trim())) {
      setDuplicate(null);
      return;
    }
    const t = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (form.phone.trim().length >= 8) params.set("phone", form.phone.trim());
        if (form.email.includes("@")) params.set("email", form.email.trim());
        if (!params.toString()) return setDuplicate(null);
        const d = await api(`/leads/check-duplicate?${params}`);
        setDuplicate(d.duplicate);
      } catch {
        setDuplicate(null);
      }
    }, 450);
    return () => window.clearTimeout(t);
  }, [form.phone, form.email, open]);

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setError("");
    if (!form.name.trim()) return setError("Name is required");
    if (!form.phone.trim() && !form.email.trim()) return setError("Add a phone number or an email");
    if (user?.role !== "ADMIN" && user?.role !== "MANAGER" && !form.businessProject) return setError("Select a project");
    setSaving(true);
    try {
      const d = await api("/leads", { method: "POST", body: JSON.stringify(form) });
      onCreated(d.lead);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Could not create lead");
    } finally {
      setSaving(false);
    }
  }

  const canPickOwner = user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "BUSINESS";
  const eligibleSales = salesUsers.filter(
    (s) =>
      !form.businessProject ||
      !s.assignedProjects?.length ||
      s.assignedProjects.some((p: any) => String(p?._id || p) === form.businessProject),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add lead"
      subtitle="Walk-ins, referrals and phone enquiries — tracked like every Meta lead."
      footer={
        <>
          <button className={btn.secondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className={btn.primary} onClick={submit} disabled={saving}>
            {saving && <Loader2 size={13} className="animate-spin" />} Create lead
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
          Full name *
          <input value={form.name} onChange={set("name")} className={field} maxLength={120} placeholder="e.g. Priya Sharma" />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Phone
          <input value={form.phone} onChange={set("phone")} className={field} inputMode="tel" placeholder="+91 98765 43210" />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Email
          <input value={form.email} onChange={set("email")} className={field} type="email" placeholder="name@example.com" />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Project {user?.role === "ADMIN" || user?.role === "MANAGER" ? "" : "*"}
          <select value={form.businessProject} onChange={set("businessProject")} className={field}>
            <option value="">{user?.role === "ADMIN" || user?.role === "MANAGER" ? "Unmapped" : "Select project"}</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
                {p.business?.name ? ` · ${p.business.name}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Source
          <select value={form.source} onChange={set("source")} className={field}>
            {MANUAL_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {canPickOwner && (
          <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
            Assign to
            <select value={form.assignedTo} onChange={set("assignedTo")} className={field}>
              <option value="">Leave unassigned</option>
              {eligibleSales.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
          First note
          <textarea value={form.notes} onChange={set("notes")} rows={3} className={field} maxLength={2000} placeholder="Requirement, budget, preferred unit…" />
        </label>
      </div>

      {duplicate && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            A lead with this contact already exists:{" "}
            <Link href={`/leads/${duplicate._id}`} className="font-semibold underline" target="_blank">
              {duplicate.name}
            </Link>{" "}
            ({String(duplicate.status).replaceAll("_", " ").toLowerCase()}, {new Date(duplicate.createdAt).toLocaleDateString()}). You can still create it — it will be flagged as a repeat enquiry.
          </span>
        </div>
      )}
      {error && <div className="mt-3 rounded-xl bg-rose-50 p-2.5 text-xs text-rose-700">{error}</div>}
    </Modal>
  );
}
