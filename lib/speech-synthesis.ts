import type { LangCode } from "@/types";

export const SPEECH_LANG: Record<LangCode, string> = {
  en: "en-US",
  zh: "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
};

const SKIP_TEXT = new Set(["", "Translating...", "[Translation unavailable]"]);

export function isSpeakableText(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim();
  return t.length > 0 && !SKIP_TEXT.has(t);
}

/** Prime speech inside a user gesture (required on iOS Safari). */
export function primeSpeechInGesture(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(".");
  u.volume = 0.01;
  u.rate = 2;
  window.speechSynthesis.speak(u);
}

export class SpeechQueue {
  private queue: string[] = [];
  private speaking = false;
  private enabled = false;
  private lang: string;

  constructor(langCode: LangCode) {
    this.lang = SPEECH_LANG[langCode] ?? "en-US";
  }

  setLanguage(langCode: LangCode): void {
    this.lang = SPEECH_LANG[langCode] ?? "en-US";
  }

  enable(): void {
    this.enabled = true;
    this.drain();
  }

  enqueue(text: string): void {
    if (!isSpeakableText(text)) return;
    this.queue.push(text.trim());
    this.drain();
  }

  /** Immediate replay — call from a tap handler. */
  replay(text: string): void {
    if (!isSpeakableText(text) || typeof window === "undefined") return;
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    this.speaking = false;
    this.queue = [];
    this.enabled = true;

    const u = new SpeechSynthesisUtterance(text.trim());
    u.lang = this.lang;
    this.speaking = true;
    u.onend = () => {
      this.speaking = false;
    };
    u.onerror = () => {
      this.speaking = false;
    };
    window.speechSynthesis.speak(u);
  }

  stop(): void {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.speaking = false;
    this.queue = [];
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  private drain(): void {
    if (!this.enabled || this.speaking || this.queue.length === 0) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const text = this.queue.shift()!;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = this.lang;
    this.speaking = true;

    u.onend = () => {
      this.speaking = false;
      this.drain();
    };
    u.onerror = () => {
      this.speaking = false;
      this.drain();
    };

    window.speechSynthesis.speak(u);
  }
}
