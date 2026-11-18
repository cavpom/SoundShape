import { HARMONIC_COUNT } from '../music/harmonics';
import type { WaveComponent } from '../music/waves';

const SMOOTH_SECONDS = 0.02 / 3;

/** Ten phase-coherent sine oscillators; no normalization based on selected amplitudes. */
export class HarmonicPlayer {
  private context?: AudioContext;
  private master?: GainNode;
  private readonly voices: { oscillator: OscillatorNode; gain: GainNode }[] = [];
  private playing = false;
  private volume = 0.35;
  private disposed = false;
  private spectrum: readonly WaveComponent[];

  constructor(spectrum: readonly WaveComponent[]) {
    this.spectrum = [...spectrum];
  }

  setSpectrum(spectrum: readonly WaveComponent[]): void {
    this.spectrum = [...spectrum];
    if (!this.context) return;
    const now = this.context.currentTime;
    this.voices.forEach((voice, index) => {
      const component = this.spectrum[index];
      voice.oscillator.frequency.setTargetAtTime(component.frequency, now, SMOOTH_SECONDS);
      voice.gain.gain.setTargetAtTime(component.amplitude / HARMONIC_COUNT, now, SMOOTH_SECONDS);
    });
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.updateMaster();
  }

  async setPlaying(playing: boolean): Promise<void> {
    if (this.disposed) return;
    this.playing = playing;
    if (!this.context && !playing) return;
    if (!this.context) this.initialize();
    this.updateMaster();
    if (playing && this.context!.state === 'suspended') await this.context!.resume();
  }

  dispose(): void {
    this.disposed = true;
    for (const { oscillator } of this.voices) oscillator.stop();
    this.voices.length = 0;
    if (this.context) void this.context.close().catch(() => {});
    this.context = undefined;
    this.master = undefined;
  }

  private initialize(): void {
    const context = new AudioContext();
    this.context = context;
    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    this.master = master;
    const startTime = context.currentTime;
    for (const component of this.spectrum) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = component.frequency;
      const gain = context.createGain();
      gain.gain.value = component.amplitude / HARMONIC_COUNT;
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(startTime);
      this.voices.push({ oscillator, gain });
    }
  }

  private updateMaster(): void {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(this.playing ? this.volume : 0, this.context.currentTime, SMOOTH_SECONDS);
  }
}
