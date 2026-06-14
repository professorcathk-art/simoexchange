import type { TranscriptSegment } from "@/types";

/** Merge DB segments with in-memory state — never wipe live transcript with an empty fetch. */
export function mergeSegments(
  existing: TranscriptSegment[],
  fromDb: TranscriptSegment[]
): TranscriptSegment[] {
  if (fromDb.length === 0 && existing.length > 0) {
    return existing;
  }

  const map = new Map<string, TranscriptSegment>();
  for (const seg of existing) {
    map.set(seg.id, seg);
  }
  for (const seg of fromDb) {
    const prev = map.get(seg.id);
    map.set(seg.id, {
      ...prev,
      ...seg,
      // Keep in-memory audio if DB stripped base64 but didn't store URL yet
      audio_base64: seg.audio_url ? null : (seg.audio_base64 ?? prev?.audio_base64 ?? null),
      audio_url: seg.audio_url ?? prev?.audio_url ?? null,
      translated_text: seg.translated_text ?? prev?.translated_text ?? null,
    });
  }

  return Array.from(map.values()).sort((a, b) => a.seq_no - b.seq_no);
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
