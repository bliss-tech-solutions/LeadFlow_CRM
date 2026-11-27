"use client";

import { useState } from "react";
import Topbar from "../../../components/Topbar";
import { api, API } from "../../../lib/api";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Code,
  Copy,
  ExternalLink,
  Layers,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Webhook,
} from "lucide-react";

type TabType = "meta" | "leadsync";

const LEADSYNC_TEMPLATE_JSON = `{
  "lead_id": "{{lead_id}}",
  "name": "{{full_name}}",
  "email": "{{email}}",
  "phone": "{{phone_number}}",
  "page_id": "{{page_id}}",
  "page_name": "{{page_name}}",
  "form_id": "{{form_id}}",
  "form_name": "{{form_name}}",
  "campaign_id": "{{campaign_id}}",
  "campaign_name": "{{campaign_name}}",
  "ad_id": "{{ad_id}}",
  "ad_name": "{{ad_name}}",
  "created_time": "{{created_time}}",
  "form_data": {
    "budget": "{{budget}}",
    "city": "{{city}}",
    "preferred_bhk": "{{preferred_bhk}}",
    "requirement": "{{requirement}}"
  }
}`;

const LEADSYNC_SAMPLE_DATA_JSON = `{
  "lead_id": "ls_984729182371",
  "name": "Rahul Sharma",
  "email": "rahul.sharma@example.com",
  "phone": "+91 98765 43210",
  "page_id": "104928374619283",
  "page_name": "Skyline Heights Official",
  "form_id": "892019283746192",
  "form_name": "Premium 3BHK Brochure Download",
  "campaign_id": "23851928374619",
  "campaign_name": "Vadodara Luxury Real Estate Q4",
  "ad_id": "23851928374620",
  "ad_name": "Tower A Pre-Launch Video Ad",
  "created_time": "2026-11-19T10:30:00Z",
  "form_data": {
    "budget": "₹80 Lakh – ₹1 Crore",
    "city": "Vadodara",
    "preferred_bhk": "3BHK",
    "requirement": "Immediate possession with clubhouse access"
  }
}`;

