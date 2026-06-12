"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Session, TranscriptSegment as Segment } from "@/types";
import { getLanguagePair } from "@/lib/constants";
import { getSocket, joinSession } from "@/lib/socket-client";
import { useAudioPlayer } from "@/components/AudioPlayer";
import StatusBadge from "@/components/StatusBadge";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import TranscriptSegment from "@/components/TranscriptSegment";

export default function HostPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [interimText, setInterimText] = useState("");
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const segmentsEndRef = useRef<HTMLDivElement>(null);
  const { play } = useAudioPlayer();

  const loadSession = useCallback(async () => {
    const [sessionRes, segmentsRes] = await Promise.all([
      fetch(`/api/sessions/${sessionId}`),
      fetch(`/api/sessions/${sessionId}/segments`),
    ]);

    if (!sessionRes.ok) throw new Error("Session not found");
    setSession(await sessionRes.json());
    if (segmentsRes.ok) setSegments(await segmentsRes.json());
  }, [sessionId]);

  useEffect(() => {
    loadSession()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loadSession]);

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
      sourceText: string;
      translatedText: string;
      audioBase64: string | null;
      seqNo: number;
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
  }, [sessionId]);

  useEffect(() => {
    segmentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments, interimText]);

  const updateStatus = async (status: string) => {
    const res = await fetch(`/api/sessions/${sessionId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSession(updated);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/api/ws/audio?sessionId=${sessionId}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";

        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(e.data);
          }
        };

        recorder.start(250);
        setRecording(true);
        updateStatus("live");
      };

      ws.onerror = () => setError("WebSocket connection failed");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Microphone access denied"
      );
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    setRecording(false);
    setInterimText("");
  };

  const endSession = async () => {
    stopRecording();
    await updateStatus("ended");
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-gray-400">Loading session...</p>
      </main>
    );
  }

  if (error && !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  if (!session) return null;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row">
        {/* Left panel — Controls */}
        <div className="w-full shrink-0 space-y-6 rounded-xl border border-white/10 bg-card p-6 lg:w-80">
          <Link href="/" className="text-sm text-gray-400 hover:text-accent">
            ← All sessions
          </Link>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">{session.name}</h1>
              <StatusBadge status={session.status} size="sm" />
            </div>
            <p className="mt-2 text-sm text-gray-400">
              {getLanguagePair(session.source_lang, session.target_lang)}
            </p>
          </div>

          <div className="space-y-3">
            {!recording ? (
              <button
                onClick={startRecording}
                disabled={session.status === "ended"}
                className="w-full rounded-lg bg-red-500 py-3 font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                Start Recording
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="w-full rounded-lg border border-red-500/50 bg-red-500/10 py-3 font-semibold text-red-400 hover:bg-red-500/20"
              >
                Stop Recording
              </button>
            )}

            <button
              onClick={endSession}
              disabled={session.status === "ended"}
              className="w-full rounded-lg border border-white/10 py-3 text-sm text-gray-400 hover:border-white/20 hover:text-white disabled:opacity-50"
            >
              End Session
            </button>
          </div>

          <QRCodeDisplay sessionId={sessionId} />

          <Link
            href={`/session/${sessionId}/audio-out`}
            className="block text-center text-sm text-accent hover:underline"
          >
            Open Audio Output (for Zoom)
          </Link>
        </div>

        {/* Right panel — Live transcript */}
        <div className="flex-1 rounded-xl border border-white/10 bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Live Transcript</h2>

          <div className="mb-6 rounded-lg border border-white/5 bg-white/5 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              Source
            </p>
            <div className="min-h-[3rem] space-y-1">
              {segments.map((seg) => (
                <p key={seg.id} className="text-white">
                  {seg.source_text}
                </p>
              ))}
              {interimText && (
                <p className="text-gray-500">{interimText}</p>
              )}
              {!interimText && segments.length === 0 && (
                <p className="text-gray-600">
                  {recording
                    ? "Listening..."
                    : "Start recording to see live transcript"}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-white/5 bg-white/5 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              Translation
            </p>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto">
              {segments.map((seg) => (
                <TranscriptSegment
                  key={seg.id}
                  segment={seg}
                  variant="host"
                  showPlayButton
                  onPlay={(audio) => play(audio)}
                />
              ))}
              <div ref={segmentsEndRef} />
            </div>
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-400">{error}</p>
          )}
        </div>
      </div>
    </main>
  );
}
