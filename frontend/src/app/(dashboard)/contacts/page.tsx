"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Globe, Loader2, MessageSquare, Search, Settings2, Trash2, UserPlus, X } from "lucide-react";
import Topbar from "../../../components/Topbar";
import Pagination from "../../../components/Pagination";
import WhatsAppIcon from "../../../components/WhatsAppIcon";
import AddContactsModal from "../../../components/outreach/AddContactsModal";
import SetupModal from "../../../components/outreach/SetupModal";
import SendMessageModal from "../../../components/outreach/SendMessageModal";
import MessageStatus from "../../../components/outreach/MessageStatus";
import { formatContactPhone, type Channel, type ContactRow, type OutreachConfig, type Recipient } from "../../../components/outreach/types";
import { api, downloadFile } from "../../../lib/api";
import { getUser } from "../../../lib/auth";
import { socket } from "../../../lib/socket";

type Data = { contacts: ContactRow[]; total: number; page: number; pages: number; perPage: number };

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/** True when the browser (not the user) filled the field, e.g. a saved login email. */
function isAutofilled(el: HTMLInputElement) {
  try {
    return el.matches(":autofill");
  } catch {
    try {
      return el.matches(":-webkit-autofill");
    } catch {
      return false;
    }
  }
}

const keyOf = (c: { kind: string; _id?: string; id?: string }) => `${c.kind}:${c._id ?? c.id}`;
const toRecipient = (c: ContactRow): Recipient => ({ kind: c.kind, id: c._id, name: c.name, phone: c.phone });

