import { loadEnvConfig } from "@next/env";
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { WebSocketServer } from "ws";
import { setIO } from "./server/socket";
import { setupAudioWebSocket } from "./server/audio-ws";

loadEnvConfig(process.cwd());

const requiredEnv = [
  "DEEPGRAM_API_KEY",
  "AIML_API_KEY",
  "ELEVENLABS_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
] as const;

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.warn(`⚠️  Missing env var: ${key} — some features will not work`);
  }
}

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/socket.io",
  });

  setIO(io);

  io.on("connection", (socket) => {
    socket.on("join_session", (sessionId: string) => {
      if (sessionId) {
        socket.join(`session:${sessionId}`);
      }
    });
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const { pathname, query } = parse(request.url!, true);

    if (pathname === "/api/ws/audio") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        const sessionId = (query.sessionId as string) || "";
        setupAudioWebSocket(ws, sessionId).catch((err) => {
          console.error("Audio WS setup error:", err);
          ws.close(1011, "Setup failed");
        });
      });
    } else {
      socket.destroy();
    }
  });

  httpServer.listen(port, () => {
    console.log(`> LiveTranslate ready on http://${hostname}:${port}`);
  });
});
