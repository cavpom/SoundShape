export interface Note {
  readonly midi: number;
  readonly name: string;
  readonly octave: number;
  readonly black: boolean;
}

const names = ['До', 'До♯', 'Ре', 'Ре♯', 'Ми', 'Фа', 'Фа♯', 'Соль', 'Соль♯', 'Ля', 'Ля♯', 'Си'];
const blackKeys = new Set([1, 3, 6, 8, 10]);

// Two full octaves, C4–B5. MIDI is the stable identity, independent of labels.
export const pianoNotes: readonly Note[] = Array.from({ length: 24 }, (_, index) => {
  const midi = 60 + index;
  return { midi, name: names[midi % 12], octave: Math.floor(midi / 12) - 1, black: blackKeys.has(midi % 12) };
});

export function noteLabel(note: Note): string {
  return `${note.name}${note.octave}`;
}
