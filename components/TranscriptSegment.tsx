"use client";

import type { TranscriptSegment as Segment } from "@/types";
import { getSpeakerLabel, getSpeakerStyle } from "@/lib/speakers";

interface TranscriptSegmentProps {
  segment: Segment;
  showPlayButton?: boolean;
  onPlay?: (audioBase64: string) => void;
  variant?: "host" | "listener";
}

function SpeakerBadge({ speakerId }: { speakerId: number | null | undefined }) {
  const style = getSpeakerStyle(speakerId);
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${style.border} ${style.bg} ${style.text}`}
    >
      {getSpeakerLabel(speakerId)}
    </span>
  );
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
        <div className="mb-1">
          <SpeakerBadge speakerId={segment.speaker_id} />
        </div>
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

  const style = getSpeakerStyle(segment.speaker_id);

  return (
    <div className={`rounded-xl border p-4 ${style.border} ${style.bg}`}>
      <div className="mb-2">
        <SpeakerBadge speakerId={segment.speaker_id} />
      </div>
      <p className="mb-1 text-sm text-gray-500">{segment.source_text}</p>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xl text-white">
          {segment.translated_text || "Translating..."}
        </p>
        {showPlayButton && onPlay && (
          <button
            type="button"
            onClick={() => onPlay(segment.translated_text ?? segment.audio_base64 ?? "")}
            className="shrink-0 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent active:scale-95"
            aria-label="Replay translation speech"
          >
            ▶
          </button>
        )}
      </div>
    </div>
  );
}

export function InterimTranscript({
  text,
  speakerId,
}: {
  text: string;
  speakerId?: number | null;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-card/30 p-4">
      {speakerId != null && (
        <div className="mb-1">
          <SpeakerBadge speakerId={speakerId} />
        </div>
      )}
      <p className="text-sm text-gray-500">{text}</p>
      <p className="mt-1 text-lg text-gray-600">...</p>
    </div>
  );
}
