export type LangCode = "en" | "zh" | "ja" | "ko";
export type SessionStatus = "waiting" | "live" | "ended";

export interface Session {
  id: string;
  name: string;
  source_lang: LangCode;
  target_lang: LangCode;
  status: SessionStatus;
  created_at: string;
  ended_at: string | null;
}

export interface TranscriptSegment {
  id: string;
  session_id: string;
  seq_no: number;
  source_text: string;
  is_final: boolean;
  translated_text: string | null;
  audio_base64: string | null;
  speaker_id: number | null;
  created_at: string;
}

export interface SegmentUpdateEvent {
  sessionId: string;
  segmentId: string;
  sourceText: string;
  translatedText: string;
  audioBase64: string | null;
  seqNo: number;
  speakerId: number | null;
}

export interface TranscriptInterimEvent {
  sessionId: string;
  text: string;
  seqNo: number;
  speakerId: number | null;
}

export interface TranscriptFinalEvent {
  sessionId: string;
  text: string;
  seqNo: number;
  segmentId: string;
  speakerId: number | null;
}

export interface SessionStatusEvent {
  sessionId: string;
  status: SessionStatus;
}
