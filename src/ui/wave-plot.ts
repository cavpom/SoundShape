import { sampleWaves } from '../music/waves';
import { frequencyForMidi } from '../music/tuning';
import { noteLabel, type Note } from '../music/notes';

const NS = 'http://www.w3.org/2000/svg';
let nextId = 0;
const colors = ['#a96a42', '#6e7faa', '#a87893', '#9b8a39', '#568a92', '#8277a3'];

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}

export function createWavePlot(): { element: HTMLElement; setNotes(notes: readonly Note[]): void; dispose(): void } {
  const element = document.createElement('section');
  element.className = 'panel wave-panel';
  const id = `wave-plot-${nextId++}`;
  element.setAttribute('aria-labelledby', `${id}-title`);
  element.innerHTML = `
    <div class="panel-heading"><h2 id="${id}-title">Звуковые волны</h2><span class="sum-legend">Сумма</span></div>
    <div class="plot-controls">
      <label>Время <select class="time-scale" aria-label="Диапазон времени">
        <option value="5">0–5 мс</option><option value="10">0–10 мс</option><option value="20" selected>0–20 мс</option><option value="50">0–50 мс</option><option value="100">0–100 мс</option>
      </select></label>
      <label>Амплитуда <select class="amplitude-scale" aria-label="Диапазон амплитуды">
        <option value="1">±1 A</option><option value="2">±2 A</option><option value="4" selected>±4 A</option><option value="8">±8 A</option><option value="16">±16 A</option><option value="24">±24 A</option>
      </select></label>
      <label class="components-control"><input type="checkbox" /> Отдельные волны</label>
    </div>
    <div class="plot-surface"></div>
    <div class="wave-legend" hidden></div>
    <p class="plot-overflow" role="status" hidden></p>
    <p class="plot-caption">A — амплитуда одной волны. Громкость звука не меняет масштаб графика.</p>
  `;
  const surface = element.querySelector<HTMLElement>('.plot-surface')!;
  const timeScale = element.querySelector<HTMLSelectElement>('.time-scale')!;
  const amplitudeScale = element.querySelector<HTMLSelectElement>('.amplitude-scale')!;
  const componentsControl = element.querySelector<HTMLInputElement>('input')!;
  const legend = element.querySelector<HTMLElement>('.wave-legend')!;
  const overflow = element.querySelector<HTMLElement>('.plot-overflow')!;
  let notes: readonly Note[] = [];
  let lastWidth = -1;
  let resizeFrame = 0;

  function render(): void {
    lastWidth = surface.clientWidth;
    const width = Math.max(260, lastWidth);
    const height = 300;
    const left = 43, right = width - 14, top = 27, bottom = height - 40;
    const durationMs = Number(timeScale.value);
    const limit = Number(amplitudeScale.value);
    const samples = sampleWaves(notes.map(note => frequencyForMidi(note.midi)), durationMs);
    const x = (index: number) => left + index / (samples.times.length - 1) * (right - left);
    const y = (value: number) => top + (limit - value) / (limit * 2) * (bottom - top);
    const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `Сумма ${notes.length} волн. Время от 0 до ${durationMs} мс. Амплитуда от −${limit} до ${limit} A.` });
    const defs = svgElement('defs', {});
    const clip = svgElement('clipPath', { id: `${id}-clip` });
    clip.append(svgElement('rect', { x: left, y: top, width: right - left, height: bottom - top }));
    defs.append(clip); svg.append(defs);
    svg.append(svgElement('text', { x: left, y: 14, class: 'axis-label' }, 'Амплитуда, A'));
    for (let tick = 0; tick <= 4; tick++) {
      const value = -limit + tick * limit / 2;
      svg.append(svgElement('line', { x1: left, x2: right, y1: y(value), y2: y(value), class: value === 0 ? 'plot-zero' : 'plot-grid' }));
      svg.append(svgElement('text', { x: left - 9, y: y(value) + 4, 'text-anchor': 'end', class: 'axis-label' }, String(value).replace('-', '−')));
      const px = left + tick / 4 * (right - left);
      svg.append(svgElement('line', { x1: px, x2: px, y1: top, y2: bottom, class: 'plot-grid' }));
      svg.append(svgElement('text', { x: px, y: bottom + 19, 'text-anchor': 'middle', class: 'axis-label' }, String(durationMs * tick / 4).replace('.', ',')));
    }
    svg.append(svgElement('text', { x: right, y: height - 3, 'text-anchor': 'end', class: 'axis-label' }, 'Время, мс'));
    const curves = svgElement('g', { 'clip-path': `url(#${id}-clip)` });
    const path = (values: Float64Array) => Array.from(values, (value, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(value).toFixed(2)}`).join(' ');
    if (componentsControl.checked) samples.components.forEach((values, index) => {
      curves.append(svgElement('path', { d: path(values), fill: 'none', stroke: colors[index % colors.length], 'stroke-opacity': 0.55, 'stroke-width': 1.2 }));
    });
    curves.append(svgElement('path', { d: path(samples.sum), fill: 'none', stroke: '#285e47', 'stroke-width': 2.3, 'stroke-linejoin': 'round' }));
    svg.append(curves);
    const above = samples.sum.some(value => value > limit + 1e-10);
    const below = samples.sum.some(value => value < -limit - 1e-10);
    for (const sign of [1, -1]) {
      let lastMarker = -Infinity;
      let outside = false;
      samples.sum.forEach((value, i) => {
        const isOutside = sign * value > limit + 1e-10;
        if (isOutside && !outside && x(i) - lastMarker > 12) {
          const px = x(i), edge = sign > 0 ? top : bottom;
          svg.append(svgElement('path', { d: `M${px},${edge} l-4,${sign * 7} h8 Z`, fill: '#b56b32' }));
          lastMarker = px;
        }
        outside = isOutside;
      });
    }
    surface.replaceChildren(svg);
    overflow.hidden = !above && !below;
    overflow.textContent = above && below
      ? 'Пики выходят за верхнюю и нижнюю границы. Увеличь диапазон амплитуды, чтобы увидеть их целиком.'
      : `Пики выходят за ${above ? 'верхнюю' : 'нижнюю'} границу. Увеличь диапазон амплитуды, чтобы увидеть их целиком.`;
    legend.replaceChildren();
    legend.hidden = !componentsControl.checked || notes.length === 0;
    if (!legend.hidden) notes.forEach((note, index) => {
      const item = document.createElement('span');
      item.textContent = noteLabel(note);
      item.style.setProperty('--wave-color', colors[index % colors.length]);
      legend.append(item);
    });
  }
  timeScale.addEventListener('change', render);
  amplitudeScale.addEventListener('change', render);
  componentsControl.addEventListener('change', render);
  const resizeObserver = new ResizeObserver(() => {
    // Changing SVG height can notify the observer again; redraw only for width changes,
    // and outside the observer's layout delivery cycle.
    if (surface.clientWidth === lastWidth) return;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(render);
  });
  resizeObserver.observe(surface);
  render();
  return {
    element,
    setNotes: selected => { notes = selected; render(); },
    dispose: () => { resizeObserver.disconnect(); cancelAnimationFrame(resizeFrame); },
  };
}

