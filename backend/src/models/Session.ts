import { Schema, model, Types, Document } from "mongoose";

export type ClientApp = "admin-app" | "partner-app";

/**
 * A signed-in mobile device. Holds a hashed, rotating refresh token.
 * Access tokens for apps are short-lived (15 min); the refresh token keeps the
 * user signed in for up to 60 days of inactivity on that device.
 */
export interface ISession extends Document {
  user: Types.ObjectId;
  app: ClientApp;
  refreshTokenHash: string;
  /** Hashes of tokens already rotated out — presenting one again means the token was stolen. */
  previousHashes: string[];
  tokenVersion: number;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
  ip?: string;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revokedReason?: string;
  createdAt: Date;
}

const schema = new Schema<ISession>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    app: { type: String, enum: ["admin-app", "partner-app"], required: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    previousHashes: { type: [String], default: [], index: true },
    tokenVersion: { type: Number, default: 0 },
    deviceName: { type: String, maxlength: 120 },
    platform: { type: String, maxlength: 20 },
    appVersion: { type: String, maxlength: 20 },
    ip: String,
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    revokedReason: String,
  },
  { timestamps: true },
);

// Remove sessions 30 days after they expire.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const Session = model<ISession>("Session", schema);

/** Revoke every active session of a user (logout-all, password change, block). */
export async function revokeUserSessions(userId: string, reason: string) {
  await Session.updateMany({ user: userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date(), revokedReason: reason } });
}
