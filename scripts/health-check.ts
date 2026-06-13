/**
 * Automated health check — run: npx tsx scripts/health-check.ts
 */
import { loadEnvConfig } from "@next/env";
import { createServer } from "http";
import { parse } from "url";
import WebSocket from "ws";
import { io as ioClient } from "socket.io-client";
import { DeepgramClient } from "@deepgram/sdk";
import OpenAI from "openai";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createClient } from "@supabase/supabase-js";
import { buildListenerUrl, ensureUrlScheme } from "../lib/qrcode";

loadEnvConfig(process.cwd());

const BASE = process.env.HEALTH_CHECK_URL || "http://localhost:3000";
let passed = 0;
let failed = 0;

function ok(name: string) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name: string, err: unknown) {
  failed++;
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`  ✗ ${name}: ${msg}`);
}

async function fetchJson(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not json
  }
  return { res, json, text };
}

async function checkEnv() {
  console.log("\n[1] Environment variables");
  for (const key of [
    "DEEPGRAM_API_KEY",
    "AIML_API_KEY",
    "ELEVENLABS_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
  ]) {
    if (process.env[key]) ok(key);
    else fail(key, "missing");
  }
}

async function checkQrUrlHelpers() {
  console.log("\n[2b] QR URL helpers");
  try {
    const normalized = ensureUrlScheme(
      "amusing-radiance-production-2939.up.railway.app"
    );
    if (!normalized.startsWith("https://")) {
      throw new Error(`expected https:// prefix, got ${normalized}`);
    }
    ok("ensureUrlScheme adds https:// to bare hostnames");

    const listener = buildListenerUrl(
      "test-session-id",
      "https://example.com"
    );
    if (listener !== "https://example.com/session/test-session-id/listen") {
      throw new Error(`unexpected listener URL: ${listener}`);
    }
    ok("buildListenerUrl produces full listen path");
  } catch (err) {
    fail("QR URL helpers", err);
  }
}

async function checkSupabase() {
  console.log("\n[2] Supabase");
  try {
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );
    const { error } = await sb.from("sessions").select("id").limit(1);
    if (error) throw error;
    ok("sessions table accessible");

    const { data: created, error: createErr } = await sb
      .from("sessions")
      .insert({
        name: "Delete policy test",
        source_lang: "en",
        target_lang: "zh",
        status: "waiting",
      })
      .select("id")
      .single();
    if (createErr) throw createErr;

    const { data: deleted, error: deleteErr } = await sb
      .from("sessions")
      .delete()
      .eq("id", created.id)
      .select("id");
    if (deleteErr) throw deleteErr;
    if (!deleted?.length) {
      throw new Error(
        "DELETE blocked by RLS — run supabase/migrations/003_allow_delete_sessions.sql in Supabase SQL Editor"
      );
    }
    ok("session delete policy works");
  } catch (err) {
    fail("Supabase", err);
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function checkDeepgram() {
  console.log("\n[3] Deepgram API");
  try {
    const dg = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY! });
    const socket = await withTimeout(
      dg.listen.v1.connect({
        model: "nova-3",
        language: "multi",
        diarize: "true",
        smart_format: "true",
        interim_results: "true",
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      }),
      15000,
      "Deepgram connect"
    );
    socket.connect();
    await withTimeout(socket.waitForOpen(), 15000, "Deepgram open");
    socket.close();
    ok("Deepgram multi+diarize WebSocket connects");
  } catch (err) {
    fail("Deepgram", err);
  }
}

async function checkAiml() {
  console.log("\n[4] AIML API (translation)");
  try {
    const client = new OpenAI({
      apiKey: process.env.AIML_API_KEY!,
      baseURL: "https://api.aimlapi.com/v1",
    });
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Translate to Chinese. Output only translation." },
        { role: "user", content: "Hello" },
      ],
      max_tokens: 50,
    });
    const text = res.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("empty response");
    ok(`AIML translate: "Hello" → "${text}"`);
  } catch (err) {
    fail("AIML API", err);
  }
}

