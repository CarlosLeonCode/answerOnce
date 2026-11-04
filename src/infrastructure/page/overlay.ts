/**
 * Toggles the in-page AnswerOnce panel: a floating, draggable frame that hosts the
 * extension's own panel page (an extension-origin iframe, so the host page can
 * display it but never read the profile data rendered inside).
 *
 * Runs in the page via `scripting.executeScript({ func, args })`, so it must be
 * fully self-contained: no imports, no closures over module scope.
 */
export function toggleOverlay(panelUrl: string): 'opened' | 'closed' {
  const HOST_ID = 'answeronce-overlay-host';
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.remove();
    return 'closed';
  }

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all: initial; position: fixed; top: 12px; right: 12px; z-index: 2147483647;';
  const root = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    .frame {
      width: 400px; height: min(720px, calc(100vh - 24px));
      display: flex; flex-direction: column;
      background: #f8fafc; border: 1px solid rgb(15 23 42 / 0.12); border-radius: 14px;
      box-shadow: 0 12px 40px rgb(15 23 42 / 0.22), 0 2px 8px rgb(15 23 42 / 0.08);
      overflow: hidden; font: 500 12px/1 system-ui, -apple-system, sans-serif; color: #475569;
    }
    .frame.collapsed { height: auto; }
    .frame.collapsed iframe { display: none; }
    .bar {
      display: flex; align-items: center; gap: 6px; padding: 6px 8px 6px 12px;
      background: #eef2ff; border-bottom: 1px solid rgb(15 23 42 / 0.08);
      cursor: grab; user-select: none; touch-action: none;
    }
    .bar:active { cursor: grabbing; }
    .title { flex: 1; letter-spacing: 0.02em; }
    button {
      all: unset; width: 24px; height: 24px; display: grid; place-items: center;
      border-radius: 6px; cursor: pointer; color: #475569; font-size: 15px; line-height: 1;
    }
    button:hover { background: rgb(79 70 229 / 0.12); color: #312e81; }
    button:focus-visible { outline: 2px solid #4f46e5; outline-offset: 1px; }
    iframe { flex: 1; width: 100%; border: 0; background: #f8fafc; color-scheme: normal; }
    @media (prefers-color-scheme: dark) {
      .frame { background: #0b1120; border-color: rgb(148 163 184 / 0.2); color: #94a3b8; }
      .bar { background: #1e1b4b; border-color: rgb(148 163 184 / 0.15); }
      button { color: #94a3b8; }
      button:hover { background: rgb(129 140 248 / 0.2); color: #e0e7ff; }
      iframe { background: #0b1120; }
    }
  `;

  const frame = document.createElement('div');
  frame.className = 'frame';
  frame.setAttribute('role', 'dialog');
  frame.setAttribute('aria-label', 'AnswerOnce');

  const bar = document.createElement('div');
  bar.className = 'bar';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = 'AnswerOnce · drag to move';
  const collapse = document.createElement('button');
  collapse.type = 'button';
  collapse.title = 'Collapse';
  collapse.setAttribute('aria-label', 'Collapse AnswerOnce panel');
  collapse.textContent = '–';
  collapse.addEventListener('click', () => {
    const collapsed = frame.classList.toggle('collapsed');
    collapse.textContent = collapsed ? '+' : '–';
    collapse.title = collapsed ? 'Expand' : 'Collapse';
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.title = 'Close';
  close.setAttribute('aria-label', 'Close AnswerOnce panel');
  close.textContent = '×';
  close.addEventListener('click', () => host.remove());
  bar.append(title, collapse, close);

  const iframe = document.createElement('iframe');
  iframe.src = panelUrl;
  iframe.title = 'AnswerOnce panel';
  iframe.allow = 'clipboard-write';

  // Drag by the bar, kept inside the viewport.
  bar.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = host.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    bar.setPointerCapture(e.pointerId);
    // The iframe would swallow pointer events while dragging over it.
    iframe.style.pointerEvents = 'none';
    const move = (ev: PointerEvent) => {
      const left = Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - rect.width);
      const top = Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - 40);
      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
      host.style.right = 'auto';
    };
    const up = () => {
      iframe.style.pointerEvents = '';
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
  });

  frame.append(bar, iframe);
  root.append(style, frame);
  document.documentElement.append(host);
  return 'opened';
}
