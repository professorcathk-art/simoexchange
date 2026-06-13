import type { LangCode } from "@/types";

const DEEPGRAM_LANG_MAP: Record<string, LangCode> = {
  en: "en",
  english: "en",
  zh: "zh",
  cmn: "zh",
  "zh-cn": "zh",
  "zh-tw": "zh",
  chinese: "zh",
  ja: "ja",
  japanese: "ja",
  ko: "ko",
  korean: "ko",
};

export function mapDeepgramLanguage(code: string | undefined): LangCode | undefined {
  if (!code) return undefined;
  return DEEPGRAM_LANG_MAP[code.toLowerCase()] ?? undefined;
}

function countDeepgramLanguages(
  words: { language?: string }[]
): Map<LangCode, number> {
  const counts = new Map<LangCode, number>();
  for (const word of words) {
    const lang = mapDeepgramLanguage(word.language);
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  return counts;
}

function topDeepgramLanguage(words: { language?: string }[]): LangCode | undefined {
  const counts = countDeepgramLanguages(words);
  if (counts.size === 0) return undefined;
  const entries = Array.from(counts.entries());
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

const hasKana = (text: string) => /[\u3040-\u309f\u30a0-\u30ff]/.test(text);
const hasHangul = (text: string) => /[\uac00-\ud7af]/.test(text);
const hasCjk = (text: string) => /[\u4e00-\u9fff]/.test(text);
const hasLatin = (text: string) => /[a-zA-Z]/.test(text);

/**
 * Resolve source language using script analysis, Deepgram tags, and session hint.
 * CJK without kana defaults to Mandarin — avoids mislabeling pinyin fragments as Japanese.
 */
export function resolveSourceLanguage(
  text: string,
  words: { language?: string }[] = [],
  sessionHint?: LangCode
): LangCode | undefined {
  if (hasKana(text)) return "ja";
  if (hasHangul(text)) return "ko";

  const dgLang = topDeepgramLanguage(words);

  if (hasCjk(text)) {
    // Chinese characters without kana → Mandarin (even if Deepgram says ja)
    if (dgLang === "ja") return sessionHint ?? "zh";
    return sessionHint ?? dgLang ?? "zh";
  }

  if (hasLatin(text)) {
    // Roman letters mixed with misheard CJK fragments → use session hint or English
    if (sessionHint) return sessionHint;
    return dgLang ?? "en";
  }

  return sessionHint ?? dgLang;
}

/** @deprecated use resolveSourceLanguage */
export function detectSourceLanguage(
  text: string,
  words: { language?: string }[] = []
): LangCode | undefined {
  return resolveSourceLanguage(text, words);
}
