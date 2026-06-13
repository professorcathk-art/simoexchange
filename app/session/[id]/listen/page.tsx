"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { Session, TranscriptSegment as Segment } from "@/types";
import { LANGUAGES } from "@/lib/constants";
import { isSpeakableText } from "@/lib/speech-synthesis";
import { getSocket, joinSession } from "@/lib/socket-client";
import { useListenerSpeech } from "@/hooks/useListenerSpeech";
import StatusBadge from "@/components/StatusBadge";
import TranscriptSegment, { InterimTranscript } from "@/components/TranscriptSegment";

export default function ListenPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [interimText, setInterimText] = useState("");
  const [interimSpeakerId, setInterimSpeakerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const segmentsEndRef = useRef<HTMLDivElement>(null);
  const spokenIdsRef = useRef<Set<string>>(new Set());

  const targetLangCode = session?.target_lang ?? "zh";

  const {
    speechOn,
    speechUnlocked,
    isSpeaking,
    speechSupported,
    enableSpeech,
    speakText,
    replayText,
    toggleSpeech,
  } = useListenerSpeech(targetLangCode);

  const speakSegment = useCallback(
    (segmentId: string, translatedText: string | null) => {
      if (!speechUnlocked || !isSpeakableText(translatedText)) return;
      if (spokenIdsRef.current.has(segmentId)) return;
      spokenIdsRef.current.add(segmentId);
      speakText(translatedText!);
    },
    [speechUnlocked, speakText]
  );

  useEffect(() => {
    Promise.all([
      fetch(`/api/sessions/${sessionId}`),
      fetch(`/api/sessions/${sessionId}/segments`),
    ])
      .then(async ([sessionRes, segmentsRes]) => {
        if (!sessionRes.ok) throw new Error("Session not found");
        setSession(await sessionRes.json());
        if (segmentsRes.ok) setSegments(await segmentsRes.json());
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    const socket = getSocket();
    joinSession(sessionId);

    const onInterim = (data: { text: string; speakerId?: number | null }) => {
      setInterimText(data.text);
      setInterimSpeakerId(data.speakerId ?? null);
    };

    const onFinal = (data: {
      text: string;
      segmentId: string;
      seqNo: number;
      speakerId?: number | null;
    }) => {
      setInterimText("");
      setInterimSpeakerId(null);
      setSegments((prev) => {
        if (prev.some((s) => s.id === data.segmentId)) return prev;
        return [
          ...prev,
          {
            id: data.segmentId,
            session_id: sessionId,
            seq_no: data.seqNo,
            source_text: data.text,
            is_final: true,
            translated_text: null,
            audio_base64: null,
            speaker_id: data.speakerId ?? null,
            created_at: new Date().toISOString(),
          },
        ];
      });
    };

    const onSegmentUpdate = (data: {
      segmentId: string;
      translatedText: string;
      audioBase64: string | null;
    }) => {
      setSegments((prev) =>
        prev.map((s) =>
          s.id === data.segmentId
            ? {
                ...s,
                translated_text: data.translatedText,
                audio_base64: data.audioBase64,
              }
            : s
        )
      );
      speakSegment(data.segmentId, data.translatedText);
    };

    const onStatus = (data: { status: string }) => {
      setSession((prev) =>
        prev ? { ...prev, status: data.status as Session["status"] } : prev
      );
    };

    socket.on("transcript_interim", onInterim);
    socket.on("transcript_final", onFinal);
    socket.on("segment_update", onSegmentUpdate);
    socket.on("session_status", onStatus);

    return () => {
      socket.off("transcript_interim", onInterim);
      socket.off("transcript_final", onFinal);
      socket.off("segment_update", onSegmentUpdate);
      socket.off("session_status", onStatus);
    };
  }, [sessionId, speakSegment]);

  useEffect(() => {
    if (!speechUnlocked) return;
    for (const seg of segments) {
      speakSegment(seg.id, seg.translated_text);
    }
  }, [speechUnlocked, segments, speakSegment]);

  useEffect(() => {
    segmentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments, interimText]);

  const targetLang = session
    ? LANGUAGES.find((l) => l.code === session.target_lang)
    : null;

  return (
    <main className="relative min-h-screen bg-background">
      {loading && (
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-gray-400">Loading...</p>
        </div>
      )}

      {!loading && (error || !session) && (
        <div className="flex min-h-screen items-center justify-center px-4">
          <p className="text-red-400">{error || "Session not found"}</p>
        </div>
      )}

      {!loading && session && (
        <>
          {!speechUnlocked && (
            <div
              className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black/90 px-6"
              style={{ touchAction: "manipulation" }}
            >
              <button
                type="button"
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  enableSpeech();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  enableSpeech();
                }}
                className="min-h-[52px] min-w-[240px] cursor-pointer rounded-2xl bg-accent px-8 py-4 text-lg font-semibold text-black active:scale-95"
                style={{
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                Tap to enable speech
              </button>
              <p className="max-w-xs text-center text-sm text-gray-400">
                Reads each translation aloud using your device voice
              </p>
              {!speechSupported && (
                <p className="max-w-xs text-center text-sm text-amber-400">
                  Speech not supported in this browser — try Safari or Chrome
                </p>
              )}
            </div>
          )}

          <div className="mx-auto max-w-lg px-4 py-6">
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-xl font-bold text-white">{session.name}</h1>
              <StatusBadge status={session.status} size="sm" />
            </div>

            {session.status === "ended" && (
              <div className="mb-4 rounded-lg border border-gray-500/30 bg-gray-500/10 p-4 text-center text-gray-400">
                Session has ended
              </div>
            )}

            <div className="mb-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-card px-3 py-1 text-xs text-gray-300">
                🌐 Multi-language (EN/ZH/JA/KO)
              </span>
              <span className="text-gray-500">→</span>
              <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-accent">
                {targetLang?.flag} {targetLang?.name}
              </span>
            </div>

            <button
              type="button"
              onClick={toggleSpeech}
              className={`mb-2 w-full rounded-lg py-3 text-sm font-medium transition-colors ${
                speechOn
                  ? "bg-accent/20 text-accent"
                  : "border border-white/10 text-gray-400"
              }`}
            >
              {speechOn ? "🔊 Speech ON" : "🔇 Speech OFF"}
            </button>
            {speechUnlocked && (
              <p className="mb-6 text-center text-xs text-gray-500">
                {isSpeaking
                  ? "Speaking translation..."
                  : "Speech ready — new translations read aloud automatically"}
              </p>
            )}

            <div className="space-y-3 pb-8">
              {segments.map((seg) => (
                <TranscriptSegment
                  key={seg.id}
                  segment={seg}
                  variant="listener"
                  showPlayButton={isSpeakableText(seg.translated_text)}
                  onPlay={replayText}
                />
              ))}

              {interimText && (
                <InterimTranscript
                  text={interimText}
                  speakerId={interimSpeakerId}
                />
              )}

              {segments.length === 0 &&
                !interimText &&
                session.status !== "ended" && (
                  <p className="text-center text-gray-500">
                    Waiting for live captions...
                  </p>
                )}

              <div ref={segmentsEndRef} />
            </div>
          </div>
        </>
      )}
    </main>
  );
}
