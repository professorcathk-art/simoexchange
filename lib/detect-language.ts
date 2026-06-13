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

/** Detect source language from transcript text and optional Deepgram word tags. */
export function detectSourceLanguage(
  text: string,
  words: { language?: string }[] = []
): LangCode | undefined {
  const counts = new Map<LangCode, number>();
  for (const word of words) {
    const lang = mapDeepgramLanguage(word.language);
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  if (counts.size > 0) {
    const entries = Array.from(counts.entries());
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  }

  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return "ja";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[\u4e00-\u9fff]/.test(text)) {
    if (/[的了吗是在有不]/.test(text)) return "zh";
    if (/[ですますである]/.test(text)) return "ja";
    return "zh";
  }
  if (/[a-zA-Z]/.test(text)) return "en";
  return undefined;
}
