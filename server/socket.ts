import type { Server as SocketIOServer } from "socket.io";

declare global {
  // eslint-disable-next-line no-var
  var __livetranslate_io: SocketIOServer | undefined;
}

let io: SocketIOServer | null = null;

export function setIO(server: SocketIOServer): void {
  io = server;
  global.__livetranslate_io = server;
}

export function getIO(): SocketIOServer {
  const instance = global.__livetranslate_io ?? io;
  if (!instance) {
    throw new Error("Socket.io server not initialized");
  }
  return instance;
}

export function emitToSession(
  sessionId: string,
  event: string,
  payload: unknown
): void {
  getIO().to(`session:${sessionId}`).emit(event, payload);
}
