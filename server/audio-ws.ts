import type { WebSocket } from "ws";
import { DeepgramClient, type Deepgram } from "@deepgram/sdk";
import {
  getSession,
  getNextSeqNo,
  insertSegment,
  updateSegmentTranslation,
} from "@/lib/supabase";
import { translate } from "@/lib/translate";
import { generateTTS } from "@/lib/tts";
import { emitToSession } from "@/server/socket";
import type { LangCode } from "@/types";

interface ActiveConnection {
  deepgramSocket: Awaited<ReturnType<DeepgramClient["listen"]["v1"]["connect"]>> | null;
  keepaliveInterval: ReturnType<typeof setInterval> | null;
  sessionId: string;
  sourceLang: LangCode;
  targetLang: LangCode;
}

const activeConnections = new Map<WebSocket, ActiveConnection>();

async function processFinalTranscript(
  sessionId: string,
  text: string,
  sourceLang: LangCode,
  targetLang: LangCode
): Promise<void> {
  const seqNo = await getNextSeqNo(sessionId);
  const segment = await insertSegment(sessionId, seqNo, text);

  emitToSession(sessionId, "transcript_final", {
    sessionId,
    text,
    seqNo,
    segmentId: segment.id,
  });

  let translatedText = "[Translation unavailable]";
  let audioBase64: string | null = null;

  try {
    translatedText = await translate(text, sourceLang, targetLang);
    if (!translatedText) translatedText = "[Translation unavailable]";
  } catch (err) {
    console.error("Translation error:", err);
  }

  try {
    if (translatedText !== "[Translation unavailable]") {
      audioBase64 = await generateTTS(translatedText, targetLang);
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
  });
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

  const sourceLang = session.source_lang as LangCode;
  const targetLang = session.target_lang as LangCode;

  if (!process.env.DEEPGRAM_API_KEY) {
    ws.close(1011, "DEEPGRAM_API_KEY not configured");
    return;
  }

  const deepgram = new DeepgramClient({
    apiKey: process.env.DEEPGRAM_API_KEY,
  });

  let deepgramSocket: Awaited<
    ReturnType<DeepgramClient["listen"]["v1"]["connect"]>
  > | null = null;

  try {
    // WebM/Opus from MediaRecorder is containerized — omit encoding/sample_rate
    // so Deepgram reads headers from the stream (see Deepgram docs).
    deepgramSocket = await deepgram.listen.v1.connect({
      model: "nova-3",
      language: sourceLang,
      smart_format: "true",
      punctuate: "true",
      interim_results: "true",
      utterance_end_ms: "1000",
      vad_events: "true",
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
    });

    const keepaliveInterval = setInterval(() => {
      try {
        deepgramSocket?.sendKeepAlive({ type: "KeepAlive" });
      } catch {
        // ignore keepalive errors
      }
    }, 8000);

    activeConnections.set(ws, {
      deepgramSocket,
      keepaliveInterval,
      sessionId,
      sourceLang,
      targetLang,
    });

    deepgramSocket.on("message", (data) => {
      if (data.type !== "Results") return;
      const result = data as Deepgram.listen.ListenV1Results;
      const transcript =
        result.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
      if (!transcript) return;

      if (result.is_final) {
        console.log(`[deepgram] final: ${transcript}`);
        processFinalTranscript(sessionId, transcript, sourceLang, targetLang).catch(
          (err) => console.error("Process final error:", err)
        );
      } else {
        console.log(`[deepgram] interim: ${transcript}`);
        emitToSession(sessionId, "transcript_interim", {
          sessionId,
          text: transcript,
          seqNo: -1,
        });
      }
    });

    deepgramSocket.on("error", (err) => {
      console.error("Deepgram error:", err);
    });

    await deepgramSocket.waitForOpen();
  } catch (err) {
    console.error("Deepgram connection error:", err);
    ws.close(1011, "Failed to connect to Deepgram");
    return;
  }

  ws.on("message", (data) => {
    const conn = activeConnections.get(ws);
    if (!conn?.deepgramSocket) return;
    try {
      conn.deepgramSocket.sendMedia(data as Buffer);
    } catch (err) {
      console.error("Error sending audio to Deepgram:", err);
    }
  });

  ws.on("close", () => {
    cleanupConnection(ws);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
    cleanupConnection(ws);
  });
}

function cleanupConnection(ws: WebSocket): void {
  const conn = activeConnections.get(ws);
  if (conn) {
    if (conn.keepaliveInterval) clearInterval(conn.keepaliveInterval);
    try {
      conn.deepgramSocket?.sendCloseStream({ type: "CloseStream" });
      conn.deepgramSocket?.close();
    } catch {
      // ignore cleanup errors
    }
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
