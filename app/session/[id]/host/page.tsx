"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ApiUsageStats } from "@/lib/audio-ws-protocol";
import type { Session, TranscriptSegment as Segment } from "@/types";
import { getLanguagePair } from "@/lib/constants";
import { getSocket, joinSession } from "@/lib/socket-client";
import { useAudioPlayer } from "@/components/AudioPlayer";
import StatusBadge from "@/components/StatusBadge";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import TranscriptSegment, { InterimTranscript } from "@/components/TranscriptSegment";
import VadStateIndicator from "@/components/VadStateIndicator";
import ApiUsagePanel from "@/components/ApiUsagePanel";
import TranscriptPolishPanel from "@/components/TranscriptPolishPanel";
import { useHostRecording } from "@/hooks/useHostRecording";

export default function HostPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [interimText, setInterimText] = useState("");
  const [interimSpeakerId, setInterimSpeakerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const segmentsEndRef = useRef<HTMLDivElement>(null);
  const { play } = useAudioPlayer();

  const {
    recording,
    wsStatus,
    lowPowerMode,
    setLowPowerMode,
    vadState,
    apiUsage,
    setApiUsage,
    error: recordingError,
    setError: setRecordingError,
    startRecording,
    stopRecording,
    teardown,
    getRawRecordingBlob,
  } = useHostRecording(sessionId);

  const loadSegments = useCallback(async () => {
    const segmentsRes = await fetch(`/api/sessions/${sessionId}/segments`);
    if (segmentsRes.ok) setSegments(await segmentsRes.json());
  }, [sessionId]);

  const loadSession = useCallback(async () => {
    const [sessionRes] = await Promise.all([
      fetch(`/api/sessions/${sessionId}`),
      loadSegments(),
    ]);

    if (!sessionRes.ok) throw new Error("Session not found");
    setSession(await sessionRes.json());
  }, [sessionId, loadSegments]);

  useEffect(() => {
    loadSession()
      .catch((err) => setPageError(err.message))
      .finally(() => setLoading(false));
  }, [loadSession]);

  useEffect(() => {
    return () => teardown();
  }, [teardown]);

  useEffect(() => {
    const socket = getSocket();
    joinSession(sessionId);

    socket.on("transcript_interim", (data: { text: string; speakerId?: number | null }) => {
      setInterimText(data.text);
      setInterimSpeakerId(data.speakerId ?? null);
    });

    socket.on("transcript_final", (data: {
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
    });

    socket.on("segment_update", (data: {
      segmentId: string;
      sourceText: string;
      translatedText: string;
      audioBase64: string | null;
      seqNo: number;
      speakerId?: number | null;
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
      if (data.status === "ended") {
        void loadSegments();
      }
    });

    socket.on("api_usage", (data: { usage: ApiUsageStats }) => {
      if (data.usage) setApiUsage(data.usage);
    });

    return () => {
      socket.off("transcript_interim");
      socket.off("transcript_final");
      socket.off("segment_update");
      socket.off("session_status");
      socket.off("api_usage");
    };
  }, [sessionId, setApiUsage, loadSegments]);

  useEffect(() => {
    segmentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments, interimText]);

  const updateStatus = async (status: string) => {
    const res = await fetch(`/api/sessions/${sessionId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) setSession(await res.json());
  };

  const handleStartRecording = async () => {
    setRecordingError(null);
    if (session?.status === "ended") await updateStatus("live");
    await startRecording();
    await updateStatus("live");
  };

  const endSession = async () => {
    const recordingBlob = getRawRecordingBlob();
    stopRecording();

    if (recordingBlob && recordingBlob.size > 0) {
      try {
        const form = new FormData();
        form.append("recording", recordingBlob, "host-recording.webm");
        await fetch(`/api/sessions/${sessionId}/recording`, {
          method: "POST",
          body: form,
        });
      } catch (err) {
        console.error("Recording upload failed:", err);
      }
    }

    await updateStatus("ended");
    await loadSegments();
  };

  const displayError = pageError || recordingError;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-gray-400">Loading session...</p>
      </main>
    );
  }

  if (pageError && !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-red-400">{pageError}</p>
      </main>
    );
  }

  if (!session) return null;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row">
        <div className="w-full shrink-0 space-y-6 rounded-xl border border-white/10 bg-card p-6 lg:w-80">
          <Link href="/app" className="text-sm text-gray-400 hover:text-accent">
            ← All sessions
          </Link>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">{session.name}</h1>
              <StatusBadge status={session.status} size="sm" />
            </div>
            <p className="mt-2 text-sm text-gray-400">
              🌐 Multi-language (EN/ZH/JA/KO) →{" "}
              {getLanguagePair(session.source_lang, session.target_lang).split("→")[1]?.trim()}
            </p>
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <span className="text-sm text-gray-300">Low Power Mode</span>
            <input
              type="checkbox"
              checked={lowPowerMode}
              disabled={recording}
              onChange={(e) => setLowPowerMode(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
          </label>
          <p className="text-xs text-gray-500">
            Only sends audio to Deepgram when speech is detected (saves API cost).
            First words may take ~1–2s while Deepgram connects.
          </p>

          <div className="flex items-center justify-between">
            <VadStateIndicator state={vadState} />
            {recording && (
              <span
                className={`text-xs ${
                  wsStatus === "connected"
                    ? "text-green-400"
                    : wsStatus === "error"
                      ? "text-red-400"
                      : "text-yellow-400"
                }`}
              >
                WS {wsStatus}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {!recording ? (
              <button
                onClick={handleStartRecording}
                className="w-full rounded-lg bg-red-500 py-3 font-semibold text-white hover:bg-red-600"
              >
                {session.status === "ended" ? "Restart Recording" : "Start Recording"}
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

          {session.status === "ended" && (
            <p className="rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2 text-xs text-green-400">
              Session ended — transcript saved to database
            </p>
          )}

          {session.status === "ended" && segments.length > 0 && (
            <TranscriptPolishPanel
              sessionId={sessionId}
              title="Professional Transcript"
            />
          )}

          <ApiUsagePanel usage={apiUsage} lowPowerMode={lowPowerMode} />
          <QRCodeDisplay sessionId={sessionId} />

          <p className="text-center text-xs text-gray-500">
            Audience scans QR or opens listener link — transcript + auto-play audio on one page
          </p>
        </div>

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
                <InterimTranscript text={interimText} speakerId={interimSpeakerId} />
              )}
              {!interimText && segments.length === 0 && (
                <p className="text-gray-600">
                  {recording ? "Listening..." : "Start recording to see live transcript"}
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
                  variant="translation-only"
                  showPlayButton
                  onPlay={(audio) => play(audio)}
                />
              ))}
              <div ref={segmentsEndRef} />
            </div>
          </div>

          {displayError && (
            <p className="mt-4 text-sm text-red-400">{displayError}</p>
          )}
        </div>
      </div>
    </main>
  );
}
