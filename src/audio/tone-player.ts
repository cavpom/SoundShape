import { frequencyForMidi } from '../music/tuning';

const FADE_SECONDS = 0.02;

/** A fixed oscillator bank keeps note amplitudes and phase origin independent of selection order. */
export class TonePlayer {
  private context?: AudioContext;
  private master?: GainNode;
  private readonly voices = new Map<number, { oscillator: OscillatorNode; gate: GainNode }>();
  private volume = 0.35;
  private muted = false;
  private disposed = false;

  constructor(private readonly midiNotes: readonly number[]) {}

  async setNotes(selected: readonly number[]): Promise<void> {
    if (this.disposed) return;
    if (!this.context && selected.length === 0) return;
    if (!this.context) this.initialize();
    const context = this.context!;
    const selection = new Set(selected);
    for (const [midi, voice] of this.voices) {
      voice.gate.gain.setTargetAtTime(selection.has(midi) ? 1 / this.midiNotes.length : 0, context.currentTime, FADE_SECONDS / 3);
    }
    // Called directly from the user's click, including the first activation.
    if (context.state === 'suspended') await context.resume();
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.updateMaster();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.updateMaster();
  }

  dispose(): void {
    this.disposed = true;
    for (const { oscillator } of this.voices.values()) oscillator.stop();
    this.voices.clear();
    if (this.context) void this.context.close().catch(() => {});
    this.context = undefined;
    this.master = undefined;
  }

  private initialize(): void {
    const context = new AudioContext();
    this.context = context;
    const master = context.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    master.connect(context.destination);
    this.master = master;
    const startTime = context.currentTime;
    for (const midi of this.midiNotes) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequencyForMidi(midi);
      const gate = context.createGain();
      gate.gain.value = 0;
      oscillator.connect(gate);
      gate.connect(master);
      oscillator.start(startTime);
      this.voices.set(midi, { oscillator, gate });
    }
  }

  private updateMaster(): void {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, FADE_SECONDS / 3);
  }
}
