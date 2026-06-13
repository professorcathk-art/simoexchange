import type { VadUiState } from "@/lib/audio-ws-protocol";

const STATE_LABELS: Record<VadUiState, string> = {
  idle: "Idle",
  listening: "Listening",
  speech_detected: "Speech detected",
  deepgram_active: "Deepgram active",
};

const STATE_COLORS: Record<VadUiState, string> = {
  idle: "text-gray-500 border-gray-500/30 bg-gray-500/10",
  listening: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  speech_detected: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  deepgram_active: "text-green-400 border-green-500/30 bg-green-500/10",
};

export default function VadStateIndicator({ state }: { state: VadUiState }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${STATE_COLORS[state]}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          state === "deepgram_active"
            ? "animate-pulse bg-green-400"
            : state === "speech_detected"
              ? "animate-pulse bg-yellow-400"
              : state === "listening"
                ? "bg-blue-400"
                : "bg-gray-500"
        }`}
      />
      {STATE_LABELS[state]}
    </div>
  );
}
