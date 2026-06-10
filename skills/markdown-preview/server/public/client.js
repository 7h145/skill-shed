const documentEl = document.querySelector('#document');
const errorEl = document.querySelector('#error');
const connectionEl = document.querySelector('#connection');
const updatedEl = document.querySelector('#updated');
const menuButtonEl = document.querySelector('#menu-button');
const menuEl = document.querySelector('#menu');
const directoryEl = document.querySelector('#directory');

function setConnection(state) {
  connectionEl.textContent = state;
  connectionEl.title = 'Connection status to the preview server';
  const className = state === 'connected' ? 'ok' : state === 'refreshing' ? 'muted' : 'bad';
  connectionEl.className = `pill ${className}`;
}

function formatTime(isoTimestamp) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(isoTimestamp));
}

function setMenu(open) {
  menuEl.hidden = !open;
  menuButtonEl.setAttribute('aria-expanded', String(open));
}

menuButtonEl.addEventListener('click', () => setMenu(menuEl.hidden));
document.addEventListener('click', (event) => {
  if (!menuEl.hidden && !event.target.closest('.menu-wrap')) setMenu(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMenu(false);
});
updatedEl.addEventListener('click', async () => {
  setConnection('refreshing');
  const response = await fetch('/api/render/rebuild', { method: 'POST', cache: 'no-store' });
  if (!response.ok) throw new Error(`Rebuild failed: ${response.status}`);
  render(await response.json());
});

function render(payload) {
  documentEl.innerHTML = payload.html || '<p><em>No Markdown files found.</em></p>';

  directoryEl.textContent = payload.markdownDir || 'Markdown directory';
  directoryEl.title = payload.markdownDir || 'Markdown directory';

  updatedEl.textContent = payload.updatedAt
    ? formatTime(payload.updatedAt)
    : 'not updated yet';
  updatedEl.title = 'Time of last rebuild, click to rebuild now';

  if (payload.error) {
    errorEl.hidden = false;
    errorEl.textContent = payload.error;
    setConnection('error');
  } else {
    errorEl.hidden = true;
    errorEl.textContent = '';
    setConnection('connected');
  }
}

async function initialLoad() {
  const response = await fetch('/api/render/html', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Initial load failed: ${response.status}`);
  render(await response.json());
}

function connectEvents() {
  const events = new EventSource('/api/events');

  events.addEventListener('open', () => setConnection('connected'));
  events.addEventListener('update', (event) => render(JSON.parse(event.data)));
  events.addEventListener('error', (event) => {
    if (event.data) render(JSON.parse(event.data));
    else setConnection('reconnecting');
  });

  events.onerror = () => setConnection('reconnecting');
}

setConnection('connecting');
initialLoad()
  .then(connectEvents)
  .catch((error) => {
    errorEl.hidden = false;
    errorEl.textContent = String(error?.stack || error);
    setConnection('error');
  });
