"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiUsageStats, VadUiState } from "@/lib/audio-ws-protocol";
import { EnergyVAD } from "@/lib/vad";

const LOW_POWER_KEY = "livetranslate_low_power_mode";
const PRE_SPEECH_CHUNKS = 16;

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
  const deepgramReadyRef = useRef(false);
  const webmHeaderRef = useRef<ArrayBuffer | null>(null);
  const preSpeechChunksRef = useRef<ArrayBuffer[]>([]);
  const pendingChunksRef = useRef<ArrayBuffer[]>([]);
  const rawRecordingChunksRef = useRef<Blob[]>([]);
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
    if (speechStreamingRef.current && deepgramReadyRef.current) {
      setVadState("deepgram_active");
    } else if (speechStreamingRef.current) {
      setVadState("speech_detected");
    } else if (vadRef.current?.speaking) {
      setVadState("speech_detected");
    } else {
      setVadState("listening");
    }
  }, [wsStatus]);

  useEffect(() => {
    updateVadState();
  }, [recording, wsStatus, lowPowerMode, updateVadState]);

  /** Flush WebM header + buffered chunks once Deepgram is ready on the server. */
  const flushBufferedAudio = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    if (webmHeaderRef.current) {
      ws.send(webmHeaderRef.current);
    }
    for (const chunk of preSpeechChunksRef.current) {
      ws.send(chunk);
    }
    preSpeechChunksRef.current = [];
    for (const chunk of pendingChunksRef.current) {
      ws.send(chunk);
    }
    pendingChunksRef.current = [];
  }, []);

  const routeAudioChunk = useCallback(
    (buf: ArrayBuffer) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      if (!lowPowerRef.current || vadFailedRef.current) {
        ws.send(buf);
        return;
      }

      if (!speechStreamingRef.current) {
        // Keep ring buffer; header is also in webmHeaderRef for flush
        preSpeechChunksRef.current.push(buf);
        if (preSpeechChunksRef.current.length > PRE_SPEECH_CHUNKS) {
          preSpeechChunksRef.current.shift();
        }
        return;
      }

      if (!deepgramReadyRef.current) {
        pendingChunksRef.current.push(buf);
        return;
      }

      ws.send(buf);
    },
    []
  );

  /** speech start handler — request Deepgram; buffer until deepgram_ready. */
  const handleSpeechStart = useCallback(() => {
    if (!lowPowerRef.current || vadFailedRef.current) return;
    if (hangoverTimerRef.current) {
      clearTimeout(hangoverTimerRef.current);
      hangoverTimerRef.current = null;
    }
    speechStreamingRef.current = true;
    deepgramReadyRef.current = false;
    sendWsJson({ type: "speech_start" });
    updateVadState();
  }, [sendWsJson, updateVadState]);

  /** speech end handler — keep streaming briefly, then suspend Deepgram. */
  const handleSpeechEnd = useCallback(() => {
    if (!lowPowerRef.current || vadFailedRef.current) return;
    if (hangoverTimerRef.current) clearTimeout(hangoverTimerRef.current);
    hangoverTimerRef.current = setTimeout(() => {
      speechStreamingRef.current = false;
      deepgramReadyRef.current = false;
      pendingChunksRef.current = [];
      sendWsJson({ type: "speech_end" });
      updateVadState();
    }, 1200);
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
    deepgramReadyRef.current = false;
    webmHeaderRef.current = null;
    preSpeechChunksRef.current = [];
    pendingChunksRef.current = [];
    rawRecordingChunksRef.current = [];
    setRecording(false);
    setWsStatus("idle");
    setVadState("idle");
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setWsStatus("connecting");
      vadFailedRef.current = false;
      webmHeaderRef.current = null;
      rawRecordingChunksRef.current = [];

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

      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        try {
          const msg = JSON.parse(event.data) as { type?: string };
          if (msg.type === "deepgram_ready") {
            deepgramReadyRef.current = true;
            if (lowPowerRef.current && !vadFailedRef.current) {
              flushBufferedAudio();
            }
            updateVadState();
          }
        } catch {
          // ignore non-JSON
        }
      };

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
        let gotHeader = false;

        recorder.ondataavailable = async (e) => {
          if (e.data.size === 0) return;
          rawRecordingChunksRef.current.push(e.data);
          const buf = await e.data.arrayBuffer();
          if (!gotHeader) {
            webmHeaderRef.current = buf;
            gotHeader = true;
            if (!lowPowerRef.current || vadFailedRef.current) {
              routeAudioChunk(buf);
            }
            return;
          }
          routeAudioChunk(buf);
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
    flushBufferedAudio,
    handleSpeechEnd,
    handleSpeechStart,
    routeAudioChunk,
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

  const getRawRecordingBlob = useCallback((): Blob | null => {
    if (rawRecordingChunksRef.current.length === 0) return null;
    const mime =
      mediaRecorderRef.current?.mimeType ||
      rawRecordingChunksRef.current[0]?.type ||
      "audio/webm";
    return new Blob(rawRecordingChunksRef.current, { type: mime });
  }, []);

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
    getRawRecordingBlob,
  };
}