async function checkElevenLabs() {
  console.log("\n[5] ElevenLabs TTS");
  try {
    const el = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY! });
    const stream = await el.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
      text: "Test",
      modelId: "eleven_flash_v2_5",
      outputFormat: "mp3_44100_128",
    });
    const reader = stream.getReader();
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value?.length ?? 0;
    }
    if (bytes < 100) throw new Error(`audio too small: ${bytes} bytes`);
    ok(`ElevenLabs TTS: ${bytes} bytes generated`);
  } catch (err) {
    fail("ElevenLabs", err);
  }
}

async function checkHttpRoutes() {
  console.log("\n[6] HTTP routes (server must be running)");

  try {
    const home = await fetch(`${BASE}/`);
    if (home.status !== 200) throw new Error(`GET / → ${home.status}`);
    ok(`GET / → ${home.status}`);
  } catch (err) {
    fail("GET /", err);
    return null;
  }

  let sessionId: string | null = null;

  try {
    const { res, json } = await fetchJson("/api/sessions");
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    ok("GET /api/sessions");
  } catch (err) {
    fail("GET /api/sessions", err);
  }

  try {
    const { res, json } = await fetchJson("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Health Check",
        source_lang: "en",
        target_lang: "zh",
      }),
    });
    if (res.status !== 201) throw new Error(`status ${res.status}: ${JSON.stringify(json)}`);
    sessionId = (json as { id: string }).id;
    ok(`POST /api/sessions → ${sessionId}`);
  } catch (err) {
    fail("POST /api/sessions", err);
    return null;
  }

  for (const path of [
    `/api/sessions/${sessionId}`,
    `/api/sessions/${sessionId}/segments`,
  ]) {
    try {
      const { res } = await fetchJson(path);
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      ok(`GET ${path}`);
    } catch (err) {
      fail(`GET ${path}`, err);
    }
  }

  try {
    const { res, json } = await fetchJson(`/api/sessions/${sessionId}/qrcode`);
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    const qr = (json as { qrCode?: string }).qrCode ?? "";
    const listenerUrl = (json as { listenerUrl?: string }).listenerUrl ?? "";
    if (!qr.startsWith("data:image")) throw new Error("invalid QR data");
    if (!/^https?:\/\/.+\/session\/[^/]+\/listen$/.test(listenerUrl)) {
      throw new Error(`listener URL must be absolute: ${listenerUrl}`);
    }
    ok(`GET /api/sessions/[id]/qrcode → ${listenerUrl}`);
  } catch (err) {
    fail("GET qrcode", err);
  }

  try {
    const listenRes = await fetch(`${BASE}/session/${sessionId}/listen`);
    if (listenRes.status !== 200) throw new Error(`status ${listenRes.status}`);
    const html = await listenRes.text();
    if (!html.includes("LiveTranslate") && !html.includes("Waiting for live captions")) {
      throw new Error("listener page missing expected content");
    }
    ok(`GET /session/[id]/listen → ${listenRes.status}`);
  } catch (err) {
    fail("GET listener page", err);
  }

  try {
    const { res, json } = await fetchJson(`/api/sessions/${sessionId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "live" }),
    });
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    ok("PATCH /api/sessions/[id]/status");
  } catch (err) {
    fail("PATCH status", err);
  }

  try {
    const { res } = await fetchJson("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x", source_lang: "en", target_lang: "en" }),
    });
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
    ok("POST invalid lang pair → 400");
  } catch (err) {
    fail("POST validation", err);
  }

  return sessionId;
}

async function checkDeleteSession(sessionId: string) {
  console.log("\n[9] Delete session");
  try {
    const { res } = await fetchJson(`/api/sessions/${sessionId}`, {
      method: "DELETE",
    });
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    ok("DELETE /api/sessions/[id]");
  } catch (err) {
    fail("DELETE session", err);
    return;
  }

  try {
    const { res } = await fetchJson(`/api/sessions/${sessionId}`);
    if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`);
    ok("GET deleted session → 404");
  } catch (err) {
    fail("GET deleted session", err);
  }
}

