"use client";

import { Bell, Search, CheckCheck, Trash2, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { socket } from "../lib/socket";
import { isNotificationSoundEnabled, unlockNotificationSound } from "../lib/notificationSound";

type NotificationItem = {
  _id: string;
  title: string;
  message: string;
  readAt?: string | null;
  createdAt: string;
};

export default function Topbar({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  async function loadNotifications() {
    try {
      const data = await api("/notifications");
      setItems(data.notifications ?? []);
      setUnread(data.unreadCount ?? 0);
    } catch {
      // Ignore notification refresh errors.
    }
  }

  useEffect(() => {
    const syncSoundState = () => setSoundEnabled(isNotificationSoundEnabled());

    syncSoundState();
    window.addEventListener("leadflow:sound-enabled", syncSoundState);
    loadNotifications();

    const interval = window.setInterval(loadNotifications, 15000);
    const onNewLead = () => loadNotifications();
    const onFollowup = () => loadNotifications();
    const onAssignment = () => loadNotifications();

    socket.on("new_lead", onNewLead);
    socket.on("followup_updated", onFollowup);
    socket.on("lead_assigned", onAssignment);

    return () => {
      window.removeEventListener("leadflow:sound-enabled", syncSoundState);
      clearInterval(interval);
      socket.off("new_lead", onNewLead);
      socket.off("followup_updated", onFollowup);
      socket.off("lead_assigned", onAssignment);
    };
  }, []);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function enableSound() {
    const enabled = await unlockNotificationSound();
    setSoundEnabled(enabled);
  }

  async function markRead(id: string) {
    await api(`/notifications/${id}/read`, { method: "PATCH" });
    await loadNotifications();
  }

  async function markAllRead() {
    await api("/notifications/read-all", { method: "PATCH" });
    await loadNotifications();
  }

  async function clearRead() {
    await api("/notifications/clear-read", { method: "DELETE" });
    await loadNotifications();
  }

  return (
    <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden h-10 w-64 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-slate-400 shadow-sm sm:flex">
          <Search size={16} />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search CRM..."
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        <button
          onClick={enableSound}
          title={soundEnabled ? "Notification sound enabled" : "Enable notification sound"}
          aria-label={soundEnabled ? "Notification sound enabled" : "Enable notification sound"}
          className={`grid h-10 w-10 place-items-center rounded-xl border shadow-sm ${
            soundEnabled
              ? "border-emerald-200 bg-emerald-50 text-emerald-600"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>

        <div ref={panelRef} className="relative">
          <button
            onClick={() => setOpen((value) => !value)}
            aria-label="Notifications"
            className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <Bell size={18} />
            {unread > 0 && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-12 z-50 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <b className="block text-sm">Notifications</b>
                  <span className="text-xs text-slate-500">{unread} unread</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={markAllRead}
                    disabled={!unread}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
                  >
                    <CheckCheck size={14} /> Read all
                  </button>
                  <button
                    onClick={clearRead}
                    title="Clear read notifications"
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto">
                {items.length ? (
                  items.map((item) => (
                    <div
                      key={item._id}
                      className={`flex gap-3 border-b border-slate-100 px-4 py-3 ${
                        !item.readAt ? "bg-indigo-50/40" : ""
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          item.readAt ? "bg-slate-300" : "bg-indigo-500"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <b className="block text-xs text-slate-900">{item.title}</b>
                        <span className="mt-0.5 block text-xs text-slate-600">{item.message}</span>
                        <small className="mt-1 block text-[10px] text-slate-400">
                          {new Date(item.createdAt).toLocaleString()}
                        </small>
                      </div>
                      {!item.readAt && (
                        <button
                          onClick={() => markRead(item._id)}
                          title="Mark as read"
                          className="self-start rounded-lg px-2 py-1 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-50"
                        >
                          Read
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-slate-500">No notifications.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
