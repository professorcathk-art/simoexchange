import type { WebSocket } from "ws";
import { DeepgramClient, type Deepgram } from "@deepgram/sdk";
import { parseControlMessage } from "@/lib/audio-ws-protocol";
import {
  getSession,
  getNextSeqNo,
  insertSegment,
  updateSegmentTranslation,
} from "@/lib/supabase";
import { getDominantSpeaker } from "@/lib/speakers";
import { resolveSourceLanguage } from "@/lib/detect-language";
import { translate } from "@/lib/translate";
import { generateTTS } from "@/lib/tts";
import {
  trackDeepgramActiveSec,
  trackDeepgramSessionStart,
  trackTranslation,
  trackTts,
} from "@/server/api-usage";
import { emitToSession } from "@/server/socket";
import type { LangCode } from "@/types";

interface ActiveConnection {
  deepgramSocket: Awaited<ReturnType<DeepgramClient["listen"]["v1"]["connect"]>> | null;
  keepaliveInterval: ReturnType<typeof setInterval> | null;
  suspendTimer: ReturnType<typeof setTimeout> | null;
  sessionId: string;
  targetLang: LangCode;
  sessionSourceLang: LangCode;
  audioQueue: Buffer[];
  deepgramReady: boolean;
  deepgramConnecting: boolean;
  lastProcessedText: string;
  lowPowerMode: boolean;
  configReceived: boolean;
  speechActive: boolean;
  deepgramStartedAt: number | null;
}

function sendWsJson(ws: WebSocket, payload: object): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

const activeConnections = new Map<WebSocket, ActiveConnection>();

function toBuffer(data: WebSocket.RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data as Uint8Array);
}

function isTextControl(data: WebSocket.RawData): string | null {
  if (typeof data === "string") {
    return parseControlMessage(data) ? data : null;
  }
  if (!Buffer.isBuffer(data) || data.length > 256) return null;
  const text = data.toString("utf8");
  return parseControlMessage(text) ? text : null;
}

function flushAudioQueue(conn: ActiveConnection): void {
  if (!conn.deepgramReady || !conn.deepgramSocket) return;
  for (const chunk of conn.audioQueue) {
    try {
      conn.deepgramSocket.sendMedia(chunk);
    } catch (err) {
      console.error("Error flushing audio chunk:", err);
    }
  }
  conn.audioQueue.length = 0;
}

function canSendAudioToDeepgram(conn: ActiveConnection): boolean {
  if (!conn.lowPowerMode) return true;
  return conn.speechActive;
}

function handleAudioChunk(ws: WebSocket, data: WebSocket.RawData): void {
  const conn = activeConnections.get(ws);
  if (!conn) return;

  const controlText = isTextControl(data);
  if (controlText) {
    handleControlMessage(ws, conn, controlText);
    return;
  }

  if (!canSendAudioToDeepgram(conn)) return;

  const buf = toBuffer(data);
  if (!conn.deepgramReady || !conn.deepgramSocket) {
    conn.audioQueue.push(buf);
    return;
  }

  try {
    conn.deepgramSocket.sendMedia(buf);
  } catch (err) {
    console.error("Error sending audio to Deepgram:", err);
  }
}

function handleControlMessage(
  ws: WebSocket,
  conn: ActiveConnection,
  raw: string
): void {
  const msg = parseControlMessage(raw);
  if (!msg) return;

  if (msg.type === "config") {
    conn.configReceived = true;
    conn.lowPowerMode = msg.lowPowerMode;
    if (!conn.lowPowerMode) {
      void startDeepgramSession(ws, conn);
    }
    return;
  }

  if (msg.type === "speech_start") {
    conn.speechActive = true;
    if (conn.suspendTimer) {
      clearTimeout(conn.suspendTimer);
      conn.suspendTimer = null;
    }
    void startDeepgramSession(ws, conn);
    return;
  }

  if (msg.type === "speech_end") {
    conn.speechActive = false;
    scheduleSuspendDeepgram(conn);
  }
}

