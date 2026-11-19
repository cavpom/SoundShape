export interface Note {
  readonly midi: number;
  readonly name: string;
  readonly octave: number;
  readonly black: boolean;
}

const names = ['До', 'До♯', 'Ре', 'Ре♯', 'Ми', 'Фа', 'Фа♯', 'Соль', 'Соль♯', 'Ля', 'Ля♯', 'Си'];
const blackKeys = new Set([1, 3, 6, 8, 10]);

function createNoteRange(firstMidi: number, lastMidi: number): readonly Note[] {
  return Array.from({ length: lastMidi - firstMidi + 1 }, (_, index) => {
    const midi = firstMidi + index;
    return { midi, name: names[midi % 12], octave: Math.floor(midi / 12) - 1, black: blackKeys.has(midi % 12) };
  });
}

// MIDI is the stable identity, independent of labels.
export const pianoNotes = createNoteRange(60, 83); // C4–B5: two complete octaves.
export const timbreNotes = createNoteRange(45, 83); // A2 (110 Hz)–B5.
export const tunerNotes = createNoteRange(36, 84); // C2–C6.

export function noteLabel(note: Note): string {
  return `${note.name}${note.octave}`;
}
