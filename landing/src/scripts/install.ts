/**
 * Install guide (/install/): browser picker, "Done" checkboxes, progress bar and "Start over".
 * Progress is saved in localStorage when it is available; the page works the same without it.
 * The browser wording itself is switched by CSS from <html data-browser>, set by an inline script
 * before the steps render.
 */
import { browsers, GUIDE_STORAGE_KEY, isBrowserId, type BrowserId } from '../browsers';

/** Localized runtime strings, written into the page by InstallPage.astro. */
type GuideStrings = Record<
  'detected' | 'chosen' | 'count' | 'countLong' | 'announce' | 'allDone' | 'cleared' | 'mobile' | 'notChromium' | 'copyAddress',
  string
>;
const strings = JSON.parse(document.querySelector('[data-guide-strings]')?.textContent || '{}') as GuideStrings;
const say = (key: keyof GuideStrings, vars: Record<string, string | number> = {}) =>
  (strings[key] ?? '').replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all));

type Saved = { done: number[]; browser?: BrowserId };

function load(): Saved {
  try {
    const raw = localStorage.getItem(GUIDE_STORAGE_KEY);
    if (!raw) return { done: [] };
    const v = JSON.parse(raw) as Partial<Saved>;
    return {
      done: Array.isArray(v.done) ? v.done.filter((n): n is number => Number.isInteger(n)) : [],
      browser: isBrowserId(v.browser) ? v.browser : undefined,
    };
  } catch {
    return { done: [] };
  }
}

function save(s: Saved) {
  try {
    localStorage.setItem(GUIDE_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked (private mode, disabled site data): progress lasts for this visit only.
  }
}

const root = document.documentElement;
const state = load();

// ---------- Browser picker ----------
const radios = [...document.querySelectorAll<HTMLInputElement>('input[name="browser"]')];
const urlCopy = document.querySelector<HTMLButtonElement>('[data-url-copy]');
const hint = document.querySelector<HTMLElement>('[data-browser-hint]');

function setBrowser(id: BrowserId, auto: boolean) {
  root.dataset.browser = id;
  root.toggleAttribute('data-browser-auto', auto);
  for (const r of radios) r.checked = r.value === id;
  const b = browsers.find((x) => x.id === id)!;
  if (urlCopy) {
    urlCopy.dataset.copy = b.extensionsUrl;
    urlCopy.setAttribute('aria-label', say('copyAddress', { url: b.extensionsUrl }));
  }
  if (hint) hint.textContent = say(auto ? 'detected' : 'chosen', { name: b.name });
  onBrowser();
}
// Re-renders the progress once the steps below are wired up (some steps only show in one browser).
let onBrowser = () => {};

const initial = isBrowserId(root.dataset.browser) ? root.dataset.browser : 'chrome';
setBrowser(initial, root.hasAttribute('data-browser-auto'));

for (const r of radios) {
  r.addEventListener('change', () => {
    if (!r.checked || !isBrowserId(r.value)) return;
    state.browser = r.value;
    save(state);
    setBrowser(r.value, false);
  });
}

// Arc and Brave share Chrome's user agent. Arc adds --arc-palette-* CSS variables to the page
// shortly after load; Brave exposes navigator.brave. Only refine a guess, never a saved choice.
function refineGuess() {
  if (!root.hasAttribute('data-browser-auto')) return;
  if (getComputedStyle(root).getPropertyValue('--arc-palette-title').trim()) setBrowser('arc', true);
}
refineGuess();
window.addEventListener('load', () => setTimeout(refineGuess, 800), { once: true });
const brave = (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave;
brave?.isBrave?.().then((yes) => yes && root.hasAttribute('data-browser-auto') && setBrowser('brave', true)).catch(() => {});

// Not a desktop Chromium browser: say so above the steps.
const envNote = document.querySelector<HTMLElement>('[data-env-note]');
const envText = document.querySelector<HTMLElement>('[data-env-text]');
const ua = navigator.userAgent;
const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
const mobile = uaData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/.test(ua);
const chromium = !!uaData || (/Chrome\/|Chromium\//.test(ua) && !/Firefox\/|FxiOS|CriOS|EdgiOS/.test(ua));
if (envNote && envText && (mobile || !chromium)) {
  envText.textContent = say(mobile ? 'mobile' : 'notChromium');
  envNote.hidden = false;
}

// ---------- Steps and progress ----------
const steps = [...document.querySelectorAll<HTMLLIElement>('[data-step]')];
const boxes = steps.map((li) => li.querySelector<HTMLInputElement>('[data-step-done]')!);
const bar = document.querySelector<HTMLElement>('[data-progress]');
const fill = document.querySelector<HTMLElement>('[data-progress-fill]');
const text = document.querySelector<HTMLElement>('[data-progress-text]');
const announce = document.querySelector<HTMLElement>('[data-announce]');
const index = [...document.querySelectorAll<HTMLAnchorElement>('[data-index]')];
const finish = document.querySelector<HTMLElement>('[data-finish]');

// Steps for other browsers (<li data-for>) are hidden and left out of the count.
const shown = (el: HTMLElement) => !el.dataset.for || el.dataset.for.split(' ').includes(root.dataset.browser ?? 'chrome');

function render() {
  const done = new Set(state.done);
  const visible = steps.filter(shown);
  const total = visible.length;
  const current = visible.find((li) => !done.has(Number(li.dataset.step)));
  steps.forEach((li, i) => {
    const n = Number(li.dataset.step);
    li.dataset.state = done.has(n) ? 'done' : li === current ? 'current' : 'todo';
    boxes[i].checked = done.has(n);
  });
  for (const a of index) {
    const n = Number(a.dataset.index);
    a.dataset.state = done.has(n) ? 'done' : current && Number(current.dataset.step) === n ? 'current' : 'todo';
    if (a.dataset.state === 'current') a.setAttribute('aria-current', 'step');
    else a.removeAttribute('aria-current');
  }
  const count = visible.filter((li) => done.has(Number(li.dataset.step))).length;
  if (bar) {
    bar.setAttribute('aria-valuenow', String(count));
    bar.setAttribute('aria-valuetext', say('countLong', { n: count, total }));
  }
  if (fill) fill.style.transform = `scaleX(${count / total})`;
  if (text) text.textContent = say('count', { n: count, total });
  finish?.toggleAttribute('data-complete', count === total);
}

boxes.forEach((box, i) => {
  box.addEventListener('change', () => {
    const n = Number(steps[i].dataset.step);
    const done = new Set(state.done);
    if (box.checked) done.add(n);
    else done.delete(n);
    state.done = [...done].sort((a, b) => a - b);
    save(state);
    render();
    if (announce) {
      const visible = steps.filter(shown);
      const count = visible.filter((li) => done.has(Number(li.dataset.step))).length;
      announce.textContent = count === visible.length ? say('allDone') : say('announce', { n: count, total: visible.length });
    }
  });
});

document.querySelector('[data-reset]')?.addEventListener('click', () => {
  state.done = [];
  save(state);
  render();
  if (announce) announce.textContent = say('cleared');
});

onBrowser = render;
render();

// Links to a closed <details> (e.g. #build-from-source) open it.
function openTarget() {
  const el = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  if (el instanceof HTMLDetailsElement) el.open = true;
}
window.addEventListener('hashchange', openTarget);
openTarget();
