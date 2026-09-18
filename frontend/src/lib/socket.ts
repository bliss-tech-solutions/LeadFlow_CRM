import { io } from "socket.io-client";

// One authenticated browser-side singleton. The token is read at connection
// time so it is available after the user finishes the login flow.
export const socket = io(
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000",
  {
    autoConnect: false,
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
    timeout: 10000,
    auth: (callback) => {
      callback({
        token:
          typeof window !== "undefined"
            ? localStorage.getItem("leadflow_token")
            : null,
      });
    },
  },
);
