export interface MicrophoneFrame {
  readonly samples: Float32Array<ArrayBuffer>;
  readonly sampleRate: number;
}

/** Owns microphone resources only. No connection to speakers and no recording. */
export class MicrophoneInput {
  private context?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private samples?: Float32Array<ArrayBuffer>;
  private generation = 0;

  constructor(private readonly onEnded: () => void) {}

  async start(): Promise<boolean> {
    this.stop();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Для микрофона открой сайт по HTTPS или через localhost на этом компьютере.');
    }
    const generation = this.generation;
    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    // Resume while still inside the click gesture, before the permission prompt.
    const resumed = context.resume();
    void resumed.catch(() => {});
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: { ideal: 1 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      }, video: false });
      if (generation !== this.generation) {
        stream.getTracks().forEach(track => track.stop());
        return false;
      }
      this.stream = stream;
      await resumed;
      if (generation !== this.generation) return false;
      const analyser = context.createAnalyser();
      analyser.fftSize = Math.min(32768, 2 ** Math.ceil(Math.log2(context.sampleRate * 0.08)));
      analyser.smoothingTimeConstant = 0;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      this.source = source;
      this.analyser = analyser;
      this.samples = new Float32Array(analyser.fftSize);
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
        if (generation === this.generation) this.onEnded();
      }, { once: true }));
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      this.stop();
      throw error;
    }
  }

  readFrame(): MicrophoneFrame | null {
    if (!this.context || this.context.state !== 'running' || !this.analyser || !this.samples) return null;
    this.analyser.getFloatTimeDomainData(this.samples);
    return { samples: this.samples, sampleRate: this.context.sampleRate };
  }

  stop(): void {
    this.generation++;
    this.stream?.getTracks().forEach(track => track.stop());
    this.source?.disconnect();
    this.analyser?.disconnect();
    if (this.context) void this.context.close().catch(() => {});
    this.stream = undefined;
    this.source = undefined;
    this.analyser = undefined;
    this.samples = undefined;
    this.context = undefined;
  }
}
