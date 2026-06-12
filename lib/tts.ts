import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { LangCode } from "@/types";

const VOICE_IDS: Record<LangCode, string> = {
  en: "JBFqnCBsd6RMkjVDRZzb",
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

async function generateSingleTTS(
  text: string,
  targetLang: LangCode
): Promise<Buffer> {
  const elevenlabs = getElevenLabsClient();
  const audioStream = await elevenlabs.textToSpeech.convert(
    VOICE_IDS[targetLang],
    {
      text,
      modelId: "eleven_flash_v2_5",
      outputFormat: "mp3_44100_128",
    }
  );

  const chunks: Buffer[] = [];
  const reader = audioStream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
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
