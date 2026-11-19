import { frequencyForMidi } from './tuning';

export interface PitchEstimate {
  readonly frequency: number;
  readonly confidence: number;
}

export interface PitchReading {
  readonly frequency: number;
  readonly midi: number;
  readonly cents: number;
}

/** RMS after removing DC; dBFS is relative to digital full scale, not sound pressure. */
export function levelDbfs(samples: Float32Array): number {
  if (samples.length === 0) return -120;
  let mean = 0;
  for (const sample of samples) mean += sample;
  mean /= samples.length;
  let energy = 0;
  for (const sample of samples) energy += (sample - mean) ** 2;
  return Math.max(-120, 10 * Math.log10(energy / samples.length || 1e-12));
}

/** YIN difference function, cumulative normalization, first trough, parabolic refinement. */
export function estimatePitch(samples: Float32Array, sampleRate: number, minFrequency = 55, maxFrequency = 1200): PitchEstimate | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || samples.length < 8) return null;
  const windowSize = Math.floor(samples.length / 2);
  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const maxLag = Math.min(windowSize - 2, Math.ceil(sampleRate / minFrequency));
  if (minLag >= maxLag) return null;
  const normalized = new Float64Array(maxLag + 2);
  normalized[0] = 1;
  let cumulative = 0;
  for (let lag = 1; lag <= maxLag + 1; lag++) {
    let difference = 0;
    for (let i = 0; i < windowSize; i++) {
      const delta = samples[i] - samples[i + lag];
      difference += delta * delta;
    }
    cumulative += difference;
    normalized[lag] = cumulative > 0 ? difference * lag / cumulative : 1;
  }
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (normalized[lag] >= 0.15) continue;
    while (lag < maxLag && normalized[lag + 1] < normalized[lag]) lag++;
    const left = normalized[lag - 1], middle = normalized[lag], right = normalized[lag + 1];
    const curvature = left - 2 * middle + right;
    const correction = Math.abs(curvature) > 1e-12 ? Math.max(-1, Math.min(1, (left - right) / (2 * curvature))) : 0;
    const frequency = sampleRate / (lag + correction);
    if (!Number.isFinite(frequency) || frequency < minFrequency || frequency > maxFrequency) return null;
    return { frequency, confidence: Math.max(0, Math.min(1, 1 - middle)) };
  }
  return null;
}

export function pitchFromFrequency(frequency: number): PitchReading {
  if (!Number.isFinite(frequency) || frequency <= 0) throw new RangeError('Frequency must be positive');
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  return { frequency, midi, cents: 1200 * Math.log2(frequency / frequencyForMidi(midi)) };
}

/** Reject brief note changes, median-filter three frames, release after a short dropout. */
export class PitchTracker {
  private history: number[] = [];
  private candidate?: number;
  private candidateSince = 0;
  private lastValid = -Infinity;
  private lastReading = -Infinity;
  private reading: PitchReading | null = null;

  reset(): void {
    this.history = [];
    this.candidate = undefined;
    this.lastValid = -Infinity;
    this.lastReading = -Infinity;
    this.reading = null;
  }

  update(estimate: PitchEstimate | null, nowMs: number): PitchReading | null {
    if (!estimate || !Number.isFinite(estimate.confidence) || estimate.confidence < 0.85 || !Number.isFinite(estimate.frequency) || estimate.frequency <= 0) {
      this.history = [];
      this.candidate = undefined;
      if (nowMs - this.lastValid >= 160) this.reading = null;
      return this.reading;
    }
    this.lastValid = nowMs;
    const previous = this.history.at(-1);
    if (previous && Math.abs(12 * Math.log2(estimate.frequency / previous)) > 1) this.history = [];
    this.history.push(estimate.frequency);
    if (this.history.length > 3) this.history.shift();
    const ordered = [...this.history].sort((a, b) => a - b);
    const pitch = pitchFromFrequency(ordered[Math.floor(ordered.length / 2)]);
    if (this.candidate !== pitch.midi) {
      this.candidate = pitch.midi;
      this.candidateSince = nowMs;
    }
    if (this.reading?.midi === pitch.midi || nowMs - this.candidateSince >= 180) {
      this.reading = pitch;
      this.lastReading = nowMs;
    } else if (nowMs - this.lastReading > 260) {
      this.reading = null;
    }
    return this.reading;
  }
}
