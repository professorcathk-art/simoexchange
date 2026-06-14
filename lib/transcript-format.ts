import type { TranscriptSegment } from "@/types";
import { getSpeakerLabel } from "@/lib/speakers";

export function segmentsToRawTranscript(segments: TranscriptSegment[]): string {
  const sorted = [...segments].sort((a, b) => a.seq_no - b.seq_no);
  return sorted
    .map((seg) => {
      const speaker = getSpeakerLabel(seg.speaker_id);
      const src = seg.source_text.trim();
      const tr = seg.translated_text?.trim();
      if (tr && tr !== "Translating..." && tr !== "[Translation unavailable]") {
        return `[${speaker}] ${src}\n[${speaker} — translated] ${tr}`;
      }
      return `[${speaker}] ${src}`;
    })
    .join("\n\n");
}

export function plainTextToStructuredInput(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

export function estimateChunkCount(text: string, chunkSize = 10_000): number {
  return Math.max(1, Math.ceil(text.length / chunkSize));
}

export function splitIntoChunks(text: string, chunkSize = 10_000): string[] {
  if (text.length <= chunkSize) return [text];

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > chunkSize && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}
