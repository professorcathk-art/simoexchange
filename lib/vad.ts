/**
 * Lightweight RMS/energy-based voice activity detection.
 * Falls back safely: caller should disable low-power mode if init fails.
 */

export type VadCallback = () => void;

export interface EnergyVADOptions {
  /** RMS above this => likely speech (default 0.018) */
  speechThreshold?: number;
  /** RMS below this => likely silence (default 0.008) */
  silenceThreshold?: number;
  /** Minimum sustained speech before firing start (default 280ms) */
  minSpeechMs?: number;
  /** Silence duration before speech end + hangover (default 600ms) */
  silenceHangoverMs?: number;
  /** Extra tail after speech end before callback (default 500ms) */
  speechEndDelayMs?: number;
  /** Poll interval (default 50ms) */
  pollIntervalMs?: number;
}

export class EnergyVAD {
  private audioContext: AudioContext;
  private analyser: AnalyserNode;
  private source: MediaStreamAudioSourceNode;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private speechEndTimer: ReturnType<typeof setTimeout> | null = null;

  private speechThreshold: number;
  private silenceThreshold: number;
  private minSpeechMs: number;
  private silenceHangoverMs: number;
  private speechEndDelayMs: number;

  private isSpeaking = false;
  private speechCandidateSince: number | null = null;
  private silenceSince: number | null = null;

  onSpeechStart?: VadCallback;
  onSpeechEnd?: VadCallback;

  private constructor(
    audioContext: AudioContext,
    analyser: AnalyserNode,
    source: MediaStreamAudioSourceNode,
    options: EnergyVADOptions
  ) {
    this.audioContext = audioContext;
    this.analyser = analyser;
    this.source = source;
    this.speechThreshold = options.speechThreshold ?? 0.01;
    this.silenceThreshold = options.silenceThreshold ?? 0.004;
    this.minSpeechMs = options.minSpeechMs ?? 180;
    this.silenceHangoverMs = options.silenceHangoverMs ?? 800;
    this.speechEndDelayMs = options.speechEndDelayMs ?? 700;
  }

  /** VAD init — wire AnalyserNode to the mic stream and start polling. */
  static async create(
    stream: MediaStream,
    options: EnergyVADOptions = {}
  ): Promise<EnergyVAD> {
    const audioContext = new AudioContext();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.85;
    source.connect(analyser);
    return new EnergyVAD(audioContext, analyser, source, options);
  }

  start(pollIntervalMs = 50): void {
    const buffer = new Float32Array(this.analyser.fftSize);
    this.pollTimer = setInterval(() => {
      this.analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
      const rms = Math.sqrt(sum / buffer.length);
      this.processRms(rms);
    }, pollIntervalMs);
  }

  private processRms(rms: number): void {
    const now = Date.now();

    if (!this.isSpeaking) {
      if (rms >= this.speechThreshold) {
        if (this.speechCandidateSince === null) {
          this.speechCandidateSince = now;
        } else if (now - this.speechCandidateSince >= this.minSpeechMs) {
          // speech start handler
          this.isSpeaking = true;
          this.speechCandidateSince = null;
          this.silenceSince = null;
          if (this.speechEndTimer) {
            clearTimeout(this.speechEndTimer);
            this.speechEndTimer = null;
          }
          this.onSpeechStart?.();
        }
      } else {
        this.speechCandidateSince = null;
      }
      return;
    }

    if (rms <= this.silenceThreshold) {
      if (this.silenceSince === null) this.silenceSince = now;
      if (
        now - this.silenceSince >= this.silenceHangoverMs &&
        !this.speechEndTimer
      ) {
        // speech end handler (debounced tail)
        this.speechEndTimer = setTimeout(() => {
          this.isSpeaking = false;
          this.silenceSince = null;
          this.speechCandidateSince = null;
          this.speechEndTimer = null;
          this.onSpeechEnd?.();
        }, this.speechEndDelayMs);
      }
    } else {
      this.silenceSince = null;
      if (this.speechEndTimer) {
        clearTimeout(this.speechEndTimer);
        this.speechEndTimer = null;
      }
    }
  }

  get speaking(): boolean {
    return this.isSpeaking;
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.speechEndTimer) clearTimeout(this.speechEndTimer);
    this.pollTimer = null;
    this.speechEndTimer = null;
    try {
      this.source.disconnect();
      this.analyser.disconnect();
      void this.audioContext.close();
    } catch {
      // ignore teardown errors
    }
  }
}
