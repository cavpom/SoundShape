import './style.css';
import { chapters } from './chapters';

const app = document.querySelector<HTMLDivElement>('#app')!;
const requestedId = new URLSearchParams(location.search).get('chapter');
const chapter = requestedId === null ? chapters[0] : chapters.find(item => item.id === requestedId);

app.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <a class="brand" href="./">SoundShape<span>Песочница звука</span></a>
      <nav aria-label="Главы"><p class="nav-label">Исследования</p></nav>
    </aside>
    <main id="chapter-content"></main>
  </div>
`;
const nav = app.querySelector('nav')!;
for (const item of chapters) {
  const link = document.createElement('a');
  link.href = `?chapter=${encodeURIComponent(item.id)}`;
  link.textContent = item.title;
  if (chapter?.id === item.id) link.setAttribute('aria-current', 'page');
  nav.append(link);
}
const content = app.querySelector<HTMLElement>('main')!;
if (chapter) {
  document.title = `${chapter.title} · SoundShape`;
  chapter.mount(content);
} else {
  const heading = document.createElement('h1');
  heading.textContent = 'Глава не найдена';
  const text = document.createElement('p');
  text.textContent = 'Выбери главу в меню исследований.';
  content.append(heading, text);
}
