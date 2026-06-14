import type { GlossaryTerm, LangCode } from "@/types";
import { getGlossaryTerms } from "@/lib/supabase";

export function formatGlossaryForPrompt(terms: GlossaryTerm[]): string {
  if (terms.length === 0) return "";

  const lines = terms.map((t) => {
    const note = t.notes ? ` (${t.notes})` : "";
    return `- "${t.source_term}" → "${t.target_term}"${note}`;
  });

  return `ORGANIZATION GLOSSARY — use these translations exactly when the source term appears:
${lines.join("\n")}`;
}

export async function loadGlossaryPrompt(
  sourceLang?: LangCode,
  targetLang?: LangCode
): Promise<string> {
  const terms = await getGlossaryTerms(sourceLang, targetLang);
  return formatGlossaryForPrompt(terms);
}

export function filterGlossaryForLangs(
  terms: GlossaryTerm[],
  sourceLang?: LangCode,
  targetLang?: LangCode
): GlossaryTerm[] {
  return terms.filter((t) => {
    const srcOk = t.source_lang === "*" || !sourceLang || t.source_lang === sourceLang;
    const tgtOk = t.target_lang === "*" || !targetLang || t.target_lang === targetLang;
    return srcOk && tgtOk;
  });
}
