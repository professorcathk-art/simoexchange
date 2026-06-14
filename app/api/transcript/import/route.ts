import { NextRequest, NextResponse } from "next/server";
import { createTranscriptJob } from "@/lib/supabase";
import { scheduleTranscriptJob } from "@/server/transcript-jobs";
import type { LangCode } from "@/types";

const LANGS = new Set(["en", "zh", "ja", "ko"]);

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let text = "";
    let sourceLang: LangCode = "en";
    let targetLang: LangCode = "zh";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      sourceLang = (form.get("source_lang") as LangCode) ?? "en";
      targetLang = (form.get("target_lang") as LangCode) ?? "zh";

      if (file instanceof File) {
        text = await file.text();
      } else {
        text = String(form.get("text") ?? "");
      }
    } else {
      const body = await request.json();
      text = body.text ?? "";
      sourceLang = body.source_lang ?? "en";
      targetLang = body.target_lang ?? "zh";
    }

    if (!text.trim()) {
      return NextResponse.json({ error: "Transcript text is required" }, { status: 400 });
    }

    if (!LANGS.has(sourceLang) || !LANGS.has(targetLang)) {
      return NextResponse.json({ error: "Invalid language pair" }, { status: 400 });
    }

    if (sourceLang === targetLang) {
      return NextResponse.json(
        { error: "Source and target languages must differ" },
        { status: 400 }
      );
    }

    const job = await createTranscriptJob({
      session_id: null,
      job_type: "import_polish",
      status: "pending",
      progress_percent: 0,
      progress_message: "Queued — starting import polish...",
      source_lang: sourceLang,
      target_lang: targetLang,
      input_text: text.trim(),
    });

    scheduleTranscriptJob(job.id);
    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    console.error("Import transcript error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to import transcript" },
      { status: 500 }
    );
  }
}
