"use client";
import { useState } from "react";
import Topbar from "../../../components/Topbar";
import { api, API } from "../../../lib/api";
import { Copy, Play, Webhook } from "lucide-react";
export default function Integration() {
  const [name, setName] = useState("Demo Meta Lead");
  const [email, setEmail] = useState("lead@example.com");
  const [phone, setPhone] = useState("+91 98765 00000");
  const [result, setResult] = useState("");
  async function test() {
    try {
      const d = await api("/meta/test-lead", {
        method: "POST",
        body: JSON.stringify({ name, email, phone, campaign: "Demo Campaign" }),
      });
      setResult(`${d.duplicate ? "Duplicate" : "Created"}: ${d.lead?.name}.`);
    } catch (e: any) {
      setResult(e.message);
    }
  }
  // API already falls back to http://localhost:4000/api when NEXT_PUBLIC_API_URL is unset.
  const webhook = `${API.replace(/\/$/, "")}/meta/webhook`;
  return (
    <div className="space-y-5">
      <Topbar
        title="Meta setup"
        subtitle="Webhook configuration and local lead ingestion test. Project-specific Meta IDs are configured under Business Projects."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <Webhook size={17} /> Webhook
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Server-side configuration
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
              Protected
            </span>
          </div>
          <div className="mt-5 rounded-xl bg-slate-50 p-3">
            <span className="text-[10px] font-bold uppercase text-slate-400">
              Webhook URL
            </span>
            <b className="mt-1 block break-all text-xs text-slate-800">
              {webhook}
            </b>
          </div>
          <button
            onClick={() => navigator.clipboard?.writeText(webhook)}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700"
          >
            <Copy size={14} /> Copy URL
          </button>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Configure META_VERIFY_TOKEN, META_APP_SECRET, Meta access
            credentials and graph version only on the backend. Incoming leadgen
            events are matched against Business Project Meta source IDs.
          </p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Test lead ingestion</h2>
          <p className="mt-1 text-xs text-slate-500">
            Uses a local Meta-shaped event and does not call Graph API.
          </p>
          {[
            ["Name", name, setName],
            ["Email", email, setEmail],
            ["Phone", phone, setPhone],
          ].map(([label, value, setter]: any) => (
            <label
              key={label}
              className="mt-4 block text-xs font-semibold text-slate-700"
            >
              {label}
              <input
                value={value}
                onChange={(e) => setter(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </label>
          ))}
          <button
            onClick={test}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Play size={14} /> Send test lead
          </button>
          {result && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              {result}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
