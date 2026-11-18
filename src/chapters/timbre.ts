import { HarmonicPlayer } from '../audio/harmonic-player';
import { createHarmonics, HARMONIC_COUNT, initialAmplitudes } from '../music/harmonics';
import { noteLabel, timbreNotes } from '../music/notes';
import { frequencyForMidi } from '../music/tuning';
import { createWavePlot } from '../ui/wave-plot';

export function mountTimbre(container: HTMLElement): void {
  container.innerHTML = `
    <header class="chapter-header">
      <p class="eyebrow">Глава 02</p>
      <h1>Тембр</h1>
      <p class="intro">Настрой амплитуды гармоник и послушай, как меняется звук.</p>
    </header>
    <section class="panel" aria-labelledby="harmonics-title">
      <div class="panel-heading">
        <h2 id="harmonics-title">Гармоники</h2>
        <button type="button" class="clear-button reset-harmonics">Сбросить</button>
      </div>
      <div class="timbre-controls">
        <label class="note-control" for="fundamental">Основная нота
          <select id="fundamental" aria-label="Основная нота"></select>
        </label>
        <span class="fundamental-frequency"></span>
      </div>
      <div class="audio-controls">
        <button type="button" class="sound-button" aria-pressed="false">Включить звук</button>
        <label class="volume-control" for="timbre-volume">Громкость
          <input id="timbre-volume" type="range" min="0" max="100" value="35" />
          <output for="timbre-volume">35%</output>
        </label>
      </div>
      <p class="audio-error" role="status" hidden></p>
      <div class="harmonic-bank" role="group" aria-label="Амплитуды десяти гармоник"></div>
      <p class="harmonics-caption">100% = 1 A. Нулевая амплитуда убирает гармонику.</p>
    </section>
  `;
  const noteControl = container.querySelector<HTMLSelectElement>('#fundamental')!;
  for (const note of timbreNotes) {
    const option = document.createElement('option');
    option.value = String(note.midi);
    option.textContent = noteLabel(note);
    noteControl.append(option);
  }
  noteControl.value = '45';
  let amplitudes = initialAmplitudes();
  let fundamental = frequencyForMidi(Number(noteControl.value));
  let spectrum = createHarmonics(fundamental, amplitudes);
  let playing = false;
  let disposed = false;
  let playRequest = 0;
  let plotFrame = 0;
  const player = new HarmonicPlayer(spectrum);
  const plot = createWavePlot({ durationMs: 20, amplitude: 2,
    caption: '100% на ползунке = 1 A. Громкость звука не меняет масштаб графика.' });
  container.append(plot.element);
  const bank = container.querySelector<HTMLElement>('.harmonic-bank')!;
  const soundButton = container.querySelector<HTMLButtonElement>('.sound-button')!;
  const volume = container.querySelector<HTMLInputElement>('#timbre-volume')!;
  const volumeOutput = container.querySelector<HTMLOutputElement>('output[for="timbre-volume"]')!;
  const error = container.querySelector<HTMLElement>('.audio-error')!;
  const frequency = container.querySelector<HTMLElement>('.fundamental-frequency')!;

  const controls = Array.from({ length: HARMONIC_COUNT }, (_, index) => {
    const column = document.createElement('div');
    column.className = 'harmonic-column';
    const number = index + 1;
    column.innerHTML = `
      <output for="harmonic-${number}" class="harmonic-level"></output>
      <div class="harmonic-slider">
        <div class="harmonic-rail" aria-hidden="true"><div class="harmonic-fill"></div><div class="harmonic-thumb"></div></div>
        <input id="harmonic-${number}" type="range" min="0" max="100" step="1" aria-label="Амплитуда гармоники ${number}" aria-orientation="vertical" />
      </div>
      <label for="harmonic-${number}" class="harmonic-number">${number}</label>
      <span class="harmonic-frequency"></span>
      <span class="harmonic-unit">Гц</span>
    `;
    const input = column.querySelector<HTMLInputElement>('input')!;
    const output = column.querySelector<HTMLOutputElement>('output')!;
    const frequency = column.querySelector<HTMLElement>('.harmonic-frequency')!;
    input.addEventListener('input', () => {
      amplitudes[index] = Number(input.value) / 100;
      updateColumn(index);
      updateSpectrum();
    });
    bank.append(column);
    return { column, input, output, frequency };
  });

  function updateColumn(index: number): void {
    const control = controls[index];
    const percent = Math.round(amplitudes[index] * 100);
    control.input.value = String(percent);
    control.input.setAttribute('aria-valuetext', `${percent}%`);
    control.output.value = `${percent}%`;
    control.column.style.setProperty('--fill', `${percent}%`);
    control.column.classList.toggle('is-zero', percent === 0);
  }

  function updatePlot(): void {
    plot.setWaves(spectrum.map((component, index) => ({ ...component, label: `Гармоника ${index + 1}` })));
  }

  function updateSpectrum(): void {
    spectrum = createHarmonics(fundamental, amplitudes);
    player.setSpectrum(spectrum);

    cancelAnimationFrame(plotFrame);
    plotFrame = requestAnimationFrame(updatePlot);
  }

  function updateFrequencies(): void {
    frequency.textContent = `${fundamental.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} Гц`;
    controls.forEach((control, index) => {
      control.frequency.textContent = spectrum[index].frequency.toLocaleString('ru-RU', { useGrouping: false, maximumFractionDigits: 1 });
    });
  }
  function updateSoundButton(): void {
    soundButton.setAttribute('aria-pressed', String(playing));
    soundButton.textContent = playing ? 'Выключить звук' : 'Включить звук';
  }

  soundButton.addEventListener('click', async () => {
    const request = ++playRequest;
    playing = !playing;
    updateSoundButton();
    try {
      await player.setPlaying(playing);
      if (!disposed && request === playRequest) error.hidden = true;
    } catch {
      if (disposed || request !== playRequest) return;
      playing = false;
      void player.setPlaying(false).catch(() => {});
      updateSoundButton();
      error.textContent = 'Не удалось включить звук. Попробуй ещё раз или обнови страницу.';
      error.hidden = false;
    }
  });
  noteControl.addEventListener('change', () => {
    fundamental = frequencyForMidi(Number(noteControl.value));
    updateSpectrum();
    updateFrequencies();
  });
  volume.addEventListener('input', () => {
    volumeOutput.value = `${volume.value}%`;
    player.setVolume(Number(volume.value) / 100);
  });
  container.querySelector('.reset-harmonics')!.addEventListener('click', () => {
    amplitudes = initialAmplitudes();
    controls.forEach((_, index) => updateColumn(index));
    updateSpectrum();
  });
  controls.forEach((_, index) => updateColumn(index));
  updateSpectrum();
  updateFrequencies();

  function dispose(): void {
    disposed = true;
    cancelAnimationFrame(plotFrame);
    player.dispose();
    plot.dispose();
  }
  window.addEventListener('pagehide', dispose, { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  if (import.meta.hot) import.meta.hot.dispose(dispose);
}
