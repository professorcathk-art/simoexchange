export type VadUiState = "idle" | "listening" | "speech_detected" | "deepgram_active";

export interface AudioWsConfig {
  type: "config";
  lowPowerMode: boolean;
}

export interface AudioWsSpeechStart {
  type: "speech_start";
}

export interface AudioWsSpeechEnd {
  type: "speech_end";
}

export interface AudioWsDeepgramReady {
  type: "deepgram_ready";
}

export type AudioWsControl =
  | AudioWsConfig
  | AudioWsSpeechStart
  | AudioWsSpeechEnd;

export type AudioWsServerMessage = AudioWsDeepgramReady;

export interface ApiUsageStats {
  deepgramActiveSec: number;
  deepgramSessions: number;
  translations: number;
  translationChars: number;
  ttsRequests: number;
  ttsChars: number;
}

export function parseControlMessage(raw: string): AudioWsControl | null {
  if (raw.length > 256) return null;
  try {
    const msg = JSON.parse(raw) as AudioWsControl;
    if (
      msg?.type === "config" ||
      msg?.type === "speech_start" ||
      msg?.type === "speech_end"
    ) {
      return msg;
    }
  } catch {
    // not JSON control
  }
  return null;
}
