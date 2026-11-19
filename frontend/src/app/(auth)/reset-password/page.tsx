"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, KeyRound, Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { api } from "../../../lib/api";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const email = params.get("email") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const strong = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("Passwords do not match");
    if (!strong) return setError("Use at least 8 characters with letters and numbers");
    setBusy(true);
    try {
      await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, email, password }) });
      setDone(true);
    } catch (err: any) {
      setError(err?.message || "Could not reset password");
    } finally {
      setBusy(false);
    }
  }

  if (!token || !email) {
    return (
      <p className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
        This reset link is incomplete. <Link href="/forgot-password" className="font-semibold underline">Request a new one</Link>.
      </p>
    );
  }

  if (done) {
    return (
      <div className="mt-5 space-y-4">
        <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> Password updated. All other sessions were signed out.
        </div>
        <Link href="/login" className="block w-full rounded-xl bg-indigo-600 px-4 py-3 text-center text-sm font-semibold text-white">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <p className="text-sm text-slate-500">
        Setting a new password for <b className="text-slate-800">{email}</b>
      </p>
      <label className="block text-xs font-semibold">
        New password
        <div className="mt-2 flex items-center rounded-xl border border-slate-200 pr-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
          <input required type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl px-3 py-3 text-sm outline-none" />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="p-1 text-slate-400">
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <span className={`mt-1 block text-[11px] font-normal ${strong ? "text-emerald-600" : "text-slate-400"}`}>At least 8 characters, letters and numbers</span>
      </label>
      <label className="block text-xs font-semibold">
        Confirm password
        <input required type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
      </label>
      {error && <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
      <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
        {busy && <Loader2 size={15} className="animate-spin" />} Update password
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <Link href="/login" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft size={14} /> Back to login
        </Link>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
          <KeyRound size={15} /> Choose a new password
        </div>
        <h1 className="mt-4 text-2xl font-bold">Reset password</h1>
        <Suspense fallback={<p className="mt-5 text-sm text-slate-500">Loading…</p>}>
          <ResetForm />
        </Suspense>
      </div>
    </main>
  );
}
