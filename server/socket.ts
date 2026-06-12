import type { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer | null = null;

export function setIO(server: SocketIOServer): void {
  io = server;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error("Socket.io server not initialized");
  }
  return io;
}

export function emitToSession(
  sessionId: string,
  event: string,
  payload: unknown
): void {
  getIO().to(`session:${sessionId}`).emit(event, payload);
}
