import { Server } from "socket.io";
import { resolveToken, AuthUser } from "../middleware/auth";
import { isAllowedOrigin } from "../config/origins";
import { logger } from "../config/logger";

/**
 * Create the realtime server and place each user into only their authorized rooms:
 * - user:<id>        every user
 * - role:ADMIN       ADMIN and MANAGER (platform-wide stream)
 * - business:<id>    BUSINESS owners (their tenant's stream)
 */
export function setupSocket(httpServer: any) {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin: any, callback: any) => {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error("Socket CORS rejected: " + origin), false);
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  io.use(async (socket, next) => {
    const token = String(socket.handshake.auth?.token ?? "");
    const user = token ? await resolveToken(token) : null;
    if (!user) return next(new Error("Socket authentication failed"));
    socket.data.user = user;
    next();
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as AuthUser;

    socket.join(`user:${user.id}`);
    if (user.role === "ADMIN" || user.role === "MANAGER") socket.join("role:ADMIN");
    if (user.role === "BUSINESS" && user.business) socket.join(`business:${user.business}`);

    logger.debug("[socket] connected", { socketId: socket.id, userId: user.id, role: user.role });
    socket.on("disconnect", (reason) =>
      logger.debug("[socket] disconnected", { socketId: socket.id, reason }),
    );
  });

  return io;
}

/** Force-disconnect every socket for a user (blocked, logged out everywhere, password reset). */
export function disconnectUserSockets(io: Server | undefined, userId: string) {
  if (!io) return;
  io.in(`user:${userId}`).disconnectSockets(true);
}

/**
 * Emit a lead-scoped event to everyone allowed to see that lead:
 * admins, the assigned salesperson, and the owning business.
 */
export function emitLeadEvent(
  io: Server | undefined,
  event: string,
  payload: unknown,
  scope: { assignedTo?: unknown; business?: unknown },
) {
  if (!io) return;
  let target = io.to("role:ADMIN");
  if (scope.assignedTo) target = target.to(`user:${String(scope.assignedTo)}`);
  if (scope.business) target = target.to(`business:${String(scope.business)}`);
  target.emit(event, payload);
}
