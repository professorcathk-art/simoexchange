"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SILENT_MP3_DATA_URL, base64ToBlobUrl } from "@/lib/audio-playback";

export function useListenerAudio() {
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<string[]>([]);
  const playingRef = useRef(false);
  const unlockedRef = useRef(false);
  const audioOnRef = useRef(true);
  const blobUrlsRef = useRef<Set<string>>(new Set());

  const [audioOn, setAudioOn] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
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
      playNext();
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

  const bindAudioElement = useCallback(
    (el: HTMLAudioElement | null) => {
      audioElRef.current = el;
      if (!el) return;

      const onEnded = () => {
        if (el.src.startsWith("blob:")) revokeUrl(el.src);
        playingRef.current = false;
        setIsPlaying(false);
        void playNext();
      };

      const onError = () => {
        playingRef.current = false;
        setIsPlaying(false);
        if (el.src.startsWith("blob:")) revokeUrl(el.src);
        void playNext();
      };

      el.addEventListener("ended", onEnded);
      el.addEventListener("error", onError);
    },
    [playNext, revokeUrl]
  );

  const enableAudio = useCallback(async () => {
    const audio = audioElRef.current;
    if (!audio) return;

    audio.src = SILENT_MP3_DATA_URL;
    audio.volume = 0.01;
    try {
      await audio.play();
      audio.pause();
      audio.volume = 1;
      unlockedRef.current = true;
      audioOnRef.current = true;
      setAudioUnlocked(true);
      setAudioOn(true);
      setPlayError(null);
      void playNext();
    } catch (err) {
      console.error("Audio unlock failed:", err);
      setPlayError("Could not unlock audio — try tapping again");
    }
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
    return () => {
      Array.from(blobUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current.clear();
      queueRef.current = [];
    };
  }, []);

  return {
    audioOn,
    audioUnlocked,
    isPlaying,
    playError,
    bindAudioElement,
    enableAudio,
    toggleAudio,
    queueAudio,
  };
}
