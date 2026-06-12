"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { Session } from "@/types";
import { getSocket, joinSession } from "@/lib/socket-client";
import { useAudioPlayer } from "@/components/AudioPlayer";
import StatusBadge from "@/components/StatusBadge";

export default function AudioOutPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [currentText, setCurrentText] = useState("Waiting for translation...");
  const [volume, setVolume] = useState(1);
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const { unlock } = useAudioPlayer();

  const playNext = useCallback(() => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    const next = audioQueueRef.current.shift();
    if (!next) return;
    isPlayingRef.current = true;
    const audio = new Audio(`data:audio/mp3;base64,${next}`);
    audio.volume = volume;
    audio.onended = () => {
      isPlayingRef.current = false;
      playNext();
    };
    audio.play().catch(() => {
      isPlayingRef.current = false;
    });
  }, [volume]);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((res) => res.json())
      .then(setSession)
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    const socket = getSocket();
    joinSession(sessionId);

    socket.on("segment_update", (data: {
      translatedText: string;
      audioBase64: string | null;
    }) => {
      setCurrentText(data.translatedText);
      if (data.audioBase64 && unlocked) {
        audioQueueRef.current.push(data.audioBase64);
        playNext();
      }
    });

    socket.on("session_status", (data: { status: string }) => {
      setSession((prev) =>
        prev ? { ...prev, status: data.status as Session["status"] } : prev
      );
    });

    return () => {
      socket.off("segment_update");
      socket.off("session_status");
    };
  }, [sessionId, unlocked, playNext]);

  const handleUnlock = () => {
    unlock();
    setUnlocked(true);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black px-6">
      {!unlocked && (
        <button
          onClick={handleUnlock}
          className="mb-8 rounded-2xl bg-accent px-10 py-5 text-xl font-bold text-black"
        >
          Click to unlock audio
        </button>
      )}

      <div className="mb-8">
        {session && <StatusBadge status={session.status} />}
      </div>

      <p className="max-w-2xl text-center text-3xl font-medium leading-relaxed text-white md:text-4xl">
        {currentText}
      </p>

      <div className="mt-12 w-full max-w-md">
        <label className="mb-2 block text-sm text-gray-500">Volume</label>
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

      <p className="mt-12 max-w-lg text-center text-sm text-gray-600">
        Set your system audio output as the input for your virtual audio cable
        (BlackHole on macOS, VB-Cable on Windows) and select that device as
        your Zoom microphone input.
      </p>
    </main>
  );
}
