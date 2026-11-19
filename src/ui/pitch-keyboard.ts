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

/** Read-only keyboard, with a continuous voice marker and smooth camera following. */
export function createPitchKeyboard(notes: readonly Note[]): {
  element: HTMLElement;
  setPitch(reading: PitchReading | null): void;
  setAutoScroll(enabled: boolean): void;
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
  let pitchX: number | null = null;
  let autoScroll = true;
  let followFrame = 0;
  let lastFrameTime = 0;
  let layoutFrame = 0;
  let viewportWidth = 0;
  let sidePadding = 0;
  let laidOut = false;
  for (const note of notes) {
    const key = document.createElement('div');
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
    dispose(): void {
      resizeObserver.disconnect();
      cancelAnimationFrame(layoutFrame);
      cancelFollowing();
    },
  };
}
