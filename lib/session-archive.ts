import { getSegments, getSession, updateSessionArchive } from "@/lib/supabase";
import { getPublicStorageUrl, uploadJson } from "@/lib/storage";
import { segmentsToRawTranscript } from "@/lib/transcript-format";
import type { TranscriptSegment } from "@/types";

export async function archiveSessionTranscript(sessionId: string): Promise<string | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const segments = await getSegments(sessionId, { includeAudio: false });
  if (segments.length === 0) return null;

  const payload = {
    session_id: sessionId,
    session_name: session.name,
    source_lang: session.source_lang,
    target_lang: session.target_lang,
    ended_at: session.ended_at ?? new Date().toISOString(),
    archived_at: new Date().toISOString(),
    segment_count: segments.length,
    raw_transcript: segmentsToRawTranscript(segments),
    segments: segments.map((s) => ({
      id: s.id,
      seq_no: s.seq_no,
      speaker_id: s.speaker_id,
      source_text: s.source_text,
      translated_text: s.translated_text,
      audio_storage_path: s.audio_storage_path,
      created_at: s.created_at,
    })),
  };

  const path = `archives/${sessionId}/transcript-${Date.now()}.json`;
  await uploadJson(path, payload);
  try {
    await updateSessionArchive(sessionId, { transcript_archive_path: path });
  } catch (err) {
    console.error("Could not save archive path on session (run migration 005):", err);
  }
  return path;
}

export function enrichSegmentsWithAudioUrl(
  segments: TranscriptSegment[]
): TranscriptSegment[] {
  return segments.map((seg) => {
    if (seg.audio_storage_path) {
      return {
        ...seg,
        audio_url: getPublicStorageUrl(seg.audio_storage_path),
        audio_base64: null,
      };
    }
    return seg;
  });
}
