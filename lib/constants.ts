import type { LangCode } from "@/types";

export const LANGUAGES: {
  code: LangCode;
  name: string;
  flag: string;
}[] = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "zh", name: "Chinese", flag: "🇨🇳" },
  { code: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "ko", name: "Korean", flag: "🇰🇷" },
];

export function getLanguageLabel(code: LangCode): string {
  const lang = LANGUAGES.find((l) => l.code === code);
  return lang ? `${lang.flag} ${lang.name}` : code;
}

export function getLanguagePair(source: LangCode, target: LangCode): string {
  const src = LANGUAGES.find((l) => l.code === source);
  const tgt = LANGUAGES.find((l) => l.code === target);
  return `${src?.flag ?? ""} ${src?.name ?? source} → ${tgt?.flag ?? ""} ${tgt?.name ?? target}`;
}
