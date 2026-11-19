import { noteLabel, type Note } from '../music/notes';
import type { PitchReading } from '../music/pitch';

/** Semitones need not have equal screen widths: interpolate adjacent key centres. */
export function interpolatePitchPosition(pitch: number, centres: ReadonlyMap<number, number>): number | null {
  if (!Number.isFinite(pitch) || centres.size === 0) return null;
  const first = Math.min(...centres.keys()), last = Math.max(...centres.keys());
  const bounded = Math.max(first, Math.min(last, pitch));
  const lower = Math.floor(bounded), upper = Math.ceil(bounded);
  const left = centres.get(lower), right = centres.get(upper);
  if (left === undefined || right === undefined) return null;
  return left + (right - left) * (bounded - lower);
}

/** Voice display and a separately selected reference key, with smooth voice following. */
export function createPitchKeyboard(
  notes: readonly Note[],
  onKeyPress: (midi: number) => void = () => {},
  onManualScroll: () => void = () => {},
): {
  element: HTMLElement;
  setPitch(reading: PitchReading | null): void;
  setAutoScroll(enabled: boolean): void;
  setHeldNote(midi: number | null): void;
  dispose(): void;
} {
  const element = document.createElement('div');
  element.className = 'piano-scroll pitch-keyboard-scroll';
  const stage = document.createElement('div');
  stage.className = 'pitch-keyboard-stage';
  const piano = document.createElement('div');
  piano.className = 'piano pitch-keyboard';
  piano.setAttribute('role', 'group');
  piano.setAttribute('aria-label', `Клавиатура от ${noteLabel(notes[0])} до ${noteLabel(notes[notes.length - 1])}`);
  const keys = new Map<number, HTMLElement>();
  let whiteIndex = 0;
  let current: number | null = null;
  let held: number | null = null;
  let pitchX: number | null = null;
  let autoScroll = true;
  let followFrame = 0;
  let lastFrameTime = 0;
  let layoutFrame = 0;
  let viewportWidth = 0;
  let sidePadding = 0;
  let laidOut = false;
  let pointer: { id: number; x: number; y: number; scroll: number; touch: boolean; target: Element; dragging: boolean } | null = null;
  let ignorePointerClick = false;
  for (const note of notes) {
    const key = document.createElement('button');
    key.type = 'button';
    key.setAttribute('aria-label', noteLabel(note));
    key.setAttribute('aria-pressed', 'false');
    key.addEventListener('click', () => onKeyPress(note.midi));
    key.className = `piano-key ${note.black ? 'black' : 'white'}`;
    key.textContent = noteLabel(note);
    key.dataset.midi = String(note.midi);
    key.style.setProperty('--position', String(note.black ? whiteIndex - 0.32 : whiteIndex));
    if (!note.black) whiteIndex++;
    keys.set(note.midi, key);
    piano.append(key);
  }
  const pianoWidth = whiteIndex * 46;
  piano.style.setProperty('--white-count', String(whiteIndex));
  piano.style.width = `${pianoWidth}px`;
  const voiceMarker = document.createElement('span');
  voiceMarker.className = 'voice-pitch-marker';
  voiceMarker.setAttribute('aria-hidden', 'true');
  voiceMarker.hidden = true;
  piano.append(voiceMarker);
  stage.append(piano);
  element.append(stage);

  function cancelFollowing(): void {
    cancelAnimationFrame(followFrame);
    followFrame = 0;
    lastFrameTime = 0;
  }

  function manualScroll(): void {
    cancelFollowing();
    if (autoScroll) {
      autoScroll = false;
      onManualScroll();
    }
  }

  function endDrag(): void {
    const active = pointer;
    pointer = null;
    element.classList.remove('is-dragging');
    if (active?.target.hasPointerCapture(active.id)) active.target.releasePointerCapture(active.id);
  }

  element.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || pointer) return;
    ignorePointerClick = false;
    if (!(event.target instanceof Element) || !stage.contains(event.target)) {
      // Native scrollbar interaction should also stop voice following.
      if (event.clientY >= element.getBoundingClientRect().top + element.clientHeight) manualScroll();
      return;
    }
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY,
      scroll: element.scrollLeft, touch: event.pointerType === 'touch', target: event.target, dragging: false };
    event.target.setPointerCapture(event.pointerId);
  });
  element.addEventListener('pointermove', event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (!pointer.dragging) {
      if (Math.hypot(dx, dy) < 6) return;
      if (pointer.touch && Math.abs(dy) > Math.abs(dx)) {
        ignorePointerClick = true;
        endDrag();
        return;
      }
      pointer.dragging = true;
      ignorePointerClick = true;
      element.classList.add('is-dragging');
      manualScroll();
    }
    event.preventDefault();
    element.scrollLeft = pointer.scroll - dx;
  }, { passive: false });
  element.addEventListener('pointerup', event => { if (pointer?.id === event.pointerId) endDrag(); });
  element.addEventListener('pointercancel', event => { if (pointer?.id === event.pointerId) endDrag(); });
  element.addEventListener('lostpointercapture', event => { if (pointer?.id === event.pointerId) endDrag(); });
  element.addEventListener('click', event => {
    // The generated pointer click after a drag must not toggle a reference key.
    // A new pointerdown clears this flag; keyboard and assistive clicks (detail 0) still work.
    if (ignorePointerClick && event.detail !== 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  element.addEventListener('dragstart', event => event.preventDefault());
  element.addEventListener('wheel', event => {
    if (event.deltaX !== 0 || event.shiftKey) manualScroll();
  }, { passive: true });
  window.addEventListener('blur', endDrag);
  function animateFollow(now: number): void {
    followFrame = 0;
    if (!autoScroll || pitchX === null) return;
    const target = Math.max(0, Math.min(sidePadding + pitchX - element.clientWidth / 2, element.scrollWidth - element.clientWidth));
    const distance = target - element.scrollLeft;
    if (Math.abs(distance) <= 1) {
      element.scrollLeft = target;
      lastFrameTime = 0;
      return;
    }
    const elapsed = lastFrameTime ? Math.min(50, now - lastFrameTime) : 16;
    lastFrameTime = now;
    const previousScroll = element.scrollLeft;
    element.scrollLeft += distance * (1 - Math.exp(-elapsed / 140));
    // Some browsers round scroll offsets to physical pixels. Finish a subpixel step
    // directly instead of keeping an animation alive without any visible movement.
    if (Math.abs(element.scrollLeft - previousScroll) < 0.01) element.scrollLeft = target;
    followFrame = requestAnimationFrame(animateFollow);
  }

  function follow(): void {
    if (autoScroll && pitchX !== null && !followFrame) followFrame = requestAnimationFrame(animateFollow);
  }

  function layout(): void {
    const previousPadding = sidePadding;
    sidePadding = element.clientWidth / 2;
    // Extra space allows even the lowest and highest keys to reach the viewport centre.
    stage.style.width = `${pianoWidth + 2 * sidePadding}px`;
    piano.style.marginLeft = `${sidePadding}px`;
    if (!laidOut) {
      element.scrollLeft = pianoWidth / 2;
      laidOut = true;
    } else {
      element.scrollLeft += sidePadding - previousPadding;
    }
    follow();
  }
  const resizeObserver = new ResizeObserver(() => {
    if (element.clientWidth === viewportWidth) return;
    viewportWidth = element.clientWidth;
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(layout);
  });
  resizeObserver.observe(element);

  return {
    element,
    setPitch(reading): void {
      const midi = reading && keys.has(reading.midi) ? reading.midi : null;
      if (midi !== current) {
        if (current !== null) {
          keys.get(current)?.classList.remove('is-detected');
          keys.get(current)?.removeAttribute('aria-current');
        }
        current = midi;
        if (midi !== null) {
          keys.get(midi)?.classList.add('is-detected');
          keys.get(midi)?.setAttribute('aria-current', 'true');
        }
      }
      if (!reading || midi === null) {
        pitchX = null;
        voiceMarker.hidden = true;
        cancelFollowing();
        return;
      }
      const centres = new Map(Array.from(keys, ([keyMidi, key]) => [keyMidi, key.offsetLeft + key.offsetWidth / 2]));
      pitchX = interpolatePitchPosition(69 + 12 * Math.log2(reading.frequency / 440), centres);
      voiceMarker.hidden = pitchX === null;
      if (pitchX !== null) voiceMarker.style.left = `${pitchX}px`;
      voiceMarker.classList.toggle('is-close', Math.abs(reading.cents) <= 5);
      follow();
    },
    setAutoScroll(enabled): void {
      autoScroll = enabled;
      if (enabled) follow();
      else cancelFollowing();
    },
    setHeldNote(midi): void {
      if (held !== null) {
        keys.get(held)?.classList.remove('is-held');
        keys.get(held)?.setAttribute('aria-pressed', 'false');
      }
      held = midi !== null && keys.has(midi) ? midi : null;
      if (held !== null) {
        keys.get(held)?.classList.add('is-held');
        keys.get(held)?.setAttribute('aria-pressed', 'true');
      }
    },
    dispose(): void {
      endDrag();
      window.removeEventListener('blur', endDrag);
      resizeObserver.disconnect();
      cancelAnimationFrame(layoutFrame);
      cancelFollowing();
    },
  };
}
