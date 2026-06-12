"use client";

import type { TranscriptSegment as Segment } from "@/types";

interface TranscriptSegmentProps {
  segment: Segment;
  showPlayButton?: boolean;
  onPlay?: (audioBase64: string) => void;
  variant?: "host" | "listener";
}

export default function TranscriptSegment({
  segment,
  showPlayButton = false,
  onPlay,
  variant = "listener",
}: TranscriptSegmentProps) {
  if (variant === "host") {
    return (
      <div className="rounded-lg border border-white/5 bg-white/5 p-3">
        <p className="text-sm text-gray-300">{segment.source_text}</p>
        {segment.translated_text && (
          <div className="mt-2 flex items-start justify-between gap-2">
            <p className="text-sm text-accent">{segment.translated_text}</p>
            {showPlayButton && segment.audio_base64 && onPlay && (
              <button
                onClick={() => onPlay(segment.audio_base64!)}
                className="shrink-0 rounded p-1 text-accent hover:bg-accent/10"
                aria-label="Play audio"
              >
                ▶
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/5 bg-card/50 p-4">
      <p className="mb-1 text-sm text-gray-500">{segment.source_text}</p>
      <p className="text-xl text-white">
        {segment.translated_text || "Translating..."}
      </p>
    </div>
  );
}
