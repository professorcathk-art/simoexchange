import OpenAI from "openai";
import type { LangCode } from "@/types";

const langNames: Record<LangCode, string> = {
  en: "English",
  zh: "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
};

const STRICT_RULES = `You are a professional simultaneous interpreter for live events.

CRITICAL RULES — NEVER VIOLATE:
- Output ONLY the translated text in the target language.
- NEVER ask questions. NEVER request more input. NEVER refuse to translate.
- NEVER say things like "请提供", "请问", "无法翻译", "请", "provide", "cannot translate".
- Even if the input is incomplete, fragmented, misspelled, or mixed-language, translate your best understanding.
- Do not explain. Do not add notes. Do not use quotation marks around the output.`;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.AIML_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("AIML_API_KEY (or OPENAI_API_KEY) must be set");
  }

  return new OpenAI({
    apiKey,
    baseURL: "https://api.aimlapi.com/v1",
  });
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
  // Question-shaped meta responses
  if (/[？?]$/.test(t) && /请|什么|吗|呢|could|would/i.test(t)) return true;
  return false;
}

function fallbackTranslation(text: string, targetLang: LangCode): string {
  // CJK source going to Chinese — pass through cleaned text
  if (targetLang === "zh" && /[\u4e00-\u9fff]/.test(text)) {
    return text.replace(/\s+/g, "").trim() || text;
  }
  return text;
}

async function callTranslate(
  text: string,
  systemPrompt: string
): Promise<string> {
  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    temperature: 0.1,
    max_tokens: 500,
  });
  return response.choices[0]?.message?.content?.trim() ?? "";
}

export async function translate(
  text: string,
  targetLang: LangCode,
  sourceLang?: LangCode
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";

  let result = await callTranslate(trimmed, buildSystemPrompt(targetLang, sourceLang));

  if (isMetaTranslation(result)) {
    result = await callTranslate(
      trimmed,
      buildSystemPrompt(targetLang, undefined)
    );
  }

  if (isMetaTranslation(result)) {
    return fallbackTranslation(trimmed, targetLang);
  }

  return result;
}
