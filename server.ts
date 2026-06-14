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
  const upgradeHandler = app.getUpgradeHandler();

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/socket.io",
    maxHttpBufferSize: 5e6,
    perMessageDeflate: false,
  });

  setIO(io);

  io.on("connection", (socket) => {
    socket.on("join_session", (sessionId: string, ack?: (res: { ok: boolean }) => void) => {
      if (sessionId) {
        socket.join(`session:${sessionId}`);
        ack?.({ ok: true });
      }
    });
  });

  const wss = new WebSocketServer({
    noServer: true,
    // Railway edge proxy + permessage-deflate breaks audio WS (RSV1 must be clear)
    perMessageDeflate: false,
  });

  httpServer.on("upgrade", (request, socket, head) => {
    const { pathname, query } = parse(request.url!, true);

    if (pathname === "/api/ws/audio") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        const sessionId = (query.sessionId as string) || "";
        console.log(`[audio-ws] Client connected for session ${sessionId}`);
        setupAudioWebSocket(ws, sessionId).catch((err) => {
          console.error("Audio WS setup error:", err);
          ws.close(1011, "Setup failed");
        });
      });
    } else {
      upgradeHandler(request, socket, head);
    }
  });

  httpServer
    .listen(port, () => {
      console.log(`> LiveTranslate ready on http://${hostname}:${port}`);
    })
    .on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `\nPort ${port} is already in use. Stop the other server first:\n  lsof -ti:${port} | xargs kill -9\n  npm run dev\n`
        );
        process.exit(1);
      }
      throw err;
    });
}).catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
