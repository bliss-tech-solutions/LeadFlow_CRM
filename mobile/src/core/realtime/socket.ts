import { useEffect } from "react";
import { AppState } from "react-native";
import { io, type Socket } from "socket.io-client";
import { SOCKET_URL } from "../config";
import { refreshSession, tokenStore } from "../api/client";
import { queryClient } from "../query";
import { useAuth } from "../auth/store";
import { toast } from "../ui/toast";

let socket: Socket | null = null;

export function getSocket() {
  return socket;
}

/** Which cached queries each realtime event makes stale. */
const INVALIDATE: Record<string, string[][]> = {
  new_lead: [["leads"], ["board"], ["my-day"], ["stats"]],
  lead_updated: [["leads"], ["lead"], ["board"], ["my-day"]],
  leads_assigned: [["leads"], ["board"], ["my-day"]],
  call_logged: [["lead"], ["my-day"]],
  followup_updated: [["lead"], ["followups"], ["calendar"], ["my-day"]],
  followup_reminder: [["followups"], ["my-day"]],
  whatsapp_message: [["wa-messages"], ["wa-outbox"], ["wa-status"]],
  whatsapp_status: [["wa-status"]],
  sla_warning: [["my-day"]],
  notification: [["notifications"]],
};

/**
 * Keep one authenticated Socket.IO connection while signed in and the app is in
 * the foreground; translate server events into cache invalidation + in-app toasts.
 */
export function useRealtime() {
  const status = useAuth((s) => s.status);
  const userId = useAuth((s) => s.user?.id);

  useEffect(() => {
    if (status !== "signedIn") return;

    const s = io(SOCKET_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelayMax: 10_000,
      auth: (cb) => cb({ token: tokenStore.access }),
    });
    socket = s;

    s.on("connect_error", async (err) => {
      // Access tokens are short-lived: refresh and let socket.io retry with the new one.
      if (/auth/i.test(err.message)) {
        const ok = await refreshSession().catch(() => false);
        if (!ok) useAuth.getState().logout({ remote: false });
      }
    });

    for (const [event, keys] of Object.entries(INVALIDATE)) {
      s.on(event, () => keys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey })));
    }
    // Every notification-producing event also refreshes the bell.
    ["new_lead", "followup_reminder", "sla_warning", "notification", "leads_assigned"].forEach((e) =>
      s.on(e, () => queryClient.invalidateQueries({ queryKey: ["notifications"] })),
    );

    s.on("sla_warning", (p: any) => toast.warn("Lead waiting for first contact", `${p?.name || "A lead"} · ${p?.minutes ?? ""} min`));
    s.on("whatsapp_message", (p: any) => {
      if (p?.status === "FAILED") toast.error("WhatsApp message failed", p?.error || "Open the lead for details");
    });
    s.on("user_status_changed", (p: any) => {
      if (p?.userId === userId && p?.isActive === false) useAuth.getState().logout({ remote: false });
    });

    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active" && !s.connected) s.connect();
      if (st === "background") s.disconnect();
    });

    return () => {
      sub.remove();
      s.removeAllListeners();
      s.disconnect();
      socket = null;
    };
  }, [status, userId]);
}
