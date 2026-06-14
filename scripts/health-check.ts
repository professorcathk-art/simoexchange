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
import { resolveSourceLanguage } from "../lib/detect-language";
import { translate, isMetaTranslation } from "../lib/translate";
import { generateTTS } from "../lib/tts";
import { mergeSegments } from "../lib/segment-merge";
import type { TranscriptSegment } from "../types";

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
  const res = await fetch(`${BASE}${path}`, { cache: "no-store", ...init });
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
    const text = await withTimeout(
      translate("Hello", "zh", "en"),
      45000,
      "translate Hello→ZH"
    );
    if (!text) throw new Error("empty response");
    if (!/[\u4e00-\u9fff]/.test(text)) {
      throw new Error(`expected Chinese output, got: ${text}`);
    }
    ok(`translate: "Hello" → "${text}"`);
  } catch (err) {
    fail("AIML API", err);
  }
}

function looksLikeEnglishOnly(text: string): boolean {
  return /[a-zA-Z]/.test(text) && !/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text);
}

async function checkTranslationQuality() {
  console.log("\n[4b] Translation quality");
  try {
    const lang = resolveSourceLanguage(
      "sin 就 有",
      [{ language: "ja" }],
      "zh"
    );
    if (lang !== "zh") {
      throw new Error(`CJK fragment should resolve to zh, got ${lang}`);
    }
    ok("resolveSourceLanguage: CJK+pinyin → zh (not ja)");

    const enToZh = await withTimeout(
      translate("Hello, hello. This is a test.", "zh", "en"),
      45000,
      "EN→ZH translate"
    );
    if (isMetaTranslation(enToZh)) {
      throw new Error(`meta response for EN→ZH: ${enToZh}`);
    }
    if (looksLikeEnglishOnly(enToZh)) {
      throw new Error(`EN→ZH returned untranslated English: ${enToZh}`);
    }
    ok(`EN→ZH: "Hello, hello..." → "${enToZh}"`);

    const fragment = await withTimeout(
      translate("sin 就 有", "zh", "zh"),
      30000,
      "translate fragment"
    );
    if (isMetaTranslation(fragment)) {
      throw new Error(`meta response for fragment: ${fragment}`);
    }
    ok(`translate fragment: "sin 就 有" → "${fragment}"`);

    const mandarin = await withTimeout(
      translate("尋 在 想 在 想 在", "zh", "zh"),
      30000,
      "translate mandarin"
    );
    if (isMetaTranslation(mandarin)) {
      throw new Error(`meta response for mandarin: ${mandarin}`);
    }
    ok(`translate mandarin fragment → "${mandarin}"`);

    const mickey = await withTimeout(
      translate("Hello, testing. This is Mickey. How are you?", "zh", "en"),
      30_000,
      "Mickey test phrase"
    );
    if (mickey === "[Translation unavailable]") {
      throw new Error("Mickey test phrase returned unavailable");
    }
    if (isMetaTranslation(mickey)) {
      throw new Error(`Mickey phrase flagged as meta: ${mickey}`);
    }
    if (!/[\u4e00-\u9fff]/.test(mickey)) {
      throw new Error(`Mickey phrase not Chinese: ${mickey}`);
    }
    ok(`EN→ZH Mickey phrase → "${mickey}"`);

    if (isMetaTranslation("你好吗？")) {
      throw new Error("isMetaTranslation false-positive on 你好吗？");
    }
    ok("isMetaTranslation: normal Chinese questions not flagged");
  } catch (err) {
    fail("Translation quality", err);
  }
}

