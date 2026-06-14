"use client";

import { useCallback, useRef } from "react";
import { toAudioPlaySrc } from "@/lib/segment-audio";

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);

  const unlock = useCallback(() => {
    if (unlockedRef.current) return;
    const audio = new Audio();
    audio.src =
      "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+1DEAAAHAAGf9AAAIgAANIAAAAQAAAaEAAAAA";
    audio.volume = 0.01;
    audio.play().then(() => {
      audio.pause();
      unlockedRef.current = true;
    }).catch(() => {});
  }, []);

  const play = useCallback((audioSrc: string, volume = 1) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(toAudioPlaySrc(audioSrc));
    audio.volume = volume;
    audioRef.current = audio;
    audio.play().catch(console.error);
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  return { play, stop, unlock, isUnlocked: () => unlockedRef.current };
}
