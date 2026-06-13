export const SPEAKER_COLORS = [
  { border: "border-cyan-500/30", bg: "bg-cyan-500/10", text: "text-cyan-400" },
  { border: "border-orange-500/30", bg: "bg-orange-500/10", text: "text-orange-400" },
  { border: "border-purple-500/30", bg: "bg-purple-500/10", text: "text-purple-400" },
  { border: "border-green-500/30", bg: "bg-green-500/10", text: "text-green-400" },
  { border: "border-pink-500/30", bg: "bg-pink-500/10", text: "text-pink-400" },
  { border: "border-yellow-500/30", bg: "bg-yellow-500/10", text: "text-yellow-400" },
];

export function getSpeakerStyle(speakerId: number | null | undefined) {
  if (speakerId == null) {
    return { border: "border-white/10", bg: "bg-white/5", text: "text-gray-400" };
  }
  return SPEAKER_COLORS[speakerId % SPEAKER_COLORS.length];
}

export function getSpeakerLabel(speakerId: number | null | undefined): string {
  if (speakerId == null) return "Speaker";
  return `Speaker ${speakerId + 1}`;
}

export function getDominantSpeaker(
  words: { speaker?: number }[]
): number | null {
  const counts = new Map<number, number>();
  for (const word of words) {
    if (word.speaker !== undefined) {
      counts.set(word.speaker, (counts.get(word.speaker) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;
  const entries = Array.from(counts.entries());
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}
