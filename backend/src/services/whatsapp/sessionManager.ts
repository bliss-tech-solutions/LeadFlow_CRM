import QRCode from "qrcode";
import pino from "pino";
import { Types } from "mongoose";
import { WhatsAppSession, WhatsAppMessage, WhatsAppSessionStatus } from "../../models/WhatsApp";
import { User } from "../../models/User";
import { Notification } from "../../models/Notification";
import { OutreachMessage, OUTREACH_WA_ID } from "../../models/Outreach";
import { useMongoAuthState } from "./authState";
import { logger } from "../../config/logger";
import { env } from "../../config/env";

type BaileysModule = typeof import("@whiskeysockets/baileys", { with: { "resolution-mode": "import" } });
type WASocket = ReturnType<BaileysModule["makeWASocket"]>;

type LiveSession = {
  sock: WASocket;
  status: WhatsAppSessionStatus;
  qr?: string; // data URL
  qrCount: number;
  stopping: boolean;
  clearAuth: () => Promise<unknown>;
};

/**
 * Manages one Baileys socket per business.
 *
 * NOTE: run the API as a single instance while WhatsApp is enabled — a linked
 * device can only hold one live connection, so two API replicas would fight
 * over the same session.
 */
class WhatsAppSessionManager {
  private sessions = new Map<string, LiveSession>();
  private starting = new Map<string, Promise<void>>();
  private reconnectAttempts = new Map<string, number>();
  private baileys: Promise<BaileysModule> | null = null;
  private io: any = null;
  private silentLogger = pino({ level: "silent" });

  setIO(io: any) {
    this.io = io;
  }

  private load() {
    // Baileys is ESM-only; the API compiles to CommonJS, so load it with a real dynamic import.
    if (!this.baileys) this.baileys = import("@whiskeysockets/baileys");
    return this.baileys;
  }

  private emit(businessId: string, event: string, payload: unknown) {
    this.io?.to(`business:${businessId}`).emit(event, payload);
    this.io?.to("role:ADMIN").emit(event, { businessId, ...(payload as object) });
  }

