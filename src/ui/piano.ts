import { noteLabel, type Note } from '../music/notes';

export interface Piano {
  element: HTMLElement;
  clear(): void;
}

export function createPiano(notes: readonly Note[], onChange: (selected: readonly Note[]) => void): Piano {
  const element = document.createElement('div');
  element.className = 'piano';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', 'Клавиатура: от До4 до Си5');
  const selected = new Set<number>();
  const buttons = new Map<number, HTMLButtonElement>();
  let whiteIndex = 0;

  function update(): void {
    for (const [midi, button] of buttons) {
      button.setAttribute('aria-pressed', String(selected.has(midi)));
    }
    onChange(notes.filter(note => selected.has(note.midi)));
  }

  for (const note of notes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `piano-key ${note.black ? 'black' : 'white'}`;
    button.textContent = noteLabel(note);
    button.setAttribute('aria-label', noteLabel(note));
    button.setAttribute('aria-pressed', 'false');
    button.style.setProperty('--position', String(note.black ? whiteIndex - 0.32 : whiteIndex));
    if (!note.black) whiteIndex++;
    button.addEventListener('click', () => {
      if (selected.has(note.midi)) selected.delete(note.midi);
      else selected.add(note.midi);
      update();
    });
    buttons.set(note.midi, button);
    element.append(button);
  }
  element.style.setProperty('--white-count', String(whiteIndex));
  return { element, clear: () => { selected.clear(); update(); } };
}
