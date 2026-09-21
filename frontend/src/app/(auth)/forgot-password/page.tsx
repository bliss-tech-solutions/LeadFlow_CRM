"use client";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { useState } from "react";
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSent(true);
        }}
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8"
      >
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500"
        >
          <ArrowLeft size={14} /> Back to login
        </Link>
        <div className="mt-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 font-extrabold text-white">
            LF
          </div>
          <div>
            <b className="block">LeadFlow CRM</b>
            <span className="text-xs text-slate-500">Account recovery</span>
          </div>
        </div>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
          <Mail size={15} /> Forgot password
        </div>
        <h1 className="mt-4 text-2xl font-bold">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Enter your account email. This screen is ready for the email reset
          service.
        </p>
        <label className="mt-5 block text-xs font-semibold">
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
          />
        </label>
        {sent && (
          <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">
            Recovery request UI is ready. Password reset delivery is not enabled
            yet.
          </div>
        )}
        <button className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white">
          Continue
        </button>
      </form>
    </main>
  );
}
