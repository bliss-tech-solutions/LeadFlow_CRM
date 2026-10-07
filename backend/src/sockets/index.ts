import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

type SocketUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "SALES";
};

/**
 * Authenticate Socket.IO connections with the same JWT used by the API.
 */
function authenticateSocket(socket: any): SocketUser | null {
  const token = String(socket.handshake.auth?.token ?? "");

  if (!token) return null;

  try {
    return jwt.verify(token, env.JWT_SECRET) as SocketUser;
  } catch {
    return null;
  }
}

/**
 * Create the realtime server and place each user into only their authorized rooms.
 */
export function setupSocket(httpServer: any) {
  const allowedOrigins = env.FRONTEND_URL.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  io.use((socket, next) => {
    const user = authenticateSocket(socket);

    if (!user) {
      return next(new Error("Socket authentication failed"));
    }

    socket.data.user = user;
    next();
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as SocketUser;

    socket.join(`user:${user.id}`);

    // Only a server-verified ADMIN can join the global admin room.
    if (user.role === "ADMIN" || user.role === "MANAGER") {
      socket.join("role:ADMIN");
    }

    console.log(
      `[socket] connected ${socket.id} user=${user.id} role=${user.role}`,
    );

    socket.on("disconnect", (reason) =>
      console.log(`[socket] disconnected ${socket.id}: ${reason}`),
    );
  });

  return io;
}
