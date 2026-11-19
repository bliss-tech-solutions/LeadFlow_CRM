"use client";

import { useState } from "react";
import { KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { getUser, logout, saveSession } from "../lib/auth";
import { field } from "./Modal";

/** Change password + sign out of every device. */
export default function SecurityCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function change() {
    setMsg(null);
    if (next !== confirm) return setMsg({ ok: false, text: "New passwords do not match" });
    if (next.length < 8) return setMsg({ ok: false, text: "Use at least 8 characters" });
    setBusy(true);
    try {
      const r = await api("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      const user = getUser();
      if (r.token && user) saveSession(r.token, user);
      setCurrent("");
      setNext("");
      setConfirm("");
      setMsg({ ok: true, text: r.message || "Password updated" });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Could not change password" });
    } finally {
      setBusy(false);
    }
  }

  async function logoutAll() {
    if (!window.confirm("Sign out from every device, including this one?")) return;
    try {
      await api("/auth/logout-all", { method: "POST" });
    } catch {}
    logout();
  }

  return (
    <section className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">Security</h2>
          <p className="text-xs text-slate-500">Change your password. Other devices are signed out automatically.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-slate-700">
          Current password
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={field} />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          New password
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={field} />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Confirm
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
        </label>
      </div>
      {msg && <div className={`mt-3 rounded-xl p-3 text-xs ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msg.text}</div>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <button onClick={logoutAll} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50">
          <LogOut size={14} /> Sign out of all devices
        </button>
        <button onClick={change} disabled={busy || !current || !next} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Update password
        </button>
      </div>
    </section>
  );
}
