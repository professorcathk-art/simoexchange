import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/supabase";
import { generateTTS } from "@/lib/tts";
import { emitToSession } from "@/server/socket";
import type { LangCode } from "@/types";

/** Dev/health-check only — emits test segment_update + segment_audio with real TTS. */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_TEST_EMIT !== "true"
  ) {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  try {
    const session = await getSession(params.id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const targetLang = session.target_lang as LangCode;
    const translatedText =
      targetLang === "zh"
        ? "音频播放测试。"
        : targetLang === "ja"
          ? "オーディオテストです。"
          : targetLang === "ko"
            ? "오디오 테스트입니다."
            : "Audio playback test.";

    const audioBase64 = await generateTTS(translatedText, targetLang);

    if (!audioBase64 || audioBase64.length < 500) {
      return NextResponse.json(
        { error: "TTS produced no audio" },
        { status: 500 }
      );
    }

    const segmentId = `health-check-${Date.now()}`;

    emitToSession(params.id, "segment_update", {
      sessionId: params.id,
      segmentId,
      sourceText: "Audio playback test.",
      translatedText,
      audioBase64,
      seqNo: 9999,
      speakerId: null,
    });

    emitToSession(params.id, "segment_audio", {
      sessionId: params.id,
      segmentId,
      audioBase64,
      seqNo: 9999,
    });

    return NextResponse.json({
      ok: true,
      segmentId,
      translatedText,
      audioBase64Length: audioBase64.length,
    });
  } catch (err) {
    console.error("Test segment emit error:", err);
    return NextResponse.json(
      { error: "Failed to emit test segment" },
      { status: 500 }
    );
  }
}
