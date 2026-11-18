import { mountWaveShape } from './wave-shape';

export interface Chapter {
  readonly id: string;
  readonly title: string;
  readonly mount: (container: HTMLElement) => void;
}

// Add experiments here; the application shell builds navigation from this list.
export const chapters: readonly Chapter[] = [
  { id: 'wave-shape', title: 'Форма звука', mount: mountWaveShape },
];
