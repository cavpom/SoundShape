import { ReferenceTonePlayer } from '../audio/reference-tone-player';
import { frequencyForMidi } from '../music/tuning';
import { MicrophoneInput } from '../audio/microphone-input';
import { noteLabel, tunerNotes } from '../music/notes';
import { estimatePitch, levelDbfs, PitchTracker, type PitchReading } from '../music/pitch';
import { createPitchKeyboard } from '../ui/pitch-keyboard';

export function mountVoiceTuner(container: HTMLElement): void {
  container.innerHTML = `
    <header class="chapter-header">
      <p class="eyebrow">Глава 03</p>
      <h1>Тюнер голоса</h1>
    </header>
    <section class="panel" aria-label="Настройки звука">
      <div class="mic-controls">
        <button type="button" class="sound-button mic-button" aria-pressed="false">Включить микрофон</button>
      </div>
      <p class="audio-error mic-error" role="alert" hidden></p>
      <div class="reference-controls">
        <div class="audio-controls">
          <button type="button" class="sound-button reference-button" aria-pressed="false">Озвучивать ноту</button>
          <label class="volume-control" for="reference-volume">Громкость
            <input id="reference-volume" type="range" min="0" max="100" value="20" step="1" />
            <output for="reference-volume">20%</output>
          </label>
        </div>
        <p class="audio-error reference-error" role="alert" hidden></p>
      </div>
      <div class="mic-settings">
        <label class="threshold-control" for="mic-threshold">Порог
          <input id="mic-threshold" type="range" min="-65" max="-15" value="-45" step="1" />
          <output for="mic-threshold">−45 дБFS</output>
        </label>
        <div class="mic-level-heading"><span>Уровень микрофона</span><span class="mic-level-value">—</span></div>
        <div class="mic-meter" role="meter" aria-label="Уровень микрофона" aria-valuemin="-70" aria-valuemax="0" aria-valuenow="-70">
          <span class="mic-meter-fill"></span><span class="mic-meter-threshold" aria-hidden="true"></span>
        </div>
      </div>
    </section>
    <section class="panel" aria-labelledby="voice-keyboard-title">
      <div class="panel-heading tuner-keyboard-heading">
        <h2 id="voice-keyboard-title">Клавиатура</h2>
        <label class="autoscroll-control"><input type="checkbox" checked /> Автопрокрутка</label>
      </div>
      <div class="held-note-controls">
        <span class="held-note-label" role="status">Нажми клавишу, чтобы удерживать опорную ноту.</span>
        <button type="button" class="clear-button release-note" disabled>Отпустить</button>
      </div>
      <div class="voice-keyboard-mount"></div>
      <div class="cents-scale" role="img" aria-label="Отклонение от ближайшей ноты не определено">
        <span class="cents-target"></span><span class="cents-center"></span><span class="cents-marker" hidden></span>
      </div>
      <div class="cents-labels" aria-hidden="true"><span>−50</span><span>0</span><span>+50</span></div>
    </section>
  `;
  const button = container.querySelector<HTMLButtonElement>('.mic-button')!;
  const error = container.querySelector<HTMLElement>('.mic-error')!;
  const threshold = container.querySelector<HTMLInputElement>('#mic-threshold')!;
  const thresholdOutput = container.querySelector<HTMLOutputElement>('output[for="mic-threshold"]')!;
  const meter = container.querySelector<HTMLElement>('.mic-meter')!;
  const meterFill = container.querySelector<HTMLElement>('.mic-meter-fill')!;
  const meterThreshold = container.querySelector<HTMLElement>('.mic-meter-threshold')!;
  const level = container.querySelector<HTMLElement>('.mic-level-value')!;
  const scale = container.querySelector<HTMLElement>('.cents-scale')!;
  const marker = container.querySelector<HTMLElement>('.cents-marker')!;
  const autoScrollControl = container.querySelector<HTMLInputElement>('.autoscroll-control input')!;
  const keyboard = createPitchKeyboard(tunerNotes, midi => toggleHeldNote(midi), () => {
    autoScrollControl.checked = false;
  });
  container.querySelector('.voice-keyboard-mount')!.append(keyboard.element);
  const tracker = new PitchTracker();
  const reference = new ReferenceTonePlayer();
  const referenceButton = container.querySelector<HTMLButtonElement>('.reference-button')!;
  const referenceVolume = container.querySelector<HTMLInputElement>('#reference-volume')!;
  const referenceOutput = container.querySelector<HTMLOutputElement>('output[for="reference-volume"]')!;
  const referenceError = container.querySelector<HTMLElement>('.reference-error')!;
  const heldNoteLabel = container.querySelector<HTMLElement>('.held-note-label')!;
  const releaseNoteButton = container.querySelector<HTMLButtonElement>('.release-note')!;
  let heldMidi: number | null = null;
  let referenceEnabled = false;
  let referenceRequest = 0;
  let detectedMidi: number | null = null;
  let running = false;
  let opening = false;
  let disposed = false;
  let frameId = 0;
  let lastAnalysis = -Infinity;
  let gateOpen = false;
  let request = 0;
  const microphone = new MicrophoneInput(() => stop());

  function text(element: HTMLElement, value: string): void {
    if (element.textContent !== value) element.textContent = value;
  }

  function showReading(reading: PitchReading | null): void {
    const matchingNote = reading && tunerNotes.find(item => item.midi === reading.midi);
    keyboard.setPitch(reading);
    detectedMidi = matchingNote ? matchingNote.midi : null;
    updateReferenceTone();
    marker.hidden = !reading;
    if (reading) {
      marker.style.left = `${Math.max(0, Math.min(100, reading.cents + 50))}%`;
      const close = Math.abs(reading.cents) <= 5;
      marker.classList.toggle('is-close', close);
      scale.setAttribute('aria-label', `Отклонение ${Math.round(reading.cents)} центов`);
    } else {
      scale.setAttribute('aria-label', 'Отклонение от ближайшей ноты не определено');
    }
  }

  function referenceMidi(): number | null {
    return heldMidi ?? detectedMidi;
  }

  function updateReferenceTone(): void {
    reference.setNote(referenceMidi());
  }

  function updateHeldNote(): void {
    const selected = tunerNotes.find(item => item.midi === heldMidi);
    text(heldNoteLabel, selected
      ? `Опорная: ${noteLabel(selected)} · ${frequencyForMidi(selected.midi).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} Гц`
      : 'Нажми клавишу, чтобы удерживать опорную ноту.');
    releaseNoteButton.disabled = heldMidi === null;
    keyboard.setHeldNote(heldMidi);
  }

  async function enableReference(enabled: boolean): Promise<void> {
    const current = ++referenceRequest;
    referenceEnabled = enabled;
    referenceError.hidden = true;
    referenceButton.setAttribute('aria-pressed', String(referenceEnabled));
    referenceButton.textContent = referenceEnabled ? 'Выключить озвучивание' : 'Озвучивать ноту';
    try {
      await reference.setEnabled(referenceEnabled);
    } catch {
      if (disposed || current !== referenceRequest) return;
      referenceEnabled = false;
      void reference.setEnabled(false).catch(() => {});
      referenceButton.setAttribute('aria-pressed', 'false');
      referenceButton.textContent = 'Озвучивать ноту';
      referenceError.textContent = 'Не удалось включить звук. Попробуй ещё раз.';
      referenceError.hidden = false;
    }
  }

  function releaseHeldNote(): void {
    heldMidi = null;
    updateHeldNote();
    updateReferenceTone();
  }

  function toggleHeldNote(midi: number): void {
    if (heldMidi === midi) { releaseHeldNote(); return; }
    heldMidi = midi;
    updateHeldNote();
    updateReferenceTone();
  }

  referenceButton.addEventListener('click', () => { void enableReference(!referenceEnabled); });
  releaseNoteButton.addEventListener('click', releaseHeldNote);
  referenceVolume.addEventListener('input', () => {
    referenceOutput.value = `${referenceVolume.value}%`;
    reference.setVolume(Number(referenceVolume.value) / 100);
  });

  function stop(): void {
    request++;
    running = false;
    opening = false;
    cancelAnimationFrame(frameId);
    microphone.stop();
    tracker.reset();
    gateOpen = false;
    lastAnalysis = -Infinity;
    button.textContent = 'Включить микрофон';
    button.setAttribute('aria-pressed', 'false');
    button.removeAttribute('aria-busy');
    error.hidden = true;
    meterFill.style.width = '0%';
    meter.setAttribute('aria-valuenow', '-70');
    text(level, '—');
    showReading(null);
  }

  function analyse(now: number): void {
    if (!running || disposed) return;
    if (now - lastAnalysis >= 40) {
      lastAnalysis = now;
      const frame = microphone.readFrame();
      if (frame) {
        if (error.textContent === 'Аудио приостановлено. Выключи микрофон и включи снова.') error.hidden = true;
        const db = levelDbfs(frame.samples);
        const gate = Number(threshold.value);
        gateOpen = db >= gate - (gateOpen ? 3 : 0);
        const estimate = gateOpen ? estimatePitch(frame.samples, frame.sampleRate) : null;
        const reading = tracker.update(estimate, now);
        meterFill.style.width = `${Math.max(0, Math.min(100, (db + 70) / 70 * 100))}%`;
        meter.setAttribute('aria-valuenow', String(Math.max(-70, Math.min(0, Math.round(db)))));
        text(level, `${Math.round(db).toLocaleString('ru-RU')} дБFS`);
        showReading(reading);
      } else {
        showReading(tracker.update(null, now));
        meterFill.style.width = '0%';
        meter.setAttribute('aria-valuenow', '-70');
        text(level, '—');
        error.textContent = 'Аудио приостановлено. Выключи микрофон и включи снова.';
        error.hidden = false;
      }
    }
    frameId = requestAnimationFrame(analyse);
  }

  function errorMessage(cause: unknown): string {
    if (cause instanceof DOMException) {
      if (cause.name === 'NotAllowedError' || cause.name === 'SecurityError') return 'Доступ к микрофону не разрешён. Разреши его в настройках сайта и попробуй ещё раз.';
      if (cause.name === 'NotFoundError') return 'Микрофон не найден. Подключи его и попробуй ещё раз.';
      if (cause.name === 'NotReadableError') return 'Не удалось открыть микрофон. Проверь, не занят ли он другим приложением.';
    }
    return cause instanceof Error ? cause.message : 'Не удалось включить микрофон. Попробуй ещё раз.';
  }

  button.addEventListener('click', async () => {
    if (opening || running) { stop(); return; }
    const current = ++request;
    opening = true;
    error.hidden = true;
    button.textContent = 'Отменить';
    button.setAttribute('aria-busy', 'true');
    try {
      const started = await microphone.start();
      if (!started || disposed || current !== request) return;
      opening = false;
      running = true;
      button.textContent = 'Выключить микрофон';
      button.setAttribute('aria-pressed', 'true');
      button.removeAttribute('aria-busy');
      frameId = requestAnimationFrame(analyse);
    } catch (cause) {
      if (disposed || current !== request) return;
      stop();
      error.textContent = errorMessage(cause);
      error.hidden = false;
    }
  });

  function updateThreshold(): void {
    const value = Number(threshold.value);
    thresholdOutput.value = `${value.toLocaleString('ru-RU')} дБFS`;
    meterThreshold.style.left = `${(value + 70) / 70 * 100}%`;
    gateOpen = false;
    tracker.reset();
    showReading(null);
  }
  threshold.addEventListener('input', updateThreshold);
  updateThreshold();
  autoScrollControl.addEventListener('change', event => {
    keyboard.setAutoScroll((event.currentTarget as HTMLInputElement).checked);
  });
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    button.disabled = true;
    error.textContent = 'Для микрофона открой сайт по HTTPS или через localhost на этом компьютере.';
    error.hidden = false;
  }
  function dispose(): void { disposed = true; stop(); reference.dispose(); keyboard.dispose(); }
  window.addEventListener('pagehide', dispose, { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  if (import.meta.hot) import.meta.hot.dispose(dispose);
}
