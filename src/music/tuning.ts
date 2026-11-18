/** Equal temperament with A4 = 440 Hz; MIDI 69 denotes A4. */
export function frequencyForMidi(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