async function checkSocketIo() {
  console.log("\n[7] Socket.io");
  try {
    const res = await fetch(`${BASE}/socket.io/?EIO=4&transport=polling`);
    const text = await res.text();
    if (!text.includes('"sid"')) throw new Error("no session id in response");
    ok("Socket.io polling handshake");
  } catch (err) {
    fail("Socket.io", err);
  }
}

async function checkAudioWebSocket(sessionId: string) {
  console.log("\n[8] Audio WebSocket + Deepgram pipeline");
  return new Promise<void>((resolve) => {
    const wsUrl = BASE.replace("http://", "ws://").replace("https://", "wss://");
    const ws = new WebSocket(`${wsUrl}/api/ws/audio?sessionId=${sessionId}`);
    const timeout = setTimeout(() => {
      ws.close();
      fail("Audio WebSocket", "timeout — Deepgram did not become ready in 15s");
      resolve();
    }, 15000);

    ws.on("open", () => {
      ok("Audio WebSocket connects");
      ws.send(JSON.stringify({ type: "config", lowPowerMode: false }));
      const webmHeader = Buffer.from([
        0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f,
      ]);
      setTimeout(() => ws.send(webmHeader), 200);
    });

    ws.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 1000 || code === 1005) {
        ok("Audio WebSocket closes cleanly");
      } else if (code === 1011) {
        fail("Audio WebSocket", `server closed: ${code} (Deepgram setup failed)`);
      }
      resolve();
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      fail("Audio WebSocket", err);
      resolve();
    });

    // If still open after 10s, server accepted connection (Deepgram setup async)
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        clearTimeout(timeout);
        ok("Audio WebSocket pipeline accepted");
        ws.close(1000);
        resolve();
      }
    }, 10000);
  });
}

async function checkListenerChannel(sessionId: string) {
  console.log("\n[10] Listener Socket.io channel");
  return new Promise<void>((resolve) => {
    const socket = ioClient(BASE, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      fail("Listener channel", "timeout waiting for session_status event");
      resolve();
    }, 15000);

    const triggerStatusChange = () => {
      fetch(`${BASE}/api/sessions/${sessionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "waiting" }),
      })
        .then(() =>
          fetch(`${BASE}/api/sessions/${sessionId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "live" }),
          })
        )
        .catch((err) => {
          clearTimeout(timeout);
          fail("Listener channel", err);
          socket.disconnect();
          resolve();
        });
    };

    socket.on("connect", () => {
      socket.emit("join_session", sessionId, (res: { ok?: boolean }) => {
        if (!res?.ok) {
          clearTimeout(timeout);
          fail("Listener channel", "join_session ack failed");
          socket.disconnect();
          resolve();
          return;
        }
        ok("Listener joins session room");
        triggerStatusChange();
      });
    });

    socket.on("session_status", (data: { status?: string }) => {
      if (data.status === "live") {
        clearTimeout(timeout);
        ok("Listener receives session_status via Socket.io");
        socket.disconnect();
        resolve();
      }
    });

    socket.on("connect_error", (err) => {
      clearTimeout(timeout);
      fail("Listener channel", err);
      resolve();
    });
  });
}

async function main() {
  console.log("=== LiveTranslate Health Check ===");
  console.log(`Target: ${BASE}`);

  await checkEnv();
  await checkQrUrlHelpers();
  await checkSupabase();
  await checkDeepgram();
  await checkAiml();
  await checkElevenLabs();

  const sessionId = await checkHttpRoutes();
  await checkSocketIo();

  if (sessionId) {
    await checkAudioWebSocket(sessionId);
    await checkListenerChannel(sessionId);
    await checkDeleteSession(sessionId);
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .then(() => {
    // ensure output flushes
  })
  .catch((err) => {
    console.error("Health check crashed:", err);
    process.exit(1);
  });
