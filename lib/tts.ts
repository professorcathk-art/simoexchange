import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { LangCode } from "@/types";

/** Free-tier voice that works without paid ElevenLabs plan. */
const FREE_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

const VOICE_IDS: Record<LangCode, string> = {
  en: FREE_VOICE_ID,
  zh: "jsCqWAovK2LkecY7zXl4",
  ja: "jsCqWAovK2LkecY7zXl4",
  ko: "jsCqWAovK2LkecY7zXl4",
};

function getElevenLabsClient(): ElevenLabsClient {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY must be set");
  }
  return new ElevenLabsClient({ apiKey });
}

function splitAtSentences(text: string, maxLen = 200): string[] {
  if (text.length <= maxLen) return [text];

  const sentences = text.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + sentence).length > maxLen && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

function isPaidVoiceError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /402|payment_required|paid_plan/i.test(msg);
}

async function streamToBuffer(
  audioStream: ReadableStream<Uint8Array>
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const reader = audioStream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function convertVoice(
  voiceId: string,
  text: string
): Promise<Buffer> {
  const elevenlabs = getElevenLabsClient();
  const audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
    text,
    modelId: "eleven_flash_v2_5",
    outputFormat: "mp3_44100_128",
  });
  return streamToBuffer(audioStream);
}

async function generateSingleTTS(
  text: string,
  targetLang: LangCode
): Promise<Buffer> {
  const voiceId = VOICE_IDS[targetLang];
  try {
    return await convertVoice(voiceId, text);
  } catch (err) {
    if (voiceId !== FREE_VOICE_ID && isPaidVoiceError(err)) {
      console.warn(
        `[tts] Voice ${voiceId} requires paid plan — falling back to free voice`
      );
      return convertVoice(FREE_VOICE_ID, text);
    }
    throw err;
  }
}

export async function generateTTS(
  text: string,
  targetLang: LangCode
): Promise<string> {
  const parts = splitAtSentences(text);
  const buffers: Buffer[] = [];

  for (const part of parts) {
    const buf = await generateSingleTTS(part, targetLang);
    buffers.push(buf);
  }

  return Buffer.concat(buffers).toString("base64");
}