export default function IntegrationPage() {
  const [activeTab, setActiveTab] = useState<TabType>("meta");

  // Meta Test State
  const [metaName, setMetaName] = useState("Demo Meta Lead");
  const [metaEmail, setMetaEmail] = useState("lead@example.com");
  const [metaPhone, setMetaPhone] = useState("+91 98765 00000");
  const [metaPageId, setMetaPageId] = useState("");
  const [metaFormId, setMetaFormId] = useState("");
  const [metaResult, setMetaResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testingMeta, setTestingMeta] = useState(false);

  // LeadSync State
  const [leadsyncView, setLeadsyncView] = useState<"template" | "sample">("template");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // LeadSync Test State
  const [lsName, setLsName] = useState("Aarav Mehta");
  const [lsEmail, setLsEmail] = useState("aarav.mehta@example.com");
  const [lsPhone, setLsPhone] = useState("+91 98250 12345");
  const [lsCampaign, setLsCampaign] = useState("LeadSync Facebook Campaign");
  const [lsPageId, setLsPageId] = useState("");
  const [lsFormId, setLsFormId] = useState("");
  const [lsBudget, setLsBudget] = useState("₹50 Lakh – ₹75 Lakh");
  const [lsCity, setLsCity] = useState("Ahmedabad");
  const [lsResult, setLsResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testingLs, setTestingLs] = useState(false);

  const baseUrl = API.replace(/\/$/, "");
  const metaWebhookUrl = `${baseUrl}/meta/webhook`;
  const leadsyncWebhookUrl = `${baseUrl}/leadsync/webhook`;

  function copyToClipboard(text: string, key: string) {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    }
  }

  async function testMetaLead() {
    setTestingMeta(true);
    setMetaResult(null);
    try {
      const d = await api("/meta/test-lead", {
        method: "POST",
        body: JSON.stringify({
          name: metaName,
          email: metaEmail,
          phone: metaPhone,
          campaign: "Demo Meta Campaign",
          page_id: metaPageId.trim() || undefined,
          form_id: metaFormId.trim() || undefined,
        }),
      });
      setMetaResult({
        type: "success",
        text: `${d.duplicate ? "Duplicate Lead Handled" : "Lead Created Successfully"}: ${d.lead?.name} (Status: ${d.lead?.status || "NEW"}).`,
      });
    } catch (e: any) {
      setMetaResult({ type: "error", text: e.message || "Failed to send Meta test lead." });
    } finally {
      setTestingMeta(false);
    }
  }

  async function testLeadSyncLead() {
    setTestingLs(true);
    setLsResult(null);
    try {
      const d = await api("/leadsync/test-lead", {
        method: "POST",
        body: JSON.stringify({
          name: lsName,
          email: lsEmail,
          phone: lsPhone,
          campaign_name: lsCampaign,
          page_id: lsPageId.trim() || undefined,
          form_id: lsFormId.trim() || undefined,
          form_data: {
            budget: lsBudget,
            city: lsCity,
          },
        }),
      });
      setLsResult({
        type: "success",
        text: `${d.duplicate ? "Duplicate Lead Handled" : "LeadSync Lead Created"}: ${d.lead?.name || lsName} (ID: ${d.lead?._id || "synced"}).`,
      });
    } catch (e: any) {
      setLsResult({ type: "error", text: e.message || "Failed to send LeadSync test lead." });
    } finally {
      setTestingLs(false);
    }
  }

  return (
    <div className="space-y-6">
      <Topbar
        title="Lead Ingestion & Webhooks"
        subtitle="Connect incoming Meta Facebook Lead Ads directly via Meta Graph API or via LeadSync middleware."
      />

      {/* Method Selector Tabs */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-xs">
        <button
          onClick={() => setActiveTab("meta")}
          className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
            activeTab === "meta"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
          }`}
        >
          <div className={`grid h-5 w-5 place-items-center rounded-md ${activeTab === "meta" ? "bg-white/20" : "bg-slate-100"}`}>
            <Webhook size={13} className={activeTab === "meta" ? "text-white" : "text-slate-600"} />
          </div>
          <span>Option 1: Facebook Meta (Native Webhook)</span>
        </button>

        <button
          onClick={() => setActiveTab("leadsync")}
          className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
            activeTab === "leadsync"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
          }`}
        >
          <div className={`grid h-5 w-5 place-items-center rounded-md ${activeTab === "leadsync" ? "bg-white/20" : "bg-slate-100"}`}>
            <Code size={13} className={activeTab === "leadsync" ? "text-white" : "text-slate-600"} />
          </div>
          <span>Option 2: LeadSync Webhook API & JSON</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${activeTab === "leadsync" ? "bg-white/25 text-white" : "bg-indigo-50 text-indigo-700 border border-indigo-100"}`}>
            JSON Setup
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* OPTION 1: FACEBOOK META NATIVE WEBHOOK                                    */}
      {/* ========================================================================= */}
      {activeTab === "meta" && (
        <div className="grid gap-6 lg:grid-cols-2 items-start">
          {/* Left Column: Meta Webhook URL & Configuration */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Webhook size={16} className="text-indigo-600" />
                  <span>Meta Webhook Endpoint</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Direct real-time webhook from Meta App Dashboard.
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                <ShieldCheck size={12} className="text-emerald-600" />
                <span>HMAC Verified</span>
              </span>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Webhook Callback URL
                </span>
                <span className="text-[10px] font-semibold text-slate-400">GET (verify) + POST</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="block flex-1 rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs font-mono font-semibold text-slate-800 break-all select-all">
                  {metaWebhookUrl}
                </code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(metaWebhookUrl, "meta-url")}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  {copiedKey === "meta-url" ? (
                    <>
                      <Check size={13} className="text-emerald-600" />
                      <span className="text-emerald-700">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-3 pt-2 text-xs text-slate-600">
              <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                Meta Developer Setup Checklist:
              </h3>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-600 leading-5">
                <li>
                  Open your <strong>Meta App Dashboard</strong> at developers.facebook.com.
                </li>
                <li>
                  Under <strong>Webhooks</strong>, select the <strong>Page</strong> object and click <strong>Subscribe</strong>.
                </li>
                <li>
                  Paste the <strong>Callback URL</strong> above and your backend <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700">META_VERIFY_TOKEN</code>.
                </li>
                <li>
                  Subscribe to the <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px] text-slate-800">leadgen</code> event.
                </li>
                <li>
                  Under <strong>Business Projects</strong>, map your Facebook Page ID & Form ID to assign incoming leads automatically.
                </li>
              </ol>
            </div>
          </section>

          {/* Right Column: Meta Ingestion Tester */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3.5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Play size={16} className="text-indigo-600" />
                <span>Test Meta Lead Ingestion</span>
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Simulates a native Meta leadgen webhook event locally to verify parsing, project mapping, and routing.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={metaName}
                  onChange={(e) => setMetaName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                    Phone <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={metaPhone}
                    onChange={(e) => setMetaPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={metaEmail}
                    onChange={(e) => setMetaEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                    Page ID (Optional Project Map)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 104928374619"
                    value={metaPageId}
                    onChange={(e) => setMetaPageId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                    Form ID (Optional Project Map)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 892019283746"
                    value={metaFormId}
                    onChange={(e) => setMetaFormId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={testingMeta}
                onClick={testMetaLead}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50 transition-all"
              >
                <Play size={13} />
                <span>{testingMeta ? "Simulating Ingestion..." : "Send Test Meta Lead"}</span>
              </button>

              {metaResult && (
                <div
                  className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-xs font-medium ${
                    metaResult.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  {metaResult.type === "success" ? (
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <span>{metaResult.text}</span>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* OPTION 2: LEADSYNC WEBHOOK API & JSON PAYLOAD TEMPLATE                    */}
      {/* ========================================================================= */}
      {activeTab === "leadsync" && (
        <div className="space-y-6">
          {/* Top Row: Webhook URL & Secret Header */}
          <div className="grid gap-6 lg:grid-cols-2 items-start">
            {/* Endpoint Card */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Webhook size={16} className="text-indigo-600" />
                    <span>LeadSync Webhook URL</span>
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Paste this into your LeadSync.me custom webhook destination.
                  </p>
                </div>
                <span className="rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700">
                  LeadSync Compatible
                </span>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Webhook Target URL
                </span>
                <div className="flex items-center gap-2">
                  <code className="block flex-1 rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs font-mono font-semibold text-slate-800 break-all select-all">
                    {leadsyncWebhookUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(leadsyncWebhookUrl, "ls-url")}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    {copiedKey === "ls-url" ? (
                      <>
                        <Check size={13} className="text-emerald-600" />
                        <span className="text-emerald-700">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Secret Header Card */}
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Required Security Header
                  </span>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                    HTTP Header
                  </span>
                </div>
                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-sans text-[11px] w-14 shrink-0">Header:</span>
                    <code className="rounded bg-white border border-slate-200 px-2 py-1 text-indigo-700 font-bold">
                      x-leadsync-secret
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard("x-leadsync-secret", "ls-hdr-name")}
                      className="p-1 rounded text-slate-400 hover:text-slate-700"
                      title="Copy Header Name"
                    >
                      {copiedKey === "ls-hdr-name" ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-sans text-[11px] w-14 shrink-0">Value:</span>
                    <span className="text-slate-600 font-sans text-xs">
                      Value of <code className="bg-white border px-1 py-0.5 rounded text-slate-800">LEADSYNC_WEBHOOK_SECRET</code> from backend <code className="text-slate-800">.env</code>
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Setup Instructions Card */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-3.5">
              <div className="border-b border-slate-100 pb-3.5">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Sparkles size={16} className="text-indigo-600" />
                  <span>How to Setup in LeadSync Dashboard</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Step-by-step instructions to connect LeadSync in less than 2 minutes.
                </p>
              </div>

              <ol className="list-decimal list-inside space-y-2 text-xs text-slate-600 leading-5">
                <li className="pl-1">
                  Log in to your <strong>LeadSync.me</strong> account and click on <strong>Lead Services</strong>.
                </li>
                <li className="pl-1">
                  Click <strong>Add New Connection</strong> and choose <strong>Webhook</strong>.
                </li>
                <li className="pl-1">
                  Name your service (e.g., <em>Data Scraper CRM Ingestion</em>).
                </li>
                <li className="pl-1">
                  Paste the <strong>Webhook URL</strong> from the left into the <strong>URL field</strong>.
                </li>
                <li className="pl-1">
                  Add the HTTP Header: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px] text-slate-800">x-leadsync-secret</code> with your secret key.
                </li>
                <li className="pl-1">
                  In the <strong>Raw JSON Body</strong> box, paste the <strong>LeadSync JSON Template</strong> below.
                </li>
                <li className="pl-1">
                  Go to <strong>Lead Forms</strong> and link this webhook connection to your Facebook Lead Ads.
                </li>
              </ol>
            </section>
          </div>

          {/* LeadSync JSON Template Box */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Code size={18} className="text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    LeadSync JSON Payload Specification
                  </h3>
                  <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                    Ready to Copy
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  This JSON payload maps LeadSync placeholder tags directly to Data Scraper CRM fields and flexible form Q&amp;A.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* View Mode Toggle */}
                <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
                  <button
                    type="button"
                    onClick={() => setLeadsyncView("template")}
                    className={`rounded-lg px-3 py-1 transition-all ${
                      leadsyncView === "template" ? "bg-white text-indigo-700 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    Template (Placeholders)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeadsyncView("sample")}
                    className={`rounded-lg px-3 py-1 transition-all ${
                      leadsyncView === "sample" ? "bg-white text-indigo-700 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    Sample Payload
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      leadsyncView === "template" ? LEADSYNC_TEMPLATE_JSON : LEADSYNC_SAMPLE_DATA_JSON,
                      "ls-json"
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-[0.98] transition-all"
                >
                  {copiedKey === "ls-json" ? (
                    <>
                      <Check size={13} className="text-emerald-300" />
                      <span>Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      <span>Copy JSON Template</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Code Block Container */}
            <div className="relative rounded-2xl bg-slate-900 p-4 font-mono text-xs shadow-inner overflow-x-auto">
              <div className="absolute right-3 top-3 text-[10px] uppercase font-bold text-slate-500">
                JSON (application/json)
              </div>
              <pre className="text-indigo-200 leading-relaxed">
                {leadsyncView === "template" ? LEADSYNC_TEMPLATE_JSON : LEADSYNC_SAMPLE_DATA_JSON}
              </pre>
            </div>

            {/* Field Mappings Reference */}
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Key Fields Mapped by Data Scraper CRM:
              </span>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                <div className="rounded-lg bg-white p-2.5 border border-slate-200/60">
                  <code className="text-indigo-700 font-bold block mb-0.5">lead_id / id</code>
                  <span className="text-slate-500 text-[11px]">Unique Meta leadgen ID for deduplication.</span>
                </div>
                <div className="rounded-lg bg-white p-2.5 border border-slate-200/60">
                  <code className="text-indigo-700 font-bold block mb-0.5">name &amp; phone</code>
                  <span className="text-slate-500 text-[11px]">Primary lead contact details.</span>
                </div>
                <div className="rounded-lg bg-white p-2.5 border border-slate-200/60">
                  <code className="text-indigo-700 font-bold block mb-0.5">page_id &amp; form_id</code>
                  <span className="text-slate-500 text-[11px]">Auto-maps to Business Projects.</span>
                </div>
                <div className="rounded-lg bg-white p-2.5 border border-slate-200/60">
                  <code className="text-indigo-700 font-bold block mb-0.5">form_data (object)</code>
                  <span className="text-slate-500 text-[11px]">Custom Meta form questions (Budget, BHK, etc.).</span>
                </div>
              </div>
            </div>
          </section>

          {/* Test LeadSync Ingestion Form */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-2">
                <Play size={16} className="text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Test LeadSync Webhook Ingestion
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Send a sample LeadSync webhook payload with custom form answers to test live lead creation, deduplication, and project assignment.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={lsName}
                  onChange={(e) => setLsName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Phone Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={lsPhone}
                  onChange={(e) => setLsPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={lsEmail}
                  onChange={(e) => setLsEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Campaign Name
                </label>
                <input
                  type="text"
                  value={lsCampaign}
                  onChange={(e) => setLsCampaign(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Page ID (Optional Project Map)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 104928374619"
                  value={lsPageId}
                  onChange={(e) => setLsPageId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Form ID (Optional Project Map)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 892019283746"
                  value={lsFormId}
                  onChange={(e) => setLsFormId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Custom Question: Budget
                </label>
                <input
                  type="text"
                  value={lsBudget}
                  onChange={(e) => setLsBudget(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Custom Question: City
                </label>
                <input
                  type="text"
                  value={lsCity}
                  onChange={(e) => setLsCity(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={testingLs}
                onClick={testLeadSyncLead}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50 transition-all"
              >
                <Send size={13} />
                <span>{testingLs ? "Ingesting LeadSync Test..." : "Send Test LeadSync Lead"}</span>
              </button>
            </div>

            {lsResult && (
              <div
                className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-xs font-medium ${
                  lsResult.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {lsResult.type === "success" ? (
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                )}
                <span>{lsResult.text}</span>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
