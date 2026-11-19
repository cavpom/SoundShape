import { MicrophoneInput } from '../audio/microphone-input';
import { noteLabel, tunerNotes } from '../music/notes';
import { estimatePitch, levelDbfs, PitchTracker, type PitchReading } from '../music/pitch';
import { createPitchKeyboard } from '../ui/pitch-keyboard';

export function mountVoiceTuner(container: HTMLElement): void {
  container.innerHTML = `
    <header class="chapter-header">
      <p class="eyebrow">Глава 03</p>
      <h1>Тюнер голоса</h1>
      <p class="intro">Включи микрофон и тяни одну ноту. Подсветка покажет ближайшую клавишу, а шкала — отклонение от неё.</p>
    </header>
    <section class="panel" aria-labelledby="voice-title">
      <div class="panel-heading"><h2 id="voice-title">Твой голос</h2></div>
      <div class="mic-controls">
        <button type="button" class="sound-button mic-button" aria-pressed="false">Включить микрофон</button>
        <span class="mic-status" role="status">Микрофон выключен</span>
      </div>
      <p class="audio-error mic-error" role="alert" hidden></p>
      <div class="mic-settings">
        <label class="threshold-control" for="mic-threshold">Порог
          <input id="mic-threshold" type="range" min="-65" max="-15" value="-45" step="1" aria-describedby="threshold-help" />
          <output for="mic-threshold">−45 дБFS</output>
        </label>
        <p id="threshold-help" class="mic-help">Звук тише порога игнорируется.</p>
        <div class="mic-level-heading"><span>Уровень микрофона</span><span class="mic-level-value">—</span></div>
        <div class="mic-meter" role="meter" aria-label="Уровень микрофона" aria-valuemin="-70" aria-valuemax="0" aria-valuenow="-70">
          <span class="mic-meter-fill"></span><span class="mic-meter-threshold" aria-hidden="true"></span>
        </div>
      </div>
      <div class="tuner-readout">
        <div><span class="readout-label">Ближайшая нота</span><strong class="detected-note" aria-live="polite">—</strong></div>
        <div><span class="readout-label">Частота, Гц</span><strong class="detected-frequency">—</strong></div>
        <div><span class="readout-label">Центы</span><strong class="detected-cents">—</strong></div>
      </div>
    </section>
    <section class="panel" aria-labelledby="voice-keyboard-title">
      <div class="panel-heading tuner-keyboard-heading">
        <h2 id="voice-keyboard-title">Клавиатура</h2>
        <label class="autoscroll-control"><input type="checkbox" checked /> Автопрокрутка</label>
      </div>
      <div class="voice-keyboard-mount"></div>
      <p class="voice-marker-caption">Метка — высота голоса. Подсветка — ближайшая нота.</p>
      <div class="cents-scale" role="img" aria-label="Отклонение от ближайшей ноты не определено">
        <span class="cents-target"></span><span class="cents-center"></span><span class="cents-marker" hidden></span>
      </div>
      <div class="cents-labels" aria-hidden="true"><span>−50</span><span>0</span><span>+50</span></div>
      <p class="pitch-direction">Спой протяжную гласную.</p>
    </section>
  `;
  const button = container.querySelector<HTMLButtonElement>('.mic-button')!;
  const status = container.querySelector<HTMLElement>('.mic-status')!;
  const error = container.querySelector<HTMLElement>('.mic-error')!;
  const threshold = container.querySelector<HTMLInputElement>('#mic-threshold')!;
  const thresholdOutput = container.querySelector<HTMLOutputElement>('output')!;
  const meter = container.querySelector<HTMLElement>('.mic-meter')!;
  const meterFill = container.querySelector<HTMLElement>('.mic-meter-fill')!;
  const meterThreshold = container.querySelector<HTMLElement>('.mic-meter-threshold')!;
  const level = container.querySelector<HTMLElement>('.mic-level-value')!;
  const note = container.querySelector<HTMLElement>('.detected-note')!;
  const frequency = container.querySelector<HTMLElement>('.detected-frequency')!;
  const cents = container.querySelector<HTMLElement>('.detected-cents')!;
  const scale = container.querySelector<HTMLElement>('.cents-scale')!;
  const marker = container.querySelector<HTMLElement>('.cents-marker')!;
  const direction = container.querySelector<HTMLElement>('.pitch-direction')!;
  const keyboard = createPitchKeyboard(tunerNotes);
  container.querySelector('.voice-keyboard-mount')!.append(keyboard.element);
  const tracker = new PitchTracker();
  let running = false;
  let opening = false;
  let disposed = false;
  let frameId = 0;
  let lastAnalysis = -Infinity;
  let gateOpen = false;
  let request = 0;
  const microphone = new MicrophoneInput(() => stop('Микрофон отключён'));

  function text(element: HTMLElement, value: string): void {
    if (element.textContent !== value) element.textContent = value;
  }

  function showReading(reading: PitchReading | null): void {
    const matchingNote = reading && tunerNotes.find(item => item.midi === reading.midi);
    text(note, matchingNote ? noteLabel(matchingNote) : reading ? 'Вне диапазона' : '—');
    text(frequency, reading ? reading.frequency.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : '—');
    text(cents, reading ? Math.round(reading.cents).toLocaleString('ru-RU', { signDisplay: 'exceptZero' }) : '—');
    keyboard.setPitch(reading);
    marker.hidden = !reading;
    if (reading) {
      marker.style.left = `${Math.max(0, Math.min(100, reading.cents + 50))}%`;
      const close = Math.abs(reading.cents) <= 5;
      marker.classList.toggle('is-close', close);
      scale.setAttribute('aria-label', `Отклонение ${Math.round(reading.cents)} центов`);
      text(direction, close ? 'Близко к ноте' : reading.cents < 0 ? 'Ниже ноты' : 'Выше ноты');
    } else {
      scale.setAttribute('aria-label', 'Отклонение от ближайшей ноты не определено');
      text(direction, 'Спой протяжную гласную.');
    }
  }

  function stop(message = 'Микрофон выключен'): void {
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
    text(status, message);
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
        const db = levelDbfs(frame.samples);
        const gate = Number(threshold.value);
        gateOpen = db >= gate - (gateOpen ? 3 : 0);
        const estimate = gateOpen ? estimatePitch(frame.samples, frame.sampleRate) : null;
        const reading = tracker.update(estimate, now);
        meterFill.style.width = `${Math.max(0, Math.min(100, (db + 70) / 70 * 100))}%`;
        meter.setAttribute('aria-valuenow', String(Math.max(-70, Math.min(0, Math.round(db)))));
        text(level, `${Math.round(db).toLocaleString('ru-RU')} дБFS`);
        showReading(reading);
        text(status, reading ? 'Нота распознана' : !gateOpen ? 'Тише порога' : estimate ? 'Определяю ноту…' : 'Не удаётся определить ноту');
      } else {
        showReading(tracker.update(null, now));
        meterFill.style.width = '0%';
        meter.setAttribute('aria-valuenow', '-70');
        text(level, '—');
        text(status, 'Аудио приостановлено. Выключи микрофон и включи снова.');
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
    text(status, 'Ожидаю доступ к микрофону…');
    try {
      const started = await microphone.start();
      if (!started || disposed || current !== request) return;
      opening = false;
      running = true;
      button.textContent = 'Выключить микрофон';
      button.setAttribute('aria-pressed', 'true');
      button.removeAttribute('aria-busy');
      text(status, 'Слушаю…');
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
  container.querySelector<HTMLInputElement>('.autoscroll-control input')!.addEventListener('change', event => {
    keyboard.setAutoScroll((event.currentTarget as HTMLInputElement).checked);
  });
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    button.disabled = true;
    error.textContent = 'Для микрофона открой сайт по HTTPS или через localhost на этом компьютере.';
    error.hidden = false;
  }
  function dispose(): void { disposed = true; stop(); keyboard.dispose(); }
  window.addEventListener('pagehide', dispose, { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  if (import.meta.hot) import.meta.hot.dispose(dispose);
}
