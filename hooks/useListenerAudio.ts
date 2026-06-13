"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  base64ToBlobUrl,
  unlockWithAudioContext,
  unlockWithAudioElement,
} from "@/lib/audio-playback";

export function useListenerAudio() {
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<string[]>([]);
  const playingRef = useRef(false);
  const unlockedRef = useRef(false);
  const unlockingRef = useRef(false);
  const audioOnRef = useRef(true);
  const blobUrlsRef = useRef<Set<string>>(new Set());

  const [audioOn, setAudioOn] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  const revokeUrl = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    blobUrlsRef.current.delete(url);
  }, []);

  const playNext = useCallback(async () => {
    const audio = audioElRef.current;
    if (!audio || playingRef.current || queueRef.current.length === 0) return;
    if (!unlockedRef.current || !audioOnRef.current) return;

    const next = queueRef.current.shift();
    if (!next) return;

    playingRef.current = true;
    setIsPlaying(true);
    setPlayError(null);

    const url = base64ToBlobUrl(next);
    blobUrlsRef.current.add(url);

    const prev = audio.src;
    if (prev.startsWith("blob:")) revokeUrl(prev);

    audio.src = url;
    audio.load();

    try {
      await audio.play();
    } catch (err) {
      console.error("Audio play failed:", err);
      playingRef.current = false;
      setIsPlaying(false);
      setPlayError("Tap enable audio again if playback stopped");
      revokeUrl(url);
      void playNext();
    }
  }, [revokeUrl]);

  const queueAudio = useCallback(
    (audioBase64: string) => {
      if (!audioBase64) return;
      queueRef.current.push(audioBase64);
      void playNext();
    },
    [playNext]
  );

  const bindAudioElement = useCallback((el: HTMLAudioElement | null) => {
    audioElRef.current = el;
  }, []);

  /**
   * Must be called synchronously from pointer/touch handler (not async).
   * iOS Safari only allows play() inside the direct user-gesture call stack.
   */
  const enableAudio = useCallback(() => {
    const audio = audioElRef.current;
    if (!audio || unlockingRef.current || unlockedRef.current) return;

    unlockingRef.current = true;
    setUnlocking(true);
    setPlayError(null);

    unlockWithAudioElement(audio)
      .catch(() => unlockWithAudioContext())
      .then(() => {
        unlockedRef.current = true;
        audioOnRef.current = true;
        setAudioUnlocked(true);
        setAudioOn(true);
        setPlayError(null);
        void playNext();
      })
      .catch((err) => {
        console.error("Audio unlock failed:", err);
        setPlayError("Could not unlock audio — tap the button again");
      })
      .finally(() => {
        unlockingRef.current = false;
        setUnlocking(false);
      });
  }, [playNext]);

  const toggleAudio = useCallback(() => {
    setAudioOn((prev) => {
      const next = !prev;
      audioOnRef.current = next;
      if (next && unlockedRef.current) void playNext();
      if (!next) {
        audioElRef.current?.pause();
        playingRef.current = false;
        setIsPlaying(false);
      }
      return next;
    });
  }, [playNext]);

  useEffect(() => {
    const audio = audioElRef.current;
    if (!audio) return;

    const onEnded = () => {
      if (audio.src.startsWith("blob:")) revokeUrl(audio.src);
      playingRef.current = false;
      setIsPlaying(false);
      void playNext();
    };

    const onError = () => {
      playingRef.current = false;
      setIsPlaying(false);
      if (audio.src.startsWith("blob:")) revokeUrl(audio.src);
      void playNext();
    };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [playNext, revokeUrl, audioUnlocked]);

  useEffect(() => {
    return () => {
      Array.from(blobUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current.clear();
      queueRef.current = [];
    };
  }, []);

  return {
    audioOn,
    audioUnlocked,
    unlocking,
    isPlaying,
    playError,
    bindAudioElement,
    enableAudio,
    toggleAudio,
    queueAudio,
  };
}
