
"use client";

import { useEffect, useRef, useState } from "react";
import { socket } from "../lib/socket";
import { getUser, logout } from "../lib/auth";
import {
  playNotificationSound,
  unlockNotificationSound,
} from "../lib/notificationSound";
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  X,
  UserPlus,
  Phone,
  AlertTriangle,
  AtSign,
} from "lucide-react";

type Popup = {
  id: string;
  kind: "LEAD" | "FOLLOWUP" | "CALL" | "ALERT" | "MENTION";
  title: string;
  message: string;
  tone: "blue" | "green" | "amber" | "violet" | "rose" | "slate";
};

function followupPopup(payload: any): Popup | null {
  const followUp = payload?.followUp;
  if (!followUp) return null;

  const action = String(payload?.action || "UPDATED").toUpperCase();
  const leadName = followUp?.lead?.name || "Lead";
  const scheduledAt = followUp?.scheduledAt
    ? new Date(followUp.scheduledAt).toLocaleString()
    : "the scheduled time";

  const map: Record<string, Pick<Popup, "title" | "tone" | "message">> = {
    CREATED: {
      title: "Follow-up scheduled",
      message: `${leadName} · ${followUp.type || "CALL"} · ${scheduledAt}`,
      tone: "blue",
    },
    FOLLOWUP_CREATED: {
      title: "Follow-up scheduled",
      message: `${leadName} · ${followUp.type || "CALL"} · ${scheduledAt}`,
      tone: "blue",
    },
    FOLLOWUP_COMPLETED: {
      title: "Follow-up completed",
      message: `${leadName} · The follow-up was marked completed.`,
      tone: "green",
    },
    FOLLOWUP_CANCELLED: {
      title: "Follow-up cancelled",
      message: `${leadName} · ${
        followUp.cancellationReason ||
        "The scheduled follow-up was cancelled."
      }`,
      tone: "rose",
    },
    FOLLOWUP_RESCHEDULED: {
      title: "Follow-up rescheduled",
      message: `${leadName} · New time: ${scheduledAt}`,
      tone: "violet",
    },
    REMINDER: {
      title: "Follow-up reminder",
      message: `${leadName} · ${followUp.type || "CALL"} tomorrow at ${scheduledAt}`,
      tone: "amber",
    },
  };

  const item = map[action] || {
    title: "Follow-up updated",
    message: `${leadName} · ${scheduledAt}`,
    tone: "slate" as const,
  };

  return {
    id: `${followUp._id || followUp.id || "followup"}-${action}-${Date.now()}-${Math.random()}`,
    kind: "FOLLOWUP",
    ...item,
  };
}

