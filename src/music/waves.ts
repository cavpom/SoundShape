export interface WaveComponent {
  readonly frequency: number;
  readonly amplitude: number;
}

export interface WaveSamples {
  readonly times: Float64Array;
  readonly components: readonly Float64Array[];
  readonly sum: Float64Array;
}

/** Common zero phase; amplitude is in units of A, time in seconds. */
export function sampleWaves(waves: readonly WaveComponent[], durationMs: number): WaveSamples {
  const duration = durationMs / 1000;
  const highestFrequency = Math.max(0, ...waves.map(wave => wave.frequency));
  // At least 32 samples per fastest cycle, independently of screen width.
  const intervals = Math.max(1200, Math.ceil(duration * highestFrequency * 32));
  const times = Float64Array.from({ length: intervals + 1 }, (_, i) => duration * i / intervals);
  const sum = new Float64Array(times.length);
  const components = waves.map(wave => Float64Array.from(times, (time, i) => {
    const value = wave.amplitude * Math.sin(2 * Math.PI * wave.frequency * time);
    sum[i] += value;
    return value;
  }));
  return { times, components, sum };
}
