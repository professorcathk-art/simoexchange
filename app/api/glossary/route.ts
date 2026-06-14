import { NextRequest, NextResponse } from "next/server";
import { createGlossaryTerm, getGlossaryTerms } from "@/lib/supabase";
import type { LangCode } from "@/types";

const LANGS = new Set(["en", "zh", "ja", "ko", "*"]);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceLang = searchParams.get("source_lang") ?? undefined;
    const targetLang = searchParams.get("target_lang") ?? undefined;
    const terms = await getGlossaryTerms(sourceLang, targetLang);
    return NextResponse.json(terms);
  } catch (err) {
    console.error("Get glossary error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get glossary" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source_term, target_term, source_lang, target_lang, notes } = body;

    if (!source_term?.trim() || !target_term?.trim()) {
      return NextResponse.json(
        { error: "source_term and target_term are required" },
        { status: 400 }
      );
    }

    const src = (source_lang ?? "*") as LangCode | "*";
    const tgt = (target_lang ?? "*") as LangCode | "*";
    if (!LANGS.has(src) || !LANGS.has(tgt)) {
      return NextResponse.json({ error: "Invalid language code" }, { status: 400 });
    }

    const term = await createGlossaryTerm(
      source_term.trim(),
      target_term.trim(),
      src,
      tgt,
      notes?.trim()
    );
    return NextResponse.json(term, { status: 201 });
  } catch (err) {
    console.error("Create glossary error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create glossary term" },
      { status: 500 }
    );
  }
}