export default function RealtimeToast() {
  const [popups, setPopups] = useState<Popup[]>([]);
  const timers = useRef<Map<string, number>>(new Map());
  const seenEvents = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unlock = () => {
      unlockNotificationSound().catch(() => undefined);
    };

    window.addEventListener("pointerdown", unlock, {
      once: true,
      capture: true,
    });
    window.addEventListener("keydown", unlock, {
      once: true,
      capture: true,
    });

    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, []);

  useEffect(() => {
    const user = getUser();
    const token = localStorage.getItem("leadflow_token");

    if (!user || !token) return;

    const addPopup = (popup: Popup | null) => {
      if (!popup) return;

      setPopups((current) => [...current, popup].slice(-5));
      void playNotificationSound();

      const timer = window.setTimeout(() => {
        setPopups((current) =>
          current.filter((item) => item.id !== popup.id)
        );
        timers.current.delete(popup.id);
      }, 8000);

      timers.current.set(popup.id, timer);
    };

    const onNewLead = (payload: any) => {
      const lead = payload?.lead;
      if (!lead?._id) return;

      const key = `lead:${lead._id}:new`;
      if (seenEvents.current.has(key)) return;
      seenEvents.current.add(key);

      addPopup({
        id: `${key}-${Date.now()}`,
        kind: "LEAD",
        title: "New lead received",
        message: `${lead.name || "New lead"}${
          lead.phone ? ` · ${lead.phone}` : ""
        }${lead.email ? ` · ${lead.email}` : ""} · ${
          lead.source || "META"
        }${lead.campaign ? ` · Campaign: ${lead.campaign}` : ""}${
          lead.formName ? ` · Form: ${lead.formName}` : ""
        }`,
        tone: "green",
      });
    };

    const onCallLogged = (payload: any) => {
      const lead = payload?.lead;
      const call = payload?.call;
      if (!lead?._id) return;

      const key = `call:${call?._id || lead._id}:${call?.result || "CALL"}`;
      if (seenEvents.current.has(key)) return;
      seenEvents.current.add(key);

      addPopup({
        id: `${key}-${Date.now()}`,
        kind: "CALL",
        title: "Call logged",
        message: `${lead.name || "Lead"} · ${String(
          call?.result || "COMPLETED"
        ).replace(/_/g, " ")}${call?.notes ? ` · ${call.notes}` : ""}`,
        tone: "blue",
      });
    };

    const onFollowup = (payload: any) => {
      const popup = followupPopup(payload);
      if (!popup) return;

      const followUpId = payload?.followUp?._id || payload?.followUp?.id;
      const action = payload?.action || "UPDATED";
      const key = `followup:${followUpId}:${action}`;

      if (followUpId && seenEvents.current.has(key)) return;
      if (followUpId) seenEvents.current.add(key);

      addPopup(popup);
    };

    const onReminder = (payload: any) => {
      const popup = followupPopup({ ...payload, action: "REMINDER" });
      if (!popup) return;

      const followUpId = payload?.followUp?._id || payload?.followUp?.id;
      const key = `followup:${followUpId}:REMINDER`;

      if (followUpId && seenEvents.current.has(key)) return;
      if (followUpId) seenEvents.current.add(key);

      addPopup(popup);
    };

    const onSla = (p: any) =>
      addPopup({
        id: `sla-${p?.leadId}-${Date.now()}`,
        kind: "ALERT",
        title: "Lead waiting for first contact",
        message: `${p?.name || "A lead"} has been waiting ${p?.minutes ?? ""} minutes. Call now to keep your SLA.`,
        tone: "amber",
      });
    const onEscalated = (p: any) =>
      addPopup({
        id: `esc-${p?.leadId}-${Date.now()}`,
        kind: "ALERT",
        title: "SLA breached",
        message: `${p?.name || "A lead"} is still uncontacted. Consider reassigning.`,
        tone: "rose",
      });
    const onNotification = (p: any) => {
      if (p?.type === "MENTION")
        addPopup({ id: `mention-${p?.leadId}-${Date.now()}`, kind: "MENTION", title: "You were mentioned", message: "A teammate mentioned you in a lead note.", tone: "violet" });
    };
    const onWhatsApp = (p: any) => {
      if (p?.status === "FAILED")
        addPopup({ id: `wa-${p?.messageId}-${Date.now()}`, kind: "ALERT", title: "WhatsApp message failed", message: p?.error || "Open the lead to see details.", tone: "rose" });
    };
    const onUnassigned = (p: any) =>
      addPopup({
        id: `unassigned-${Date.now()}`,
        kind: "ALERT",
        title: "Leads waiting for a salesperson",
        message: `${p?.count ?? "Some"} leads have no available salesperson. Raise limits or assign manually.`,
        tone: "amber",
      });
    const onStatusChanged = (p: any) => {
      if (p?.userId === user.id && p?.isActive === false) logout();
    };

    socket.on("sla_warning", onSla);
    socket.on("sla_escalated", onEscalated);
    socket.on("notification", onNotification);
    socket.on("whatsapp_message", onWhatsApp);
    socket.on("unassigned_leads", onUnassigned);
    socket.on("user_status_changed", onStatusChanged);
    socket.on("new_lead", onNewLead);
    socket.on("call_logged", onCallLogged);
    socket.on("followup_updated", onFollowup);
    socket.on("followup_reminder", onReminder);

    const onSocketError = (error: Error) => {
      if (
        /authentication failed|invalid|expired|unauthorized/i.test(
          error?.message || ""
        )
      ) {
        socket.disconnect();
        logout();
      }
    };

    const onLogout = () => {
      socket.disconnect();
    };

    window.addEventListener("leadflow:logout", onLogout);
    socket.on("connect_error", onSocketError);

    if (!socket.connected) socket.connect();

    return () => {
      socket.off("sla_warning", onSla);
      socket.off("sla_escalated", onEscalated);
      socket.off("notification", onNotification);
      socket.off("whatsapp_message", onWhatsApp);
      socket.off("unassigned_leads", onUnassigned);
      socket.off("user_status_changed", onStatusChanged);
      socket.off("new_lead", onNewLead);
      socket.off("call_logged", onCallLogged);
      socket.off("followup_updated", onFollowup);
      socket.off("followup_reminder", onReminder);
      socket.off("connect_error", onSocketError);

      window.removeEventListener("leadflow:logout", onLogout);
      socket.disconnect();

      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  function dismiss(id: string) {
    const timer = timers.current.get(id);

    if (timer !== undefined) {
      window.clearTimeout(timer);
    }

    timers.current.delete(id);
    setPopups((current) => current.filter((item) => item.id !== id));
  }

  const iconByKind = (popup: Popup) => {
    if (popup.kind === "LEAD") return <UserPlus size={18} />;
    if (popup.kind === "CALL") return <Phone size={18} />;
    if (popup.kind === "ALERT") return <AlertTriangle size={18} />;
    if (popup.kind === "MENTION") return <AtSign size={18} />;
    if (popup.title.includes("completed")) return <CheckCircle2 size={18} />;
    if (popup.title.includes("reminder")) return <BellRing size={18} />;
    return <CalendarClock size={18} />;
  };

  const toneClasses: Record<Popup["tone"], string> = {
    blue: "bg-sky-50 text-sky-600 border-sky-200",
    green: "bg-emerald-50 text-emerald-600 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
    rose: "bg-rose-50 text-rose-600 border-rose-200",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
  };

  if (!popups.length) return null;

  return (
    <div className="fixed right-4 top-4 z-[110] flex w-[min(390px,calc(100vw-32px))] flex-col gap-3">
      {popups.map((popup) => (
        <div
          key={popup.id}
          className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
          role="alert"
        >
          <div
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${toneClasses[popup.tone]}`}
          >
            {iconByKind(popup)}
          </div>

          <div className="min-w-0 flex-1">
            <b className="block text-sm text-slate-900">{popup.title}</b>
            <span className="mt-1 block text-xs leading-5 text-slate-600">
              {popup.message}
            </span>
          </div>

          <button
            type="button"
            aria-label="Close notification"
            onClick={() => dismiss(popup.id)}
            className="self-start rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function SocketStatus() {
  return null;
}