  private async setStatus(businessId: string, status: WhatsAppSessionStatus, extra: Record<string, unknown> = {}) {
    const live = this.sessions.get(businessId);
    if (live) live.status = status;
    const $set: Record<string, unknown> = { status };
    const $unset: Record<string, 1> = {};
    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined) $unset[key] = 1;
      else $set[key] = value;
    }
    await WhatsAppSession.updateOne(
      { business: businessId },
      { $set, ...(Object.keys($unset).length ? { $unset } : {}) },
      { upsert: true },
    );
    this.emit(businessId, "whatsapp_status", { status, ...extra });
  }

  getLiveStatus(businessId: string) {
    const live = this.sessions.get(businessId);
    return live ? { status: live.status, qr: live.status === "QR" ? live.qr : undefined } : null;
  }

  isConnected(businessId: string) {
    return this.sessions.get(businessId)?.status === "CONNECTED";
  }

  connectedBusinessIds() {
    return [...this.sessions.entries()].filter(([, s]) => s.status === "CONNECTED").map(([id]) => id);
  }

  /** Start (or resume) a session. Emits QR codes to the business room until scanned. */
  async start(businessId: string, opts: { userId?: string } = {}) {
    if (!env.WA_ENABLED) throw new Error("WhatsApp integration is disabled on this server");
    if (this.sessions.has(businessId)) return;
    const inflight = this.starting.get(businessId);
    if (inflight) return inflight;

    const p = this.open(businessId, opts).finally(() => this.starting.delete(businessId));
    this.starting.set(businessId, p);
    return p;
  }

  private async open(businessId: string, opts: { userId?: string }) {
    const baileys = await this.load();
    const makeWASocket = (baileys as any).default ?? baileys.makeWASocket;
    const { DisconnectReason, Browsers, makeCacheableSignalKeyStore, jidNormalizedUser } = baileys;

    const { state, saveCreds, clear } = await useMongoAuthState(businessId, baileys);

    let version: [number, number, number] | undefined;
    try {
      version = (await baileys.fetchLatestBaileysVersion()).version as [number, number, number];
    } catch {
      version = undefined;
    }

    const sock: WASocket = makeWASocket({
      version,
      auth: { creds: state.creds as any, keys: makeCacheableSignalKeyStore(state.keys as any, this.silentLogger as any) },
      logger: this.silentLogger as any,
      browser: Browsers.ubuntu("LeadFlow CRM"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: false,
    });

    const live: LiveSession = { sock, status: "CONNECTING", qrCount: 0, stopping: false, clearAuth: clear };
    this.sessions.set(businessId, live);
    await this.setStatus(businessId, "CONNECTING", opts.userId ? { connectedBy: opts.userId } : {});

    sock.ev.on("creds.update", () => {
      saveCreds().catch((error) => logger.error("[whatsapp] failed to save creds", { businessId, error: error?.message }));
    });

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        live.qrCount += 1;
        // WhatsApp rotates the QR ~every 20s. Give up after ~6 rotations (~2 minutes).
        if (live.qrCount > 6) {
          live.stopping = true;
          await this.setStatus(businessId, "DISCONNECTED", { lastError: "QR code expired. Click Connect to try again." });
          try {
            sock.end(undefined);
          } catch {}
          return;
        }
        try {
          live.qr = await QRCode.toDataURL(qr, { margin: 1, width: 300 });
        } catch {
          live.qr = undefined;
        }
        live.status = "QR";
        await WhatsAppSession.updateOne({ business: businessId }, { $set: { status: "QR" } }, { upsert: true });
        this.emit(businessId, "whatsapp_qr", { qr: live.qr, expiresInSeconds: 20 });
      }

      if (connection === "open") {
        this.reconnectAttempts.delete(businessId);
        const me = sock.user;
        const phone = me?.id ? jidNormalizedUser(me.id).split("@")[0] : undefined;
        live.qr = undefined;
        await this.setStatus(businessId, "CONNECTED", {
          phone,
          displayName: me?.name || me?.verifiedName || undefined,
          lastConnectedAt: new Date(),
          lastError: undefined,
        });
        logger.info("[whatsapp] connected", { businessId });
      }

      if (connection === "close") {
        const code = (lastDisconnect?.error as any)?.output?.statusCode;
        this.sessions.delete(businessId);

        if (code === DisconnectReason.loggedOut || code === DisconnectReason.forbidden) {
          await clear();
          await this.setStatus(businessId, "LOGGED_OUT", {
            lastDisconnectedAt: new Date(),
            lastError: "WhatsApp was logged out from the phone. Scan the QR code again to reconnect.",
            phone: undefined,
          });
          await this.notifyOwners(businessId, "WhatsApp disconnected", "Your WhatsApp was logged out. Open Settings → WhatsApp and scan the QR code again.");
          return;
        }

        if (live.stopping) {
          // Manual stop or QR timeout: status already set by the caller.
          return;
        }

        // Transient close (network, restart-required after pairing, server restart...). Reconnect with backoff.
        const wasPaired = Boolean((state.creds as any)?.me?.id);
        if (!wasPaired && code !== DisconnectReason.restartRequired) {
          await this.setStatus(businessId, "DISCONNECTED", { lastError: "Connection closed before the QR code was scanned." });
          return;
        }

        const attempt = (this.reconnectAttempts.get(businessId) || 0) + 1;
        this.reconnectAttempts.set(businessId, attempt);
        if (attempt > 8) {
          await this.setStatus(businessId, "DISCONNECTED", {
            lastDisconnectedAt: new Date(),
            lastError: "Unable to reconnect to WhatsApp. Please reconnect from settings.",
          });
          await this.notifyOwners(businessId, "WhatsApp connection lost", "We could not reconnect your WhatsApp. Please open Settings → WhatsApp and reconnect.");
          return;
        }
        const delay = code === DisconnectReason.restartRequired ? 500 : Math.min(60_000, 2_000 * 2 ** (attempt - 1));
        await this.setStatus(businessId, "CONNECTING");
        setTimeout(() => {
          this.start(businessId).catch((error) =>
            logger.error("[whatsapp] reconnect failed", { businessId, error: error?.message }),
          );
        }, delay);
      }
    });

    // Delivery / read receipts for messages we sent.
    sock.ev.on("messages.update", async (updates: any[]) => {
      for (const u of updates) {
        const id = u?.key?.id;
        const status = u?.update?.status;
        if (!id || typeof status !== "number" || !u?.key?.fromMe) continue;
        // proto.WebMessageInfo.Status: 2 SERVER_ACK, 3 DELIVERY_ACK, 4 READ, 5 PLAYED
        const set: Record<string, unknown> = {};
        if (status >= 4) {
          set.status = "READ";
          set.readAt = new Date();
        } else if (status === 3) {
          set.status = "DELIVERED";
          set.deliveredAt = new Date();
        } else continue;

        // LeadFlow's own outreach number: receipts update the Contact Data message log.
        if (businessId === OUTREACH_WA_ID) {
          const next = set.status as string;
          const res = await OutreachMessage.updateOne(
            { channel: "WHATSAPP", waMessageIds: id, status: { $in: next === "READ" ? ["SENDING", "SENT", "DELIVERED"] : ["SENDING", "SENT"] } },
            { $set: { status: next, ...(next === "DELIVERED" ? { deliveredAt: new Date() } : {}) } },
          );
          if (res.modifiedCount) this.io?.to("role:ADMIN").emit("outreach_updated", {});
          continue;
        }

        const order = status >= 4 ? ["QUEUED", "SENDING", "SENT", "DELIVERED"] : ["QUEUED", "SENDING", "SENT"];
        const msg = await WhatsAppMessage.findOneAndUpdate(
          { business: businessId, waMessageIds: id, status: { $in: order } },
          { $set: set },
          { new: true },
        )
          .select("_id lead status")
          .lean();
        if (msg) this.emit(businessId, "whatsapp_message", { messageId: String(msg._id), leadId: String(msg.lead), status: msg.status });
      }
    });
  }

  private async notifyOwners(businessId: string, title: string, message: string) {
    try {
      // The outreach number belongs to the platform, so admins are told instead of a business.
      const isOutreach = businessId === OUTREACH_WA_ID;
      const owners = await User.find(isOutreach ? { role: { $in: ["ADMIN", "MANAGER"] }, isActive: true } : { role: "BUSINESS", business: businessId, isActive: true })
        .select("_id")
        .lean();
      if (isOutreach) {
        message = "LeadFlow's messaging WhatsApp needs attention. Open Contact Data → SMS & WhatsApp setup → WhatsApp and reconnect.";
      }
      if (owners.length) {
        await Notification.insertMany(
          owners.map((o) => ({ user: o._id, type: "WHATSAPP_STATUS", title, message, entityType: "Business", entityId: businessId })),
        );
      }
    } catch {}
  }

  /** Disconnect and forget the linked device (logs out on the phone too). */
  async logout(businessId: string) {
    const live = this.sessions.get(businessId);
    if (live) {
      live.stopping = true;
      try {
        await live.sock.logout();
      } catch {
        try {
          live.sock.end(undefined);
        } catch {}
      }
      await live.clearAuth();
      this.sessions.delete(businessId);
    } else {
      const baileys = await this.load();
      const { clear } = await useMongoAuthState(businessId, baileys);
      await clear();
    }
    await this.setStatus(businessId, "DISCONNECTED", { phone: undefined, lastDisconnectedAt: new Date(), lastError: undefined });
  }

  /** Stop a pending QR login without touching stored credentials. */
  async cancel(businessId: string) {
    const live = this.sessions.get(businessId);
    if (!live) return;
    live.stopping = true;
    try {
      live.sock.end(undefined);
    } catch {}
    this.sessions.delete(businessId);
    await this.setStatus(businessId, "DISCONNECTED");
  }

  /** On boot, reconnect every business that was connected before the restart. */
  async restoreAll() {
    if (!env.WA_ENABLED) return;
    const sessions = await WhatsAppSession.find({ status: { $in: ["CONNECTED", "CONNECTING"] } }).select("business").lean();
    for (const s of sessions) {
      const id = String(s.business);
      this.start(id).catch((error) => logger.error("[whatsapp] restore failed", { businessId: id, error: error?.message }));
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (sessions.length) logger.info("[whatsapp] restoring sessions", { count: sessions.length });
  }

  async shutdown() {
    for (const [, live] of this.sessions) {
      live.stopping = true;
      try {
        live.sock.end(undefined);
      } catch {}
    }
    this.sessions.clear();
  }

  /** Resolve a phone number to a WhatsApp JID, or null when the number is not on WhatsApp. */
  async resolveJid(businessId: string, phone: string): Promise<string | null> {
    const live = this.sessions.get(businessId);
    if (!live || live.status !== "CONNECTED") throw new Error("WhatsApp is not connected");
    const result = await live.sock.onWhatsApp(phone);
    const hit = result?.find((r) => r.exists);
    return hit ? hit.jid : null;
  }

  async sendText(businessId: string, jid: string, text: string) {
    const live = this.sessions.get(businessId);
    if (!live || live.status !== "CONNECTED") throw new Error("WhatsApp is not connected");
    const sent = await live.sock.sendMessage(jid, { text });
    return sent?.key?.id || null;
  }

  async sendDocument(businessId: string, jid: string, doc: { url: string; fileName: string; mimetype: string }) {
    const live = this.sessions.get(businessId);
    if (!live || live.status !== "CONNECTED") throw new Error("WhatsApp is not connected");
    const isImage = doc.mimetype.startsWith("image/");
    const sent = await live.sock.sendMessage(
      jid,
      isImage
        ? { image: { url: doc.url }, caption: doc.fileName, mimetype: doc.mimetype }
        : { document: { url: doc.url }, fileName: doc.fileName, mimetype: doc.mimetype },
    );
    return sent?.key?.id || null;
  }
}

export const whatsappManager = new WhatsAppSessionManager();

export function isValidObjectId(id: unknown) {
  return Types.ObjectId.isValid(String(id));
}
