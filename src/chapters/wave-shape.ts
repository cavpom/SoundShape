import { TonePlayer } from '../audio/tone-player';
import { noteLabel, pianoNotes, type Note } from '../music/notes';
import { frequencyForMidi } from '../music/tuning';
import { createPiano } from '../ui/piano';
import { createWavePlot } from '../ui/wave-plot';

export function mountWaveShape(container: HTMLElement): void {
  container.innerHTML = `
    <header class="chapter-header">
      <p class="eyebrow">Глава 01</p>
      <h1>Форма звука</h1>
      <p class="intro">Выбирай ноты и собирай сочетания. Каждая клавиша остаётся нажатой до следующего нажатия.</p>
    </header>
    <section class="panel" aria-labelledby="piano-title">
      <div class="panel-heading">
        <h2 id="piano-title">Твоя клавиатура</h2>
        <button type="button" class="clear-button">Отпустить всё</button>
      </div>
      <div class="audio-controls">
        <button type="button" class="sound-button" aria-pressed="true">Звук включён</button>
        <label class="volume-control" for="volume">Громкость
          <input id="volume" type="range" min="0" max="100" value="35" />
          <output for="volume">35%</output>
        </label>
      </div>
      <p class="audio-error" role="status" hidden></p>
      <div class="piano-scroll"></div>
      <div class="selection" aria-live="polite" aria-atomic="true">Ноты пока не выбраны</div>
    </section>
  `;
  const plot = createWavePlot();
  container.append(plot.element);
  const player = new TonePlayer(pianoNotes.map(note => note.midi));
  const selection = container.querySelector<HTMLElement>('.selection')!;
  const clearButton = container.querySelector<HTMLButtonElement>('.clear-button')!;
  const soundButton = container.querySelector<HTMLButtonElement>('.sound-button')!;
  const volume = container.querySelector<HTMLInputElement>('#volume')!;
  const output = container.querySelector<HTMLOutputElement>('output')!;
  const error = container.querySelector<HTMLElement>('.audio-error')!;
  let selected: readonly Note[] = [];
  let muted = false;
  let disposed = false;

  async function updateSound(): Promise<void> {
    try {
      await player.setNotes(selected.map(note => note.midi));
      if (!disposed) error.hidden = true;
    } catch {
      if (disposed) return;
      error.textContent = 'Не удалось включить звук. Попробуй нажать клавишу ещё раз или обновить страницу.';
      error.hidden = false;
    }
  }

  clearButton.disabled = true;
  const piano = createPiano(pianoNotes, notes => {
    selected = notes;
    plot.setNotes(notes);
    selection.textContent = notes.length
      ? notes.map(note => `${noteLabel(note)} · ${frequencyForMidi(note.midi).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} Гц`).join(' / ')
      : 'Ноты пока не выбраны';
    clearButton.disabled = notes.length === 0;
    void updateSound();
  });
  container.querySelector('.piano-scroll')!.append(piano.element);
  clearButton.addEventListener('click', () => piano.clear());
  soundButton.addEventListener('click', () => {
    muted = !muted;
    player.setMuted(muted);
    soundButton.setAttribute('aria-pressed', String(!muted));
    soundButton.textContent = muted ? 'Звук выключен' : 'Звук включён';
    if (!muted) void updateSound();
  });
  volume.addEventListener('input', () => {
    output.value = `${volume.value}%`;
    player.setVolume(Number(volume.value) / 100);
  });
  window.addEventListener('pagehide', () => {
    disposed = true;
    player.dispose();
    plot.dispose();
  }, { once: true });
  // A page restored from the back/forward cache needs a fresh audio context.
  window.addEventListener('pageshow', event => {
    if (event.persisted) location.reload();
  });
  if (import.meta.hot) import.meta.hot.dispose(() => {
    disposed = true;
    player.dispose();
    plot.dispose();
  });
}