export default function ContactsPage() {
  const user = getUser();
  const isAdmin = user?.role === "ADMIN" || user?.role === "MANAGER";

  const [tab, setTab] = useState<"contacts" | "status">("contacts");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);
  const [pendingNew, setPendingNew] = useState(0);

  const [selected, setSelected] = useState<Map<string, Recipient>>(new Map());
  const [config, setConfig] = useState<OutreachConfig | null>(null);
  const [sendTo, setSendTo] = useState<{ recipients: Recipient[]; channel: Channel } | null>(null);
  const [setupTab, setSetupTab] = useState<Channel | null>(null);
  const [templatesVersion, setTemplatesVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const [statusKey, setStatusKey] = useState(0);

  // Data scraping (demo): keeps loading and pulls a few contacts at a time from the
  // demodata collection into Contact Data until you click anywhere outside it.
  const [site, setSite] = useState("");
  const [scraping, setScraping] = useState("");
  const [scrapeCount, setScrapeCount] = useState(0);
  const [scrapeNote, setScrapeNote] = useState("");
  const scraperRef = useRef<HTMLFormElement | null>(null);
  const scrapeRun = useRef(0);
  const scrapeFound = useRef(0);

  const query = useCallback(
    (p: number) => {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set("q", q);
      return params.toString();
    },
    [q]
  );

  const load = useCallback(
    async (p: number, silent = false) => {
      if (!silent) setLoading(true);
      try {
        setData(await api(`/outreach/contacts?${query(p)}`));
        setError("");
      } catch (e: any) {
        setError(e?.message || "Could not load contacts");
      } finally {
        setLoading(false);
      }
    },
    [query]
  );

  useEffect(() => {
    void load(page);
  }, [load, page]);
  const loadRef = useRef(load);
  loadRef.current = load;

  const loadConfig = useCallback(() => {
    api("/outreach/config")
      .then(setConfig)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isAdmin) loadConfig();
  }, [isAdmin, loadConfig]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setPage(1);
      setQ(filter.trim());
    }, 350);
    return () => window.clearTimeout(t);
  }, [filter]);

  // Realtime: new leads land on page 1; on other pages a "new" bar is shown.
  const pageRef = useRef(page);
  pageRef.current = page;
  useEffect(() => {
    let timer: number | undefined;
    const onNewLead = () => {
      if (pageRef.current !== 1) return setPendingNew((n) => n + 1);
      if (timer === undefined)
        timer = window.setTimeout(() => {
          timer = undefined;
          void load(1, true);
        }, 1200);
    };
    socket.on("new_lead", onNewLead);
    return () => {
      socket.off("new_lead", onNewLead);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!scraping) return;
    const stop = (e: MouseEvent) => {
      if (scraperRef.current?.contains(e.target as Node)) return;
      scrapeRun.current++;
      const n = scrapeFound.current;
      setScrapeNote(`Stopped. ${n} new contact${n === 1 ? "" : "s"} found on ${scraping}.`);
      setScraping("");
    };
    document.addEventListener("mousedown", stop);
    return () => document.removeEventListener("mousedown", stop);
  }, [scraping]);

  // Stop the loop if the page is left mid-scrape.
  useEffect(() => () => void scrapeRun.current++, []);

  function startScrape(e: React.FormEvent) {
    e.preventDefault();
    const target = site.trim();
    if (!target || scraping) return;
    const run = ++scrapeRun.current;
    scrapeFound.current = 0;
    setScrapeCount(0);
    setScraping(target);
    setScrapeNote("");
    setTab("contacts");
    setPage(1);
    void scrapeLoop(run);
  }

  /** Runs until stopped: every few seconds pulls 1–12 contacts into Contact Data. */
  async function scrapeLoop(run: number) {
    await sleep(1200);
    while (run === scrapeRun.current) {
      let wait = 1500 + Math.random() * 2500;
      try {
        const out = await api("/outreach/scrape/next", { method: "POST" });
        if (out.added) {
          // Rows are saved even if stopped mid-request, so always refresh.
          if (run === scrapeRun.current) {
            scrapeFound.current += out.added;
            setScrapeCount(scrapeFound.current);
          }
          if (pageRef.current === 1) void loadRef.current(1, true);
          else setPendingNew((n) => n + out.added);
        }
        if (out.exhausted) wait = 6000;
      } catch {
        wait = 5000;
      }
      await sleep(wait);
    }
  }

  async function exportPage() {
    setExporting(true);
    try {
      await downloadFile(`/outreach/contacts/export?${query(page)}`, `contacts-page-${page}.xlsx`);
    } catch (e: any) {
      setError(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function removeContact(c: ContactRow) {
    if (!window.confirm(`Remove ${c.name || "this contact"}?`)) return;
    try {
      await api(`/outreach/contacts/${c._id}`, { method: "DELETE" });
      setSelected((s) => {
        const next = new Map(s);
        next.delete(keyOf(c));
        return next;
      });
      void load(page, true);
    } catch (e: any) {
      setError(e?.message || "Could not remove contact");
    }
  }

  function toggle(c: ContactRow) {
    setSelected((s) => {
      const next = new Map(s);
      const k = keyOf(c);
      if (next.has(k)) next.delete(k);
      else next.set(k, toRecipient(c));
      return next;
    });
  }

  const rows = data?.contacts || [];
  const allOnPage = rows.length > 0 && rows.every((c) => selected.has(keyOf(c)));
  function togglePage() {
    setSelected((s) => {
      const next = new Map(s);
      rows.forEach((c) => (allOnPage ? next.delete(keyOf(c)) : next.set(keyOf(c), toRecipient(c))));
      return next;
    });
  }

  if (!isAdmin) return <div className="p-8 text-slate-500">Access denied.</div>;

  const startIndex = data ? (data.page - 1) * data.perPage : 0;  const bulk = (channel: Channel) => setSendTo({ recipients: [...selected.values()], channel });

  return (
    <div className="space-y-5 pb-24">
      <Topbar title="Contact Data" subtitle="Contacts from leads and uploads. Send SMS or WhatsApp to one or many." />

      {/* Scraper search */}
      <form ref={scraperRef} onSubmit={startScrape} autoComplete="off" role="search" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="scrape" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Data scraping
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Globe size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="scrape"
              name="scrape-website"
              type="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              value={site}
              onChange={(e) => setSite(isAutofilled(e.target) ? "" : e.target.value)}
              placeholder="Enter a website, e.g. google.com"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={!site.trim() || !!scraping}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {scraping ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {scraping ? "Scraping…" : "Scrape"}
          </button>
        </div>
        {scraping ? (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-700">
            <Loader2 size={18} className="shrink-0 animate-spin" />
            <span className="min-w-0 truncate">
              Scraping contacts from <b>{scraping}</b>…
            </span>
            <span className="ml-auto shrink-0 rounded-lg bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-indigo-600">{scrapeCount} found</span>
          </div>
        ) : (
          scrapeNote && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-2.5 text-sm text-emerald-700">
              <span className="min-w-0 truncate">{scrapeNote}</span>
              <button type="button" onClick={() => setScrapeNote("")} aria-label="Dismiss" className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-100">
                <X size={14} />
              </button>
            </div>
          )
        )}
      </form>

      <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm sm:w-fit">
        {(
          [
            ["contacts", "Contacts"],
            ["status", "Message status"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`flex-1 rounded-lg px-4 py-2 text-xs font-semibold sm:flex-none ${tab === k ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "status" ? (
        <MessageStatus refreshKey={statusKey} />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                name="contact-search"
                type="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                value={filter}
                onChange={(e) => setFilter(isAutofilled(e.target) ? "" : e.target.value)}
                placeholder="Search name or number"
                className="w-full rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-indigo-400 lg:w-64"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <UserPlus size={15} /> Add contacts
              </button>
              <button
                type="button"
                onClick={() => setSetupTab("SMS")}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Settings2 size={15} /> SMS &amp; WhatsApp setup
              </button>
              <button
                type="button"
                onClick={exportPage}
                disabled={exporting || !rows.length}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                Excel (page {page})
              </button>
            </div>
          </div>

          {pendingNew > 0 && (
            <button
              type="button"
              onClick={() => {
                setPendingNew(0);
                setPage(1);
              }}
              className="w-full bg-indigo-50 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-100"
            >
              {pendingNew} new contact{pendingNew > 1 ? "s" : ""} received · Go to latest
            </button>
          )}

          {error && <div className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-600">{error}</div>}

          <div className="overflow-x-auto">
            <table className="w-full min-w-140 text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-4 py-2.5">
                    <input type="checkbox" aria-label="Select page" checked={allOnPage} onChange={togglePage} className="h-4 w-4 accent-indigo-600" />
                  </th>
                  <th className="w-16 px-2 py-2.5 font-semibold">No.</th>
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-4 py-2.5 font-semibold">Contact</th>
                  <th className="w-28 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && !data ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                      <Loader2 size={20} className="mx-auto animate-spin" />
                    </td>
                  </tr>
                ) : rows.length ? (
                  rows.map((c, i) => {
                    const checked = selected.has(keyOf(c));
                    return (
                      <tr key={keyOf(c)} className={`${checked ? "bg-indigo-50/50" : "hover:bg-slate-50"} ${loading ? "opacity-60" : ""}`}>
                        <td className="px-4 py-2.5">
                          <input type="checkbox" aria-label={`Select ${c.name}`} checked={checked} onChange={() => toggle(c)} className="h-4 w-4 accent-indigo-600" />
                        </td>
                        <td className="px-2 py-2.5 text-xs text-slate-400">{startIndex + i + 1}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-900">{c.name || "—"}</td>
                        <td className="px-4 py-2.5">
                          {c.phone ? (
                            <a href={`tel:${formatContactPhone(c.phone).replace(/\s+/g, "")}`} className="font-medium tabular-nums text-slate-800 hover:text-indigo-600">
                              {formatContactPhone(c.phone)}
                            </a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              title="Send SMS"
                              aria-label={`Send SMS to ${c.name}`}
                              disabled={!c.phone}
                              onClick={() => setSendTo({ recipients: [toRecipient(c)], channel: "SMS" })}
                              className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50 disabled:opacity-30"
                            >
                              <MessageSquare size={16} />
                            </button>
                            <button
                              type="button"
                              title="Send WhatsApp"
                              aria-label={`Send WhatsApp to ${c.name}`}
                              disabled={!c.phone}
                              onClick={() => setSendTo({ recipients: [toRecipient(c)], channel: "WHATSAPP" })}
                              className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-30"
                            >
                              <WhatsAppIcon size={16} />
                            </button>
                            {c.kind === "CONTACT" && (
                              <button type="button" title="Remove contact" onClick={() => removeContact(c)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-400">
                      No contacts found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={data?.page || page}
            pages={data?.pages || 1}
            total={data?.total || 0}
            label="contacts"
            onChange={(p) => {
              setPage(p);
              if (p === 1) setPendingNew(0);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </section>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && tab === "contacts" && (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-2xl flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 px-1">
            <button type="button" onClick={() => setSelected(new Map())} title="Clear selection" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
              <X size={16} />
            </button>
            <b className="text-sm text-slate-900">{selected.size} selected</b>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => bulk("SMS")} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
              <MessageSquare size={14} /> SMS
            </button>
            <button type="button" onClick={() => bulk("WHATSAPP")} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">
              <WhatsAppIcon size={14} /> WhatsApp
            </button>
          </div>
        </div>
      )}

      <AddContactsModal
        open={adding}
        onClose={() => setAdding(false)}
        onDone={() => {
          setPage(1);
          void load(1, true);
        }}
      />
      <SetupModal
        open={setupTab !== null}
        tab={setupTab || "SMS"}
        onTab={setSetupTab}
        onClose={() => setSetupTab(null)}
        onChanged={() => {
          loadConfig();
          setTemplatesVersion((v) => v + 1);
        }}
      />
      <SendMessageModal
        open={sendTo !== null && setupTab === null}
        onClose={() => setSendTo(null)}
        recipients={sendTo?.recipients || []}
        channel={sendTo?.channel || "SMS"}
        onChannel={(ch) => setSendTo((s) => (s ? { ...s, channel: ch } : s))}
        config={config}
        templatesVersion={templatesVersion}
        onSetup={(ch) => setSetupTab(ch)}
        onSent={() => {
          setStatusKey((k) => k + 1);
          if (sendTo && sendTo.recipients.length > 1) setSelected(new Map());
        }}
      />
    </div>
  );
}
