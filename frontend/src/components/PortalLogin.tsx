"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, UserRound, Building2, ArrowRight } from "lucide-react";
import { saveSession } from "../lib/auth";
import { api } from "../lib/api";

type Portal = "ADMIN" | "SALES" | "BUSINESS";

export default function PortalLogin({ portal }: { portal: Portal }) {
  const router = useRouter();
  const isAdmin = portal === "ADMIN";
  const isBusiness = portal === "BUSINESS";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const d = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, portal }),
      });
      saveSession(d.token, d.user);
      if (portal === "BUSINESS") {
        router.push("/business-dashboard");
      } else {
        router.push("/dashboard");
      }
    } catch (e: any) {
      setError(e?.message || "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-8">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 font-extrabold text-white">
            DS
          </div>
          <div>
            <b className="block text-slate-900">Data Scraper CRM</b>
            <span className="text-xs text-slate-500">
              {isAdmin
                ? "Admin & manager workspace"
                : isBusiness
                  ? "Business partner portal"
                  : "Sales workspace"}
            </span>
          </div>
        </div>

        <div className="mt-7 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
          {isAdmin ? (
            <ShieldCheck size={15} />
          ) : isBusiness ? (
            <Building2 size={15} />
          ) : (
            <UserRound size={15} />
          )}
          {isAdmin
            ? "Admin login"
            : isBusiness
              ? "Business partner login"
              : "Sales login"}
        </div>

        <h1 className="mt-4 text-2xl font-bold text-slate-900">
          {isAdmin
            ? "Welcome back"
            : isBusiness
              ? "Project partner workspace"
              : "Sales workspace"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {isAdmin
            ? "Manage projects, leads, team, Meta mappings and CRM activity."
            : isBusiness
              ? "Monitor project leads, follow-up calendar, and manage project documents."
              : "View assigned leads, project documents, calls and follow-ups."}
        </p>

        <label className="mt-5 block text-xs font-semibold text-slate-700">
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder={
              isAdmin
                ? "admin@company.com"
                : isBusiness
                  ? "partner@company.com"
                  : "sales@company.com"
            }
            required
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-500"
          />
        </label>

        <label className="mt-4 block text-xs font-semibold text-slate-700">
          <span className="flex justify-between">
            Password
            <Link href="/forgot-password" className="text-indigo-600">
              Forgot password?
            </Link>
          </span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="••••••••"
            required
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-500"
          />
        </label>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        <button
          disabled={loading}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
          {!loading && <ArrowRight size={15} />}
        </button>

        <div className="mt-5 text-center text-xs text-slate-500">
          Looking for a different workspace?{" "}
          <Link className="font-semibold text-indigo-600" href="/login">
            Switch workspace
          </Link>
        </div>
      </form>
    </main>
  );
}
