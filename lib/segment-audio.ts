export function resolveSegmentAudioSrc(segment: {
  audio_base64?: string | null;
  audio_url?: string | null;
}): string | null {
  if (segment.audio_url) return segment.audio_url;
  if (segment.audio_base64) return segment.audio_base64;
  return null;
}

export function toAudioPlaySrc(src: string): string {
  if (src.startsWith("http") || src.startsWith("data:")) return src;
  return `data:audio/mp3;base64,${src}`;
}
