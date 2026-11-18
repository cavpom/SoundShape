import type { WaveComponent } from './waves';

export const HARMONIC_COUNT = 10;

export function initialAmplitudes(): number[] {
  return Array.from({ length: HARMONIC_COUNT }, (_, index) => index === 0 ? 1 : 0);
}

export function createHarmonics(fundamental: number, amplitudes: readonly number[]): readonly WaveComponent[] {
  if (!Number.isFinite(fundamental) || fundamental <= 0) throw new RangeError('Invalid fundamental frequency');
  if (amplitudes.length !== HARMONIC_COUNT) throw new RangeError('Expected ten harmonic amplitudes');
  return amplitudes.map((amplitude, index) => {
    if (!Number.isFinite(amplitude) || amplitude < 0 || amplitude > 1) throw new RangeError('Amplitude must be between zero and one');
    return { frequency: fundamental * (index + 1), amplitude };
  });
}
