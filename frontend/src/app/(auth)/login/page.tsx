"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck, UserRound, Building2 } from "lucide-react";

export default function LoginChooser() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 font-extrabold text-white">
            LF
          </div>
          <div>
            <b className="block text-slate-900">LeadFlow CRM</b>
            <span className="text-xs text-slate-500">
              Choose your workspace
            </span>
          </div>
        </div>
        <h1 className="mt-7 text-2xl font-bold text-slate-900">Sign in</h1>
        <p className="mt-2 text-sm text-slate-500">
          Select the workspace that matches your account.
        </p>

        <div className="mt-6 space-y-3">
          <Link
            href="/admin/login"
            className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-indigo-300 hover:bg-indigo-50/50"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
              <ShieldCheck size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-sm text-slate-900">Admin / Manager</b>
              <span className="text-xs text-slate-500">
                Projects, team, leads, Meta and reports
              </span>
            </span>
            <ArrowRight size={16} className="text-slate-400" />
          </Link>

          <Link
            href="/sales/login"
            className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-indigo-300 hover:bg-indigo-50/50"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
              <UserRound size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-sm text-slate-900">Salesperson</b>
              <span className="text-xs text-slate-500">
                Assigned leads, project documents and follow-ups
              </span>
            </span>
            <ArrowRight size={16} className="text-slate-400" />
          </Link>

          <Link
            href="/business/login"
            className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-indigo-300 hover:bg-indigo-50/50"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <Building2 size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-sm text-slate-900">Business Partner</b>
              <span className="text-xs text-slate-500">
                Project leads, calendar and document management
              </span>
            </span>
            <ArrowRight size={16} className="text-slate-400" />
          </Link>
        </div>
      </section>
    </main>
  );
}
