export interface WaveSamples {
  readonly times: Float64Array;
  readonly components: readonly Float64Array[];
  readonly sum: Float64Array;
}

/** Unit amplitude per note, common zero phase. Time is in seconds. */
export function sampleWaves(frequencies: readonly number[], durationMs: number): WaveSamples {
  const duration = durationMs / 1000;
  // At least 32 samples per fastest cycle, independently of screen width.
  const intervals = Math.max(1200, Math.ceil(duration * Math.max(0, ...frequencies) * 32));
  const times = Float64Array.from({ length: intervals + 1 }, (_, i) => duration * i / intervals);
  const sum = new Float64Array(times.length);
  const components = frequencies.map(frequency => Float64Array.from(times, (time, i) => {
    const value = Math.sin(2 * Math.PI * frequency * time);
    sum[i] += value;
    return value;
  }));
  return { times, components, sum };
}
