"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LangCode } from "@/types";
import {
  isSpeakableText,
  primeSpeechInGesture,
  SpeechQueue,
} from "@/lib/speech-synthesis";
import {
  base64ToBlobUrl,
  prepareMobileAudioElement,
  SILENT_MP3_DATA_URL,
  unlockWithAudioContextSync,
} from "@/lib/audio-playback";

interface SegmentAudio {
  text: string;
  audioBase64: string | null;
  audioUrl: string | null;
  seqNo: number;
}

interface Mp3QueueItem {
  b64: string | null;
  url: string | null;
  text: string;
}

/**
 * Continuous translation playback using ONE persistent <audio> element.
 * iOS requires the same element unlocked in a tap gesture, then reused for every clip.
 */
export function useTranslationPlayback(targetLang: LangCode) {
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);
  const audioOnRef = useRef(true);
  const volumeRef = useRef(1);
  const mp3QueueRef = useRef<Mp3QueueItem[]>([]);
  const playingRef = useRef(false);
  const playedMp3IdsRef = useRef(new Set<string>());
  const playedSpeechIdsRef = useRef(new Set<string>());
  const pendingRef = useRef<Map<string, SegmentAudio>>(new Map());
  const currentBlobUrlRef = useRef<string | null>(null);
  const speechQueueRef = useRef<SpeechQueue | null>(null);

  const [unlocked, setUnlocked] = useState(false);
  const [audioOn, setAudioOn] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [lastPlaySource, setLastPlaySource] = useState<"mp3" | "speech" | null>(
    null
  );
  const [queueLength, setQueueLength] = useState(0);

  if (!speechQueueRef.current) {
    speechQueueRef.current = new SpeechQueue(targetLang);
  }

  useEffect(() => {
    speechQueueRef.current?.setLanguage(targetLang);
  }, [targetLang]);

  useEffect(() => {
    volumeRef.current = volume;
    if (audioElRef.current) audioElRef.current.volume = volume;
  }, [volume]);

  const revokeBlob = useCallback(() => {
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
  }, []);

  const updateQueueLength = useCallback(() => {
    setQueueLength(mp3QueueRef.current.length);
  }, []);

  const speakFallback = useCallback((text: string) => {
    if (!unlockedRef.current || !audioOnRef.current) return;
    setLastPlaySource("speech");
    speechQueueRef.current?.enable();
    speechQueueRef.current?.enqueue(text);
  }, []);

  const playNextMp3 = useCallback(() => {
    const audio = audioElRef.current;
    if (!audio || playingRef.current || !unlockedRef.current || !audioOnRef.current) {
      return;
    }

    const item = mp3QueueRef.current.shift();
    updateQueueLength();
    if (!item) return;

    playingRef.current = true;
    setIsPlaying(true);
    setLastPlaySource("mp3");

    revokeBlob();
    const url = item.url ?? (item.b64 ? base64ToBlobUrl(item.b64) : null);
    if (!url) {
      playingRef.current = false;
      setIsPlaying(false);
      if (isSpeakableText(item.text)) speakFallback(item.text);
      playNextMp3();
      return;
    }
    currentBlobUrlRef.current = item.url ? null : url;

    audio.src = url;
    audio.volume = volumeRef.current;

    const onEnded = () => {
      cleanup();
      playingRef.current = false;
      setIsPlaying(false);
      playNextMp3();
    };

    const onError = () => {
      cleanup();
      playingRef.current = false;
      setIsPlaying(false);
      if (isSpeakableText(item.text)) speakFallback(item.text);
      playNextMp3();
    };

    const cleanup = () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    void audio.play().catch((err) => {
      console.error("MP3 play() blocked:", err);
      onError();
    });
  }, [revokeBlob, speakFallback, updateQueueLength]);

  const tryPlaySegment = useCallback(
    (segmentId: string) => {
      if (!unlockedRef.current || !audioOnRef.current) return;

      const pending = pendingRef.current.get(segmentId);
      if (!pending) return;

      const { text, audioBase64, audioUrl } = pending;

      if ((audioBase64 || audioUrl) && !playedMp3IdsRef.current.has(segmentId)) {
        playedMp3IdsRef.current.add(segmentId);
        mp3QueueRef.current.push({
          b64: audioBase64,
          url: audioUrl,
          text,
        });
        updateQueueLength();
        playNextMp3();
        return;
      }

      if (
        !audioBase64 &&
        !audioUrl &&
        isSpeakableText(text) &&
        !playedSpeechIdsRef.current.has(segmentId)
      ) {
        playedSpeechIdsRef.current.add(segmentId);
        speakFallback(text);
      }
    },
    [playNextMp3, speakFallback, updateQueueLength]
  );

  const registerSegment = useCallback(
    (
      segmentId: string,
      text: string | null,
      audioBase64: string | null,
      seqNo = 0,
      audioUrl: string | null = null
    ) => {
      const existing = pendingRef.current.get(segmentId);
      pendingRef.current.set(segmentId, {
        text: text ?? existing?.text ?? "",
        audioBase64: audioBase64 ?? existing?.audioBase64 ?? null,
        audioUrl: audioUrl ?? existing?.audioUrl ?? null,
        seqNo: seqNo || existing?.seqNo || 0,
      });
      tryPlaySegment(segmentId);
    },
    [tryPlaySegment]
  );

  const flushAllPending = useCallback(() => {
    const ordered = Array.from(pendingRef.current.entries()).sort(
      (a, b) => a[1].seqNo - b[1].seqNo
    );
    for (const [id] of ordered) {
      tryPlaySegment(id);
    }
  }, [tryPlaySegment]);

  const bindAudioElement = useCallback((el: HTMLAudioElement | null) => {
    if (el) prepareMobileAudioElement(el);
    audioElRef.current = el;
  }, []);

  const enableAudio = useCallback(() => {
    const audio = audioElRef.current;
    if (!audio || unlockedRef.current) return;

    unlockWithAudioContextSync();
    prepareMobileAudioElement(audio);
    primeSpeechInGesture();
    speechQueueRef.current?.enable();

    unlockedRef.current = true;
    audioOnRef.current = true;
    setUnlocked(true);
    setAudioOn(true);

    const startPlayback = () => {
      audio.volume = volumeRef.current;
      flushAllPending();
      playNextMp3();
    };

    audio.src = SILENT_MP3_DATA_URL;
    audio.volume = 0.01;

    const promise = audio.play();
    if (promise) {
      promise
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          startPlayback();
        })
        .catch(() => startPlayback());
    } else {
      startPlayback();
    }
  }, [flushAllPending, playNextMp3]);

  const replaySegment = useCallback(
    (
      _segmentId: string,
      text: string | null,
      audioBase64: string | null,
      audioUrl: string | null = null
    ) => {
      if (!unlockedRef.current) enableAudio();

      playingRef.current = false;
      speechQueueRef.current?.stop();

      if (audioBase64 || audioUrl) {
        mp3QueueRef.current.unshift({
          b64: audioBase64,
          url: audioUrl,
          text: text ?? "",
        });
        updateQueueLength();
        playNextMp3();
        return;
      }

      if (isSpeakableText(text)) {
        setLastPlaySource("speech");
        speechQueueRef.current?.replay(text!);
      }
    },
    [enableAudio, playNextMp3, updateQueueLength]
  );

  const toggleAudio = useCallback(() => {
    setAudioOn((prev) => {
      const next = !prev;
      audioOnRef.current = next;
      if (!next) {
        playingRef.current = false;
        audioElRef.current?.pause();
        speechQueueRef.current?.stop();
        setIsPlaying(false);
      } else if (unlockedRef.current) {
        flushAllPending();
        playNextMp3();
      }
      return next;
    });
  }, [flushAllPending, playNextMp3]);

  useEffect(() => {
    const id = setInterval(() => {
      const speechActive = speechQueueRef.current?.isSpeaking ?? false;
      setIsPlaying(playingRef.current || speechActive);
    }, 150);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      audioElRef.current?.pause();
      speechQueueRef.current?.stop();
      mp3QueueRef.current = [];
      revokeBlob();
    };
  }, [revokeBlob]);

  return {
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
  };
}