/** Deepgram session lifecycle — open stream when speech needs transcription. */
async function startDeepgramSession(
  ws: WebSocket,
  conn: ActiveConnection
): Promise<void> {
  if (conn.deepgramReady || conn.deepgramConnecting) return;
  if (!process.env.DEEPGRAM_API_KEY) return;

  conn.deepgramConnecting = true;
  const deepgram = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });

  try {
    const deepgramSocket = await deepgram.listen.v1.connect({
      model: "nova-3",
      language: "multi",
      diarize: "true",
      smart_format: "true",
      punctuate: "true",
      interim_results: "true",
      utterance_end_ms: "1000",
      endpointing: "100",
      vad_events: "true",
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
    });

    conn.deepgramSocket = deepgramSocket;
    conn.deepgramStartedAt = Date.now();
    trackDeepgramSessionStart(conn.sessionId);

    conn.keepaliveInterval = setInterval(() => {
      try {
        deepgramSocket.sendKeepAlive({ type: "KeepAlive" });
      } catch {
        // ignore keepalive errors
      }
    }, 8000);

    deepgramSocket.on("message", (data) => {
      if (data.type !== "Results") return;
      const result = data as Deepgram.listen.ListenV1Results;
      const { transcript, speakerId, words } = parseResult(result);
      if (!transcript) return;

      const isFinal = result.speech_final || result.is_final;
      if (isFinal && transcript !== conn.lastProcessedText) {
        conn.lastProcessedText = transcript;
        processFinalTranscript(
          conn.sessionId,
          transcript,
          conn.targetLang,
          speakerId,
          words as { language?: string }[],
          conn.sessionSourceLang
        ).catch((err) => console.error("Process final error:", err));
      } else if (!isFinal) {
        emitToSession(conn.sessionId, "transcript_interim", {
          sessionId: conn.sessionId,
          text: transcript,
          seqNo: -1,
          speakerId,
        });
      }
    });

    deepgramSocket.on("error", (err) => {
      console.error("Deepgram error:", err);
    });

    deepgramSocket.connect();
    await deepgramSocket.waitForOpen();
    conn.deepgramReady = true;
    conn.deepgramConnecting = false;
    flushAudioQueue(conn);
    sendWsJson(ws, { type: "deepgram_ready" });
    console.log(`[audio-ws] Deepgram active for session ${conn.sessionId}`);
  } catch (err) {
    conn.deepgramConnecting = false;
    conn.deepgramSocket = null;
    conn.deepgramReady = false;
    console.error("Deepgram connection error:", err);
    if (!conn.lowPowerMode) {
      cleanupConnection(ws);
      ws.close(1011, "Failed to connect to Deepgram");
    }
  }
}

/** Suspend Deepgram after silence hangover in low-power mode. */
function scheduleSuspendDeepgram(conn: ActiveConnection): void {
  if (!conn.lowPowerMode) return;
  if (conn.suspendTimer) clearTimeout(conn.suspendTimer);
  conn.suspendTimer = setTimeout(() => {
    if (!conn.speechActive) suspendDeepgramSession(conn);
  }, 2500);
}

function suspendDeepgramSession(conn: ActiveConnection): void {
  if (conn.deepgramStartedAt) {
    const elapsed = (Date.now() - conn.deepgramStartedAt) / 1000;
    trackDeepgramActiveSec(conn.sessionId, elapsed);
    conn.deepgramStartedAt = null;
  }
  if (conn.keepaliveInterval) {
    clearInterval(conn.keepaliveInterval);
    conn.keepaliveInterval = null;
  }
  try {
    conn.deepgramSocket?.sendCloseStream({ type: "CloseStream" });
    conn.deepgramSocket?.close();
  } catch {
    // ignore
  }
  conn.deepgramSocket = null;
  conn.deepgramReady = false;
  conn.deepgramConnecting = false;
  conn.lastProcessedText = "";
  conn.audioQueue.length = 0;
  console.log(`[audio-ws] Deepgram suspended for session ${conn.sessionId}`);
}

