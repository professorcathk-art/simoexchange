"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { Session, TranscriptSegment as Segment } from "@/types";
import { LANGUAGES } from "@/lib/constants";
import { getSocket, joinSession } from "@/lib/socket-client";
import { useListenerAudio } from "@/hooks/useListenerAudio";
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

  const {
    audioOn,
    audioUnlocked,
    isPlaying,
    playError,
    bindAudioElement,
    enableAudio,
    toggleAudio,
    queueAudio,
  } = useListenerAudio();

  const setAudioRef = (el: HTMLAudioElement | null) => {
    bindAudioElement(el);
  };

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
      if (data.audioBase64) queueAudio(data.audioBase64);
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
  }, [sessionId, queueAudio]);

  useEffect(() => {
    segmentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments, interimText]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  if (error || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-red-400">{error || "Session not found"}</p>
      </main>
    );
  }

  const targetLang = LANGUAGES.find((l) => l.code === session.target_lang);

  return (
    <main className="relative min-h-screen bg-background">
      {/* Persistent DOM audio element — required for iOS Safari playback */}
      <audio
        ref={setAudioRef}
        playsInline
        preload="auto"
        className="hidden"
        aria-hidden
      />

      {!audioUnlocked && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 px-6">
          <button
            type="button"
            onClick={() => void enableAudio()}
            className="rounded-2xl bg-accent px-8 py-4 text-lg font-semibold text-black"
          >
            Tap to enable audio
          </button>
          <p className="max-w-xs text-center text-sm text-gray-400">
            Required on mobile to play translated speech in real time
          </p>
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
          onClick={toggleAudio}
          className={`mb-2 w-full rounded-lg py-3 text-sm font-medium transition-colors ${
            audioOn
              ? "bg-accent/20 text-accent"
              : "border border-white/10 text-gray-400"
          }`}
        >
          {audioOn ? "🔊 Audio ON" : "🔇 Audio OFF"}
        </button>
        {audioUnlocked && (
          <p className="mb-6 text-center text-xs text-gray-500">
            {isPlaying
              ? "Playing translation..."
              : "Audio ready — new segments play automatically"}
            {playError && (
              <span className="mt-1 block text-red-400">{playError}</span>
            )}
          </p>
        )}

        <div className="space-y-3 pb-8">
          {segments.map((seg) => (
            <TranscriptSegment key={seg.id} segment={seg} variant="listener" />
          ))}

          {interimText && (
            <InterimTranscript text={interimText} speakerId={interimSpeakerId} />
          )}

          {segments.length === 0 && !interimText && session.status !== "ended" && (
            <p className="text-center text-gray-500">
              Waiting for live captions...
            </p>
          )}

          <div ref={segmentsEndRef} />
        </div>
      </div>
    </main>
  );
}
