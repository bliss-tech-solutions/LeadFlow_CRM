"use client";
import { useEffect, useState } from "react";
import Topbar from "../../../components/Topbar";
import { api } from "../../../lib/api";
import { getUser } from "../../../lib/auth";
import { UserRound, ShieldCheck, Plus, X } from "lucide-react";
import Image from "next/image";

export default function Team() {
  const [users, setUsers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const current = getUser();
  async function load() {
    const u = await api("/users");
    setUsers(u.users || []);
  }
  useEffect(() => {
    load();
  }, []);
  async function create() {
    setError("");
    try {
      await api("/users", { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", email: "", password: "" });
      setOpen(false);
      load();
    } catch (e: any) {
      setError(e?.message || "Unable to create salesperson");
    }
  }
  return (
    <div className="space-y-5">
      <Topbar
        title="Sales team"
        subtitle="Manage sales access and see current lead ownership."
      />
      <div className="flex justify-end">
        {current?.role === "ADMIN" && (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus size={16} /> Add salesperson
          </button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {users.map((u) => {
          const count = u.assignedLeadCount || 0;
          return (
            <div
              key={u._id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center gap-3">
                {u?.profilePhotoUrl ? (
                  <div className=" grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-bold text-white ">
                    <Image
                      src={u.profilePhotoUrl}
                      alt={u.name}
                      height={36}
                      width={36}
                      className="object-center object-cover w-11 h-11 shrink-0 place-items-center overflow-hidden rounded-full border-2 bg-indigo-50 border-indigo-600 shadow-sm"
                    />
                  </div>
                ) : (
                  <div
                    title={u?.name || "User"}
                    className="grid h-11 w-11 place-items-center rounded-full bg-indigo-50 text-indigo-600 "
                  >
                    {u?.name?.[0] || "U"}
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-slate-900">
                    {u.name}
                  </h3>
                  <p className="truncate text-xs text-slate-500">{u.email}</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-xs text-slate-500">Role</span>
                  <b className="mt-1 flex items-center gap-1 text-xs text-slate-900">
                    {u.role === "SALES" ? (
                      <UserRound size={13} />
                    ) : (
                      <ShieldCheck size={13} />
                    )}{" "}
                    {u.role}
                  </b>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-xs text-slate-500">Visible leads</span>
                  <b className="mt-1 block text-xl text-slate-900">{count}</b>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
            <div className="flex justify-between">
              <div>
                <h2 className="font-bold text-slate-900">Create salesperson</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Create a SALES workspace login.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>
            {[
              ["name", "Name", "text"],
              ["email", "Email", "email"],
              ["password", "Temporary password", "password"],
            ].map(([key, label, type]: any) => (
              <label
                key={key}
                className="mt-4 block text-xs font-semibold text-slate-700"
              >
                {label}
                <input
                  type={type}
                  value={(form as any)[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                />
              </label>
            ))}
            {error && (
              <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
                {error}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={create}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
