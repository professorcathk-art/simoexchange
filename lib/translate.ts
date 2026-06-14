import OpenAI from "openai";
import type { LangCode } from "@/types";

const langNames: Record<LangCode, string> = {
  en: "English",
  zh: "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
};

const TRANSLATE_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 2;

const STRICT_RULES = `You are a professional simultaneous interpreter for live events.

CRITICAL RULES — NEVER VIOLATE:
- Output ONLY the translated text in the target language.
- NEVER ask questions. NEVER request more input. NEVER refuse to translate.
- NEVER say things like "请提供", "请问", "无法翻译", "请", "provide", "cannot translate".
- Even if the input is incomplete, fragmented, misspelled, or mixed-language, translate your best understanding.
- Do not explain. Do not add notes. Do not use quotation marks around the output.`;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Translation API timeout after ${ms}ms`)), ms)
    ),
  ]);
}

function getTranslationClients(): Array<{ client: OpenAI; label: string }> {
  const clients: Array<{ client: OpenAI; label: string }> = [];

  const aimlKey = process.env.AIML_API_KEY;
  if (aimlKey) {
    clients.push({
      client: new OpenAI({ apiKey: aimlKey, baseURL: "https://api.aimlapi.com/v1" }),
      label: "aiml",
    });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    clients.push({
      client: new OpenAI({ apiKey: openaiKey }),
      label: "openai",
    });
  }

  return clients;
}

function buildSystemPrompt(targetLang: LangCode, sourceLang?: LangCode): string {
  const target = langNames[targetLang];

  if (sourceLang && sourceLang !== targetLang) {
    return `${STRICT_RULES}

Translate from ${langNames[sourceLang]} into ${target}.
Output language: ${target} only.`;
  }

  return `${STRICT_RULES}

The speaker may use English, Mandarin Chinese, Japanese, Korean, or a mix.
Detect the source language and translate into ${target}.
Output language: ${target} only.`;
}

const META_PATTERNS = [
  /请提供/,
  /请问/,
  /无法翻译/,
  /不能翻译/,
  /请补充/,
  /请给出/,
  /请翻译/,
  /please provide/i,
  /cannot translate/i,
  /unable to translate/i,
  /complete.*sentence/i,
  /完整.*句/,
];

export function isMetaTranslation(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  if (META_PATTERNS.some((p) => p.test(t))) return true;
  if (/[？?]$/.test(t) && /请|什么|吗|呢|could|would/i.test(t)) return true;
  return false;
}

function looksLikeUntranslated(
  source: string,
  result: string,
  targetLang: LangCode
): boolean {
  const s = source.trim().toLowerCase();
  const r = result.trim().toLowerCase();
  if (s === r) return true;
  if (targetLang === "zh" && !/[\u4e00-\u9fff]/.test(result) && /[a-zA-Z]/.test(result)) {
    return true;
  }
  return false;
}

function fallbackTranslation(
  text: string,
  targetLang: LangCode,
  sourceLang?: LangCode
): string {
  if (sourceLang && sourceLang === targetLang) return text;
  if (targetLang === "zh" && /[\u4e00-\u9fff]/.test(text)) {
    return text.replace(/\s+/g, "").trim() || text;
  }
  return "[Translation unavailable]";
}

async function callTranslateOnce(
  client: OpenAI,
  text: string,
  systemPrompt: string
): Promise<string> {
  const response = await withTimeout(
    client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      temperature: 0.1,
      max_tokens: 500,
    }),
    TRANSLATE_TIMEOUT_MS
  );
  return response.choices[0]?.message?.content?.trim() ?? "";
}

async function callTranslate(
  text: string,
  systemPrompt: string
): Promise<string> {
  const clients = getTranslationClients();
  if (clients.length === 0) {
    throw new Error("AIML_API_KEY or OPENAI_API_KEY must be set for translation");
  }

  let lastError: Error | null = null;

  for (const { client, label } of clients) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const result = await callTranslateOnce(client, text, systemPrompt);
        if (result) return result;
        throw new Error("empty response");
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(
          `[translate] ${label} attempt ${attempt + 1} failed:`,
          lastError.message
        );
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 800));
        }
      }
    }
  }

  throw lastError ?? new Error("Translation failed");
}

export async function translate(
  text: string,
  targetLang: LangCode,
  sourceLang?: LangCode
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";

  if (sourceLang && sourceLang === targetLang) {
    return trimmed;
  }

  let result = await callTranslate(
    trimmed,
    buildSystemPrompt(targetLang, sourceLang)
  );

  if (
    isMetaTranslation(result) ||
    looksLikeUntranslated(trimmed, result, targetLang)
  ) {
    result = await callTranslate(trimmed, buildSystemPrompt(targetLang, undefined));
  }

  if (
    isMetaTranslation(result) ||
    looksLikeUntranslated(trimmed, result, targetLang)
  ) {
    return fallbackTranslation(trimmed, targetLang, sourceLang);
  }

  return result;
}
