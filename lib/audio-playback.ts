/** Convert base64 MP3 to a Blob URL (more reliable than data: URLs on mobile). */
export function base64ToBlobUrl(base64: string, mime = "audio/mpeg"): string {
  const cleaned = base64.replace(/\s/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

export const SILENT_MP3_DATA_URL =
  "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+1DEAAAHAAGf9AAAIgAANIAAAAQAAAaEAAAAA";

/** Prepare element for iOS inline playback (must NOT use display:none). */
export function prepareMobileAudioElement(audio: HTMLAudioElement): void {
  audio.setAttribute("playsinline", "true");
  audio.setAttribute("webkit-playsinline", "true");
  audio.preload = "auto";
}

/**
 * Unlock audio during a user gesture. play() is invoked synchronously —
 * required for iOS Safari.
 */
export function unlockWithAudioElement(audio: HTMLAudioElement): Promise<void> {
  prepareMobileAudioElement(audio);
  audio.src = SILENT_MP3_DATA_URL;
  audio.volume = 0.01;
  const promise = audio.play();
  if (!promise) return Promise.resolve();
  return promise.then(() => {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1;
  });
}

/** Fallback when HTMLAudioElement.play() is blocked. */
export function unlockWithAudioContext(): Promise<void> {
  const ctx = new AudioContext();
  return ctx.resume().then(() => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    osc.stop(ctx.currentTime + 0.01);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        void ctx.close();
        resolve();
      }, 50);
    });
  });
}
