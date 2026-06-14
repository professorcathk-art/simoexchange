"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { Session, TranscriptSegment as Segment } from "@/types";
import { LANGUAGES } from "@/lib/constants";
import { isSpeakableText } from "@/lib/speech-synthesis";
import { getSocket, joinSession } from "@/lib/socket-client";
import { useTranslationPlayback } from "@/hooks/useTranslationPlayback";
import StatusBadge from "@/components/StatusBadge";
import TranscriptSegment, { InterimTranscript } from "@/components/TranscriptSegment";

const POLL_MS = 1500;

export default function ListenPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [interimText, setInterimText] = useState("");
  const [interimSpeakerId, setInterimSpeakerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showZoomHelp, setShowZoomHelp] = useState(false);

  const segmentsEndRef = useRef<HTMLDivElement>(null);
  const registerSegmentRef = useRef<
    (id: string, text: string | null, b64: string | null, seq?: number) => void
  >(() => {});

  const targetLangCode = session?.target_lang ?? "zh";

  const {
    unlocked,
    audioOn,
    isPlaying,
    volume,
    lastPlaySource,
    queueLength,
    setVolume,
    bindAudioElement,
    enableAudio,
    registerSegment,
    flushAllPending,
    replaySegment,
    toggleAudio,
  } = useTranslationPlayback(targetLangCode);

  registerSegmentRef.current = registerSegment;

  const syncSegmentsToPlayback = useCallback(
    (list: Segment[]) => {
      const ordered = [...list]
        .sort((a, b) => a.seq_no - b.seq_no)
        .filter((s) => s.translated_text || s.audio_base64 || s.audio_url);
      for (const seg of ordered) {
        registerSegment(
          seg.id,
          seg.translated_text,
          seg.audio_base64,
          seg.seq_no,
          seg.audio_url ?? null
        );
      }
    },
    [registerSegment]
  );

  const fetchSegments = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/segments`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data: Segment[] = await res.json();
    setSegments(data);
    syncSegmentsToPlayback(data);
  }, [sessionId, syncSegmentsToPlayback]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/sessions/${sessionId}`, { cache: "no-store" }),
      fetch(`/api/sessions/${sessionId}/segments`, { cache: "no-store" }),
    ])
      .then(async ([sessionRes, segmentsRes]) => {
        if (!sessionRes.ok) throw new Error("Session not found");
        setSession(await sessionRes.json());
        if (segmentsRes.ok) {
          const data = await segmentsRes.json();
          setSegments(data);
        }
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
      seqNo?: number;
    }) => {
      setSegments((prev) =>
        prev.map((s) =>
          s.id === data.segmentId
            ? {
                ...s,
                translated_text: data.translatedText,
                audio_base64: data.audioBase64 ?? s.audio_base64,
              }
            : s
        )
      );
      registerSegmentRef.current(
        data.segmentId,
        data.translatedText,
        data.audioBase64,
        data.seqNo
      );
    };

    const onSegmentAudio = (data: {
      segmentId: string;
      audioBase64: string;
      seqNo?: number;
    }) => {
      setSegments((prev) =>
        prev.map((s) =>
          s.id === data.segmentId
            ? { ...s, audio_base64: data.audioBase64 }
            : s
        )
      );
      registerSegmentRef.current(
        data.segmentId,
        null,
        data.audioBase64,
        data.seqNo
      );
    };

    const onStatus = (data: { status: string }) => {
      setSession((prev) =>
        prev ? { ...prev, status: data.status as Session["status"] } : prev
      );
    };

    socket.on("transcript_interim", onInterim);
    socket.on("transcript_final", onFinal);
    socket.on("segment_update", onSegmentUpdate);
    socket.on("segment_audio", onSegmentAudio);
    socket.on("session_status", onStatus);

    return () => {
      socket.off("transcript_interim", onInterim);
      socket.off("transcript_final", onFinal);
      socket.off("segment_update", onSegmentUpdate);
      socket.off("segment_audio", onSegmentAudio);
      socket.off("session_status", onStatus);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!unlocked) return;
    syncSegmentsToPlayback(segments);
  }, [unlocked, segments, syncSegmentsToPlayback]);

  useEffect(() => {
    if (!unlocked) return;
    const id = setInterval(() => void fetchSegments(), POLL_MS);
    return () => clearInterval(id);
  }, [unlocked, fetchSegments]);

  useEffect(() => {
    segmentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments, interimText]);

  const targetLang = session
    ? LANGUAGES.find((l) => l.code === session.target_lang)
    : null;

  const handleStartListening = () => {
    enableAudio();
    flushAllPending();
    void fetchSegments();
  };

  return (
    <main className="relative min-h-screen bg-background">
      {/* Must stay mounted — iOS unlocks THIS element on tap */}
      <audio
        ref={bindAudioElement}
        playsInline
        preload="auto"
        className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-[0.01]"
        aria-hidden
      />

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
          {!unlocked && (
            <div
              className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black/90 px-6"
              style={{ touchAction: "manipulation" }}
            >
              <button
                type="button"
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleStartListening();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartListening();
                }}
                className="min-h-[52px] min-w-[260px] cursor-pointer rounded-2xl bg-accent px-8 py-4 text-lg font-semibold text-black active:scale-95"
                style={{
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                Tap to start listening
              </button>
              <p className="max-w-sm text-center text-sm text-gray-400">
                Tap once. Every new translation plays automatically in order.
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
              {audioOn ? "🔊 Auto-play ON" : "🔇 Auto-play OFF"}
            </button>

            {unlocked && (
              <p className="mb-3 text-center text-xs text-gray-500">
                {isPlaying
                  ? `Playing${lastPlaySource === "speech" ? " (device voice)" : ""}...`
                  : queueLength > 0
                    ? `${queueLength} translation(s) queued`
                    : "Listening — translations play automatically"}
              </p>
            )}

            <div className="mb-6">
              <label className="mb-1 block text-xs text-gray-500">Volume</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full accent-accent"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowZoomHelp((v) => !v)}
              className="mb-4 w-full rounded-lg border border-white/10 py-2 text-xs text-gray-400 hover:text-white"
            >
              {showZoomHelp ? "Hide" : "Show"} Zoom / virtual cable setup
            </button>

            {showZoomHelp && (
              <div className="mb-6 rounded-lg border border-white/10 bg-white/5 p-4 text-xs leading-relaxed text-gray-400">
                Route this page&apos;s audio into Zoom: use BlackHole (macOS) or
                VB-Cable (Windows) as system output, then select that device as
                your Zoom microphone. Keep this page open with auto-play enabled.
              </div>
            )}

            <div className="space-y-3 pb-8">
              {segments.map((seg) => (
                <TranscriptSegment
                  key={seg.id}
                  segment={seg}
                  variant="listener"
                  showPlayButton={
                    isSpeakableText(seg.translated_text) ||
                    !!seg.audio_base64 ||
                    !!seg.audio_url
                  }
                  onPlay={() =>
                    replaySegment(
                      seg.id,
                      seg.translated_text,
                      seg.audio_base64,
                      seg.audio_url ?? null
                    )
                  }
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
