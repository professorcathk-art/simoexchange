"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { Session, TranscriptSegment as Segment } from "@/types";
import { LANGUAGES } from "@/lib/constants";
import { getSocket, joinSession } from "@/lib/socket-client";
import { useAudioPlayer } from "@/components/AudioPlayer";
import StatusBadge from "@/components/StatusBadge";
import TranscriptSegment from "@/components/TranscriptSegment";

export default function ListenPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [interimText, setInterimText] = useState("");
  const [audioOn, setAudioOn] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const segmentsEndRef = useRef<HTMLDivElement>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const { unlock } = useAudioPlayer();

  const playNextInQueue = useCallback(() => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    const next = audioQueueRef.current.shift();
    if (!next) return;
    isPlayingRef.current = true;
    const audio = new Audio(`data:audio/mp3;base64,${next}`);
    audio.onended = () => {
      isPlayingRef.current = false;
      playNextInQueue();
    };
    audio.play().catch(() => {
      isPlayingRef.current = false;
    });
  }, []);

  const queueAudio = useCallback(
    (audioBase64: string) => {
      if (!audioOn || !audioUnlocked) return;
      audioQueueRef.current.push(audioBase64);
      playNextInQueue();
    },
    [audioOn, audioUnlocked, playNextInQueue]
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

    socket.on("transcript_interim", (data: { text: string }) => {
      setInterimText(data.text);
    });

    socket.on("transcript_final", (data: { text: string; segmentId: string; seqNo: number }) => {
      setInterimText("");
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
            created_at: new Date().toISOString(),
          },
        ];
      });
    });

    socket.on("segment_update", (data: {
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
    });

    socket.on("session_status", (data: { status: string }) => {
      setSession((prev) =>
        prev ? { ...prev, status: data.status as Session["status"] } : prev
      );
    });

    return () => {
      socket.off("transcript_interim");
      socket.off("transcript_final");
      socket.off("segment_update");
      socket.off("session_status");
    };
  }, [sessionId, queueAudio]);

  useEffect(() => {
    segmentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments, interimText]);

  const enableAudio = () => {
    unlock();
    setAudioUnlocked(true);
    setAudioOn(true);
  };

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

  const sourceLang = LANGUAGES.find((l) => l.code === session.source_lang);
  const targetLang = LANGUAGES.find((l) => l.code === session.target_lang);

  return (
    <main className="relative min-h-screen bg-background">
      {!audioUnlocked && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6"
          onClick={enableAudio}
        >
          <button className="rounded-2xl bg-accent px-8 py-4 text-lg font-semibold text-black">
            Tap to enable audio
          </button>
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

        <div className="mb-4 flex gap-2">
          <span className="rounded-full border border-white/10 bg-card px-3 py-1 text-xs text-gray-300">
            {sourceLang?.flag} {sourceLang?.name}
          </span>
          <span className="text-gray-500">→</span>
          <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-accent">
            {targetLang?.flag} {targetLang?.name}
          </span>
        </div>

        <button
          onClick={() => setAudioOn((v) => !v)}
          className={`mb-6 w-full rounded-lg py-3 text-sm font-medium transition-colors ${
            audioOn
              ? "bg-accent/20 text-accent"
              : "border border-white/10 text-gray-400"
          }`}
        >
          {audioOn ? "🔊 Audio ON" : "🔇 Audio OFF"}
        </button>

        <div className="space-y-3 pb-8">
          {segments.map((seg) => (
            <TranscriptSegment key={seg.id} segment={seg} variant="listener" />
          ))}

          {interimText && (
            <div className="rounded-xl border border-white/5 bg-card/30 p-4">
              <p className="text-sm text-gray-500">{interimText}</p>
              <p className="mt-1 text-lg text-gray-600">...</p>
            </div>
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
