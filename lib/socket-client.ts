"use client";

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
  }
  return socket;
}

export function joinSession(sessionId: string): void {
  const socket = getSocket();
  const doJoin = () => socket.emit("join_session", sessionId);
  if (socket.connected) {
    doJoin();
  } else {
    socket.once("connect", doJoin);
  }
}
