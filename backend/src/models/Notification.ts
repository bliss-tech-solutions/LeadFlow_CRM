import { Schema, model, Document, Types } from "mongoose";

export interface INotification extends Document {
  user: Types.ObjectId;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<INotification>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      default: "SYSTEM",
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    entityType: String,
    entityId: String,
    readAt: Date,
  },
  { timestamps: true },
);

schema.index({ user: 1, readAt: 1, createdAt: -1 });

/*
 * Every stored notification is also delivered as a phone push (respecting the
 * user's preferences). Centralising it here means no code path can create an
 * in-app notification and forget the push, or vice versa.
 */
function dispatchPush(docs: any[]) {
  if (!docs.length) return;
  // Lazy import avoids a circular dependency (push.service -> User model).
  setImmediate(() => {
    // Realtime copy for open apps / browsers — same content as the push.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getIO } = require("../sockets") as typeof import("../sockets");
      const io = getIO();
      for (const d of docs) {
        const n = d.toObject ? d.toObject() : d;
        io?.to(`user:${String(n.user)}`).emit("notification_created", {
          _id: String(n._id),
          type: n.type,
          title: n.title,
          message: n.message,
          entityType: n.entityType,
          entityId: n.entityId,
        });
      }
    } catch {
      /* realtime is best-effort */
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { pushForNotifications } = require("../services/push.service") as typeof import("../services/push.service");
      void pushForNotifications(docs.map((d) => (d.toObject ? d.toObject() : d))).catch(() => undefined);
    } catch {
      /* push is best-effort */
    }
  });
}

schema.pre("save", function () {
  (this as any).$locals.wasNew = this.isNew;
});
schema.post("save", function (doc) {
  if ((doc as any).$locals?.wasNew) dispatchPush([doc]);
});
schema.post("insertMany", function (docs: any[]) {
  dispatchPush(Array.isArray(docs) ? docs : [docs]);
});

export const Notification = model<INotification>("Notification", schema);
