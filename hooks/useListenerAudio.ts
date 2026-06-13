"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  base64ToBlobUrl,
  prepareMobileAudioElement,
  SILENT_MP3_DATA_URL,
  unlockWithAudioContextSync,
} from "@/lib/audio-playback";

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

  const setAudioSrc = useCallback(
    (audio: HTMLAudioElement, b64: string) => {
      const url = base64ToBlobUrl(b64);
      blobUrlsRef.current.add(url);
      const prev = audio.src;
      if (prev.startsWith("blob:")) revokeUrl(prev);
      audio.src = url;
      audio.load();
      return url;
    },
    [revokeUrl]
  );

  const playNext = useCallback(async () => {
    const audio = audioElRef.current;
    if (!audio || playingRef.current || queueRef.current.length === 0) return;
    if (!unlockedRef.current || !audioOnRef.current) return;

    const next = queueRef.current.shift();
    if (!next) return;

    playingRef.current = true;
    setIsPlaying(true);
    setPlayError(null);
    setAudioSrc(audio, next);

    try {
      await audio.play();
    } catch (err) {
      console.error("Audio play failed:", err);
      playingRef.current = false;
      setIsPlaying(false);
      setPlayError("Tap ▶ on a segment if audio stops");
      void playNext();
    }
  }, [setAudioSrc]);

  const queueAudio = useCallback(
    (audioBase64: string) => {
      if (!audioBase64) return;
      queueRef.current.push(audioBase64);
      if (unlockedRef.current) void playNext();
    },
    [playNext]
  );

  const bindAudioElement = useCallback((el: HTMLAudioElement | null) => {
    if (el) prepareMobileAudioElement(el);
    audioElRef.current = el;
  }, []);

  /**
   * Play one clip inside a user gesture (tap). Required for iOS retry / manual replay.
   */
  const playNow = useCallback(
    (audioBase64: string) => {
      const audio = audioElRef.current;
      if (!audio || !audioBase64) return;

      unlockWithAudioContextSync();
      unlockedRef.current = true;
      audioOnRef.current = true;
      setAudioUnlocked(true);
      setAudioOn(true);
      setPlayError(null);

      playingRef.current = true;
      setIsPlaying(true);
      setAudioSrc(audio, audioBase64);

      const promise = audio.play();
      if (promise) {
        promise.catch((err) => {
          console.error("playNow failed:", err);
          playingRef.current = false;
          setIsPlaying(false);
          setPlayError("Could not play — try again");
        });
      }
    },
    [setAudioSrc]
  );

  /**
   * Call synchronously from pointer/touch handler. First queued clip plays in the gesture stack.
   */
  const enableAudio = useCallback(() => {
    const audio = audioElRef.current;
    if (!audio || unlockedRef.current) return;

    unlockWithAudioContextSync();
    prepareMobileAudioElement(audio);
    unlockedRef.current = true;
    audioOnRef.current = true;
    setAudioUnlocked(true);
    setAudioOn(true);
    setPlayError(null);

    if (queueRef.current.length > 0) {
      playingRef.current = true;
      setIsPlaying(true);
      const next = queueRef.current.shift()!;
      setAudioSrc(audio, next);
      void audio.play();
      return;
    }

    audio.src = SILENT_MP3_DATA_URL;
    audio.volume = 0.01;
    const promise = audio.play();
    if (promise) {
      promise
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = 1;
        })
        .catch(() => {
          setPlayError("Audio enabled — translations will play when available");
        });
    }
  }, [setAudioSrc]);

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
    isPlaying,
    playError,
    bindAudioElement,
    enableAudio,
    toggleAudio,
    queueAudio,
    playNow,
  };
}