async function checkTtsPipeline() {
  console.log("\n[5b] TTS pipeline (translate → speech audio)");
  try {
    const translated = await withTimeout(
      translate("Hello, this is a test.", "zh", "en"),
      30000,
      "TTS pipeline translate"
    );
    if (!translated) throw new Error("empty translation");
    const b64 = await generateTTS(translated, "zh");
    if (!b64 || b64.length < 500) {
      throw new Error(`TTS base64 too small: ${b64?.length ?? 0}`);
    }
    ok(`TTS pipeline: "${translated}" → ${b64.length} chars base64`);
  } catch (err) {
    fail("TTS pipeline", err);
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
    const root = await fetch(`${BASE}/`, { redirect: "manual" });
    if (root.status !== 307 && root.status !== 308) {
      throw new Error(`GET / expected redirect, got ${root.status}`);
    }
    const loc = root.headers.get("location") ?? "";
    if (!loc.includes("/enter")) {
      throw new Error(`GET / should redirect to /enter, got ${loc}`);
    }
    ok("GET / → redirects to /enter");
  } catch (err) {
    fail("GET / redirect", err);
    return null;
  }

  try {
    const enter = await fetch(`${BASE}/enter`);
    const enterText = await enter.text();
    if (enter.status !== 200) throw new Error(`GET /enter → ${enter.status}`);
    if (!enterText.includes("SimoExchange")) {
      throw new Error("landing page missing SimoExchange branding");
    }
    if (!enterText.includes("Enter access password")) {
      throw new Error("landing page missing password box");
    }
    ok(`GET /enter landing → ${enter.status}`);
  } catch (err) {
    fail("GET /enter", err);
    return null;
  }

  try {
    const contact = await fetch(`${BASE}/contact`);
    if (contact.status !== 200) throw new Error(`status ${contact.status}`);
    const text = await contact.text();
    if (!text.includes("chris.lau@professor-cat.com")) {
      throw new Error("contact email missing");
    }
    ok("GET /contact");
  } catch (err) {
    fail("GET /contact", err);
  }

  try {
    const blocked = await fetch(`${BASE}/app`, { redirect: "manual" });
    if (blocked.status !== 307 && blocked.status !== 308) {
      throw new Error(`expected redirect from /app, got ${blocked.status}`);
    }
    const appLoc = blocked.headers.get("location") ?? "";
    if (!appLoc.includes("/enter")) {
      throw new Error(`expected redirect to /enter, got ${appLoc}`);
    }
    ok("GET /app without auth → redirect to /enter");
  } catch (err) {
    fail("Auth gate /app", err);
  }

  try {
    const authRes = await fetch(`${BASE}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "mickey" }),
    });
    if (authRes.status !== 200) throw new Error(`auth status ${authRes.status}`);
    const cookie = authRes.headers.get("set-cookie")?.split(";")[0] ?? "";
    if (!cookie.includes("simo_access")) throw new Error("no auth cookie set");
    const appRes = await fetch(`${BASE}/app`, {
      headers: { Cookie: cookie },
    });
    if (appRes.status !== 200) throw new Error(`app status ${appRes.status}`);
    ok("POST /api/auth/verify + GET /app");
  } catch (err) {
    fail("Auth verify", err);
  }

  try {
    const badAuth = await fetchJson("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    if (badAuth.res.status !== 401) {
      throw new Error(`expected 401, got ${badAuth.res.status}`);
    }
    ok("POST /api/auth/verify wrong password → 401");
  } catch (err) {
    fail("Auth verify rejection", err);
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
    ok(`GET /session/[id]/listen → ${listenRes.status}`);
  } catch (err) {
    fail("GET listener page", err);
  }

  try {
    const redirectRes = await fetch(`${BASE}/session/${sessionId}/audio-out`, {
      redirect: "manual",
    });
    const location = redirectRes.headers.get("location") ?? "";
    if (redirectRes.status !== 307 && redirectRes.status !== 308) {
      throw new Error(`audio-out redirect expected 307/308, got ${redirectRes.status}`);
    }
    if (!location.includes(`/session/${sessionId}/listen`)) {
      throw new Error(`audio-out redirect wrong location: ${location}`);
    }
    ok("GET /session/[id]/audio-out → redirects to listen");
  } catch (err) {
    fail("audio-out redirect", err);
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

async function checkGlossaryAndTranscript(sessionId: string) {
  console.log("\n[11] Glossary & transcript polish");

  for (const path of ["/glossary", "/transcript/import"]) {
    try {
      const res = await fetch(`${BASE}${path}`);
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      ok(`GET ${path}`);
    } catch (err) {
      fail(`GET ${path}`, err);
    }
  }

  let glossaryAvailable = false;
  try {
    const { res, json } = await fetchJson("/api/glossary");
    if (res.status !== 200) {
      const errMsg = (json as { error?: string })?.error ?? "";
      if (errMsg.includes("table missing")) {
        ok("GET /api/glossary skipped (run migration 004)");
      } else {
        throw new Error(`status ${res.status}: ${errMsg}`);
      }
    } else {
      glossaryAvailable = true;
      ok("GET /api/glossary");
    }
  } catch (err) {
    fail("GET /api/glossary", err);
  }

  if (glossaryAvailable) {
    try {
      const { res, json } = await fetchJson("/api/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_term: "health-check-term",
          target_term: "健康检查",
          source_lang: "en",
          target_lang: "zh",
        }),
      });
      if (res.status !== 201) throw new Error(`status ${res.status}`);
      const termId = (json as { id: string }).id;
      ok("POST /api/glossary");

      const del = await fetchJson(`/api/glossary/${termId}`, { method: "DELETE" });
      if (del.res.status !== 200) throw new Error(`delete status ${del.res.status}`);
      ok("DELETE /api/glossary/[id]");
    } catch (err) {
      fail("Glossary CRUD", err);
    }
  }

  try {
    const { res } = await fetchJson("/api/transcript/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "", source_lang: "en", target_lang: "zh" }),
    });
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
    ok("POST /api/transcript/import empty → 400");
  } catch (err) {
    fail("POST /api/transcript/import validation", err);
  }

  try {
    const { res, json } = await fetchJson(`/api/sessions/${sessionId}/transcript/polish`, {
      method: "POST",
    });
    if (res.status === 400) {
      ok("POST session polish without segments → 400");
    } else if (res.status === 201 || res.status === 200) {
      ok("POST session polish job created");
    } else if (res.status === 500) {
      const errMsg = (json as { error?: string })?.error ?? "";
      if (errMsg.includes("table missing")) {
        ok("POST session polish skipped (run migration 004)");
      } else {
        throw new Error(`status ${res.status}: ${errMsg}`);
      }
    } else {
      throw new Error(`unexpected status ${res.status}`);
    }
  } catch (err) {
    fail("POST session polish", err);
  }

  try {
    const { res, json } = await fetchJson("/api/transcript/jobs/00000000-0000-0000-0000-000000000000");
    if (res.status === 404) {
      ok("GET /api/transcript/jobs/[id] missing → 404");
    } else if (res.status === 500) {
      const errMsg = (json as { error?: string })?.error ?? "";
      if (errMsg.includes("table missing")) {
        ok("GET transcript job skipped (run migration 004)");
      } else {
        throw new Error(`expected 404, got 500: ${errMsg}`);
      }
    } else {
      throw new Error(`expected 404, got ${res.status}`);
    }
  } catch (err) {
    fail("GET transcript job", err);
  }
}

async function checkDeleteSession(sessionId: string) {
  console.log("\n[12] Delete session");
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

async function checkSegmentUpdateAudio(sessionId: string) {
  console.log("\n[10b] segment_update with TTS audio");
  return new Promise<void>((resolve) => {
    const socket = ioClient(BASE, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      fail("segment_update audio", "timeout waiting for segment events (60s)");
      resolve();
    }, 60000);

    socket.on("connect", () => {
      socket.emit("join_session", sessionId, async (res: { ok?: boolean }) => {
        if (!res?.ok) {
          clearTimeout(timeout);
          fail("segment_update audio", "join_session failed");
          socket.disconnect();
          resolve();
          return;
        }

        try {
          const emitRes = await fetch(
            `${BASE}/api/sessions/${sessionId}/test-segment`,
            { method: "POST" }
          );
          if (!emitRes.ok) {
            const body = await emitRes.text();
            throw new Error(`test-segment ${emitRes.status}: ${body}`);
          }
        } catch (err) {
          clearTimeout(timeout);
          fail("segment_update audio", err);
          socket.disconnect();
          resolve();
        }
      });
    });

    let gotUpdate = false;
    let gotAudio = false;

    const finish = () => {
      if (!gotUpdate || !gotAudio) return;
      clearTimeout(timeout);
      ok("segment_update + segment_audio deliver translation and MP3");
      socket.disconnect();
      resolve();
    };

    socket.on(
      "segment_update",
      (data: { audioBase64?: string | null; translatedText?: string }) => {
        if (!data.translatedText) return;
        if (!data.audioBase64 || data.audioBase64.length < 500) {
          clearTimeout(timeout);
          fail(
            "segment_update audio",
            `missing or tiny audioBase64 (${data.audioBase64?.length ?? 0})`
          );
          socket.disconnect();
          resolve();
          return;
        }
        gotUpdate = true;
        finish();
      }
    );

    socket.on(
      "segment_audio",
      (data: { audioBase64?: string | null }) => {
        if (!data.audioBase64 || data.audioBase64.length < 500) {
          clearTimeout(timeout);
          fail(
            "segment_audio",
            `missing or tiny audio (${data.audioBase64?.length ?? 0})`
          );
          socket.disconnect();
          resolve();
          return;
        }
        gotAudio = true;
        finish();
      }
    );

    socket.on("connect_error", (err) => {
      clearTimeout(timeout);
      fail("segment_update audio", err);
      resolve();
    });
  });
}

async function checkTranscriptPersistenceAfterEnd(sessionId: string) {
  console.log("\n[10c] Transcript persistence after end session");

  try {
    const localOnly: TranscriptSegment[] = [
      {
        id: "local-seg-1",
        session_id: sessionId,
        seq_no: 99,
        source_text: "in-memory transcript line",
        is_final: true,
        translated_text: "内存中的翻译",
        audio_base64: null,
        speaker_id: null,
        created_at: new Date().toISOString(),
      },
    ];
    const merged = mergeSegments(localOnly, []);
    if (merged.length !== 1 || merged[0].source_text !== "in-memory transcript line") {
      throw new Error("mergeSegments wiped local segments when DB returned empty");
    }
    ok("mergeSegments keeps in-memory transcript when DB fetch is empty");
  } catch (err) {
    fail("mergeSegments", err);
  }

  try {
    const { res, json } = await fetchJson(`/api/sessions/${sessionId}/segments`);
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    let segments = json as TranscriptSegment[];
    if (segments.length === 0) {
      const sb = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!
      );
      const { data: inserted, error: insertErr } = await sb
        .from("transcript_segments")
        .insert({
          session_id: sessionId,
          seq_no: 1,
          source_text: "Health check persisted segment",
          is_final: true,
        })
        .select("id");
      if (insertErr) throw insertErr;
      if (!inserted?.length) throw new Error("segment insert returned no rows");
      const { res: res2, json: json2 } = await fetchJson(
        `/api/sessions/${sessionId}/segments?ts=${Date.now()}`
      );
      if (res2.status !== 200) throw new Error(`status ${res2.status}`);
      segments = json2 as TranscriptSegment[];
      if (segments.length === 0) throw new Error("segments API returned empty after insert");
    }
    ok(`GET segments before end → ${segments.length} segment(s)`);
  } catch (err) {
    fail("segments before end", err);
    return;
  }

  try {
    const { res } = await fetchJson(`/api/sessions/${sessionId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ended" }),
    });
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    ok("PATCH status → ended");
  } catch (err) {
    fail("end session for persistence", err);
    return;
  }

  try {
    const { res, json } = await fetchJson(`/api/sessions/${sessionId}/segments`);
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    const after = json as TranscriptSegment[];
    if (after.length === 0) {
      throw new Error("segments disappeared from API after session ended");
    }
    ok(`GET segments after end → ${after.length} segment(s) still available`);
  } catch (err) {
    fail("segments after end", err);
  }
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
  await checkTranslationQuality();
  await checkElevenLabs();
  await checkTtsPipeline();

  const sessionId = await checkHttpRoutes();
  await checkSocketIo();

  if (sessionId) {
    await checkAudioWebSocket(sessionId);
    await checkListenerChannel(sessionId);
    await checkSegmentUpdateAudio(sessionId);
    await checkTranscriptPersistenceAfterEnd(sessionId);
    await checkGlossaryAndTranscript(sessionId);
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
