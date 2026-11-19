import { frequencyForMidi } from '../music/tuning';

const FADE_SECONDS = 0.02 / 3;
const MAX_AMPLITUDE = 0.25;

/** A single reference tone, tuned to exact semitones. Created only by explicit enable. */
export class ReferenceTonePlayer {
  private context?: AudioContext;
  private oscillator?: OscillatorNode;
  private gain?: GainNode;
  private note: number | null = null;
  private enabled = false;
  private volume = 0.2;
  private disposed = false;

  setNote(midi: number | null): void {
    if (this.disposed || this.note === midi) return;
    this.note = midi;
    if (this.context && this.oscillator && midi !== null) {
      // Keep the oscillator phase continuous, but change pitch without a portamento.
      this.oscillator.frequency.setValueAtTime(frequencyForMidi(midi), this.context.currentTime);
    }
    this.updateGain();
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.updateGain();
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (this.disposed) return;
    this.enabled = enabled;
    if (!this.context && !enabled) return;
    if (!this.context) this.initialize();
    this.updateGain();
    if (enabled && this.context!.state === 'suspended') await this.context!.resume();
  }

  dispose(): void {
    this.disposed = true;
    this.oscillator?.stop();
    if (this.context) void this.context.close().catch(() => {});
    this.oscillator = undefined;
    this.gain = undefined;
    this.context = undefined;
  }

  private initialize(): void {
    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(context.destination);
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequencyForMidi(this.note ?? 69);
    oscillator.connect(gain);
    oscillator.start(context.currentTime);
    this.oscillator = oscillator;
    this.gain = gain;
  }

  private updateGain(): void {
    if (!this.context || !this.gain) return;
    const amplitude = this.enabled && this.note !== null ? this.volume * MAX_AMPLITUDE : 0;
    this.gain.gain.setTargetAtTime(amplitude, this.context.currentTime, FADE_SECONDS);
  }
}
