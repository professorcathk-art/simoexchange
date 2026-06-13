"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiUsageStats, VadUiState } from "@/lib/audio-ws-protocol";
import { EnergyVAD } from "@/lib/vad";

const LOW_POWER_KEY = "livetranslate_low_power_mode";
const PRE_SPEECH_CHUNKS = 8;

const emptyUsage = (): ApiUsageStats => ({
  deepgramActiveSec: 0,
  deepgramSessions: 0,
  translations: 0,
  translationChars: 0,
  ttsRequests: 0,
  ttsChars: 0,
});

export function useHostRecording(sessionId: string) {
  const [recording, setRecording] = useState(false);
  const [wsStatus, setWsStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [lowPowerMode, setLowPowerMode] = useState(false);
  const [vadState, setVadState] = useState<VadUiState>("idle");
  const [apiUsage, setApiUsage] = useState<ApiUsageStats>(emptyUsage);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const vadRef = useRef<EnergyVAD | null>(null);
  const recordingRef = useRef(false);
  const lowPowerRef = useRef(false);
  const speechStreamingRef = useRef(false);
  const preSpeechChunksRef = useRef<ArrayBuffer[]>([]);
  const hangoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadFailedRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem(LOW_POWER_KEY);
    if (saved === "true") setLowPowerMode(true);
  }, []);

  useEffect(() => {
    lowPowerRef.current = lowPowerMode;
    localStorage.setItem(LOW_POWER_KEY, String(lowPowerMode));
  }, [lowPowerMode]);

  const sendWsJson = useCallback((payload: object) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const updateVadState = useCallback(() => {
    if (!recordingRef.current) {
      setVadState("idle");
      return;
    }
    if (!lowPowerRef.current || vadFailedRef.current) {
      setVadState(wsStatus === "connected" ? "deepgram_active" : "listening");
      return;
    }
    if (speechStreamingRef.current) {
      setVadState("deepgram_active");
    } else if (vadRef.current?.speaking) {
      setVadState("speech_detected");
    } else {
      setVadState("listening");
    }
  }, [wsStatus]);

  useEffect(() => {
    updateVadState();
  }, [recording, wsStatus, lowPowerMode, updateVadState]);

  const flushPreSpeechBuffer = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    for (const chunk of preSpeechChunksRef.current) {
      ws.send(chunk);
    }
    preSpeechChunksRef.current = [];
  }, []);

  /** speech start handler — open Deepgram path and stream buffered audio. */
  const handleSpeechStart = useCallback(() => {
    if (!lowPowerRef.current || vadFailedRef.current) return;
    if (hangoverTimerRef.current) {
      clearTimeout(hangoverTimerRef.current);
      hangoverTimerRef.current = null;
    }
    speechStreamingRef.current = true;
    sendWsJson({ type: "speech_start" });
    flushPreSpeechBuffer();
    updateVadState();
  }, [flushPreSpeechBuffer, sendWsJson, updateVadState]);

  /** speech end handler — tail hangover then suspend Deepgram. */
  const handleSpeechEnd = useCallback(() => {
    if (!lowPowerRef.current || vadFailedRef.current) return;
    if (hangoverTimerRef.current) clearTimeout(hangoverTimerRef.current);
    hangoverTimerRef.current = setTimeout(() => {
      speechStreamingRef.current = false;
      sendWsJson({ type: "speech_end" });
      updateVadState();
    }, 500);
  }, [sendWsJson, updateVadState]);

  const teardown = useCallback(() => {
    if (hangoverTimerRef.current) clearTimeout(hangoverTimerRef.current);
    hangoverTimerRef.current = null;
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    vadRef.current?.stop();
    vadRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    recordingRef.current = false;
    speechStreamingRef.current = false;
    preSpeechChunksRef.current = [];
    setRecording(false);
    setWsStatus("idle");
    setVadState("idle");
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setWsStatus("connecting");
      vadFailedRef.current = false;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/api/ws/audio?sessionId=${sessionId}`
      );
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = async () => {
        setWsStatus("connected");
        sendWsJson({ type: "config", lowPowerMode: lowPowerRef.current });

        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";

        if (!mimeType) {
          setError("Browser does not support WebM audio recording");
          setWsStatus("error");
          teardown();
          return;
        }

        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = async (e) => {
          if (e.data.size === 0 || ws.readyState !== WebSocket.OPEN) return;
          const buf = await e.data.arrayBuffer();

          if (lowPowerRef.current && !vadFailedRef.current) {
            if (speechStreamingRef.current) {
              ws.send(buf);
            } else {
              preSpeechChunksRef.current.push(buf);
              if (preSpeechChunksRef.current.length > PRE_SPEECH_CHUNKS) {
                preSpeechChunksRef.current.shift();
              }
            }
            return;
          }

          ws.send(buf);
        };

        recorder.start(250);
        recordingRef.current = true;
        setRecording(true);
        updateVadState();

        if (lowPowerRef.current) {
          try {
            // VAD init — analyse mic energy before sending to Deepgram.
            const vad = await EnergyVAD.create(stream);
            vadRef.current = vad;
            vad.onSpeechStart = handleSpeechStart;
            vad.onSpeechEnd = handleSpeechEnd;
            vad.start();
          } catch (vadErr) {
            console.warn("VAD init failed, falling back to always-on:", vadErr);
            vadFailedRef.current = true;
            sendWsJson({ type: "config", lowPowerMode: false });
            setVadState("deepgram_active");
          }
        }
      };

      ws.onerror = () => {
        setWsStatus("error");
        setError("WebSocket connection failed");
      };

      ws.onclose = (event) => {
        if (event.code !== 1000 && recordingRef.current) {
          setWsStatus("error");
          setError(event.reason || `Audio connection closed (code ${event.code})`);
        }
        recordingRef.current = false;
        setRecording(false);
        setVadState("idle");
      };
    } catch (err) {
      setWsStatus("error");
      setError(err instanceof Error ? err.message : "Microphone access denied");
    }
  }, [
    handleSpeechEnd,
    handleSpeechStart,
    sendWsJson,
    sessionId,
    teardown,
    updateVadState,
  ]);

  const stopRecording = useCallback(() => {
    if (speechStreamingRef.current) {
      sendWsJson({ type: "speech_end" });
    }
    teardown();
  }, [sendWsJson, teardown]);

  return {
    recording,
    wsStatus,
    lowPowerMode,
    setLowPowerMode,
    vadState,
    apiUsage,
    setApiUsage,
    error,
    setError,
    startRecording,
    stopRecording,
    teardown,
  };
}
