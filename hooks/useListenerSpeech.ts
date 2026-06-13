"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LangCode } from "@/types";
import { primeSpeechInGesture, SpeechQueue } from "@/lib/speech-synthesis";

export function useListenerSpeech(targetLang: LangCode) {
  const queueRef = useRef<SpeechQueue | null>(null);
  const [speechOn, setSpeechOn] = useState(true);
  const [speechUnlocked, setSpeechUnlocked] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  if (!queueRef.current) {
    queueRef.current = new SpeechQueue(targetLang);
  }

  useEffect(() => {
    queueRef.current?.setLanguage(targetLang);
  }, [targetLang]);

  useEffect(() => {
    const id = setInterval(() => {
      setIsSpeaking(queueRef.current?.isSpeaking ?? false);
    }, 150);
    return () => clearInterval(id);
  }, []);

  const enableSpeech = useCallback(() => {
    if (speechUnlocked) return;
    primeSpeechInGesture();
    queueRef.current?.enable();
    setSpeechUnlocked(true);
    setSpeechOn(true);
  }, [speechUnlocked]);

  const speakText = useCallback(
    (text: string) => {
      if (!speechOn || !speechUnlocked) return;
      queueRef.current?.enqueue(text);
    },
    [speechOn, speechUnlocked]
  );

  const replayText = useCallback((text: string) => {
    primeSpeechInGesture();
    queueRef.current?.enable();
    setSpeechUnlocked(true);
    setSpeechOn(true);
    queueRef.current?.replay(text);
  }, []);

  const toggleSpeech = useCallback(() => {
    setSpeechOn((prev) => {
      const next = !prev;
      if (!next) queueRef.current?.stop();
      return next;
    });
  }, []);

  useEffect(() => {
    return () => queueRef.current?.stop();
  }, []);

  const speechSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  return {
    speechOn,
    speechUnlocked,
    isSpeaking,
    speechSupported,
    enableSpeech,
    speakText,
    replayText,
    toggleSpeech,
  };
}
