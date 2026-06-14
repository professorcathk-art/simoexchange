import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Session, TranscriptSegment, GlossaryTerm, TranscriptJob } from "@/types";

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (supabaseInstance) return supabaseInstance;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  }

  supabaseInstance = createClient(url, key);
  return supabaseInstance;
}

const MIGRATION_004_HINT =
  "run supabase/migrations/004_glossary_and_transcript_jobs.sql";

function isMissingTableError(
  error: { code?: string; message?: string },
  table: string
): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    Boolean(error.message?.includes(table))
  );
}

function missingTableError(table: string): Error {
  return new Error(`${table} table missing — ${MIGRATION_004_HINT}`);
}

export async function listSessions(): Promise<Session[]> {
  const { data, error } = await getSupabase()
    .from("sessions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getSession(id: string): Promise<Session | null> {
  const { data, error } = await getSupabase()
    .from("sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function createSession(
  name: string,
  sourceLang: string,
  targetLang: string
): Promise<Session> {
  const { data, error } = await getSupabase()
    .from("sessions")
    .insert({
      name,
      source_lang: sourceLang,
      target_lang: targetLang,
      status: "waiting",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSession(id: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from("sessions")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) throw error;
  if (!data?.length) {
    throw new Error(
      "Session was not deleted. Run supabase/migrations/003_allow_delete_sessions.sql in the Supabase SQL Editor."
    );
  }
}

export async function updateSessionStatus(
  id: string,
  status: string
): Promise<Session> {
  const updates: Record<string, string> = { status };
  if (status === "ended") {
    updates.ended_at = new Date().toISOString();
  }

  const { data, error } = await getSupabase()
    .from("sessions")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getSegments(
  sessionId: string,
  options?: { includeAudio?: boolean }
): Promise<TranscriptSegment[]> {
  const includeAudio = options?.includeAudio ?? false;

  const { data, error } = await getSupabase()
    .from("transcript_segments")
    .select("*")
    .eq("session_id", sessionId)
    .order("seq_no", { ascending: true });

  if (error) throw error;
  const segments = (data ?? []) as TranscriptSegment[];
  if (includeAudio) return segments;
  return segments.map((s) => ({ ...s, audio_base64: null }));
}

export async function getNextSeqNo(sessionId: string): Promise<number> {
  const { data, error } = await getSupabase()
    .from("transcript_segments")
    .select("seq_no")
    .eq("session_id", sessionId)
    .order("seq_no", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data && data.length > 0 ? data[0].seq_no + 1 : 1;
}

export async function insertSegment(
  sessionId: string,
  seqNo: number,
  sourceText: string,
  speakerId: number | null = null
): Promise<TranscriptSegment> {
  const { data, error } = await getSupabase()
    .from("transcript_segments")
    .insert({
      session_id: sessionId,
      seq_no: seqNo,
      source_text: sourceText,
      is_final: true,
      speaker_id: speakerId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSegmentTranslation(
  segmentId: string,
  translatedText: string,
  audioBase64: string | null,
  audioStoragePath: string | null = null
): Promise<TranscriptSegment> {
  const updates: Record<string, string | null> = {
    translated_text: translatedText,
    audio_storage_path: audioStoragePath,
  };
  // Keep DB lean — store TTS in storage, not base64 column
  if (!audioStoragePath) {
    updates.audio_base64 = audioBase64;
  } else {
    updates.audio_base64 = null;
  }

  const { data, error } = await getSupabase()
    .from("transcript_segments")
    .update(updates)
    .eq("id", segmentId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSessionRecording(
  sessionId: string,
  rawRecordingPath: string
): Promise<Session> {
  const { data, error } = await getSupabase()
    .from("sessions")
    .update({ raw_recording_path: rawRecordingPath })
    .eq("id", sessionId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSessionArchive(
  sessionId: string,
  fields: { transcript_archive_path?: string; raw_recording_path?: string }
): Promise<Session> {
  const { data, error } = await getSupabase()
    .from("sessions")
    .update(fields)
    .eq("id", sessionId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getGlossaryTerms(
  sourceLang?: string,
  targetLang?: string
): Promise<GlossaryTerm[]> {
  const { data, error } = await getSupabase()
    .from("glossary_terms")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error, "glossary_terms")) {
      throw missingTableError("glossary_terms");
    }
    throw error;
  }

  const terms = (data ?? []) as GlossaryTerm[];
  if (!sourceLang && !targetLang) return terms;

  return terms.filter((t) => {
    const srcOk = t.source_lang === "*" || !sourceLang || t.source_lang === sourceLang;
    const tgtOk = t.target_lang === "*" || !targetLang || t.target_lang === targetLang;
    return srcOk && tgtOk;
  });
}

export async function createGlossaryTerm(
  sourceTerm: string,
  targetTerm: string,
  sourceLang: string,
  targetLang: string,
  notes?: string
): Promise<GlossaryTerm> {
  const { data, error } = await getSupabase()
    .from("glossary_terms")
    .insert({
      source_term: sourceTerm,
      target_term: targetTerm,
      source_lang: sourceLang,
      target_lang: targetLang,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) {
    if (isMissingTableError(error, "glossary_terms")) {
      throw missingTableError("glossary_terms");
    }
    throw error;
  }
  return data;
}

export async function deleteGlossaryTerm(id: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from("glossary_terms")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) throw error;
  if (!data?.length) throw new Error("Glossary term not found");
}

export async function createTranscriptJob(
  job: {
    session_id: string | null;
    job_type: TranscriptJob["job_type"];
    status: TranscriptJob["status"];
    progress_percent: number;
    progress_message: string;
    source_lang: TranscriptJob["source_lang"];
    target_lang: TranscriptJob["target_lang"];
    input_text: string | null;
    result_text?: string | null;
    error_message?: string | null;
    completed_at?: string | null;
  }
): Promise<TranscriptJob> {
  const { data, error } = await getSupabase()
    .from("transcript_jobs")
    .insert({
      session_id: job.session_id,
      job_type: job.job_type,
      status: job.status,
      progress_percent: job.progress_percent,
      progress_message: job.progress_message,
      source_lang: job.source_lang,
      target_lang: job.target_lang,
      input_text: job.input_text,
      result_text: job.result_text ?? null,
      error_message: job.error_message ?? null,
      completed_at: job.completed_at ?? null,
    })
    .select()
    .single();

  if (error) {
    if (isMissingTableError(error, "transcript_jobs")) {
      throw missingTableError("transcript_jobs");
    }
    throw error;
  }
  return data;
}

export async function getTranscriptJob(id: string): Promise<TranscriptJob | null> {
  const { data, error } = await getSupabase()
    .from("transcript_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    if (isMissingTableError(error, "transcript_jobs")) {
      throw missingTableError("transcript_jobs");
    }
    throw error;
  }
  return data;
}

export async function getLatestSessionTranscriptJob(
  sessionId: string
): Promise<TranscriptJob | null> {
  const { data, error } = await getSupabase()
    .from("transcript_jobs")
    .select("*")
    .eq("session_id", sessionId)
    .eq("job_type", "session_polish")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error, "transcript_jobs")) {
      throw missingTableError("transcript_jobs");
    }
    throw error;
  }
  return data;
}

export async function updateTranscriptJob(
  id: string,
  updates: Partial<
    Pick<
      TranscriptJob,
      | "status"
      | "progress_percent"
      | "progress_message"
      | "result_text"
      | "error_message"
      | "completed_at"
    >
  >
): Promise<TranscriptJob> {
  const { data, error } = await getSupabase()
    .from("transcript_jobs")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (isMissingTableError(error, "transcript_jobs")) {
      throw missingTableError("transcript_jobs");
    }
    throw error;
  }
  return data;
}
