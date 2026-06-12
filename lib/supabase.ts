import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Session, TranscriptSegment } from "@/types";

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

export async function getSegments(sessionId: string): Promise<TranscriptSegment[]> {
  const { data, error } = await getSupabase()
    .from("transcript_segments")
    .select("*")
    .eq("session_id", sessionId)
    .order("seq_no", { ascending: true });

  if (error) throw error;
  return data ?? [];
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
  sourceText: string
): Promise<TranscriptSegment> {
  const { data, error } = await getSupabase()
    .from("transcript_segments")
    .insert({
      session_id: sessionId,
      seq_no: seqNo,
      source_text: sourceText,
      is_final: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSegmentTranslation(
  segmentId: string,
  translatedText: string,
  audioBase64: string | null
): Promise<TranscriptSegment> {
  const { data, error } = await getSupabase()
    .from("transcript_segments")
    .update({
      translated_text: translatedText,
      audio_base64: audioBase64,
    })
    .eq("id", segmentId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
