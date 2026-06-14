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
  raw_recording_path?: string | null;
  transcript_archive_path?: string | null;
}

export interface TranscriptSegment {
  id: string;
  session_id: string;
  seq_no: number;
  source_text: string;
  is_final: boolean;
  translated_text: string | null;
  audio_base64: string | null;
  audio_storage_path?: string | null;
  audio_url?: string | null;
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

export type TranscriptJobType = "session_polish" | "import_polish";
export type TranscriptJobStatus = "pending" | "processing" | "completed" | "failed";

export interface GlossaryTerm {
  id: string;
  source_term: string;
  target_term: string;
  source_lang: LangCode | "*";
  target_lang: LangCode | "*";
  notes: string | null;
  created_at: string;
}

export interface TranscriptJob {
  id: string;
  session_id: string | null;
  job_type: TranscriptJobType;
  status: TranscriptJobStatus;
  progress_percent: number;
  progress_message: string;
  source_lang: LangCode | null;
  target_lang: LangCode | null;
  input_text: string | null;
  result_text: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}
