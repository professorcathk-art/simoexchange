import OpenAI from "openai";
import type { LangCode } from "@/types";

const langNames: Record<LangCode, string> = {
  en: "English",
  zh: "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
};

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

function buildSystemPrompt(
  targetLang: LangCode,
  sourceLang?: LangCode
): string {
  if (sourceLang === "ja" && targetLang === "zh") {
    return `You are an expert Japanese-to-Simplified Chinese simultaneous interpreter for live events.

Rules:
- Translate Japanese speech into natural, fluent Simplified Chinese (简体中文).
- Handle keigo, idioms, and colloquial Japanese accurately — do NOT transliterate or romanize.
- Preserve the speaker's intent and tone; avoid literal word-for-word errors.
- If the input mixes Japanese and other languages, translate everything into Simplified Chinese.
- Output ONLY the Chinese translation. No Japanese, no pinyin, no notes, no quotes.`;
  }

  if (sourceLang === "ja") {
    return `You are a professional Japanese-to-${langNames[targetLang]} interpreter. Translate Japanese accurately into natural ${langNames[targetLang]}. Output ONLY the translation.`;
  }

  if (sourceLang) {
    return `You are a professional simultaneous interpreter. Translate ${langNames[sourceLang]} into ${langNames[targetLang]}. Output ONLY the translated text in ${langNames[targetLang]}, no explanations.`;
  }

  return `You are a professional simultaneous interpreter for live multilingual events.
The input may be English, Japanese, Korean, or Chinese (any script).
Detect the source language, then translate into ${langNames[targetLang]}.
For Japanese input targeting Chinese, use natural Simplified Chinese (not literal translation).
Output ONLY the translated text, no explanations, no quotation marks.`;
}

export async function translate(
  text: string,
  targetLang: LangCode,
  sourceLang?: LangCode
): Promise<string> {
  const openai = getOpenAIClient();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: buildSystemPrompt(targetLang, sourceLang) },
      { role: "user", content: text },
    ],
    temperature: 0.1,
    max_tokens: 500,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}
