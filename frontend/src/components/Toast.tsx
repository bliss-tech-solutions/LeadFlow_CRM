"use client";

import { useEffect, useRef, useState } from "react";
import { socket } from "../lib/socket";
import { getUser } from "../lib/auth";
import { api } from "../lib/api";
import {
  playNotificationSound,
  unlockNotificationSound,
} from "../lib/notificationSound";
import { X, UserPlus } from "lucide-react";

export default function RealtimeToast() {
  const [lead, setLead] = useState<any>(null);
  const seenLeadIds = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Browsers require a user gesture before audible playback. Unlock the
    // shared audio instance on the first dashboard interaction.
    const unlock = () => {
      unlockNotificationSound().catch(() => undefined);
    };

    window.addEventListener("pointerdown", unlock, {
      once: true,
      capture: true,
    });
    window.addEventListener("keydown", unlock, { once: true, capture: true });

    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, []);

  function showLead(incoming: any) {
    const id = incoming?._id || incoming?.id;

    if (!incoming || !id || seenLeadIds.current.has(id)) return false;

    seenLeadIds.current.add(id);

    if (seenLeadIds.current.size > 500) {
      const first = seenLeadIds.current.values().next().value;
      if (first) seenLeadIds.current.delete(first);
    }
    setLead(incoming);

    if (timer.current) {
      clearTimeout(timer.current);
    }

    timer.current = setTimeout(() => {
      setLead(null);
    }, 8000);

    return true;
  }

  useEffect(() => {
    const user = getUser();
    const token = localStorage.getItem("leadflow_token");

    if (!user || !token) return;

    const join = () => {
      console.info(`[realtime] connected user=${user.id} role=${user.role}`);
    };

    const onNewLead = (payload: any) => {
      const incomingLead = payload?.lead;

      if (showLead(incomingLead)) {
        void playNotificationSound();
      }
    };

    const onLeadAssigned = (payload: any) => {
      const incomingLead = payload?.lead;

      if (showLead(incomingLead)) {
        void playNotificationSound();
      }
    };

    socket.on("connect", join);
    socket.on("new_lead", onNewLead);
    socket.on("lead_assigned", onLeadAssigned);

    if (!socket.connected) {
      socket.connect();
    } else {
      join();
    }

    // Fallback polling is already user-scoped by /api/leads.
    let lastSeenCreatedAt = "";

    const checkLatest = async () => {
      try {
        const data = await api("/leads?limit=1");
        const latest = data?.leads?.[0];

        if (!latest) return;

        const createdAt = latest.createdAt || "";

        if (!lastSeenCreatedAt) {
          lastSeenCreatedAt = createdAt;
          return;
        }

        if (createdAt > lastSeenCreatedAt) {
          lastSeenCreatedAt = createdAt;

          if (showLead(latest)) {
            void playNotificationSound();
          }
        }
      } catch {
        // Ignore fallback polling errors.
      }
    };

    checkLatest();
    const interval = window.setInterval(checkLatest, 5000);

    return () => {
      socket.off("connect", join);
      socket.off("new_lead", onNewLead);
      socket.off("lead_assigned", onLeadAssigned);
      window.clearInterval(interval);

      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  if (!lead) return null;

  return (
    <div
      className="fixed right-4 top-4 z-[90] flex w-[min(360px,calc(100vw-32px))] gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
      role="alert"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
        <UserPlus size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <b className="block text-sm text-slate-900">New lead received</b>
        <span className="mt-1 block truncate text-xs text-slate-500">
          {lead.name} · {lead.source || "META"}
        </span>
        {lead.phone && (
          <span className="mt-0.5 block text-xs text-slate-500">
            {lead.phone}
          </span>
        )}
      </div>
      <button
        aria-label="Close notification"
        onClick={() => setLead(null)}
        className="self-start rounded-lg p-1 text-slate-400 hover:bg-slate-100"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function SocketStatus() {
  return null;
}
