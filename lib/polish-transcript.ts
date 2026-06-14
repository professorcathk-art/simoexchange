import OpenAI from "openai";
import type { LangCode } from "@/types";
import { formatGlossaryForPrompt } from "@/lib/glossary";
import type { GlossaryTerm } from "@/types";
import { estimateChunkCount, splitIntoChunks } from "@/lib/transcript-format";

const POLISH_TIMEOUT_MS = 90_000;
const FAST_POLISH_MAX_CHARS = 8_000;

const langNames: Record<LangCode, string> = {
  en: "English",
  zh: "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
};

export type ProgressCallback = (percent: number, message: string) => void | Promise<void>;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Polish API timeout after ${ms}ms`)), ms)
    ),
  ]);
}

function getClients(): Array<{ client: OpenAI; label: string }> {
  const clients: Array<{ client: OpenAI; label: string }> = [];
  if (process.env.AIML_API_KEY) {
    clients.push({
      client: new OpenAI({
        apiKey: process.env.AIML_API_KEY,
        baseURL: "https://api.aimlapi.com/v1",
      }),
      label: "aiml",
    });
  }
  if (process.env.OPENAI_API_KEY) {
    clients.push({ client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), label: "openai" });
  }
  return clients;
}

function buildPolishSystemPrompt(
  sourceLang: LangCode,
  targetLang: LangCode,
  glossary: GlossaryTerm[],
  isChunk: boolean,
  chunkIndex: number,
  totalChunks: number,
  fast = false
): string {
  const glossaryBlock = formatGlossaryForPrompt(glossary);
  const chunkNote =
    totalChunks > 1
      ? `\nThis is part ${chunkIndex + 1} of ${totalChunks} of a longer transcript. Keep speaker labels consistent across parts.`
      : "";

  if (fast) {
    return `Polish this live transcript into a clean bilingual document (${langNames[sourceLang]} + ${langNames[targetLang]}).
Keep all content. Label speakers (Speaker 1, Speaker 2). Fix punctuation only — do not summarize.
${glossaryBlock ? `${glossaryBlock}\n` : ""}
Format each line as:
Speaker X (Original): ...
Speaker X (Translated): ...`;
  }

  return `You are a professional transcript editor and simultaneous interpretation archivist.

TASK: Polish and format the transcript below into a professional bilingual document.

RULES:
- Preserve the original meaning as faithfully as possible — do not summarize or omit content.
- Identify speakers consistently (use "Speaker 1", "Speaker 2", etc., or names if clearly inferable).
- Fix punctuation, paragraph breaks, and obvious speech-to-text errors.
- Output BOTH the original (${langNames[sourceLang]}) AND the translation (${langNames[targetLang]}) for each utterance.
- Use the organization glossary terms exactly when they appear.
- Do not add commentary, notes, or meta-text outside the transcript.
${chunkNote}

${glossaryBlock ? `\n${glossaryBlock}\n` : ""}

OUTPUT FORMAT (plain text):
---
Segment 1
Speaker X (Original): [polished original text]
Speaker X (Translated): [professional translation in ${langNames[targetLang]}]

Segment 2
...
---`;
}

async function callPolish(
  systemPrompt: string,
  userContent: string,
  maxTokens = 8000
): Promise<string> {
  const clients = getClients();
  if (clients.length === 0) {
    throw new Error("AIML_API_KEY or OPENAI_API_KEY required for transcript polish");
  }

  let lastError: Error | null = null;
  for (const { client, label } of clients) {
    try {
      const response = await withTimeout(
        client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          temperature: 0.2,
          max_tokens: maxTokens,
        }),
        POLISH_TIMEOUT_MS
      );
      const text = response.choices[0]?.message?.content?.trim();
      if (text) return text;
      throw new Error("empty polish response");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[polish] ${label} failed:`, lastError.message);
    }
  }
  throw lastError ?? new Error("Polish failed");
}

export async function polishTranscript(
  rawText: string,
  sourceLang: LangCode,
  targetLang: LangCode,
  glossary: GlossaryTerm[],
  onProgress?: ProgressCallback
): Promise<string> {
  const chunks = splitIntoChunks(rawText);
  const total = chunks.length;
  const fastMode = rawText.length <= FAST_POLISH_MAX_CHARS && total === 1;

  await onProgress?.(15, fastMode ? "Quick polish starting..." : "Preparing transcript for AI polish...");

  const polishedParts: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const basePercent = 20 + Math.floor((i / total) * 65);
    await onProgress?.(
      basePercent,
      total > 1
        ? `AI polishing transcript (part ${i + 1} of ${total})...`
        : "AI polishing full transcript..."
    );

    const systemPrompt = buildPolishSystemPrompt(
      sourceLang,
      targetLang,
      glossary,
      total > 1,
      i,
      total,
      fastMode
    );

    const maxTokens = fastMode
      ? Math.min(4000, Math.max(1200, Math.ceil(chunks[i].length * 1.5)))
      : 8000;

    const part = await callPolish(systemPrompt, chunks[i], maxTokens);
    polishedParts.push(part);
  }

  await onProgress?.(90, "Assembling final document...");

  let result = polishedParts.join("\n\n---\n\n");

  if (total > 1) {
    await onProgress?.(92, "Running final consistency pass...");
    const mergePrompt = `You are a transcript editor. Merge these ${total} polished transcript parts into one cohesive professional bilingual document. Keep all content. Ensure speaker labels are consistent. Do not add commentary.

${formatGlossaryForPrompt(glossary)}`;

    result = await callPolish(mergePrompt, result);
  }

  await onProgress?.(98, "Finalizing...");
  return result;
}

export function getEstimatedProgressMessage(rawText: string): string {
  const chunks = estimateChunkCount(rawText);
  if (rawText.length <= FAST_POLISH_MAX_CHARS && chunks === 1) {
    return "Quick polish typically takes 15–40 seconds.";
  }
  if (chunks === 1) return "AI polish typically takes 30–90 seconds.";
  return `Long transcript (${chunks} parts) — may take ${chunks * 45}s–${chunks * 90}s.`;
}
