"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LangCode } from "@/types";
import {
  isSpeakableText,
  primeSpeechInGesture,
  SpeechQueue,
} from "@/lib/speech-synthesis";
import { SILENT_MP3_DATA_URL, unlockWithAudioContextSync } from "@/lib/audio-playback";

interface SegmentAudio {
  text: string;
  audioBase64: string | null;
}

/**
 * Reliable translation playback for the listener page.
 *
 * Primary: server TTS MP3 via HTML5 Audio (works from async Socket.io after one tap unlock).
 * Fallback: browser Speech Synthesis when audioBase64 is missing.
 */
export function useTranslationPlayback(targetLang: LangCode) {
  const unlockedRef = useRef(false);
  const audioOnRef = useRef(true);
  const volumeRef = useRef(1);
  const mp3QueueRef = useRef<string[]>([]);
  const playingRef = useRef(false);
  const playedIdsRef = useRef(new Set<string>());
  const pendingRef = useRef<Map<string, SegmentAudio>>(new Map());
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechQueueRef = useRef<SpeechQueue | null>(null);

  const [unlocked, setUnlocked] = useState(false);
  const [audioOn, setAudioOn] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [lastPlaySource, setLastPlaySource] = useState<"mp3" | "speech" | null>(
    null
  );

  if (!speechQueueRef.current) {
    speechQueueRef.current = new SpeechQueue(targetLang);
  }

  useEffect(() => {
    speechQueueRef.current?.setLanguage(targetLang);
  }, [targetLang]);

  useEffect(() => {
    volumeRef.current = volume;
    if (currentAudioRef.current) {
      currentAudioRef.current.volume = volume;
    }
  }, [volume]);

  const playNextMp3 = useCallback(() => {
    if (playingRef.current || !unlockedRef.current || !audioOnRef.current) return;

    const b64 = mp3QueueRef.current.shift();
    if (!b64) return;

    playingRef.current = true;
    setIsPlaying(true);
    setLastPlaySource("mp3");

    currentAudioRef.current?.pause();

    const audio = new Audio(`data:audio/mp3;base64,${b64}`);
    audio.volume = volumeRef.current;
    currentAudioRef.current = audio;

    audio.onended = () => {
      playingRef.current = false;
      setIsPlaying(false);
      playNextMp3();
    };

    audio.onerror = () => {
      console.error("MP3 playback error");
      playingRef.current = false;
      setIsPlaying(false);
      playNextMp3();
    };

    audio.play().catch((err) => {
      console.error("MP3 play() blocked:", err);
      playingRef.current = false;
      setIsPlaying(false);
      playNextMp3();
    });
  }, []);

  const speakFallback = useCallback((text: string) => {
    if (!unlockedRef.current || !audioOnRef.current) return;
    setLastPlaySource("speech");
    speechQueueRef.current?.enable();
    speechQueueRef.current?.enqueue(text);
  }, []);

  const tryPlaySegment = useCallback(
    (segmentId: string) => {
      if (!unlockedRef.current || !audioOnRef.current) return;
      if (playedIdsRef.current.has(segmentId)) return;

      const pending = pendingRef.current.get(segmentId);
      if (!pending) return;

      const { text, audioBase64 } = pending;
      if (!audioBase64 && !isSpeakableText(text)) return;

      playedIdsRef.current.add(segmentId);

      if (audioBase64) {
        mp3QueueRef.current.push(audioBase64);
        playNextMp3();
      } else {
        speakFallback(text);
      }
    },
    [playNextMp3, speakFallback]
  );

  const registerSegment = useCallback(
    (segmentId: string, text: string | null, audioBase64: string | null) => {
      pendingRef.current.set(segmentId, {
        text: text ?? "",
        audioBase64,
      });
      tryPlaySegment(segmentId);
    },
    [tryPlaySegment]
  );

  const enableAudio = useCallback(() => {
    if (unlockedRef.current) return;

    unlockWithAudioContextSync();

    const silent = new Audio(SILENT_MP3_DATA_URL);
    silent.volume = 0.01;
    void silent.play().then(() => silent.pause()).catch(() => {});

    primeSpeechInGesture();
    speechQueueRef.current?.enable();

    unlockedRef.current = true;
    audioOnRef.current = true;
    setUnlocked(true);
    setAudioOn(true);
  }, []);

  const replaySegment = useCallback(
    (_segmentId: string, text: string | null, audioBase64: string | null) => {
      if (!unlockedRef.current) {
        enableAudio();
      }

      playingRef.current = false;
      currentAudioRef.current?.pause();
      speechQueueRef.current?.stop();

      if (audioBase64) {
        mp3QueueRef.current.unshift(audioBase64);
        playNextMp3();
        return;
      }

      if (isSpeakableText(text)) {
        setLastPlaySource("speech");
        speechQueueRef.current?.replay(text!);
      }
    },
    [enableAudio, playNextMp3]
  );

  const toggleAudio = useCallback(() => {
    setAudioOn((prev) => {
      const next = !prev;
      audioOnRef.current = next;
      if (!next) {
        playingRef.current = false;
        currentAudioRef.current?.pause();
        speechQueueRef.current?.stop();
        setIsPlaying(false);
      } else if (unlockedRef.current) {
        playNextMp3();
      }
      return next;
    });
  }, [playNextMp3]);

  useEffect(() => {
    const id = setInterval(() => {
      const speechActive = speechQueueRef.current?.isSpeaking ?? false;
      setIsPlaying(playingRef.current || speechActive);
    }, 150);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      currentAudioRef.current?.pause();
      speechQueueRef.current?.stop();
      mp3QueueRef.current = [];
    };
  }, []);

  return {
    unlocked,
    audioOn,
    isPlaying,
    volume,
    lastPlaySource,
    setVolume,
    enableAudio,
    registerSegment,
    replaySegment,
    toggleAudio,
  };
}