async function processFinalTranscript(
  sessionId: string,
  text: string,
  targetLang: LangCode,
  speakerId: number | null,
  words: { language?: string }[],
  sessionSourceLang: LangCode
): Promise<void> {
  const seqNo = await getNextSeqNo(sessionId);
  const segment = await insertSegment(sessionId, seqNo, text, speakerId);

  emitToSession(sessionId, "transcript_final", {
    sessionId,
    text,
    seqNo,
    segmentId: segment.id,
    speakerId,
  });

  emitToSession(sessionId, "segment_update", {
    sessionId,
    segmentId: segment.id,
    sourceText: text,
    translatedText: "Translating...",
    audioBase64: null,
    seqNo,
    speakerId,
  });

  let translatedText = "[Translation unavailable]";
  let audioBase64: string | null = null;

  try {
    const sourceLang = resolveSourceLanguage(text, words, sessionSourceLang);
    translatedText = await translate(text, targetLang, sourceLang);
    if (!translatedText) translatedText = "[Translation unavailable]";
    if (translatedText !== "[Translation unavailable]") {
      trackTranslation(sessionId, text.length);
    }
  } catch (err) {
    console.error("Translation error:", err);
    translatedText = "[Translation unavailable]";
  }

  try {
    if (translatedText !== "[Translation unavailable]") {
      audioBase64 = await generateTTS(translatedText, targetLang);
      trackTts(sessionId, translatedText.length);
    }
  } catch (err) {
    console.error("TTS error:", err);
  }

  await updateSegmentTranslation(segment.id, translatedText, audioBase64);

  emitToSession(sessionId, "segment_update", {
    sessionId,
    segmentId: segment.id,
    sourceText: text,
    translatedText,
    audioBase64,
    seqNo,
    speakerId,
  });

  if (audioBase64) {
    emitToSession(sessionId, "segment_audio", {
      sessionId,
      segmentId: segment.id,
      audioBase64,
      seqNo,
    });
  }
}

function parseResult(result: Deepgram.listen.ListenV1Results) {
  const alt = result.channel?.alternatives?.[0];
  const transcript = alt?.transcript?.trim() ?? "";
  const words = alt?.words ?? [];
  const speakerId = getDominantSpeaker(words);
  return { transcript, speakerId, words };
}

export async function setupAudioWebSocket(
  ws: WebSocket,
  sessionId: string
): Promise<void> {
  if (!sessionId) {
    ws.close(1008, "sessionId required");
    return;
  }

  const session = await getSession(sessionId);
  if (!session) {
    ws.close(1008, "Session not found");
    return;
  }

  if (!process.env.DEEPGRAM_API_KEY) {
    ws.close(1011, "DEEPGRAM_API_KEY not configured");
    return;
  }

  const conn: ActiveConnection = {
    deepgramSocket: null,
    keepaliveInterval: null,
    suspendTimer: null,
    sessionId,
    targetLang: session.target_lang as LangCode,
    sessionSourceLang: session.source_lang as LangCode,
    audioQueue: [],
    deepgramReady: false,
    deepgramConnecting: false,
    lastProcessedText: "",
    lowPowerMode: false,
    configReceived: false,
    speechActive: false,
    deepgramStartedAt: null,
  };
  activeConnections.set(ws, conn);

  let legacyStartTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    legacyStartTimer = null;
    if (!conn.configReceived && !conn.deepgramReady && !conn.deepgramConnecting) {
      void startDeepgramSession(ws, conn);
    }
  }, 1500);

  const cancelLegacyStart = () => {
    if (legacyStartTimer) {
      clearTimeout(legacyStartTimer);
      legacyStartTimer = null;
    }
  };

  ws.on("message", (data) => {
    const controlText = isTextControl(data);
    if (controlText) {
      const msg = parseControlMessage(controlText);
      if (msg?.type === "config") cancelLegacyStart();
    }
    handleAudioChunk(ws, data);
  });
  ws.on("close", () => cleanupConnection(ws));
  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
    cleanupConnection(ws);
  });

  // Legacy clients without config: auto-start after short grace period.
  setTimeout(() => {
    if (!conn.configReceived && !conn.deepgramReady && !conn.deepgramConnecting) {
      void startDeepgramSession(ws, conn);
    }
  }, 1500);
}

function cleanupConnection(ws: WebSocket): void {
  const conn = activeConnections.get(ws);
  if (conn) {
    if (conn.suspendTimer) clearTimeout(conn.suspendTimer);
    suspendDeepgramSession(conn);
    activeConnections.delete(ws);
  }
}

export function closeSessionAudioConnections(sessionId: string): void {
  for (const [ws, conn] of Array.from(activeConnections.entries())) {
    if (conn.sessionId === sessionId) {
      cleanupConnection(ws);
      ws.close();
    }
  }
}
