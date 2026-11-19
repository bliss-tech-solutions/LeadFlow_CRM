"use client";

import Link from "next/link";
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../../lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      setSent(r.message || "If an account exists for this email, a reset link has been sent.");
    } catch (err: any) {
      setError(err?.message || "Could not send reset link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <Link href="/login" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft size={14} /> Back to login
        </Link>
        <div className="mt-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 font-extrabold text-white">LF</div>
          <div>
            <b className="block">LeadFlow CRM</b>
            <span className="text-xs text-slate-500">Account recovery</span>
          </div>
        </div>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
          <Mail size={15} /> Forgot password
        </div>
        <h1 className="mt-4 text-2xl font-bold">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Enter your account email and we'll send you a link to choose a new password. The link expires in 30 minutes.</p>

        {sent ? (
          <div className="mt-5 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> {sent}
          </div>
        ) : (
          <>
            <label className="mt-5 block text-xs font-semibold">
              Email
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            {error && <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
            <button disabled={busy} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {busy && <Loader2 size={15} className="animate-spin" />} Send reset link
            </button>
          </>
        )}
      </form>
    </main>
  );
}
